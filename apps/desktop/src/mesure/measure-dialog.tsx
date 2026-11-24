import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

import {
  commands as mesureCommands,
  type DifferenceRow,
  type MeasureResult,
  type SentInput,
  type StatusReason,
} from "@syntheo/plugin-mesure";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { Textarea } from "@syntheo/ui/components/ui/textarea";
import { cn } from "@syntheo/utils";

import { ensureEnrollment } from "./beta";
import {
  agreementMatrix,
  agreementPercent,
  labeledCount,
  labeledWords,
  matrixToTsv,
  type TrueClass,
  weightedAgreementPercent,
} from "./calibration";
import { saveCalibration, saveMeasurement } from "./storage";

import { liveQueryClient } from "~/db";
import {
  copyTextToClipboard,
  getStoredNoteMarkdown,
} from "~/session/components/note-input/header-shared";
import { useConfigValues } from "~/shared/config";

// Bêta, issue 671 : mesure de la reprise d'une synthèse. La version envoyée
// (collée ou déposée) ne vit qu'en mémoire, dans cette fenêtre ; seuls les
// compteurs sont enregistrés. En mode Calibrage, les différences et les
// classes choisies à la main restent aussi en mémoire : seule la matrice
// d'accord (des nombres) est enregistrée.

const ACCEPT = ".txt,.md,.markdown,.html,.htm,.docx";
/** Mêmes plafonds que le crate `mesure`, vérifiés avant toute lecture. */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_DOCX_BYTES = 16 * 1024 * 1024;

type Source =
  | { kind: "pasted"; text: string; html: string | null }
  | { kind: "file"; name: string; input: SentInput };

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

type FileInputResult =
  | { ok: true; input: SentInput }
  | { ok: false; reason: "type" | "size" | "encoding" };

/**
 * Fichier choisi ou déposé, lu par l'interface : le plugin ne reçoit jamais de
 * chemin (revue du lot 0.8.0, constat 1). Taille vérifiée avant la lecture,
 * texte décodé en UTF-8 strict (constats 23 et 26).
 */
export async function fileInput(file: File): Promise<FileInputResult> {
  const extension = extensionOf(file.name);
  const format =
    extension === "md" || extension === "markdown"
      ? "markdown"
      : extension === "html" || extension === "htm"
        ? "html"
        : extension === "txt"
          ? "text"
          : extension === "docx"
            ? "docx"
            : null;
  if (!format) return { ok: false, reason: "type" };
  const limit = format === "docx" ? MAX_DOCX_BYTES : MAX_TEXT_BYTES;
  if (file.size > limit) return { ok: false, reason: "size" };
  if (format === "docx") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { ok: true, input: { kind: "docx", base64: btoa(binary) } };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    return { ok: false, reason: "encoding" };
  }
  return { ok: true, input: { kind: "text", text, format } };
}

/**
 * Version générée de la mesure (spec §2) : le corps produit par Syntheo avant
 * toute retouche, gardé à chaque génération. Pour une synthèse générée avant
 * la 0.8.0, la synthèse actuelle, marquée `current`.
 */
async function generatedVersion(
  documentId: string,
  currentMarkdown: string,
): Promise<{ markdown: string; source: "original" | "current" }> {
  try {
    const [row] = await liveQueryClient.execute<{ body: string }>(
      "SELECT body FROM summary_generated_bodies WHERE document_id = ?",
      [documentId],
    );
    const markdown = getStoredNoteMarkdown(row?.body);
    if (markdown) return { markdown, source: "original" };
  } catch (cause) {
    console.error("[mesure] failed to read the generated body", cause);
  }
  return { markdown: currentMarkdown, source: "current" };
}

/**
 * Un collage avec HTML (mail, wiki) est lu en HTML ; un texte collé ou saisi
 * sans HTML est lu en Markdown, pour qu'une synthèse collée telle quelle
 * garde ses titres et donne une reprise nulle (revue du lot 0.8.0, constat 7).
 */
function sentInput(source: Source): SentInput {
  if (source.kind === "file") return source.input;
  return source.html
    ? { kind: "text", text: source.html, format: "html" }
    : { kind: "text", text: source.text, format: "markdown" };
}

export function MeasureDialog({
  open,
  onOpenChange,
  sessionId,
  documentId,
  summaryMarkdown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  documentId: string;
  summaryMarkdown: string;
}) {
  const { t } = useLingui();
  const { calibration_enabled, personalization_dictionary_terms } =
    useConfigValues([
      "calibration_enabled",
      "personalization_dictionary_terms",
    ] as const);
  const [source, setSource] = useState<Source | null>(null);
  const [result, setResult] = useState<MeasureResult | null>(null);
  const [generatedSource, setGeneratedSource] = useState<
    "original" | "current"
  >("original");
  const [rows, setRows] = useState<DifferenceRow[] | null>(null);
  const [labels, setLabels] = useState<Map<number, TrueClass>>(new Map());
  const [calibrationSaved, setCalibrationSaved] = useState(false);
  const [savingCalibration, setSavingCalibration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Jeton de la mesure en cours : fermer la fenêtre le change, et un calcul
  // qui se termine ensuite n'enregistre ni n'affiche rien (constats 21, 25).
  const run = useRef(0);
  // Un calibrage par mesure : réenregistrer remplace la même ligne
  // (constats 22, 24).
  const calibrationId = useRef<string | null>(null);
  const fileField = useRef<HTMLInputElement>(null);

  // Fermer la fenêtre efface tout ce qu'elle tenait en mémoire.
  const reset = () => {
    run.current += 1;
    calibrationId.current = null;
    setBusy(false);
    setSavingCalibration(false);
    setSource(null);
    setResult(null);
    setRows(null);
    setLabels(new Map());
    setCalibrationSaved(false);
    setError(null);
  };

  const measure = async () => {
    if (!source) return;
    const token = ++run.current;
    const current = () => run.current === token;
    setBusy(true);
    setError(null);
    const dictionary = personalization_dictionary_terms ?? [];
    const input = sentInput(source);
    const generated = await generatedVersion(documentId, summaryMarkdown);
    // L'inscription porte la clé des empreintes de termes : elle doit exister
    // avant le calcul (issue 672).
    await ensureEnrollment().catch((cause) =>
      console.error("[mesure] failed to enroll", cause),
    );
    if (!current()) return;
    const measured = await mesureCommands.measure(
      generated.markdown,
      input,
      dictionary,
    );
    if (!current()) return;
    if (measured.status === "error") {
      setBusy(false);
      setError(t`The sent version could not be measured: ${measured.error}`);
      return;
    }
    setResult(measured.data);
    setGeneratedSource(generated.source);
    try {
      if (!current()) return;
      await saveMeasurement(
        { sessionId, documentId, generatedSource: generated.source },
        measured.data,
      );
    } catch (cause) {
      console.error("[mesure] failed to save the counters", cause);
      setError(t`The counters could not be saved.`);
    }
    if (!current()) return;
    // Mesure refusée (issue 733) : la comparaison a échoué, ses différences
    // ne servent pas au calibrage.
    if (calibration_enabled && measured.data.status !== "refused") {
      const listed = await mesureCommands.measureDifferences(
        generated.markdown,
        input,
        dictionary,
      );
      if (!current()) return;
      if (listed.status === "ok") {
        calibrationId.current = crypto.randomUUID();
        setRows(listed.data);
      } else setError(t`The differences could not be listed.`);
    }
    setBusy(false);
  };

  const loadFile = async (file: File) => {
    const read = await fileInput(file);
    if (!read.ok) {
      setError(
        read.reason === "size"
          ? t`This file is too large to measure.`
          : read.reason === "encoding"
            ? t`This file is not UTF-8 text.`
            : t`Use a .txt, .md, .html or .docx file.`,
      );
      return;
    }
    setError(null);
    setResult(null);
    setRows(null);
    setSource({ kind: "file", name: file.name, input: read.input });
  };

  const matrix =
    rows && result ? agreementMatrix(rows, labels, result.ruleVersion) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans>Measure rework</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Paste or drop the version you actually sent. It stays in this
              window: only counts are saved, never text.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div
            className="flex flex-col gap-3"
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files?.[0];
              if (file) void loadFile(file);
            }}
          >
            <Textarea
              aria-label={t`Sent version`}
              placeholder={t`Paste the sent version here, or drop a .txt, .md, .html or .docx file.`}
              className="min-h-40"
              value={source?.kind === "pasted" ? source.text : ""}
              onPaste={(event) => {
                // Un collage avec HTML dans une zone vide garde le HTML pour la
                // mesure. Sinon, le collage s'insère à la position du curseur,
                // comme d'habitude, et la mesure lit le texte (constat 27).
                const html = event.clipboardData.getData("text/html");
                const empty =
                  source?.kind !== "pasted" || source.text.length === 0;
                if (!html || !empty) return;
                const text = event.clipboardData.getData("text/plain");
                event.preventDefault();
                setSource({ kind: "pasted", text, html });
              }}
              onChange={(event) =>
                setSource({
                  kind: "pasted",
                  text: event.target.value,
                  html: null,
                })
              }
            />
            <div className="flex items-center gap-3">
              <input
                ref={fileField}
                type="file"
                accept={ACCEPT}
                className="hidden"
                data-testid="measure-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void loadFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileField.current?.click()}
              >
                <Trans>Choose a file…</Trans>
              </Button>
              {source?.kind === "file" ? (
                <span className="text-muted-foreground truncate text-sm">
                  {source.name}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <MeasureSummary result={result} generatedSource={generatedSource} />
        )}

        {result && rows && result.status !== "refused" ? (
          <CalibrationTable
            rows={rows}
            labels={labels}
            onLabel={(index, label) => {
              const next = new Map(labels);
              next.set(index, label);
              setLabels(next);
              setCalibrationSaved(false);
            }}
          />
        ) : null}

        {matrix && labeledCount(matrix) + matrix.artefacts > 0 ? (
          <section className="flex flex-col gap-2" aria-label={t`Agreement`}>
            {labeledCount(matrix) > 0 ? (
              <>
                <p className="text-sm">
                  <Trans>
                    Agreement: {agreementPercent(matrix)?.toFixed(1)}% on{" "}
                    {labeledCount(matrix)} differences (rule{" "}
                    {matrix.ruleVersion}).
                  </Trans>
                </p>
                <p className="text-sm">
                  <Trans>
                    Weighted by words:{" "}
                    {weightedAgreementPercent(matrix)?.toFixed(1)}% on{" "}
                    {labeledWords(matrix)} words.
                  </Trans>
                </p>
              </>
            ) : null}
            {matrix.artefacts > 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>
                  Artifacts: {matrix.artefacts} differences (
                  {matrix.artefactWords} words), left out of the agreement.
                </Trans>
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void copyTextToClipboard(matrixToTsv(matrix), {
                    success: t`Copied to clipboard`,
                    error: t`Failed to copy`,
                  })
                }
              >
                <Trans>Copy the matrix</Trans>
              </Button>
              <Button
                type="button"
                disabled={calibrationSaved || savingCalibration}
                onClick={() => {
                  const id = calibrationId.current;
                  if (!id) return;
                  setSavingCalibration(true);
                  void saveCalibration(id, matrix).then(
                    () => {
                      setSavingCalibration(false);
                      setCalibrationSaved(true);
                    },
                    (cause) => {
                      setSavingCalibration(false);
                      console.error(
                        "[mesure] failed to save the matrix",
                        cause,
                      );
                      setError(t`The matrix could not be saved.`);
                    },
                  );
                }}
              >
                {calibrationSaved ? (
                  <Trans>Matrix saved</Trans>
                ) : (
                  <Trans>Save the matrix</Trans>
                )}
              </Button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {!result ? (
            <Button
              type="button"
              disabled={!source || busy || summaryMarkdown.length === 0}
              onClick={() => void measure()}
            >
              <Trans>Measure</Trans>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              <Trans>Close</Trans>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function perHundred(perMille: number | null): string {
  return perMille === null ? "-" : (perMille / 10).toFixed(1);
}

/** Raison d'un statut, en clair (codes fermés du crate `mesure`). */
function StatusReasonText({ reason }: { reason: StatusReason }) {
  switch (reason) {
    case "entity_left":
      return (
        <Trans>
          The sent version still contains HTML codes (such as &amp;eacute;) that
          could not be read. Drop the file as .docx, or paste it as plain text.
        </Trans>
      );
    case "too_few_words_kept":
      return (
        <Trans>
          Less than half of the generated words were found in the sent version.
        </Trans>
      );
    case "global_alignment":
      return (
        <Trans>
          Fewer than half of the headings were found: the text was measured as a
          whole.
        </Trans>
      );
    case "unmatched_sections":
      return (
        <Trans>
          More than a tenth of the generated words are in sections that were not
          found in the sent version.
        </Trans>
      );
  }
}

/** Nombres bruts, jamais de score composite. Garde-fous (issue 733) : une
 * mesure refusée n'affiche aucun chiffre ; une mesure douteuse les affiche
 * grisés, avec la raison. */
function MeasureSummary({
  result,
  generatedSource,
}: {
  result: MeasureResult;
  generatedSource: "original" | "current";
}) {
  const total = result.total;
  const content = perHundred(result.contentPerMille);
  const lexical = total.replacedLexical;
  const reasons = (
    <ul className="list-disc pl-5 text-xs" data-measure-reasons>
      {result.statusReasons.map((reason) => (
        <li key={reason}>
          <StatusReasonText reason={reason} />
        </li>
      ))}
    </ul>
  );
  if (result.status === "refused") {
    return (
      <section
        className="flex flex-col gap-2 text-sm"
        data-measure-result
        data-measure-status="refused"
      >
        <p className="text-base">
          <Trans>
            This measurement was refused: the comparison failed, so no number is
            shown or saved for export.
          </Trans>
        </p>
        {reasons}
      </section>
    );
  }
  const doubtful = result.status === "doubtful";
  return (
    <section
      className="flex flex-col gap-2 text-sm"
      data-measure-result
      data-measure-status={result.status}
    >
      {doubtful ? (
        <>
          <p className="text-sm font-medium">
            <Trans>Doubtful measurement: read these numbers with care.</Trans>
          </p>
          {reasons}
        </>
      ) : null}
      <p className={cn(["text-base", doubtful && "text-muted-foreground"])}>
        <Trans>
          {content} words of content reworked per 100 generated, plus {lexical}{" "}
          words of names or acronyms corrected.
        </Trans>
      </p>
      {generatedSource === "current" ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            Compared with the current summary: its original generated version
            was not kept (summary generated before version 0.8.0).
          </Trans>
        </p>
      ) : null}
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
        <dt>
          <Trans>Generated words</Trans>
        </dt>
        <dd>{total.generated}</dd>
        <dt>
          <Trans>Added</Trans>
        </dt>
        <dd>{total.added}</dd>
        <dt>
          <Trans>Deleted</Trans>
        </dt>
        <dd>{total.deleted}</dd>
        <dt>
          <Trans>Replaced (content)</Trans>
        </dt>
        <dd>{total.replacedContent}</dd>
        <dt>
          <Trans>Replaced (names, acronyms)</Trans>
        </dt>
        <dd>{total.replacedLexical}</dd>
        <dt>
          <Trans>Sections found</Trans>
        </dt>
        <dd>
          {result.headingsMatched} / {result.headingsGenerated}
          {result.controls.sectionsMatchedNear > 0 ? (
            <>
              {" "}
              <Trans>
                (including {result.controls.sectionsMatchedNear} with a
                corrected heading)
              </Trans>
            </>
          ) : null}
          {result.aligned ? null : (
            <>
              {" "}
              <Trans>(measured as a whole)</Trans>
            </>
          )}
        </dd>
      </dl>
    </section>
  );
}

function CalibrationTable({
  rows,
  labels,
  onLabel,
}: {
  rows: readonly DifferenceRow[];
  labels: ReadonlyMap<number, TrueClass>;
  onLabel: (index: number, label: TrueClass) => void;
}) {
  const { t } = useLingui();
  const kindLabel = (row: DifferenceRow) =>
    row.kind === "added"
      ? t`Added`
      : row.kind === "deleted"
        ? t`Deleted`
        : t`Replaced`;
  return (
    <section className="flex flex-col gap-2" aria-label={t`Calibration`}>
      <h3 className="text-sm font-semibold">
        <Trans>Calibration: classify each difference</Trans>
      </h3>
      <p className="text-muted-foreground text-xs">
        <Trans>These excerpts are shown only here and are never saved.</Trans>
      </p>
      <p className="text-muted-foreground text-xs">
        <Trans>
          The automatic class appears once you have chosen yours. Choose
          Artifact when the difference is not a real one (a formatting or
          reading error).
        </Trans>
      </p>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">
              <Trans>Type</Trans>
            </th>
            <th className="py-1 pr-2">
              <Trans>Generated</Trans>
            </th>
            <th className="py-1 pr-2">
              <Trans>Sent</Trans>
            </th>
            <th className="py-1 pr-2">
              <Trans>Automatic</Trans>
            </th>
            <th className="py-1">
              <Trans>Your choice</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const label = labels.get(index);
            return (
              <tr key={index} className="border-border border-t align-top">
                <td className="py-1 pr-2 tabular-nums">{index + 1}</td>
                <td className="py-1 pr-2">{kindLabel(row)}</td>
                <td className="py-1 pr-2">{row.generated}</td>
                <td className="py-1 pr-2">{row.sent}</td>
                <td className="py-1 pr-2" data-automatic-class>
                  {/* Étiquetage en aveugle (issue 735) : la classe
                      automatique n'oriente pas le choix. */}
                  {label ? (
                    row.lexical ? (
                      t`Lexical`
                    ) : (
                      t`Content`
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      <Trans>Hidden</Trans>
                    </span>
                  )}
                </td>
                <td className="py-1">
                  <div
                    role="radiogroup"
                    aria-label={t`Class of difference ${index + 1}`}
                    className="flex gap-1"
                  >
                    {(["content", "lexical", "artefact"] as const).map(
                      (value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={label === value}
                          className={cn([
                            "rounded border px-2 py-0.5",
                            label === value
                              ? "bg-foreground text-background"
                              : "border-border",
                          ])}
                          onClick={() => onLabel(index, value)}
                        >
                          {value === "content"
                            ? t`Content`
                            : value === "lexical"
                              ? t`Lexical`
                              : t`Artifact`}
                        </button>
                      ),
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

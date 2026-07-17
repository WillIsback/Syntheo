"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteSession } from "@/actions/delete-session.action";
import {
  Button,
  Card,
  Modal,
  SegmentTimeline,
  SpeakerChip,
  Spinner,
  StatCell,
} from "@/components";
import {
  REPORT_TEMPLATES,
  type ReportSection,
  type Session,
} from "@/data/sessions";
import {
  buildDocxBlob,
  buildReportFormatted,
  buildReportMarkdown,
  buildTranscriptPlain,
  buildTranscriptText,
  downloadFile,
} from "@/lib/session-export";
import { validateSessionName } from "@/lib/session-name";

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts.at(-1)?.[0]).toUpperCase();
}

type TranscriptRow =
  | { type: "header"; segment: Session["segments"][number] }
  | { type: "block"; block: Session["blocks"][number] };

// Groups blocks under their segment header, in document order.
function buildTranscriptRows(
  segments: Session["segments"],
  blocks: Session["blocks"],
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let lastSeg: string | null = null;
  for (const b of blocks) {
    if (b.segId !== lastSeg) {
      const seg = segments.find((sg) => sg.id === b.segId);
      if (seg) rows.push({ type: "header", segment: seg });
      lastSeg = b.segId;
    }
    rows.push({ type: "block", block: b });
  }
  return rows;
}

function useCloseOnOutsideClick(
  refs: Array<React.RefObject<HTMLElement | null>>,
  active: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!active) return;
    function handleMouseDown(e: MouseEvent) {
      if (refs.some((ref) => ref.current?.contains(e.target as Node))) return;
      onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [active, onClose, refs]);
}

/**
 * Interactive transcript + report screen for one session. Speaker filtering
 * and block edits are local UI state only (see TODOs) — wire them to real
 * mutations once a sessions API exists.
 */
export function SessionDetail({
  session,
  userName,
}: {
  readonly session: Session;
  readonly userName: string;
}) {
  const router = useRouter();
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [blocks, setBlocks] = useState(session.blocks);

  // Sync blocks when transcription completes (polling updates session prop)
  useEffect(() => {
    if (session.status === "completed") {
      setBlocks(session.blocks);
    }
  }, [session.status, session.blocks]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{
    id: string;
    name: string;
    content: string;
  }>(() => {
    const t = REPORT_TEMPLATES[0];
    return { id: t.id, name: t.name, content: t.content };
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState(session.report);
  const [activeTab, setActiveTab] = useState<"transcript" | "report">(
    session.report ? "report" : "transcript",
  );
  const [openMenu, setOpenMenu] = useState<"export" | "share" | null>(null);
  const [sessionName, setSessionName] = useState(session.name);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escapedNameRef = useRef(false);

  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(
    () => session.speakerNames,
  );
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [draftSpeakerName, setDraftSpeakerName] = useState("");

  const displayName = (speakerId: string) =>
    speakerNames[speakerId] ?? speakerId;

  function startEditSpeaker(speakerId: string) {
    setEditingSpeakerId(speakerId);
    setDraftSpeakerName(speakerNames[speakerId] ?? speakerId);
  }

  async function saveSpeakerName() {
    if (!editingSpeakerId) return;
    const trimmed = draftSpeakerName.trim();
    if (!trimmed) {
      setEditingSpeakerId(null);
      return;
    }
    const next = { ...speakerNames, [editingSpeakerId]: trimmed };
    setSpeakerNames(next);
    setEditingSpeakerId(null);
    await fetch(`/api/sessions/${session.id}/speakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakerNames: next }),
    });
  }

  const speakerById = useMemo(() => {
    const map: Record<string, Session["speakers"][number]> = {};
    session.speakers.forEach((sp) => {
      map[sp.id] = sp;
    });
    return map;
  }, [session.speakers]);

  const menuRefs = useMemo(() => [exportRef, shareRef], []);
  useCloseOnOutsideClick(menuRefs, !!openMenu, () => setOpenMenu(null));

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCopiedMsg(msg);
    toastTimerRef.current = setTimeout(() => setCopiedMsg(null), 2000);
  }

  async function saveSessionName() {
    const trimmed = draftName.trim();
    const error = validateSessionName(trimmed);
    if (error) {
      showToast(error);
      setEditingName(false);
      return;
    }
    if (trimmed === sessionName) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        showToast("Ce nom est déjà utilisé");
      } else if (!res.ok) {
        showToast("Erreur lors du renommage");
      } else {
        const data = (await res.json()) as { name: string };
        setSessionName(data.name);
      }
    } catch {
      showToast("Erreur réseau");
    }
    setEditingName(false);
  }

  const timelineSegs = session.segments.map((s) => ({
    id: s.id,
    color: s.color,
    pct: s.share,
  }));

  function startEdit(block: Session["blocks"][number]) {
    setEditingBlockId(block.id);
    setDraftText(block.text);
  }
  function saveEdit() {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === editingBlockId ? { ...b, text: draftText } : b,
      ),
    );
    // TODO: PATCH /api/sessions/[id]/blocks/[blockId] to persist the edit.
    setEditingBlockId(null);
  }

  const [reportError, setReportError] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      content: string;
    }>
  >([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  function openReportModal() {
    setReportModalOpen(true);
    if (!templatesLoaded) {
      fetch("/api/templates")
        .then(
          (r) =>
            r.json() as Promise<
              Array<{
                id: string;
                name: string;
                description: string | null;
                icon: string | null;
                content: string;
              }>
            >,
        )
        .then((rows) => {
          setCustomTemplates(rows);
          setTemplatesLoaded(true);
        })
        .catch(() => {});
    }
  }

  async function generateReport() {
    setIsGenerating(true);
    setReportError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          templateContent: selectedTemplate.content,
          speakerNames,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setReportError(err.error ?? `Erreur ${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        templateId: string;
        templateName: string;
        modelTag: string;
        sections: ReportSection[];
      };
      setReport(data);
      setReportModalOpen(false);
      setActiveTab("report");
    } catch {
      setReportError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleExportTxt() {
    setOpenMenu(null);
    const filename = sessionName.replace(/\s+/g, "-");
    if (activeTab === "transcript") {
      downloadFile(
        buildTranscriptText(blocks, speakerNames),
        `${filename}-transcription.txt`,
        "text/plain;charset=utf-8",
      );
    } else if (activeTab === "report" && report) {
      downloadFile(
        buildReportFormatted(report),
        `${filename}-compte-rendu.txt`,
        "text/plain;charset=utf-8",
      );
    }
  }

  async function handleExportDocx() {
    setOpenMenu(null);
    const filename = sessionName.replace(/\s+/g, "-");
    try {
      if (activeTab === "transcript") {
        const sections = blocks.map((b) => ({
          heading: `[${b.ts}] ${speakerNames[b.speakerId] ?? b.speakerId}`,
          text: b.text,
        }));
        const blob = await buildDocxBlob(sessionName, sections);
        downloadFile(blob, `${filename}-transcription.docx`, "");
      } else if (activeTab === "report" && report) {
        const sections = report.sections.map((s) => ({
          heading: s.title,
          text: s.body,
        }));
        const blob = await buildDocxBlob(sessionName, sections);
        downloadFile(blob, `${filename}-compte-rendu.docx`, "");
      }
    } catch {
      showToast("Erreur lors de l'export DOCX");
    }
  }

  async function handleCopy() {
    setOpenMenu(null);
    let text = "";
    if (activeTab === "transcript") {
      text = buildTranscriptText(blocks, speakerNames);
    } else if (activeTab === "report" && report) {
      text = buildReportFormatted(report);
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copié !");
    } catch {
      showToast("Erreur : accès au presse-papier refusé");
    }
  }

  async function handleCopyRaw() {
    setOpenMenu(null);
    let text = "";
    if (activeTab === "transcript") {
      text = buildTranscriptPlain(blocks);
    } else if (activeTab === "report" && report) {
      text = buildReportMarkdown(report);
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copié !");
    } catch {
      showToast("Erreur : accès au presse-papier refusé");
    }
  }

  const rows = buildTranscriptRows(session.segments, blocks);

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-205 px-12 py-8 pb-20">
          <div className="mb-1 flex items-start justify-between">
            <h1 className="flex-1 text-[28px] font-normal leading-tight tracking-[-0.02em] text-(--syn-text)">
              {editingName ? (
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    if (escapedNameRef.current) {
                      escapedNameRef.current = false;
                      return;
                    }
                    saveSessionName();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      escapedNameRef.current = true;
                      setEditingName(false);
                    }
                  }}
                  className="w-full bg-transparent text-[28px] font-normal leading-tight tracking-[-0.02em] text-(--syn-text) outline-none border-b border-(--syn-blue)"
                />
              ) : (
                <button
                  type="button"
                  className="group/name inline-flex items-center gap-2 border-0 bg-transparent p-0 text-inherit cursor-text"
                  onClick={() => {
                    setDraftName(sessionName);
                    setEditingName(true);
                  }}
                >
                  {sessionName}
                  <span className="text-[18px] text-(--syn-text-3) opacity-0 transition-opacity group-hover/name:opacity-100">
                    ✎
                  </span>
                </button>
              )}
              <br />
              <span className="text-lg font-normal text-(--syn-text-2)">
                Syntheo — {session.dateLabel}
              </span>
            </h1>
            <div className="ml-6 mt-1 flex shrink-0 items-center gap-2">
              <div ref={exportRef} className="group relative">
                <Button
                  onClick={() =>
                    setOpenMenu(openMenu === "export" ? null : "export")
                  }
                  style={{
                    background:
                      activeTab === "report"
                        ? "var(--syn-s4-bg)"
                        : "var(--syn-blue-light)",
                    color:
                      activeTab === "report"
                        ? "var(--syn-s4)"
                        : "var(--syn-blue)",
                  }}
                >
                  Exporter ▾
                </Button>
                {openMenu !== "export" && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] text-white opacity-0 transition-opacity delay-700 group-hover:opacity-100"
                    style={{
                      background:
                        activeTab === "transcript"
                          ? "var(--syn-blue)"
                          : "var(--syn-s4)",
                    }}
                  >
                    {activeTab === "transcript"
                      ? "Exporter la transcription"
                      : "Exporter le compte rendu"}
                  </span>
                )}
                {openMenu === "export" && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-(--syn-border) bg-(--syn-surface) py-1 shadow-md">
                    <button
                      type="button"
                      onClick={handleExportTxt}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-(--syn-text) hover:bg-(--syn-bg)"
                    >
                      Exporter en TXT
                    </button>
                    <button
                      type="button"
                      onClick={handleExportDocx}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-(--syn-text) hover:bg-(--syn-bg)"
                    >
                      Exporter en DOCX
                    </button>
                  </div>
                )}
              </div>
              <div ref={shareRef} className="group relative">
                <Button
                  onClick={() =>
                    setOpenMenu(openMenu === "share" ? null : "share")
                  }
                  style={{
                    background:
                      activeTab === "report"
                        ? "var(--syn-s4-bg)"
                        : "var(--syn-blue-light)",
                    color:
                      activeTab === "report"
                        ? "var(--syn-s4)"
                        : "var(--syn-blue)",
                  }}
                >
                  Partager ▾
                </Button>
                {openMenu !== "share" && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] text-white opacity-0 transition-opacity delay-700 group-hover:opacity-100"
                    style={{
                      background:
                        activeTab === "transcript"
                          ? "var(--syn-blue)"
                          : "var(--syn-s4)",
                    }}
                  >
                    {activeTab === "transcript"
                      ? "Copier la transcription"
                      : "Copier le compte rendu"}
                  </span>
                )}
                {openMenu === "share" && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-(--syn-border) bg-(--syn-surface) py-1 shadow-md">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-(--syn-text) hover:bg-(--syn-bg)"
                    >
                      {activeTab === "report" ? "Copier (formaté)" : "Copier"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyRaw}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-(--syn-text) hover:bg-(--syn-bg)"
                    >
                      {activeTab === "report"
                        ? "Copier (brut Markdown)"
                        : "Copier (texte brut)"}
                    </button>
                  </div>
                )}
              </div>
              <Button variant="filled" onClick={openReportModal}>
                Compte rendu
              </Button>
            </div>
          </div>

          <div className="mb-5 flex items-center gap-3 text-xs text-(--syn-text-3)">
            <span>{userName}</span>
            <span className="h-0.75 w-0.75 rounded-full bg-(--syn-text-3)" />
            <span>{session.updatedLabel}</span>
            <span className="h-0.75 w-0.75 rounded-full bg-(--syn-text-3)" />
            <span>
              {session.speakers.length} intervenants · {session.durationLabel}
            </span>
          </div>

          <div className="mb-5 flex items-start gap-2.5 rounded-(--syn-radius-sm) border border-(--syn-warn-border) bg-(--syn-warn-bg) p-3 text-xs leading-relaxed text-(--syn-warn-fg)">
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="#E37400"
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            >
              <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9V9h2v4zm0-6H9V5h2v2z" />
            </svg>
            <span>
              <strong>Transcription générée par IA</strong>. Susceptible
              d&apos;erreurs,vérifiez avant tout usage officiel. Aucun fichier
              audio n&apos;est conservé.
            </span>
          </div>

          <div className="mb-5">
            <SegmentTimeline
              segments={timelineSegs}
              note="Repères de sujets détectés automatiquement, pas de lecture audio disponible."
            />
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-(--syn-text-3)">
              Intervenants :
            </span>
            {session.speakers.map((sp) => (
              <SpeakerChip
                key={sp.id}
                name={displayName(sp.id)}
                color={sp.color}
                bg={sp.bg}
                selected={speakerFilter === sp.id}
                onClick={() =>
                  setSpeakerFilter((f) => (f === sp.id ? null : sp.id))
                }
              />
            ))}
          </div>

          {/* Tab switcher */}
          <div className="mb-6 flex gap-1 border-b border-(--syn-border)">
            <button
              type="button"
              onClick={() => setActiveTab("transcript")}
              className={[
                "px-4 py-2 text-[13px] font-medium transition-colors",
                activeTab === "transcript"
                  ? "border-b-2 border-(--syn-blue) text-(--syn-blue) -mb-px"
                  : "text-(--syn-text-2) hover:text-(--syn-text)",
              ].join(" ")}
            >
              Transcription
            </button>
            <button
              type="button"
              onClick={() => {
                if (report) {
                  setActiveTab("report");
                } else {
                  setReportModalOpen(true);
                }
              }}
              className={[
                "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium transition-colors",
                activeTab === "report"
                  ? "border-b-2 border-(--syn-s4) text-(--syn-s4) -mb-px"
                  : "text-(--syn-text-2) hover:text-(--syn-text)",
              ].join(" ")}
            >
              Compte rendu
              {!report && (
                <span className="rounded-full bg-(--syn-border-soft) px-1.5 py-px text-[10px] text-(--syn-text-3)">
                  Générer
                </span>
              )}
            </button>
          </div>

          {activeTab === "transcript" &&
            (session.status === "pending" ||
              session.status === "processing") && (
              <Spinner
                label="Transcription en cours…"
                hint="La page se met à jour automatiquement."
              />
            )}

          {activeTab === "transcript" &&
            session.status === "completed" &&
            rows.map((row, i) =>
              row.type === "header" ? (
                <div
                  key={`h-${row.segment.id}-${i}`}
                  className="my-7 mb-2.5 flex items-center gap-2.5 first:mt-0"
                >
                  <div className="shrink-0 text-[11px] font-semibold tabular-nums tracking-[.03em] text-(--syn-text-3)">
                    {row.segment.ts}
                  </div>
                  <div className="h-px flex-1 bg-(--syn-border-soft)" />
                  <div
                    className="flex items-center gap-1.5 rounded-[10px] px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: row.segment.bg,
                      color: row.segment.color,
                    }}
                  >
                    {displayName(row.segment.label)}
                    {row.segment.inProgress && (
                      <span className="rounded-full bg-(--syn-status-processing-fg) px-1.5 py-0.5 text-[10px] text-white">
                        en cours
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <Card
                  key={row.block.id}
                  className={[
                    "group relative mb-2",
                    speakerFilter && speakerFilter !== row.block.speakerId
                      ? "opacity-40"
                      : "",
                  ].join(" ")}
                >
                  <div
                    className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.04em]"
                    style={{ color: speakerById[row.block.speakerId]?.color }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: speakerById[row.block.speakerId]?.color,
                      }}
                    />
                    {displayName(row.block.speakerId)}
                    <span className="ml-1 text-[10px] font-normal text-(--syn-text-3)">
                      {row.block.ts}
                    </span>
                  </div>

                  {editingBlockId === row.block.id ? (
                    <>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="min-h-17.5 w-full resize-y rounded-md border border-(--syn-blue) p-2 font-serif text-sm leading-relaxed text-(--syn-text) outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button variant="filled" onClick={saveEdit}>
                          Enregistrer
                        </Button>
                        <Button onClick={() => setEditingBlockId(null)}>
                          Annuler
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-(--syn-text)">
                        {row.block.text}
                      </div>
                      <button
                        type="button"
                        title="Modifier"
                        onClick={() => startEdit(row.block)}
                        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-(--syn-border) bg-(--syn-surface) text-[13px] text-(--syn-text-2) opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        ✎
                      </button>
                    </>
                  )}
                </Card>
              ),
            )}

          {activeTab === "report" && report && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] text-(--syn-text-3)">
                  {report.templateName}
                </span>
                <span className="rounded-[10px] bg-[#F3E8FD] px-2 py-0.5 text-[11px] font-semibold text-[#A142F4]">
                  {report.modelTag}
                </span>
              </div>
              <div className="mb-4 flex items-start gap-2.5 rounded-(--syn-radius-sm) border border-(--syn-warn-border) bg-(--syn-warn-bg) p-3 text-[11px] text-(--syn-warn-fg)">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 20 20"
                  fill="#E37400"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9V9h2v4zm0-6H9V5h2v2z" />
                </svg>
                <span>
                  <strong>
                    Document généré par intelligence artificielle.
                  </strong>{" "}
                  Peut être incomplet ou inexact, ne pas utiliser comme seul
                  référentiel de décision.
                </span>
              </div>
              {report.sections.map((rs) => (
                <div key={rs.title} className="mb-5 last:mb-0">
                  <h4 className="mb-1.5 text-[14px] font-semibold text-(--syn-text)">
                    {rs.title}
                  </h4>
                  <p className="font-serif text-[13.5px] leading-relaxed text-(--syn-text)">
                    {rs.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <aside className="w-(--syn-rightpanel-w) shrink-0 overflow-y-auto border-l border-(--syn-border) bg-(--syn-surface) p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[.06em] text-(--syn-text-3)">
          Intervenants
        </div>
        {session.speakers.map((sp) => (
          <div
            key={sp.id}
            className={[
              "mb-1.5 flex items-center gap-2.5 rounded-(--syn-radius-sm) border-[1.5px] border-transparent px-2.5 py-2",
              speakerFilter === sp.id
                ? "bg-(--syn-blue-light)"
                : "hover:bg-(--syn-bg)",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() =>
                setSpeakerFilter((f) => (f === sp.id ? null : sp.id))
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: sp.color }}
            >
              {nameInitials(displayName(sp.id))}
            </button>
            <div className="min-w-0 flex-1">
              {editingSpeakerId === sp.id ? (
                <input
                  value={draftSpeakerName}
                  onChange={(e) => setDraftSpeakerName(e.target.value)}
                  onBlur={saveSpeakerName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveSpeakerName();
                    if (e.key === "Escape") setEditingSpeakerId(null);
                  }}
                  className="w-full rounded border border-(--syn-blue) bg-white px-1.5 py-0.5 text-xs font-semibold text-(--syn-text) outline-none"
                />
              ) : (
                <button
                  type="button"
                  title="Cliquer pour renommer"
                  onClick={() => startEditSpeaker(sp.id)}
                  className="block w-full text-left text-xs font-semibold text-(--syn-text) hover:text-(--syn-blue)"
                >
                  {displayName(sp.id)}
                </button>
              )}
              <div className="text-[11px] text-(--syn-text-3)">
                {sp.share}% · {sp.timeLabel}
              </div>
            </div>
          </div>
        ))}

        <div className="mb-3 mt-5 text-[11px] font-bold uppercase tracking-[.06em] text-(--syn-text-3)">
          Session
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <StatCell value={session.durationMin} label="min enregistrées" />
          <StatCell value={session.speakers.length} label="intervenants" />
        </div>

        <div className="mb-3 mt-5 text-[11px] font-bold uppercase tracking-[.06em] text-(--syn-text-3)">
          Actions rapides
        </div>
        <button
          type="button"
          onClick={() => {
            const payload = {
              id: session.id,
              name: sessionName,
              icon: session.icon,
              status: session.status,
              dateLabel: session.dateLabel,
              durationLabel: session.durationLabel,
              durationMin: session.durationMin,
              runTag: session.runTag,
              speakers: session.speakers,
              segments: session.segments,
              blocks,
              report: session.report,
            };
            const slug = sessionName.replace(/\s+/g, "-").toLowerCase();
            downloadFile(
              JSON.stringify(payload, null, 2),
              `syntheo-${slug}-export.json`,
              "application/json",
            );
          }}
          className="mb-1.5 flex w-full items-center gap-2 rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 text-left text-xs text-(--syn-text-2) hover:bg-(--syn-bg)"
        >
          Exporter mes données
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={async () => {
            if (!confirm("Supprimer définitivement cette session ?")) return;
            setIsDeleting(true);
            await deleteSession(session.id);
            router.push("/dashboard");
          }}
          className="flex w-full items-center gap-2 rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 text-left text-xs text-(--syn-status-recording-fg) hover:bg-(--syn-bg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? "Suppression…" : "Supprimer cette session"}
        </button>
      </aside>

      <Modal open={reportModalOpen} onClose={() => setReportModalOpen(false)}>
        {isGenerating ? (
          <Spinner label="Génération du compte rendu…" />
        ) : (
          <>
            <h2 className="mb-1 text-[17px] font-semibold text-(--syn-text)">
              Choisir un modèle de compte rendu
            </h2>
            <p className="mb-4.5 text-[12.5px] text-(--syn-text-2)">
              Le format du compte rendu adapte les sections générées à partir de
              la transcription.
            </p>
            <div className="mb-5 flex flex-col gap-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
                Intégrés
              </div>
              {REPORT_TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() =>
                    setSelectedTemplate({
                      id: t.id,
                      name: t.name,
                      content: t.content,
                    })
                  }
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-[10px] border-[1.5px] p-3",
                    selectedTemplate.id === t.id
                      ? "border-(--syn-blue) bg-(--syn-blue-light)"
                      : "border-(--syn-border) hover:border-(--syn-blue)",
                  ].join(" ")}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--syn-bg) text-sm">
                    {t.icon}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-(--syn-text)">
                      {t.name}
                    </div>
                    <div className="mt-0.5 text-xs text-(--syn-text-2)">
                      {t.desc}
                    </div>
                    <div className="mt-1 text-[11px] text-(--syn-text-3)">
                      {t.content
                        .split("\n")
                        .filter((l) => l.startsWith("#"))
                        .map((l) => l.replace(/^#+\s*/, "").trim())
                        .join(" · ")}
                    </div>
                  </div>
                </button>
              ))}

              {customTemplates.length > 0 && (
                <>
                  <div className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
                    Mes modèles
                  </div>
                  {customTemplates.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() =>
                        setSelectedTemplate({
                          id: t.id,
                          name: t.name,
                          content: t.content,
                        })
                      }
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-[10px] border-[1.5px] p-3",
                        selectedTemplate.id === t.id
                          ? "border-(--syn-blue) bg-(--syn-blue-light)"
                          : "border-(--syn-border) hover:border-(--syn-blue)",
                      ].join(" ")}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--syn-bg) text-sm">
                        {t.icon ?? "📝"}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-(--syn-text)">
                          {t.name}
                        </div>
                        {t.description && (
                          <div className="mt-0.5 text-xs text-(--syn-text-2)">
                            {t.description}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-(--syn-text-3)">
                          {t.content
                            .split("\n")
                            .filter((l) => l.startsWith("#"))
                            .map((l) => l.replace(/^#+\s*/, "").trim())
                            .join(" · ")}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
            {reportError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {reportError}
              </p>
            )}
            <div className="flex justify-end gap-2.5">
              <Button onClick={() => setReportModalOpen(false)}>Annuler</Button>
              <Button variant="filled" onClick={generateReport}>
                Générer
              </Button>
            </div>
          </>
        )}
      </Modal>
      {copiedMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-(--syn-text) px-4 py-2 text-xs text-white shadow-lg">
          {copiedMsg}
        </div>
      )}
    </div>
  );
}

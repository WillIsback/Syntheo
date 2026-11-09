import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";

import { cn } from "@syntheo/utils";

import { type AutomationLabels, variableLabel } from "~/automations/labels";
import {
  type AvailableVariable,
  parseVariableTokens,
} from "~/automations/variables";

// Champ texte d'une étape où les variables s'affichent en pastilles : le
// texte enregistré garde les jetons `{{summary}}` ou `{{step:<id>}}`, le
// champ les montre sous leur nom (« Synthèse », « Texte généré »). Les
// pastilles sous le champ insèrent une variable à l'endroit du curseur.

const TOKEN_SPLIT = /(\{\{\s*(?:step:[\w-]+|[a-z_]+)\s*\}\})/g;

const CHIP_CLASS =
  "bg-chart-2/15 text-chart-2 rounded-pill mx-0.5 inline-block px-2 py-0 text-[11px] leading-5 font-medium align-baseline select-none";
const MISSING_CHIP_CLASS =
  "bg-destructive/10 text-destructive rounded-pill mx-0.5 inline-block px-2 py-0 text-[11px] leading-5 font-medium align-baseline select-none";

type ChipResolver = (token: string) => { label: string; known: boolean };

/** Texte enregistré → nœuds du champ (texte et pastilles). */
export function renderVariableText(
  element: HTMLElement,
  value: string,
  resolve: ChipResolver,
) {
  const nodes = value
    .split(TOKEN_SPLIT)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (parseVariableTokens(part).length === 1 && part.startsWith("{{")) {
        return createChip(element.ownerDocument, part, resolve(part));
      }
      return element.ownerDocument.createTextNode(part);
    });
  element.replaceChildren(...nodes);
}

/** Nœuds du champ → texte enregistré, pastilles comprises. */
export function serializeVariableText(element: Node): string {
  let text = "";
  element.childNodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const token = node.dataset.variableToken;
    if (token) {
      text += token;
    } else if (node.tagName === "BR") {
      text += "\n";
    } else {
      // Un retour à la ligne natif crée un bloc <div> : nouvelle ligne.
      text += (index > 0 ? "\n" : "") + serializeVariableText(node);
    }
  });
  return text;
}

function createChip(
  document: Document,
  token: string,
  { label, known }: { label: string; known: boolean },
) {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.variableToken = token;
  chip.title = token;
  chip.className = known ? CHIP_CLASS : MISSING_CHIP_CLASS;
  chip.textContent = label;
  return chip;
}

export function VariableField({
  id,
  value,
  onChange,
  variables,
  labels,
  multiline = false,
  placeholder,
  ariaLabel,
  monospace = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  variables: AvailableVariable[];
  labels: AutomationLabels;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  monospace?: boolean;
}) {
  const { t } = useLingui();
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const missing = t`Missing output`;

  const resolve: ChipResolver = (token) => {
    const variable = variables.find((item) => item.token === token);
    return variable
      ? { label: variableLabel(variable, labels), known: true }
      : { label: missing, known: false };
  };
  const chipKey = variables
    .map((variable) => `${variable.token}=${variableLabel(variable, labels)}`)
    .join("|");

  // Le champ n'est réécrit que si le texte enregistré diffère de ce qu'il
  // affiche (valeur changée ailleurs, pastille renommée) : la frappe garde
  // son curseur.
  const renderedChipKey = useRef<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (
      serializeVariableText(element) !== value ||
      renderedChipKey.current !== chipKey
    ) {
      renderVariableText(element, value, resolve);
      renderedChipKey.current = chipKey;
    }
  });

  const element = () => ref.current as HTMLDivElement;

  const emit = () => {
    const next = serializeVariableText(element());
    if (next !== value) onChange(next);
  };

  const rememberSelection = () => {
    const selection = element().ownerDocument.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (element().contains(range.commonAncestorContainer)) {
        savedRange.current = range.cloneRange();
      }
    }
  };

  const insertNodes = (nodes: Node[]) => {
    const target = element();
    const document = target.ownerDocument;
    let range = savedRange.current;
    if (!range || !target.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
    }
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));
    const last = nodes[nodes.length - 1];
    range.insertNode(fragment);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
    }
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
    emit();
  };

  const insertVariable = (variable: AvailableVariable) => {
    insertNodes([
      createChip(
        element().ownerDocument,
        variable.token,
        resolve(variable.token),
      ),
      element().ownerDocument.createTextNode(" "),
    ]);
    element().focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-variable-field
        onInput={emit}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={rememberSelection}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (multiline) {
              insertNodes([element().ownerDocument.createTextNode("\n")]);
            }
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          rememberSelection();
          const text = event.clipboardData.getData("text/plain");
          if (text) {
            insertNodes([
              element().ownerDocument.createTextNode(
                multiline ? text : text.replace(/\s*\n\s*/g, " "),
              ),
            ]);
          }
        }}
        className={cn([
          "border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-xs break-words whitespace-pre-wrap focus-visible:ring-1 focus-visible:outline-none",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          multiline ? "min-h-20" : "min-h-8",
          monospace && "font-mono",
        ])}
      />
      {variables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-[11px]">{t`Insert`}</span>
          {variables.map((variable) => (
            <button
              key={variable.token}
              type="button"
              title={variable.token}
              data-insert-variable={variable.token}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertVariable(variable)}
              className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 focus-visible:ring-ring rounded-pill px-2 py-0.5 text-[11px] font-medium focus-visible:ring-1 focus-visible:outline-none"
            >
              + {variableLabel(variable, labels)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Pastilles en lecture seule (variables disponibles, sortie d'une étape). */
export function VariableChips({
  caption,
  variables,
  labels,
}: {
  caption: string;
  variables: AvailableVariable[];
  labels: AutomationLabels;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{caption}</span>
      {variables.map((variable) => (
        <span
          key={variable.token}
          title={variable.token}
          data-variable-token={variable.token}
          className="bg-chart-2/15 text-chart-2 rounded-pill px-2 py-0.5 text-[11px] font-medium"
        >
          {variableLabel(variable, labels)}
        </span>
      ))}
    </div>
  );
}

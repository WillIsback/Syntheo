import { useMemo } from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@syntheo/utils";

import { DotsSixVertical } from "../icons";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    className={cn("flex h-full min-h-0 w-full min-w-0", className)}
    {...props}
  />
);

// Depuis la v4, `className` et `style` vont sur le div interne du panneau et
// la bibliothèque y pose `overflow: auto`. La v2 masquait le débordement : on
// garde ce comportement par défaut.
const ResizablePanel = ({
  className,
  style,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) => (
  <ResizablePrimitive.Panel
    className={cn("min-h-0 min-w-0", className)}
    style={{ overflow: "hidden", ...style }}
    {...props}
  />
);

// La poignée d'un groupe horizontal est un séparateur vertical : la v4 pose
// `aria-orientation="vertical"` dans un groupe horizontal, et inversement.
const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "bg-border focus-visible:ring-ring relative flex w-px cursor-col-resize touch-none items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
        <DotsSixVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

const STORAGE_PREFIX = "react-resizable-panels:";

type LegacyGroupState = Record<string, { layout?: unknown } | undefined>;

// La v2 enregistrait, sous `react-resizable-panels:<autoSaveId>`, un objet
// `{ "<clé des contraintes>": { layout: [70, 30] } }` par ensemble de panneaux.
// La v4 enregistre `{ "<id du panneau>": 70, … }` sous
// `react-resizable-panels:<id>:<id des panneaux>`. On convertit une seule fois
// l'ancienne disposition, sans effacer l'ancienne clé (retour arrière possible).
export function migrateLegacyPanelLayout(
  storage: Pick<Storage, "getItem" | "setItem">,
  autoSaveId: string,
  panelIds: readonly string[],
) {
  try {
    const nextKey = `${STORAGE_PREFIX}${[autoSaveId, ...panelIds].join(":")}`;
    if (storage.getItem(nextKey) !== null) {
      return;
    }

    const raw = storage.getItem(`${STORAGE_PREFIX}${autoSaveId}`);
    if (!raw) {
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    const legacyLayout = Object.values(parsed as LegacyGroupState)
      .map((entry) => entry?.layout)
      .find(
        (layout): layout is number[] =>
          Array.isArray(layout) &&
          layout.length === panelIds.length &&
          layout.every((size) => typeof size === "number"),
      );
    if (!legacyLayout) {
      return;
    }

    storage.setItem(
      nextKey,
      JSON.stringify(
        Object.fromEntries(panelIds.map((id, i) => [id, legacyLayout[i]])),
      ),
    );
  } catch {
    // Stockage indisponible ou valeur corrompue : disposition par défaut.
  }
}

// Mémorise la disposition d'un groupe, par ensemble de panneaux affichés
// (comme `autoSaveId` en v2), en reprenant la disposition enregistrée par la v2.
export function usePersistentPanelLayout({
  autoSaveId,
  panelIds,
}: {
  autoSaveId: string;
  panelIds: string[];
}) {
  const panelIdsKey = panelIds.join(":");
  useMemo(() => {
    if (typeof localStorage !== "undefined") {
      migrateLegacyPanelLayout(localStorage, autoSaveId, panelIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveId, panelIdsKey]);

  return ResizablePrimitive.useDefaultLayout({ id: autoSaveId, panelIds });
}

export type {
  Layout,
  PanelImperativeHandle as ImperativePanelHandle,
} from "react-resizable-panels";
export { ResizableHandle, ResizablePanel, ResizablePanelGroup };

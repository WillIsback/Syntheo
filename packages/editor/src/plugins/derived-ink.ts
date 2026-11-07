import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export type DerivedInkRange = { from: number; to: number };

export type DerivedInk<T> = {
  plugin: Plugin<DecorationSet>;
  /** Remplace la donnée extérieure lue par `compute` et recalcule l'encre. */
  setData: (data: T) => void;
};

// Encre calculée : des décorations en ligne posées sur des plages dérivées du
// document et d'une donnée extérieure. Le document n'est jamais modifié : ni
// l'enregistrement, ni l'export, ni le copier-coller ne voient ces
// décorations.
export function createDerivedInk<T>({
  className,
  data: initialData,
  compute,
}: {
  className: string;
  data: T;
  compute: (doc: PMNode, data: T) => readonly DerivedInkRange[];
}): DerivedInk<T> {
  const key = new PluginKey<DecorationSet>("derivedInk");
  let data = initialData;
  let currentView: EditorView | null = null;
  let pendingRefresh = false;

  const build = (doc: PMNode) => {
    const size = doc.content.size;
    const decorations = compute(doc, data).flatMap(({ from, to }) =>
      from >= 0 && to <= size && from < to
        ? [Decoration.inline(from, to, { class: className })]
        : [],
    );
    return DecorationSet.create(doc, decorations);
  };

  const refresh = () => {
    const view = currentView;
    if (!view || view.isDestroyed) {
      pendingRefresh = true;
      return;
    }
    pendingRefresh = false;
    view.dispatch(
      view.state.tr.setMeta(key, true).setMeta("addToHistory", false),
    );
  };

  const plugin = new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, previous) =>
        tr.docChanged || tr.getMeta(key) ? build(tr.doc) : previous,
    },
    props: {
      decorations: (state) => key.getState(state),
    },
    view: (view) => {
      currentView = view;
      if (pendingRefresh) queueMicrotask(refresh);
      return {
        destroy: () => {
          if (currentView === view) currentView = null;
        },
      };
    },
  });

  return {
    plugin,
    setData: (next) => {
      if (Object.is(next, data)) return;
      data = next;
      refresh();
    },
  };
}

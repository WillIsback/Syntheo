import type { ShortcutId } from "~/shared/shortcuts";

// Un écran peut prendre la main sur un raccourci global le temps où il est au
// premier plan (même modèle que `registerPreparedNoteStart`). Le raccourci
// global, enregistré en permanence dans `useMainShortcuts`, consulte ce
// registre avant son action par défaut.
type ShortcutAction = () => void;

const actions = new Map<ShortcutId, ShortcutAction>();

export function registerShortcutAction(
  id: ShortcutId,
  action: ShortcutAction,
): () => void {
  actions.set(id, action);
  return () => {
    if (actions.get(id) === action) {
      actions.delete(id);
    }
  };
}

export function runShortcutAction(id: ShortcutId): boolean {
  const action = actions.get(id);
  if (!action) {
    return false;
  }

  action();
  return true;
}

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { type SyntheticEvent, useCallback } from "react";

export type MenuItemDef =
  | {
      id: string;
      text: string;
      action: () => void;
      disabled?: boolean;
      accelerator?: string;
    }
  | { separator: true };

/**
 * Position du menu ouvert au clavier (touche menu, Maj+F10, Entrée sur un
 * bouton « ⋮ ») : sous l'élément qui a le focus. Sans position, Tauri place
 * le menu au pointeur, loin de l'élément (issue 600). `null` pour un
 * événement souris : le menu suit le pointeur.
 */
function keyboardMenuPosition(e: SyntheticEvent): LogicalPosition | null {
  const native = e.nativeEvent;
  if (
    native instanceof MouseEvent &&
    (native.clientX !== 0 || native.clientY !== 0)
  ) {
    return null;
  }
  const active = document.activeElement;
  const anchor =
    active instanceof Element && active !== document.body
      ? active
      : e.currentTarget instanceof Element
        ? e.currentTarget
        : null;
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return new LogicalPosition(rect.left, rect.bottom);
}

// Clic droit, clic sur un bouton « ⋮ » ou touche menu clavier : tout
// événement React suffit, seul le comportement par défaut est bloqué.
export async function showNativeContextMenu(
  items: MenuItemDef[],
  e: SyntheticEvent,
) {
  e.preventDefault();
  e.stopPropagation();
  // Lu avant les `await` : l'événement et le focus sont encore ceux du geste.
  const position = keyboardMenuPosition(e);

  const menuItems = await Promise.all(
    items.map((item) =>
      "separator" in item
        ? PredefinedMenuItem.new({ item: "Separator" })
        : MenuItem.new({
            id: item.id,
            text: item.text,
            enabled: !item.disabled,
            accelerator: item.accelerator,
            action: item.action,
          }),
    ),
  );

  const menu = await Menu.new({ items: menuItems });
  await (position ? menu.popup(position) : menu.popup());
}

export function useNativeContextMenu(items: MenuItemDef[]) {
  const showMenu = useCallback(
    async (e: SyntheticEvent) => {
      await showNativeContextMenu(items, e);
    },
    [items],
  );

  return showMenu;
}

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

// Clic droit, clic sur un bouton « ⋮ » ou touche menu clavier : tout
// événement React suffit, seul le comportement par défaut est bloqué.
async function showNativeContextMenu(items: MenuItemDef[], e: SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();

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
  await menu.popup();
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

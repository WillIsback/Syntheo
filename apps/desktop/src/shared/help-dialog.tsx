import { Trans, useLingui } from "@lingui/react/macro";
import { create } from "zustand";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { Kbd, KbdGroup } from "@syntheo/ui/components/ui/kbd";

import { documentationUrl } from "~/shared/documentation";
import {
  getShortcutPlatform,
  type ShortcutDef,
  SHORTCUT_GROUPS,
  shortcutGroupLabel,
  shortcutsInGroup,
  formatShortcutKeys,
  formatShortcut,
} from "~/shared/shortcuts";

// Fenêtre « Aide et raccourcis » (F1, menu Aide). Locale : elle fonctionne sans
// réseau ; seul le bouton de la documentation ouvre le navigateur.
const useHelpDialogStore = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function openHelpDialog() {
  useHelpDialogStore.getState().setOpen(true);
}

export function HelpDialogHost() {
  const open = useHelpDialogStore((state) => state.open);
  const setOpen = useHelpDialogStore((state) => state.setOpen);

  return <HelpDialog open={open} onOpenChange={setOpen} />;
}

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const os = getShortcutPlatform();

  const openDocumentation = () => {
    void openerCommands
      .openUrl(documentationUrl(), null)
      .catch((error) =>
        console.error("[help] failed to open documentation", error),
      );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans>Help and shortcuts</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Your notes are saved automatically.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} aria-label={shortcutGroupLabel(group)}>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase">
                {shortcutGroupLabel(group)}
              </h3>
              <dl className="flex flex-col gap-1">
                {shortcutsInGroup(group).map((def) => (
                  <ShortcutRow key={def.id} def={def} os={os} />
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          <Trans>
            Without a mouse: Tab moves to the next field, Shift+Tab to the
            previous one, Enter confirms.
          </Trans>
        </p>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-muted-foreground text-xs">
            <Trans>Opens your web browser.</Trans>
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={openDocumentation}
            aria-label={t`Open the online documentation (opens your web browser)`}
          >
            <Trans>Open the online documentation</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({
  def,
  os,
}: {
  def: ShortcutDef;
  os: ReturnType<typeof getShortcutPlatform>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt>{def.label()}</dt>
      <dd aria-label={formatShortcut(def.id, os)}>
        <KbdGroup aria-hidden="true">
          {formatShortcutKeys(def.id, os)
            .split(" ")
            .map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
        </KbdGroup>
      </dd>
    </div>
  );
}

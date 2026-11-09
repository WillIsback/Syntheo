import { Trans } from "@lingui/react/macro";

import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import {
  type PendingCommandConfirmation,
  useCommandConfirmation,
} from "./command-approval";

// Premier lancement d'une commande d'automatisation : l'utilisateur voit le
// programme et chaque argument tels qu'ils seront passés, sans interpréteur
// de commandes, puis autorise ou refuse. Fermer la fenêtre vaut refus.
export function CommandConfirmationDialog() {
  const pending = useCommandConfirmation((state) => state.pending);
  const answer = useCommandConfirmation((state) => state.answer);

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      {pending ? (
        <CommandConfirmationContent pending={pending} onAnswer={answer} />
      ) : null}
    </Dialog>
  );
}

export function CommandConfirmationContent({
  pending,
  onAnswer,
}: {
  pending: Pick<
    PendingCommandConfirmation,
    "program" | "args" | "workflowTitle"
  >;
  onAnswer: (approved: boolean) => void;
}) {
  const workflowTitle = pending.workflowTitle.trim();
  return (
    <DialogContent className="flex w-full max-w-lg flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-base">
          <Trans>Run this command?</Trans>
        </DialogTitle>
        <DialogDescription>
          {workflowTitle ? (
            <Trans>
              The automation “{workflowTitle}” wants to run a program on your
              computer for the first time.
            </Trans>
          ) : (
            <Trans>
              An automation wants to run a program on your computer for the
              first time.
            </Trans>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 font-mono text-xs">
        <div>
          <span className="text-muted-foreground font-sans">
            <Trans>Program</Trans>
          </span>
          <div className="break-all" data-command-program>
            {pending.program}
          </div>
        </div>
        {pending.args.length > 0 ? (
          <div>
            <span className="text-muted-foreground font-sans">
              <Trans>Arguments</Trans>
            </span>
            <ol className="list-decimal pl-5">
              {pending.args.map((arg, index) => (
                <li key={index} className="break-all whitespace-pre-wrap">
                  {arg}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        <Trans>
          Syntheo passes each argument as is, without a shell. Your answer is
          remembered for this exact command: if you change it, Syntheo asks
          again.
        </Trans>
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onAnswer(false)}>
          <Trans>Do not run</Trans>
        </Button>
        <Button type="button" onClick={() => onAnswer(true)}>
          <Trans>Allow and run</Trans>
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

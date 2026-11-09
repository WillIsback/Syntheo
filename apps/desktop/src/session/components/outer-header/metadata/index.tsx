import { AppFloatingPanel } from "@syntheo/ui/components/ui/popover";

import { DateEditor } from "./date";
import { ParticipantsDisplay } from "./participants";

export function MetadataPanelContent({ sessionId }: { sessionId: string }) {
  return (
    <AppFloatingPanel className="scrollbar-hide max-h-[80vh] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <DateEditor sessionId={sessionId} />
        <ParticipantsDisplay sessionId={sessionId} />
      </div>
    </AppFloatingPanel>
  );
}

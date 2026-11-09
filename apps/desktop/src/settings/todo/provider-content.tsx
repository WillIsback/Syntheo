import { useLingui } from "@lingui/react/macro";

import { AccessPermissionRow, TroubleShootingLink } from "./permission";
import type { TodoProvider } from "./shared";

import { usePermission } from "~/shared/hooks/usePermissions";

export function TodoProviderContent({ config }: { config: TodoProvider }) {
  if (config.permission === "reminders") {
    return <AppleRemindersProviderContent />;
  }

  // Seul fournisseur local : Apple Reminders (macOS). Plus d'intégration cloud.
  return null;
}

function AppleRemindersProviderContent() {
  const { t } = useLingui();
  const reminders = usePermission("reminders");

  if (reminders.status !== "authorized") {
    return (
      <AccessPermissionRow
        title={t`Reminders`}
        status={reminders.status}
        isPending={reminders.isPending}
        onOpen={reminders.open}
        onRequest={reminders.request}
        onReset={reminders.reset}
      />
    );
  }

  return (
    <TroubleShootingLink
      onRequest={reminders.request}
      onReset={reminders.reset}
      onOpen={reminders.open}
      isPending={reminders.isPending}
    />
  );
}

import { Trans } from "@lingui/react/macro";

import {
  AppFloatingPanel,
  appFloatingMenuPanelClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";

import { capsuleButtonClassName } from "./index";

import {
  AutomationLaunchMenuItems,
  useAutomationLaunchItems,
} from "~/automations/launch";

// Capsule en Synthèse : « Automatisations » lance une automatisation prête sur
// cette note. Rien n'est affiché tant qu'aucune n'est prête.
export function CapsuleAutomationMenu({ sessionId }: { sessionId: string }) {
  const items = useAutomationLaunchItems(sessionId);
  if (items.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={capsuleButtonClassName("ghost")}>
          <Trans>Automations</Trans>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent variant="app" align="center" side="top">
        <AppFloatingPanel className={appFloatingMenuPanelClassName}>
          <AutomationLaunchMenuItems items={items} />
        </AppFloatingPanel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

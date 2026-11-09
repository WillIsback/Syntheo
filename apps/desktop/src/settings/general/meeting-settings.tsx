import { Trans } from "@lingui/react/macro";
import { platform } from "@tauri-apps/plugin-os";

import { SettingSwitchRow } from "~/settings/setting-row";

interface SettingItem {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function MeetingSettingsView({
  autoStopMeetings,
  floatingBar,
  meetingDisclosureAutoPost,
  captureMeetingChat,
  captureSharedScreens,
  captureReminder,
}: {
  autoStopMeetings: SettingItem;
  floatingBar: SettingItem;
  meetingDisclosureAutoPost: SettingItem;
  captureMeetingChat: SettingItem;
  captureSharedScreens: SettingItem;
  captureReminder: SettingItem;
}) {
  const currentPlatform = platform();
  const supportsMeetingAx =
    currentPlatform === "macos" || currentPlatform === "linux";
  const supportsScreenCapture =
    currentPlatform === "macos" || currentPlatform === "windows";

  return (
    <div className="flex flex-col gap-4">
      {/* La fin d'usage du micro est détectée sur toutes les plateformes, y
          compris Windows (sessions WASAPI de capture, issue 407). */}
      <SettingSwitchRow
        settingId="auto-stop-meetings"
        title={<Trans>Stop when meeting ends</Trans>}
        description={<Trans>Stop listening when your call ends.</Trans>}
        checked={autoStopMeetings.value}
        onChange={autoStopMeetings.onChange}
      />
      {supportsMeetingAx && (
        <>
          <SettingSwitchRow
            settingId="meeting-disclosure"
            title={<Trans>Post recording disclosure in meeting chat</Trans>}
            description={
              <Trans>
                Tell participants when listening starts; this does not confirm
                consent.
              </Trans>
            }
            checked={meetingDisclosureAutoPost.value}
            onChange={meetingDisclosureAutoPost.onChange}
          />
          <SettingSwitchRow
            settingId="capture-meeting-chat"
            title={<Trans>Capture meeting chat in the note</Trans>}
            description={
              <Trans>
                Save visible chat from supported meetings using Accessibility.
              </Trans>
            }
            checked={captureMeetingChat.value}
            onChange={captureMeetingChat.onChange}
          />
        </>
      )}
      {supportsScreenCapture && (
        <SettingSwitchRow
          settingId="capture-shared-screens"
          title={<Trans>Capture shared screens in the note</Trans>}
          description={
            <Trans>
              Save slides and screens others share in meetings. Requires Screen
              Recording.
            </Trans>
          }
          checked={captureSharedScreens.value}
          onChange={captureSharedScreens.onChange}
        />
      )}
      <SettingSwitchRow
        settingId="capture-reminder"
        title={<Trans>Remind participants about recording</Trans>}
        description={<Trans>Show a reminder when a recording starts.</Trans>}
        checked={captureReminder.value}
        onChange={captureReminder.onChange}
      />
      <SettingSwitchRow
        settingId="floating-bar"
        title={<Trans>Show floating bar</Trans>}
        description={
          <Trans>Control listening without reopening Syntheo.</Trans>
        }
        checked={floatingBar.value}
        onChange={floatingBar.onChange}
      />
    </div>
  );
}

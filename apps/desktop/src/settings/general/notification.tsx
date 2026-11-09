import { Trans } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { platform } from "@tauri-apps/plugin-os";
import { useState } from "react";

import { commands as notificationCommands } from "@syntheo/plugin-notification";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";
import { cn } from "@syntheo/utils";

import { toggleIgnoredApp } from "./notification-app-options";
import {
  IgnoredAppsSelector,
  useNotificationAppLists,
} from "./notification-ignored-apps";

import { useSetSettingValues } from "~/settings/queries";
import { SettingRow, SettingSwitchRow } from "~/settings/setting-row";
import {
  type CompletionSoundName,
  normalizeCompletionSoundName,
  previewCompletionSound,
} from "~/shared/completion-sound";
import { useConfigValues } from "~/shared/config";

type CompletionSoundRowProps = {
  sound: CompletionSoundName;
  disabled: boolean;
  onSoundChange: (sound: CompletionSoundName) => void;
  onPreview: () => void;
};

function CompletionSoundRow({
  sound,
  disabled,
  onSoundChange,
  onPreview,
}: CompletionSoundRowProps) {
  return (
    <SettingRow
      settingId="completion-sound-name"
      title={<Trans>Sound</Trans>}
      description={<Trans>Choose from five completion sounds.</Trans>}
    >
      {(labelProps) => (
        <div className="flex w-full items-center gap-2">
          <Select
            value={sound}
            onValueChange={(value) =>
              onSoundChange(normalizeCompletionSoundName(value))
            }
            disabled={disabled}
          >
            <SelectTrigger {...labelProps} className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="ready">
                <Trans>Ready</Trans>
              </SelectItem>
              <SelectItem value="success">
                <Trans>Success</Trans>
              </SelectItem>
              <SelectItem value="chime">
                <Trans>Chime</Trans>
              </SelectItem>
              <SelectItem value="sparkle">
                <Trans>Sparkle</Trans>
              </SelectItem>
              <SelectItem value="bloom">
                <Trans>Bloom</Trans>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onPreview}
          >
            <Trans>Preview</Trans>
          </Button>
        </div>
      )}
    </SettingRow>
  );
}

export function NotificationSettingsView() {
  const currentPlatform = platform();
  const supportsDoNotDisturb = currentPlatform === "macos";
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const configs = useConfigValues([
    "notification_disabled",
    "notification_detect",
    "notification_summary_complete",
    "notification_cloudsync_complete",
    "notification_recording",
    "notification_completion_sound",
    "notification_completion_sound_name",
    "notification_bounce",
    "show_app_in_dock",
    "respect_dnd",
    "ignored_platforms",
    "included_platforms",
    "mic_active_threshold",
  ] as const);

  useMountEffect(() => {
    void notificationCommands
      .clearNotifications()
      .catch((error) =>
        console.error("[notification] failed to clear notifications", error),
      );
    return () => {
      void notificationCommands
        .clearNotifications()
        .catch((error) =>
          console.error("[notification] failed to clear notifications", error),
        );
    };
  });

  const { installedApps, defaultIgnoredBundleIds } = useNotificationAppLists();

  const setSettingValues = useSetSettingValues();

  const form = useForm({
    defaultValues: {
      notification_disabled: configs.notification_disabled,
      notification_detect: configs.notification_detect,
      notification_summary_complete: configs.notification_summary_complete,
      notification_cloudsync_complete: configs.notification_cloudsync_complete,
      notification_recording: configs.notification_recording,
      notification_completion_sound: configs.notification_completion_sound,
      notification_completion_sound_name: normalizeCompletionSoundName(
        configs.notification_completion_sound_name,
      ),
      notification_bounce: configs.notification_bounce,
      respect_dnd: configs.respect_dnd,
      ignored_platforms: configs.ignored_platforms,
      included_platforms: configs.included_platforms,
      mic_active_threshold: configs.mic_active_threshold,
    },
    listeners: {
      onChange: ({ formApi }) => {
        void formApi.handleSubmit();
      },
    },
    onSubmit: ({ value }) => {
      setSettingValues({
        notification_disabled: value.notification_disabled,
        notification_detect: value.notification_detect,
        notification_summary_complete: value.notification_summary_complete,
        notification_cloudsync_complete: value.notification_cloudsync_complete,
        notification_recording: value.notification_recording,
        notification_completion_sound: value.notification_completion_sound,
        notification_completion_sound_name:
          value.notification_completion_sound_name,
        notification_bounce: value.notification_bounce,
        respect_dnd: value.respect_dnd,
        ignored_platforms: JSON.stringify(value.ignored_platforms),
        included_platforms: JSON.stringify(value.included_platforms),
        mic_active_threshold: value.mic_active_threshold,
      });
    },
  });

  const handleToggleIgnoredApp = (
    bundleId: string,
    ignoredPlatforms: string[],
    includedPlatforms: string[],
  ) => {
    if (!bundleId) {
      return;
    }

    const {
      ignoredPlatforms: newIgnoredPlatforms,
      includedPlatforms: newIncludedPlatforms,
    } = toggleIgnoredApp({
      bundleId,
      ignoredPlatforms,
      includedPlatforms,
      defaultIgnoredBundleIds,
    });

    form.setFieldValue("ignored_platforms", newIgnoredPlatforms);
    form.setFieldValue("included_platforms", newIncludedPlatforms);
    void form.handleSubmit();
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <form.Field name="notification_disabled">
        {(field) => (
          <SettingSwitchRow
            settingId="notifications-disabled"
            title={<Trans>Disable all notifications</Trans>}
            description={
              <Trans>
                Hide all notification panels, Dock alerts, and completion
                sounds.
              </Trans>
            }
            checked={field.state.value}
            onChange={(disabled) => {
              field.handleChange(disabled);
              if (disabled) {
                void notificationCommands
                  .clearNotifications()
                  .catch((error) =>
                    console.error(
                      "[notification] failed to clear notifications",
                      error,
                    ),
                  );
              }
            }}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.notification_disabled}>
        {(notificationsDisabled) => (
          <>
            <form.Field name="notification_summary_complete">
              {(field) => (
                <SettingSwitchRow
                  settingId="notify-summary-complete"
                  title={<Trans>Summary complete</Trans>}
                  description={<Trans>Show when a summary is ready.</Trans>}
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_cloudsync_complete">
              {(field) => (
                <SettingSwitchRow
                  settingId="notify-cloud-sync"
                  title={<Trans>Cloud sync complete</Trans>}
                  description={
                    <Trans>Show when initial cloud sync finishes.</Trans>
                  }
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_recording">
              {(field) => (
                <SettingSwitchRow
                  settingId="notify-recording"
                  title={<Trans>Recording status prompts</Trans>}
                  description={
                    <Trans>
                      Ask before stopping when a meeting may have ended. When
                      alerts are off, Syntheo keeps listening.
                    </Trans>
                  }
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_completion_sound">
              {(field) => (
                <div className="flex flex-col gap-4">
                  <SettingSwitchRow
                    settingId="completion-sound"
                    title={<Trans>Completion sound</Trans>}
                    description={
                      <Trans>
                        Play a sound when transcription, summaries, or cloud
                        sync finish.
                      </Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />

                  {field.state.value && (
                    <div className={cn(["border-muted ml-3 border-l-2 pl-4"])}>
                      <form.Field name="notification_completion_sound_name">
                        {(soundField) => (
                          <CompletionSoundRow
                            sound={soundField.state.value}
                            disabled={notificationsDisabled}
                            onSoundChange={(sound) => {
                              soundField.handleChange(sound);
                              previewCompletionSound(sound);
                            }}
                            onPreview={() =>
                              previewCompletionSound(soundField.state.value)
                            }
                          />
                        )}
                      </form.Field>
                    </div>
                  )}
                </div>
              )}
            </form.Field>

            {(currentPlatform !== "macos" || configs.show_app_in_dock) && (
              <form.Field name="notification_bounce">
                {(field) => (
                  <SettingSwitchRow
                    settingId="notify-bounce"
                    title={<Trans>Bounce app icon</Trans>}
                    description={
                      <Trans>
                        Get your attention when a summary is ready in the
                        background.
                      </Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />
                )}
              </form.Field>
            )}

            {/* La détection micro marche sur macOS, Linux et Windows
                (sessions WASAPI de capture, issue 407). */}
            <form.Field name="notification_detect">
              {(field) => (
                <div className="flex flex-col gap-4">
                  <SettingSwitchRow
                    settingId="mic-detection"
                    title={<Trans>Microphone detection</Trans>}
                    description={
                      <Trans>Detect meetings from microphone activity.</Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />

                  {field.state.value && !notificationsDisabled && (
                    <div
                      className={cn(["border-muted ml-3 border-l-2 pt-2 pl-4"])}
                    >
                      <form.Field name="mic_active_threshold">
                        {(thresholdField) => (
                          <div
                            data-setting-id="detection-delay"
                            className="mb-4 flex items-center justify-between gap-4"
                          >
                            <div className="flex-1">
                              <h4 className="text-sm font-medium">
                                <Trans>Detection delay</Trans>
                              </h4>
                              <p className="text-muted-foreground text-xs">
                                <Trans>
                                  Wait before treating microphone activity as a
                                  meeting.
                                </Trans>
                              </p>
                            </div>
                            <Select
                              value={String(thresholdField.state.value)}
                              onValueChange={(v) =>
                                thresholdField.handleChange(Number(v))
                              }
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectItem value="5">5 sec</SelectItem>
                                <SelectItem value="10">10 sec</SelectItem>
                                <SelectItem value="15">15 sec</SelectItem>
                                <SelectItem value="30">30 sec</SelectItem>
                                <SelectItem value="60">1 min</SelectItem>
                                <SelectItem value="120">2 min</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </form.Field>

                      <div data-setting-id="excluded-apps">
                        <div className="mb-3 flex flex-col gap-1">
                          <h4 className="text-sm font-medium">
                            <Trans>Exclude apps from detection</Trans>
                          </h4>
                          <p className="text-muted-foreground text-xs">
                            <Trans>
                              Prevent selected apps from triggering meeting
                              detection.
                            </Trans>
                          </p>
                        </div>
                        <form.Subscribe selector={(state) => state.values}>
                          {(values) => (
                            <IgnoredAppsSelector
                              installedApps={installedApps}
                              defaultIgnoredBundleIds={defaultIgnoredBundleIds}
                              ignoredPlatforms={values.ignored_platforms}
                              includedPlatforms={values.included_platforms}
                              searchOpen={searchOpen}
                              searchQuery={searchQuery}
                              onSearchOpenChange={setSearchOpen}
                              onSearchQueryChange={setSearchQuery}
                              onToggleApp={handleToggleIgnoredApp}
                            />
                          )}
                        </form.Subscribe>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form.Field>

            {supportsDoNotDisturb && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4 pt-4 pb-2">
                  <div className="border-muted min-w-0 flex-1 border-t" />
                  <span className="text-muted-foreground shrink-0 text-xs font-medium">
                    <Trans>For enabled notifications</Trans>
                  </span>
                  <div className="border-muted min-w-0 flex-1 border-t" />
                </div>

                <form.Subscribe
                  selector={(state) =>
                    !state.values.notification_disabled &&
                    state.values.notification_detect
                  }
                >
                  {(anyNotificationEnabled) => (
                    <form.Field name="respect_dnd">
                      {(field) => (
                        <SettingSwitchRow
                          settingId="respect-dnd"
                          title={<Trans>Respect Do-Not-Disturb mode</Trans>}
                          description={
                            <Trans>
                              Pause alerts while Do Not Disturb is on.
                            </Trans>
                          }
                          checked={field.state.value}
                          onChange={field.handleChange}
                          disabled={!anyNotificationEnabled}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>
              </div>
            )}
          </>
        )}
      </form.Subscribe>
    </div>
  );
}

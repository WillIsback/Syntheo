import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { act, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useStoredSettingValuesQuery: vi.fn(),
  mutateCloudSync: vi.fn(),
  setSettingValues: vi.fn(),
  meetingSettingsProps: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { configured: true },
    isLoading: false,
  }),
  useMutation: () => ({
    isPending: false,
    variables: undefined,
    mutate: mocks.mutateCloudSync,
  }),
}));

vi.mock("~/billing/billing-context", () => ({
  useBillingAccess: () => ({ isPro: true }),
}));

vi.mock("~/settings/queries", () => ({
  setSettingValue: vi.fn(),
  useSetSettingValues: () => mocks.setSettingValues,
  useStoredSettingValuesQuery: mocks.useStoredSettingValuesQuery,
}));

vi.mock("./account-profile", () => ({
  AccountProfile: () => <span>Profil local</span>,
}));
vi.mock("./app-settings", () => ({ AppSettingsView: () => null }));
vi.mock("./audio-settings", () => ({
  AudioSettingsView: () => <span>Audio settings</span>,
}));
vi.mock("./main-language", () => ({
  MainLanguageView: ({ value }: { value: string }) => (
    <span data-testid="main-language">{value}</span>
  ),
}));
vi.mock("./meeting-settings", () => ({
  MeetingSettingsView: (props: unknown) => {
    mocks.meetingSettingsProps(props);
    return <span>Meeting settings</span>;
  },
}));
vi.mock("./notification", () => ({ NotificationSettingsView: () => null }));
vi.mock("./permissions", () => ({ Permissions: () => null }));
vi.mock("./single-language-model-hint", () => ({
  SingleLanguageModelHint: () => null,
}));
vi.mock("./storage", () => ({ StorageSettingsView: () => null }));
vi.mock("./timezone", () => ({ TimezoneSelector: () => null }));
vi.mock("./week-start", () => ({ WeekStartSelector: () => null }));

import { SettingsApp, SettingsMeetings } from "./index";

import {
  requestSettingFocus,
  usePendingSettingFocus,
  useSettingFocus,
} from "~/settings/setting-focus";

function SettingsAppWithFocus() {
  const ref = useRef<HTMLDivElement>(null);
  usePendingSettingFocus(ref);
  return (
    <div ref={ref}>
      <SettingsApp />
    </div>
  );
}

describe("SettingsApp", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("waits for SQLite settings before constructing the form", () => {
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<SettingsApp />);

    expect(screen.getByLabelText("Loading settings")).toBeTruthy();
  });

  it("constructs the form from the hydrated SQLite values", () => {
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: {
        values: {
          ai_language: "ko",
          spoken_languages: JSON.stringify(["en"]),
        },
        hasValues: new Set(["ai_language", "spoken_languages"]),
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsApp />);

    expect(screen.getByTestId("main-language").textContent).toBe("ko");
  });

  it("account_profile_is_reachable_from_general", () => {
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: { values: {}, hasValues: new Set() },
      isLoading: false,
      error: null,
    });

    render(<SettingsApp />);

    expect(screen.getByText("Profil local")).toBeTruthy();
  });

  it("persists meeting switch toggles", async () => {
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: {
        values: {},
        hasValues: new Set(),
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsMeetings />);

    const props = mocks.meetingSettingsProps.mock.lastCall?.[0] as {
      autoStartScheduledMeetings: {
        value: boolean;
        onChange: (value: boolean) => void;
      };
    };
    expect(props.autoStartScheduledMeetings.value).toBe(true);

    act(() => props.autoStartScheduledMeetings.onChange(false));

    await waitFor(() => {
      expect(mocks.setSettingValues).toHaveBeenCalledWith(
        expect.objectContaining({ auto_start_scheduled_meetings: false }),
      );
    });
  });

  it("persists the main-language summary option without removing Korean transcription", async () => {
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: {
        values: { ai_language: "en", spoken_languages: '["ko"]' },
        hasValues: new Set(["ai_language", "spoken_languages"]),
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsApp />);
    fireEvent.click(
      screen.getByRole("switch", { name: "Use main language for summaries" }),
    );

    await waitFor(() => {
      expect(mocks.setSettingValues).toHaveBeenCalledWith(
        expect.objectContaining({
          summary_use_main_language: true,
          ai_language: "en",
          spoken_languages: '["ko"]',
        }),
      );
    });
  });

  // Issue 351 : « Modifier » dans la marge de transcription mène au réglage
  // des langues parlées, focus compris, une fois les réglages chargés.
  it("scrolls to and focuses the spoken languages once settings load", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    requestSettingFocus("spoken-languages");

    const { rerender } = render(<SettingsAppWithFocus />);
    expect(useSettingFocus.getState().pending).toBe("spoken-languages");

    mocks.useStoredSettingValuesQuery.mockReturnValue({
      data: {
        values: { ai_language: "en", spoken_languages: '["fr"]' },
        hasValues: new Set(["ai_language", "spoken_languages"]),
      },
      isLoading: false,
      error: null,
    });
    rerender(<SettingsAppWithFocus />);

    const input = screen.getByRole("combobox", { name: "Add spoken language" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    const setting = input.closest("[data-setting-id='spoken-languages']");
    expect(setting).toBeTruthy();
    expect(scrollIntoView.mock.contexts[0]).toBe(setting);
    expect(useSettingFocus.getState().pending).toBeNull();
  });
});

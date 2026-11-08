import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NativeMenuLocaleSync } from "./native-menu-locale";

const mocks = vi.hoisted(() => ({
  locale: "fr",
  setNativeMenuLocale: vi.fn(() =>
    Promise.resolve({ status: "ok" as const, data: null }),
  ),
  windowLabel: "main",
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({ i18n: { locale: mocks.locale } }),
}));

vi.mock("@syntheo/plugin-tray", () => ({
  commands: { setNativeMenuLocale: mocks.setNativeMenuLocale },
}));

vi.mock("@syntheo/plugin-windows", () => ({
  getCurrentWebviewWindowLabel: () => mocks.windowLabel,
}));

describe("NativeMenuLocaleSync", () => {
  beforeEach(() => {
    mocks.setNativeMenuLocale.mockClear();
    mocks.locale = "fr";
    mocks.windowLabel = "main";
  });

  afterEach(() => {
    cleanup();
  });

  test("sends the display locale to the native menus", () => {
    mocks.locale = "en";
    render(<NativeMenuLocaleSync />);

    expect(mocks.setNativeMenuLocale).toHaveBeenCalledExactlyOnceWith("en");
  });

  test("sends the new locale when the display language changes", () => {
    const view = render(<NativeMenuLocaleSync />);
    view.rerender(<NativeMenuLocaleSync />);

    mocks.locale = "en";
    view.rerender(<NativeMenuLocaleSync />);

    expect(mocks.setNativeMenuLocale.mock.calls).toEqual([["fr"], ["en"]]);
  });

  test("only the main window drives the native menus", () => {
    mocks.windowLabel = "floating-bar";
    render(<NativeMenuLocaleSync />);

    expect(mocks.setNativeMenuLocale).not.toHaveBeenCalled();
  });
});

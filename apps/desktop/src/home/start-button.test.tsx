import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartButton } from "./start-button";

describe("StartButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("affiche titre, les trois étapes et le raccourci", () => {
    render(<StartButton onStart={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Start a meeting/ });

    // Calendrier retiré (issue 465) : plus d'aide « tiré de l'agenda ».
    expect(button.textContent).not.toContain("calendar");
    expect(button.textContent).toContain("Ctrl N");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+N");

    const steps = button.querySelector("[data-steps]");
    expect(
      Array.from(steps?.children ?? []).map((step) => step.textContent),
    ).toEqual(["1Prepare", "2Listen", "3Synthesis"]);
    // Pas de kanji ici : un seul clin d'œil par zone (le filigrane 茶).
    expect(steps?.querySelector(".font-kanji")).toBeNull();
    expect(button.textContent).not.toMatch(/[備聴結]/);
  });

  it("utilise les jetons primary, rayon 16px et un focus visible", () => {
    render(<StartButton onStart={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Start a meeting/ });
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("text-primary-foreground");
    expect(button.className).toContain("hover:bg-primary-hover");
    expect(button.className).toContain("rounded-2xl");
    expect(button.className).toContain("focus-visible:ring-2");
    expect(button.className).toContain("motion-safe:transition-colors");
    expect(button.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("appelle onStart au clic", () => {
    const onStart = vi.fn();
    render(<StartButton onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /Start a meeting/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

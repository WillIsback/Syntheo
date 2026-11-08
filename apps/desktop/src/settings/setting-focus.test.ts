import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { focusSetting, SETTING_HIGHLIGHT_MS } from "~/settings/setting-focus";

function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("focusSetting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("fait défiler, donne le focus au réglage et le surligne 2 secondes", () => {
    const root = mount(
      `<div data-setting-id="theme"><button role="switch">Thème</button></div>`,
    );
    const row = root.querySelector<HTMLElement>("[data-setting-id]")!;

    expect(focusSetting(root, "theme")).toBe(true);

    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(document.activeElement).toBe(root.querySelector("button"));
    expect(row.hasAttribute("data-setting-highlight")).toBe(true);
    expect(SETTING_HIGHLIGHT_MS).toBe(2_000);

    vi.advanceTimersByTime(SETTING_HIGHLIGHT_MS - 1);
    expect(row.hasAttribute("data-setting-highlight")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(row.hasAttribute("data-setting-highlight")).toBe(false);
  });

  it("place le focus sur l'option cochée d'un groupe de choix", () => {
    const root = mount(`
      <div data-setting-id="theme" role="radiogroup">
        <button role="radio" aria-checked="false">Clair</button>
        <button role="radio" aria-checked="true">Sombre</button>
      </div>`);

    focusSetting(root, "theme");

    expect(document.activeElement?.textContent).toBe("Sombre");
  });

  it("rend la ligne focalisable quand elle n'a aucun champ actif", () => {
    const root = mount(
      `<div data-setting-id="notify-events"><button disabled>Off</button></div>`,
    );
    const row = root.querySelector<HTMLElement>("[data-setting-id]")!;

    focusSetting(root, "notify-events");

    expect(row.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(row);
  });

  it("cible le réglage parent quand le réglage demandé est masqué", () => {
    const root = mount(
      `<div data-setting-id="mic-detection"><button role="switch">Détection</button></div>`,
    );

    expect(focusSetting(root, "detection-delay")).toBe(true);

    expect(
      root
        .querySelector("[data-setting-id='mic-detection']")
        ?.hasAttribute("data-setting-highlight"),
    ).toBe(true);
  });

  it("attend que le réglage soit affiché", () => {
    const root = mount(`<p>Chargement…</p>`);

    expect(focusSetting(root, "theme")).toBe(false);
  });
});

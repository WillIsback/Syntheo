import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
vi.mock("./searchable-select", () => ({
  SearchableSelect: (props: Record<string, unknown>) => {
    select.props = props;
    return <span data-testid="value">{String(props.value)}</span>;
  },
}));

import { MainLanguageView } from "./main-language";

afterEach(cleanup);

describe("MainLanguageView", () => {
  it("offers automatic detection first and keeps it selected", () => {
    const onChange = vi.fn();
    render(
      <MainLanguageView
        value="auto"
        onChange={onChange}
        supportedLanguages={["fr", "en"]}
      />,
    );

    expect(screen.getByTestId("value").textContent).toBe("auto");
    const options = select.props?.options as { value: string; label: string }[];
    expect(options[0]).toEqual({
      value: "auto",
      label: "Automatic detection",
    });
    expect(options.map((option) => option.value)).toEqual(["auto", "fr", "en"]);
  });
});

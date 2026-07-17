/**
 * Syntheo design tokens — TS mirror of tokens.css, for use in logic
 * (charts, canvas, dynamic inline styles) where a CSS var can't be read directly.
 * Keep in sync with tokens.css by hand — these are source-of-truth constants,
 * not computed from the CSS file.
 */

export const color = {
  blue: "#1A73E8",
  blueLight: "#E8F0FE",
  blueDark: "#1557B0",
  surface: "#FFFFFF",
  bg: "#F8F9FA",
  border: "#E0E0E0",
  borderSoft: "#F1F3F4",
  text: "#202124",
  text2: "#5F6368",
  text3: "#9AA0A6",
} as const;

/** Speaker palette, cycled by diarization order. */
export const speakerPalette = [
  { fg: "#1A73E8", bg: "#E8F0FE" }, // s1 blue
  { fg: "#0F9D58", bg: "#E6F4EA" }, // s2 green
  { fg: "#E37400", bg: "#FEF3E2" }, // s3 amber
  { fg: "#A142F4", bg: "#F3E8FD" }, // s4 purple
] as const;

export function speakerColor(index: number) {
  return speakerPalette[index % speakerPalette.length];
}

export type SessionStatus = "recording" | "processing" | "done";

export const statusColor: Record<SessionStatus, { bg: string; fg: string }> = {
  recording: { bg: "#FCE8E6", fg: "#C5221F" },
  processing: { bg: "#FEF3E2", fg: "#E37400" },
  done: { bg: "#E6F4EA", fg: "#137333" },
};

export const warn = { bg: "#FEF3E2", border: "#F9AB00", fg: "#7A4300" };

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  pill: 999,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

export const font = {
  ui: "'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
} as const;

export const fontSize = {
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  18: 18,
  20: 20,
  28: 28,
} as const;

export const shadow = {
  sm: "0 1px 4px rgba(0,0,0,.12)",
  md: "0 2px 8px rgba(0,0,0,.08)",
} as const;

export const layout = {
  topbarHeight: 52,
  sidebarWidth: 256,
  rightPanelWidth: 240,
} as const;

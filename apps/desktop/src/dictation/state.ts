import { create } from "zustand";

import type { DictationPhase } from "./controller";

export const useDictationStatus = create<{
  capturingShortcut: boolean;
  phase: DictationPhase;
  error: string | null;
  lastTranscript: string;
  ready: boolean;
  retry: number;
  owner: string | null;
  presentedOwner: string | null;
  microphone: string;
  amplitude: number;
  text: string;
  partial: string;
  previewEnabled: boolean;
  previewUnavailable: boolean;
  /** Issue 665 : hôte en HTTP clair hors de ce poste, sinon `null`. */
  cleartextHost: string | null;
  expanded: boolean;
  cancel: (() => void) | null;
  finish: (() => void) | null;
}>(() => ({
  capturingShortcut: false,
  phase: "idle",
  error: null,
  lastTranscript: "",
  ready: false,
  retry: 0,
  owner: null,
  presentedOwner: null,
  microphone: "Default microphone",
  amplitude: 0,
  text: "",
  partial: "",
  previewEnabled: false,
  previewUnavailable: false,
  cleartextHost: null,
  expanded: false,
  cancel: null,
  finish: null,
}));

import { create } from "zustand";

// Langues réellement transcrites en direct pour chaque note en écoute. Le
// modèle de transcription ne prend parfois que la langue principale : les
// autres langues parlées sont alors omises et la note l'indique (issue 351).
type LiveTranscriptionLanguages = {
  primary: string;
  omitted: string[];
};

type LiveTranscriptionLanguagesState = {
  bySession: Record<string, LiveTranscriptionLanguages>;
  setLanguages: (
    sessionId: string,
    config: {
      languages: readonly string[];
      omittedLanguages?: readonly string[];
    },
  ) => void;
};

export const useLiveTranscriptionLanguages =
  create<LiveTranscriptionLanguagesState>((set) => ({
    bySession: {},
    setLanguages: (sessionId, { languages, omittedLanguages }) =>
      set((state) => {
        const primary = languages[0];
        const { [sessionId]: _previous, ...rest } = state.bySession;
        if (!primary || !omittedLanguages || omittedLanguages.length === 0) {
          return sessionId in state.bySession ? { bySession: rest } : state;
        }

        return {
          bySession: {
            ...rest,
            [sessionId]: { primary, omitted: [...omittedLanguages] },
          },
        };
      }),
  }));

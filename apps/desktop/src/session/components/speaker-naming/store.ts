import { create } from "zustand";

// État partagé de « Nommer les intervenants » (issue 321) :
// - `available` : la note affichée qui a des locuteurs anonymes, pour la
//   commande de la palette Ctrl K ;
// - `requested` : la note dont le panneau doit s'ouvrir (palette) ;
// - `named` : les notes où un nom a été donné depuis l'ouverture de l'app,
//   pour proposer « Régénérer la synthèse avec les noms ».
type SpeakerNamingState = {
  available: { sessionId: string; count: number } | null;
  requested: string | null;
  named: Record<string, true>;
};

export const useSpeakerNamingStore = create<SpeakerNamingState>(() => ({
  available: null,
  requested: null,
  named: {},
}));

export function markSpeakerNamed(sessionId: string) {
  useSpeakerNamingStore.setState((state) =>
    state.named[sessionId]
      ? state
      : { named: { ...state.named, [sessionId]: true } },
  );
}

export function clearSpeakerNamed(sessionId: string) {
  useSpeakerNamingStore.setState((state) => {
    if (!state.named[sessionId]) return state;
    const { [sessionId]: _removed, ...named } = state.named;
    return { named };
  });
}

export function setSpeakerNamingAvailable(
  available: SpeakerNamingState["available"],
) {
  useSpeakerNamingStore.setState((state) =>
    state.available?.sessionId === available?.sessionId &&
    state.available?.count === available?.count
      ? state
      : { available },
  );
}

/** Demande l'ouverture du panneau (commande de la palette). */
export function requestSpeakerNaming(sessionId: string) {
  useSpeakerNamingStore.setState({ requested: sessionId });
}

export function consumeSpeakerNamingRequest() {
  useSpeakerNamingStore.setState({ requested: null });
}

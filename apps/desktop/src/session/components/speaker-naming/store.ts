import { create } from "zustand";

// État partagé de « Nommer les intervenants » (issue 321) :
// - `available` : la note affichée qui a des locuteurs anonymes, pour la
//   commande de la palette Ctrl K ;
// - `requested` : la note dont le panneau doit s'ouvrir (palette) ;
// - `named` : par note, l'heure (ms) du dernier nom donné depuis l'ouverture
//   de l'app. La barre la compare à l'heure de la synthèse affichée pour
//   proposer « Régénérer la synthèse avec les noms » (issue 773).
type SpeakerNamingState = {
  available: { sessionId: string; count: number } | null;
  requested: string | null;
  named: Record<string, number>;
};

export const useSpeakerNamingStore = create<SpeakerNamingState>(() => ({
  available: null,
  requested: null,
  named: {},
}));

export function markSpeakerNamed(sessionId: string, at = Date.now()) {
  useSpeakerNamingStore.setState((state) => ({
    named: { ...state.named, [sessionId]: at },
  }));
}

/**
 * Un nom a-t-il été donné après la synthèse affichée ? Une synthèse générée
 * ensuite part de la transcription déjà nommée : rien à proposer. Sans heure
 * de génération (synthèse ancienne), tout nom donné compte.
 */
export function namedSinceSummary(
  namedAt: number | undefined,
  summaryGeneratedAt: string | null | undefined,
): boolean {
  if (namedAt === undefined) return false;
  const generatedAt = summaryGeneratedAt ? Date.parse(summaryGeneratedAt) : NaN;
  return Number.isNaN(generatedAt) || namedAt > generatedAt;
}

export function clearSpeakerNamed(sessionId: string) {
  useSpeakerNamingStore.setState((state) => {
    if (state.named[sessionId] === undefined) return state;
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

import type {
  LiveTranscriptDelta,
  LiveTranscriptSegment,
  LiveTranscriptSegmentDelta,
} from "@syntheo/plugin-transcription";

// Regroupement des mises à jour de transcription en direct (issue 444).
//
// Le moteur émet une mise à jour par réponse STT, soit environ 20 par seconde
// (`transcript_delta` et `transcript_segment_delta`). Appliquées une à une,
// elles donnaient un `set` du magasin, donc un commit React, par partiel.
// Ici, les deltas reçus pendant une fenêtre de 100 ms sont fusionnés puis
// appliqués en un seul `set`.
//
// Pourquoi une fenêtre de 100 ms par minuterie plutôt que `requestAnimationFrame` :
// - Les deltas arrivent toutes les 50 ms environ ; une image dure 16 ms. Un
//   regroupement par image ne réunirait presque jamais deux deltas et ne
//   diviserait pas le nombre de commits. Il faut une fenêtre d'au moins
//   100 ms pour passer sous 10 commits par seconde.
// - `requestAnimationFrame` est suspendu fenêtre masquée (fenêtre principale
//   cachée pendant que la capsule flottante affiche les sous-titres) : il
//   faudrait de toute façon une minuterie de repli.
// - La fenêtre part du premier delta en attente : un mot attend 100 ms au plus
//   avant d'atteindre le magasin.
//
// Ce qui n'attend pas : la persistance des mots finaux et la détection de
// blocage restent appliquées à la réception (voir `general-live.ts`). Seul
// l'état d'affichage (`liveSegments`, sous-titres, partiels) est regroupé.

export const LIVE_TRANSCRIPT_BATCH_WINDOW_MS = 100;
// Garde-fou si la minuterie est fortement ralentie (fenêtre masquée) : au-delà,
// le lot est appliqué sans attendre pour borner la mémoire.
export const LIVE_TRANSCRIPT_BATCH_MAX_PREVIEW_DELTAS = 64;

export type LiveTranscriptBatch = {
  // Dans l'ordre de réception : chaque delta remplace les partiels du
  // précédent et ajoute ou remplace des mots finaux.
  previewDeltas: LiveTranscriptDelta[];
  segmentDelta: LiveTranscriptSegmentDelta | null;
};

export type LiveSegmentDeltaAccumulator = {
  removedIds: Set<string>;
  upsertsById: Map<string, LiveTranscriptSegment>;
};

export const createLiveSegmentDeltaAccumulator =
  (): LiveSegmentDeltaAccumulator => ({
    removedIds: new Set(),
    upsertsById: new Map(),
  });

/**
 * Fusionne `delta` dans l'accumulateur, dans l'ordre : pour un même segment,
 * la dernière opération l'emporte (ajout puis suppression = suppression ;
 * suppression puis ajout = ajout ; deux ajouts = le second). Dans un delta,
 * les suppressions précèdent les ajouts, comme dans `applyLiveSegmentDelta`.
 */
export function mergeLiveSegmentDelta(
  accumulator: LiveSegmentDeltaAccumulator,
  delta: LiveTranscriptSegmentDelta,
) {
  for (const id of delta.removed_ids) {
    accumulator.upsertsById.delete(id);
    accumulator.removedIds.delete(id);
    accumulator.removedIds.add(id);
  }
  for (const segment of delta.upserts) {
    accumulator.removedIds.delete(segment.id);
    accumulator.upsertsById.delete(segment.id);
    accumulator.upsertsById.set(segment.id, segment);
  }
}

export function takeLiveSegmentDelta(
  accumulator: LiveSegmentDeltaAccumulator,
): LiveTranscriptSegmentDelta | null {
  if (accumulator.removedIds.size === 0 && accumulator.upsertsById.size === 0) {
    return null;
  }
  const delta = {
    removed_ids: [...accumulator.removedIds],
    upserts: [...accumulator.upsertsById.values()],
  };
  accumulator.removedIds.clear();
  accumulator.upsertsById.clear();
  return delta;
}

export type LiveTranscriptBatcher = {
  addPreviewDelta: (delta: LiveTranscriptDelta) => void;
  addSegmentDelta: (delta: LiveTranscriptSegmentDelta) => void;
  // Applique tout de suite ce qui attend (arrêt, pause, finalisation).
  flush: () => void;
  // Vide le lot puis arrête la minuterie ; le lot n'accepte plus rien.
  dispose: () => void;
};

const activeBatchers = new Set<LiveTranscriptBatcher>();

/**
 * Vide immédiatement tous les lots en attente. Appelé avant tout changement
 * d'état de l'écoute (cycle de vie natif, arrêt, pause, nouvelle session) :
 * aucun mot ne reste en attente quand la session se finalise.
 */
export function flushLiveTranscriptBatches() {
  for (const batcher of [...activeBatchers]) batcher.flush();
}

export function createLiveTranscriptBatcher(
  apply: (batch: LiveTranscriptBatch) => void,
  windowMs = LIVE_TRANSCRIPT_BATCH_WINDOW_MS,
): LiveTranscriptBatcher {
  let previewDeltas: LiveTranscriptDelta[] = [];
  const segments = createLiveSegmentDeltaAccumulator();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const flush = () => {
    clearTimer();
    const segmentDelta = takeLiveSegmentDelta(segments);
    if (previewDeltas.length === 0 && !segmentDelta) return;
    const batch = { previewDeltas, segmentDelta };
    previewDeltas = [];
    apply(batch);
  };

  const schedule = () => {
    if (previewDeltas.length >= LIVE_TRANSCRIPT_BATCH_MAX_PREVIEW_DELTAS) {
      flush();
      return;
    }
    if (timer === null) timer = setTimeout(flush, windowMs);
  };

  const batcher: LiveTranscriptBatcher = {
    addPreviewDelta: (delta) => {
      if (disposed) return;
      previewDeltas.push(delta);
      schedule();
    },
    addSegmentDelta: (delta) => {
      if (disposed) return;
      if (delta.upserts.length === 0 && delta.removed_ids.length === 0) return;
      mergeLiveSegmentDelta(segments, delta);
      schedule();
    },
    flush,
    dispose: () => {
      if (disposed) return;
      flush();
      disposed = true;
      activeBatchers.delete(batcher);
    },
  };
  activeBatchers.add(batcher);
  return batcher;
}

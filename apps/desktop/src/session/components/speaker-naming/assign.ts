import type { SpeakerCard } from "./speakers";

import { assignTranscriptSpeaker } from "~/stt/queries";

/**
 * Donne un nom au locuteur d'une carte, dans sa seule capture : même règle
 * que « Appliquer à tous » de la transcription (couple capture + index), sans
 * reporter l'index sur les autres captures de la note.
 */
export async function assignSpeakerCard(
  card: SpeakerCard,
  humanId: string,
): Promise<void> {
  for (const target of card.targets) {
    const anchorWordId = target.wordIds[0];
    if (!anchorWordId) continue;
    await assignTranscriptSpeaker({
      transcriptId: card.transcriptId,
      segmentKey: target.key,
      humanId,
      anchorWordId,
      mode: Number.isInteger(target.key.speaker_index) ? "all" : "segment",
      wordIds: target.wordIds,
    });
  }
}

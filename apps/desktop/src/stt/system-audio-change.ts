// Changement de la sortie capturée comme son système pendant une écoute
// (issue 450) : casque branché ou débranché, sortie choisie disparue et repli
// sur la sortie par défaut. On ne parle de casque que lorsqu'on le sait.

export type CapturedOutput = { name: string; headphone: boolean };

export type SystemAudioChange =
  | { kind: "headphones-unplugged"; output: string }
  | { kind: "headphones-plugged"; output: string }
  | { kind: "output-unavailable"; previous: string; output: string }
  | { kind: "output-changed"; output: string };

export function detectSystemAudioChange(
  previous: CapturedOutput | null,
  next: CapturedOutput | null,
  available: readonly string[],
): SystemAudioChange | null {
  if (!previous || !next || previous.name === next.name) {
    return null;
  }

  const output = next.name;
  if (!available.includes(previous.name)) {
    return previous.headphone
      ? { kind: "headphones-unplugged", output }
      : { kind: "output-unavailable", previous: previous.name, output };
  }
  if (next.headphone && !previous.headphone) {
    return { kind: "headphones-plugged", output };
  }
  return { kind: "output-changed", output };
}

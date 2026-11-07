import { Effect } from "effect";

import { type Result } from "@syntheo/plugin-transcription";

export const fromResult = <A, E>(
  run: () => Promise<Result<A, E>>,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: run,
    catch: (error) => error as E,
  }).pipe(
    Effect.flatMap((result) =>
      result.status === "ok"
        ? Effect.succeed(result.data)
        : Effect.fail(result.error),
    ),
  );

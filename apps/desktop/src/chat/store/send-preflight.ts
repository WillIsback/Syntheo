import type { ChatTransport, UIMessage } from "ai";

// Travail à faire avant l'envoi d'un tour de chat (enregistrer le message de
// l'utilisateur, attendre la réponse précédente lors d'une régénération).
// `persistOnCancel` : le travail tourne même si l'envoi est annulé, car il
// enregistre ce que l'utilisateur a écrit.
export type GuardedChatPreflight = {
  run: (
    trackCompletion: (completion: Promise<unknown>) => void,
  ) => void | Promise<void>;
  persistOnCancel: boolean;
};

const ignoreCompletion = () => {};

function abortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

// Tauri `invoke` rejects with the serialized Rust error (a bare string), and
// the AI SDK stores whatever `sendMessages` throws as `useChat().error`
// without checking it is an Error. Normalize so the UI can rely on `.message`.
function toChatTransportError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : String(error));
}

export function createChatPreflightController() {
  // Un travail préalable qui a échoué est gardé pour être rejoué avant
  // l'enregistrement de la réponse du même tour.
  const retained = new Map<string, GuardedChatPreflight>();
  let disposed = false;

  const retain = (key: string, preflight: GuardedChatPreflight) => {
    if (!retained.has(key)) {
      retained.set(key, preflight);
    }
  };

  const start = async (
    key: string,
    preflight: GuardedChatPreflight | undefined,
    isCancelled: () => boolean,
  ): Promise<boolean> => {
    if (disposed) {
      return false;
    }
    if (preflight && (preflight.persistOnCancel || !isCancelled())) {
      try {
        await preflight.run(ignoreCompletion);
      } catch (error) {
        retain(key, preflight);
        throw error;
      }
      retained.delete(key);
    }
    return !disposed;
  };

  const runAfterPreflight = async <T>(
    key: string,
    run: () => T | Promise<T>,
  ): Promise<T> => {
    const preflight = retained.get(key);
    if (preflight) {
      retained.delete(key);
      try {
        await preflight.run(ignoreCompletion);
      } catch (error) {
        retain(key, preflight);
        throw error;
      }
    }
    return run();
  };

  const dispose = () => {
    disposed = true;
  };

  const resume = () => {
    disposed = false;
  };

  return { start, runAfterPreflight, dispose, resume };
}

type ChatPreflightController = ReturnType<
  typeof createChatPreflightController
>;

export function guardChatTransport<UI_MESSAGE extends UIMessage>(
  transport: ChatTransport<UI_MESSAGE>,
  controller: ChatPreflightController,
  {
    beforeSend,
  }: {
    beforeSend?: (logicalKey: string) => GuardedChatPreflight | undefined;
  } = {},
): ChatTransport<UI_MESSAGE> {
  return {
    sendMessages: async (options) => {
      let userMessage: UI_MESSAGE | undefined;
      for (let i = options.messages.length - 1; i >= 0; i--) {
        if (options.messages[i].role === "user") {
          userMessage = options.messages[i];
          break;
        }
      }
      if (!userMessage) {
        throw new Error("Cannot start chat activity without a user message");
      }

      const key = userMessage.id;
      const preflight = beforeSend?.(key);
      let started: boolean;
      try {
        started = await controller.start(key, preflight, () =>
          Boolean(options.abortSignal?.aborted),
        );
      } catch (error) {
        if (preflight?.persistOnCancel) {
          await controller
            .runAfterPreflight(key, () => undefined)
            .catch(() => undefined);
        }
        throw toChatTransportError(error);
      }

      if (!started || options.abortSignal?.aborted) {
        throw abortError("Chat request aborted");
      }

      try {
        return await transport.sendMessages(options);
      } catch (error) {
        throw toChatTransportError(error);
      }
    },
    reconnectToStream: (options) => transport.reconnectToStream(options),
  };
}

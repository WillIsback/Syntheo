import type { ChatOnFinishCallback } from "ai";

import {
  consumeFailedChatGroupCreate,
  waitForPendingChatPersists,
} from "~/chat/store/pending-persists";
import {
  buildPersistedChatMessage,
  shouldPersistFinishedMessage,
} from "~/chat/store/persisted-messages";
import {
  deleteChatMessage,
  getChatMessageGroupId,
  replaceChatMessage,
  upsertChatMessage,
} from "~/chat/store/queries";
import type {
  createChatPreflightController,
  GuardedChatPreflight,
} from "~/chat/store/send-preflight";
import { stripEphemeralToolContext } from "~/chat/tools/strip-ephemeral-tool-context";
import type { ChatSendOptions, SyntheoUIMessage } from "~/chat/types";
import { flushDatabaseWritesByPrefix } from "~/db/write-queue";
import { id } from "~/shared/utils";

type Ref<T> = { current: T };

type ChatPreflights = ReturnType<typeof createChatPreflightController>;

type ChatRegenerationTarget = {
  chatGroupId: string;
  assistantMessageId: string;
};

/** Références partagées par le cycle de vie d'une session de chat. */
type ChatSessionRefs = {
  latestChatGroupIdRef: Ref<string | undefined>;
  latestUserIdRef: Ref<string | null>;
  submittedChatGroupIdsRef: Ref<Map<string, string>>;
  pendingTransportPreflightsRef: Ref<Map<string, GuardedChatPreflight[]>>;
  pendingRegenerationTombstonesRef: Ref<Map<string, ChatRegenerationTarget>>;
  pendingFinishedChatPersistsRef: Ref<Map<string, Promise<void>>>;
  acceptFinishedChatPersistenceRef: Ref<boolean>;
  regenerateRequestInFlightRef: Ref<boolean>;
};

/**
 * Enregistre la réponse terminée de l'assistant, après avoir réparé au
 * besoin le message utilisateur qui l'a demandée.
 */
export function createChatFinishHandler(
  {
    latestChatGroupIdRef,
    latestUserIdRef,
    submittedChatGroupIdsRef,
    pendingRegenerationTombstonesRef,
    pendingFinishedChatPersistsRef,
    acceptFinishedChatPersistenceRef,
  }: ChatSessionRefs,
  chatPreflights: ChatPreflights,
): ChatOnFinishCallback<SyntheoUIMessage> {
  return ({ message, messages, isAbort, isError }) => {
    const currentUserId = latestUserIdRef.current;
    const messageIndex = messages.findIndex((m) => m.id === message.id);
    const lastMessageIndex =
      messageIndex === -1 ? messages.length - 1 : messageIndex - 1;
    let submittedUserMessage: SyntheoUIMessage | undefined;
    for (let i = lastMessageIndex; i >= 0; i--) {
      if (messages[i].role === "user") {
        submittedUserMessage = messages[i];
        break;
      }
    }
    const submittedChatGroupId = submittedUserMessage
      ? submittedChatGroupIdsRef.current.get(submittedUserMessage.id)
      : undefined;
    if (submittedUserMessage) {
      submittedChatGroupIdsRef.current.delete(submittedUserMessage.id);
    }
    const regenerationTarget = submittedUserMessage
      ? pendingRegenerationTombstonesRef.current.get(submittedUserMessage.id)
      : undefined;
    const advanceRegenerationTarget = (assistantMessageId: string) => {
      if (
        submittedUserMessage &&
        regenerationTarget &&
        pendingRegenerationTombstonesRef.current.get(
          submittedUserMessage.id,
        ) === regenerationTarget
      ) {
        pendingRegenerationTombstonesRef.current.set(submittedUserMessage.id, {
          chatGroupId: regenerationTarget.chatGroupId,
          assistantMessageId,
        });
      }
    };
    const sanitizedParts = stripEphemeralToolContext(message.parts);
    const sanitizedMessage =
      sanitizedParts === message.parts
        ? message
        : { ...message, parts: sanitizedParts };
    const retainPriorRegeneration =
      regenerationTarget &&
      (isError || !shouldPersistFinishedMessage(sanitizedMessage));
    const persistAssistant =
      !isAbort &&
      acceptFinishedChatPersistenceRef.current &&
      !retainPriorRegeneration;

    if (!currentUserId || (!submittedUserMessage && !persistAssistant)) {
      return;
    }

    const finishedPersist = chatPreflights.runAfterPreflight(
      submittedUserMessage?.id ?? sanitizedMessage.id,
      async () => {
        // Outbound user writes may still be retrying; settle them first
        // so the lookup below reflects the final truth and a failed
        // persist can be repaired instead of orphaning the reply.
        const awaitedChatGroupId =
          submittedChatGroupId ?? latestChatGroupIdRef.current;
        if (awaitedChatGroupId) {
          await waitForPendingChatPersists(awaitedChatGroupId);
        }

        let persistedChatGroupId: string | null = null;
        if (submittedUserMessage) {
          try {
            persistedChatGroupId = await getChatMessageGroupId(
              submittedUserMessage.id,
            );
          } catch (error) {
            console.error(
              "Failed to resolve the persisted chat message group",
              error,
            );
          }
        }
        const targetChatGroupId =
          submittedChatGroupId ??
          persistedChatGroupId ??
          latestChatGroupIdRef.current;
        if (!targetChatGroupId) {
          return;
        }

        // The group row was never created; persisting into it would
        // produce orphaned rows that never appear in history.
        if (consumeFailedChatGroupCreate(targetChatGroupId)) {
          return;
        }

        // If the outbound persist failed, the assistant row would land
        // with no matching user row and reconciliation would wipe the
        // turn — repair the user message before persisting the reply.
        if (submittedUserMessage && !persistedChatGroupId) {
          await upsertChatMessage(
            buildPersistedChatMessage({
              message: submittedUserMessage,
              chatGroupId: targetChatGroupId,
              ownerUserId: currentUserId,
              status: "ready",
            }),
          );
        }

        if (!persistAssistant) {
          return;
        }

        if (!shouldPersistFinishedMessage(sanitizedMessage)) {
          await deleteChatMessage(targetChatGroupId, sanitizedMessage.id);
          return;
        }

        const persistedMessage = buildPersistedChatMessage({
          message: sanitizedMessage,
          chatGroupId: targetChatGroupId,
          ownerUserId: currentUserId,
          status: "ready",
        });
        if (regenerationTarget) {
          if (regenerationTarget.chatGroupId !== targetChatGroupId) {
            throw new Error("Regenerated chat message group changed");
          }
          await replaceChatMessage({
            message: persistedMessage,
            previousMessageId: regenerationTarget.assistantMessageId,
          });
          advanceRegenerationTarget(sanitizedMessage.id);
          return;
        }
        await upsertChatMessage(persistedMessage);
      },
    );
    void finishedPersist.catch((error) => {
      console.error("Failed to persist finished chat message", error);
    });
    if (submittedUserMessage) {
      const userMessageId = submittedUserMessage.id;
      pendingFinishedChatPersistsRef.current.set(
        userMessageId,
        finishedPersist,
      );
      void finishedPersist
        .catch(() => undefined)
        .finally(() => {
          if (
            pendingFinishedChatPersistsRef.current.get(userMessageId) ===
            finishedPersist
          ) {
            pendingFinishedChatPersistsRef.current.delete(userMessageId);
          }
        });
    }
  };
}

/** Démontage : arrête la réponse en cours et vide les écritures du chat. */
export function cleanupChatSession(
  {
    latestChatGroupIdRef,
    submittedChatGroupIdsRef,
    pendingTransportPreflightsRef,
    pendingRegenerationTombstonesRef,
    pendingFinishedChatPersistsRef,
    acceptFinishedChatPersistenceRef,
  }: ChatSessionRefs,
  chatPreflights: ChatPreflights,
  latestChatStopRef: Ref<() => unknown>,
) {
  acceptFinishedChatPersistenceRef.current = false;
  const pendingChatGroupIds = new Set([
    ...submittedChatGroupIdsRef.current.values(),
    ...[...pendingRegenerationTombstonesRef.current.values()].map(
      ({ chatGroupId }) => chatGroupId,
    ),
    ...(latestChatGroupIdRef.current ? [latestChatGroupIdRef.current] : []),
  ]);
  try {
    void Promise.resolve(latestChatStopRef.current()).catch((error) => {
      console.error("Failed to stop chat response during cleanup", error);
    });
  } catch (error) {
    console.error("Failed to stop chat response during cleanup", error);
  }
  void Promise.resolve().then(async () => {
    try {
      await Promise.resolve();
      await Promise.allSettled([
        ...pendingFinishedChatPersistsRef.current.values(),
        ...[...pendingChatGroupIds].map(waitForPendingChatPersists),
      ]);
      await flushDatabaseWritesByPrefix(["chat:"]);
    } catch (error) {
      console.error("Failed to flush chat writes during cleanup", error);
    }
  });
  chatPreflights.dispose();
  pendingTransportPreflightsRef.current.clear();
  pendingRegenerationTombstonesRef.current.clear();
}

/**
 * Réponse locale quand le transcript n'est pas encore disponible
 * (transcription par lot en cours).
 */
export function respondWithoutTranscript({
  message,
  options,
  targetChatGroupId,
  ownerUserId,
  text,
  chatSetMessages,
  chatPreflights,
  pendingFinishedChatPersistsRef,
}: {
  message: SyntheoUIMessage;
  options: ChatSendOptions | undefined;
  targetChatGroupId: string;
  ownerUserId: string;
  text: string;
  chatSetMessages: (
    update: (current: SyntheoUIMessage[]) => SyntheoUIMessage[],
  ) => void;
  chatPreflights: ChatPreflights;
  pendingFinishedChatPersistsRef: ChatSessionRefs["pendingFinishedChatPersistsRef"];
}) {
  const assistantMessage: SyntheoUIMessage = {
    id: id(),
    role: "assistant",
    parts: [
      {
        type: "text",
        text,
      },
    ],
    metadata: {
      createdAt: Math.max(
        Date.now() + 1,
        (message.metadata?.createdAt ?? 0) + 1,
      ),
    },
  };
  chatSetMessages((current) => [...current, message, assistantMessage]);
  const localResponse = chatPreflights.runAfterPreflight(
    message.id,
    async () => {
      try {
        const trackedCompletions: Promise<unknown>[] = [];
        await options?.beforeSend?.((completion) => {
          trackedCompletions.push(completion);
        });
        await upsertChatMessage(
          buildPersistedChatMessage({
            message: assistantMessage,
            chatGroupId: targetChatGroupId,
            ownerUserId,
            status: "ready",
          }),
        );
        await Promise.allSettled(trackedCompletions);
      } catch (error) {
        await Promise.allSettled([
          deleteChatMessage(targetChatGroupId, message.id),
          deleteChatMessage(targetChatGroupId, assistantMessage.id),
        ]);
        throw error;
      }
    },
  );
  pendingFinishedChatPersistsRef.current.set(message.id, localResponse);
  void localResponse
    .catch((error) => {
      chatSetMessages((current) =>
        current.filter(
          (candidate) =>
            candidate.id !== message.id && candidate.id !== assistantMessage.id,
        ),
      );
      console.error("Failed to save batch transcription chat response", error);
    })
    .finally(() => {
      if (
        pendingFinishedChatPersistsRef.current.get(message.id) === localResponse
      ) {
        pendingFinishedChatPersistsRef.current.delete(message.id);
      }
    });
}

/** Relance la dernière réponse de l'assistant pour le message utilisateur. */
export function runChatRegeneration(
  {
    pendingTransportPreflightsRef,
    pendingRegenerationTombstonesRef,
    pendingFinishedChatPersistsRef,
    regenerateRequestInFlightRef,
  }: ChatSessionRefs,
  {
    chatGroupId,
    submittedUser,
    priorFinishedPersist,
    chatRegenerate,
  }: {
    chatGroupId: string;
    submittedUser: SyntheoUIMessage;
    priorFinishedPersist: Promise<void> | undefined;
    chatRegenerate: () => Promise<void>;
  },
  assistantMessageId?: string,
) {
  let regenerationPreflight: (() => Promise<void>) | undefined;
  const nextTarget = assistantMessageId
    ? {
        chatGroupId,
        assistantMessageId,
      }
    : undefined;
  const currentTarget = pendingRegenerationTombstonesRef.current.get(
    submittedUser.id,
  );
  const initializeTarget = () => {
    const liveTarget = pendingRegenerationTombstonesRef.current.get(
      submittedUser.id,
    );
    if (liveTarget?.chatGroupId === chatGroupId) {
      return;
    }
    if (nextTarget) {
      pendingRegenerationTombstonesRef.current.set(
        submittedUser.id,
        nextTarget,
      );
    } else if (liveTarget) {
      pendingRegenerationTombstonesRef.current.delete(submittedUser.id);
    }
  };

  if (priorFinishedPersist) {
    regenerationPreflight = async () => {
      await priorFinishedPersist;
      initializeTarget();
    };
    const queue =
      pendingTransportPreflightsRef.current.get(submittedUser.id) ?? [];
    queue.push({
      run: regenerationPreflight,
      persistOnCancel: false,
    });
    pendingTransportPreflightsRef.current.set(submittedUser.id, queue);
  } else if (currentTarget?.chatGroupId !== chatGroupId) {
    initializeTarget();
  }
  regenerateRequestInFlightRef.current = true;
  let regeneration: Promise<void>;
  try {
    regeneration = Promise.resolve(chatRegenerate());
  } catch (error) {
    regeneration = Promise.reject(error);
  }
  const observedRegeneration = regeneration.catch((error) => {
    console.error("Failed to regenerate chat message", error);
  });
  void observedRegeneration
    .then(() => {
      regenerateRequestInFlightRef.current = false;
      return pendingFinishedChatPersistsRef.current.get(submittedUser.id);
    })
    .finally(() => {
      if (!regenerationPreflight) {
        return;
      }
      const queue = pendingTransportPreflightsRef.current.get(submittedUser.id);
      const index =
        queue?.findIndex(
          (candidate) => candidate.run === regenerationPreflight,
        ) ?? -1;
      if (queue && index !== -1) {
        queue.splice(index, 1);
      }
      if (queue?.length === 0) {
        pendingTransportPreflightsRef.current.delete(submittedUser.id);
      }
    })
    .catch(() => undefined);
}

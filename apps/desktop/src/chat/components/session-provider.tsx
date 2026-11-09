import { Chat, useChat } from "@ai-sdk/react";
import { useLingui } from "@lingui/react/macro";
import type { ChatStatus, ChatTransport, LanguageModel, ToolSet } from "ai";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import {
  cleanupChatSession,
  createChatFinishHandler,
  respondWithoutTranscript,
  runChatRegeneration,
} from "./session-provider-lifecycle";

import { dedupeByKey, type ContextRef } from "~/chat/context/entities";
import {
  type DisplayEntity,
  useChatContextPipeline,
} from "~/chat/context/use-chat-context-pipeline";
import { hasPendingChatPersist } from "~/chat/store/pending-persists";
import { getVisibleChatMessages } from "~/chat/store/persisted-messages";
import {
  deleteChatMessagesExcept,
  usePersistedChatMessages,
} from "~/chat/store/queries";
import {
  createChatPreflightController,
  guardChatTransport,
  type GuardedChatPreflight,
} from "~/chat/store/send-preflight";
import { useTransport } from "~/chat/transport/use-transport";
import type {
  ChatMessageSender,
  ChatSendOptions,
  SyntheoUIMessage,
} from "~/chat/types";
import { useOwnerUserId } from "~/shared/owner-user";

export type ChatSessionRenderProps = {
  sessionId: string;
  messages: SyntheoUIMessage[];
  setMessages: (
    msgs:
      | SyntheoUIMessage[]
      | ((prev: SyntheoUIMessage[]) => SyntheoUIMessage[]),
  ) => void;
  sendMessage: ChatMessageSender;
  regenerate: () => void;
  stop: () => void;
  status: ChatStatus;
  error?: Error;
  contextEntities: DisplayEntity[];
  pendingRefs: ContextRef[];
  onAddContextEntity: (ref: ContextRef) => void;
  onDraftContextRefsChange: (refs: ContextRef[]) => void;
  isSystemPromptReady: boolean;
};

type ChatTransportPreflight = NonNullable<ChatSendOptions["beforeSend"]>;

interface ChatSessionProps {
  readonly sessionId: string;
  readonly chatGroupId?: string;
  readonly currentSessionId?: string;
  readonly folderId?: string;
  readonly hasAvailableTranscript?: boolean;
  readonly isBatchTranscriptionPending?: boolean;
  readonly modelOverride?: LanguageModel;
  readonly extraTools?: ToolSet;
  readonly systemPromptOverride?: string;
  readonly unstyled?: boolean;
  readonly children: (props: ChatSessionRenderProps) => ReactNode;
}

function areMessagesEqual(a: SyntheoUIMessage[], b: SyntheoUIMessage[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((message, index) => {
    const other = b[index];
    return (
      message.id === other?.id &&
      message.role === other.role &&
      JSON.stringify(message.parts) === JSON.stringify(other.parts) &&
      JSON.stringify(message.metadata ?? {}) ===
        JSON.stringify(other.metadata ?? {})
    );
  });
}

export function ChatSession(props: ChatSessionProps) {
  return <ChatSessionLifecycle key={props.sessionId} {...props} />;
}

function ChatSessionLifecycle({
  sessionId,
  chatGroupId,
  currentSessionId,
  folderId,
  hasAvailableTranscript = false,
  isBatchTranscriptionPending = false,
  modelOverride,
  extraTools,
  systemPromptOverride,
  unstyled = false,
  children,
}: ChatSessionProps) {
  const { t } = useLingui();
  const ownerUserId = useOwnerUserId();
  const persistedMessages = usePersistedChatMessages(chatGroupId);

  const [pendingManualRefs, setPendingManualRefs] = useState<ContextRef[]>([]);
  const [pendingDraftRefs, setPendingDraftRefs] = useState<ContextRef[]>([]);
  const latestChatGroupIdRef = useRef(chatGroupId);
  const latestUserIdRef = useRef(ownerUserId);
  const initialMessagesRef = useRef<SyntheoUIMessage[]>([]);
  const submittedChatGroupIdsRef = useRef(new Map<string, string>());
  const pendingTransportPreflightsRef = useRef(
    new Map<string, GuardedChatPreflight[]>(),
  );
  const pendingRegenerationTombstonesRef = useRef(
    new Map<
      string,
      {
        chatGroupId: string;
        assistantMessageId: string;
      }
    >(),
  );
  const pendingFinishedChatPersistsRef = useRef(
    new Map<string, Promise<void>>(),
  );
  const acceptFinishedChatPersistenceRef = useRef(true);
  const regenerateRequestInFlightRef = useRef(false);
  const chatPreflightsRef = useRef<ReturnType<
    typeof createChatPreflightController
  > | null>(null);
  chatPreflightsRef.current ??= createChatPreflightController();
  const chatPreflights = chatPreflightsRef.current;
  const takeTransportPreflight = useCallback((logicalKey: string) => {
    const queue = pendingTransportPreflightsRef.current.get(logicalKey);
    const preflight = queue?.shift();
    if (queue?.length === 0) {
      pendingTransportPreflightsRef.current.delete(logicalKey);
    }
    return preflight;
  }, []);
  const removeTransportPreflight = useCallback(
    (logicalKey: string, preflight: ChatTransportPreflight) => {
      const queue = pendingTransportPreflightsRef.current.get(logicalKey);
      const index =
        queue?.findIndex((candidate) => candidate.run === preflight) ?? -1;
      if (queue && index !== -1) {
        queue.splice(index, 1);
      }
      if (queue?.length === 0) {
        pendingTransportPreflightsRef.current.delete(logicalKey);
      }
    },
    [],
  );

  latestChatGroupIdRef.current = chatGroupId;
  latestUserIdRef.current = ownerUserId;

  const onAddContextEntity = useCallback((ref: ContextRef) => {
    setPendingManualRefs((prev) =>
      prev.some((r) => r.key === ref.key) ? prev : [...prev, ref],
    );
  }, []);

  const onDraftContextRefsChange = useCallback((refs: ContextRef[]) => {
    setPendingDraftRefs(refs);
  }, []);

  useEffect(() => {
    setPendingManualRefs([]);
    setPendingDraftRefs([]);
    pendingRegenerationTombstonesRef.current.clear();
  }, [sessionId, chatGroupId]);

  const { transport, isSystemPromptReady } = useTransport(
    modelOverride,
    extraTools,
    systemPromptOverride,
    ownerUserId || undefined,
  );

  const persistedVisibleMessages = useMemo(
    () => getVisibleChatMessages(persistedMessages),
    [persistedMessages],
  );
  initialMessagesRef.current = persistedVisibleMessages;
  const latestTransportRef = useRef(transport);
  latestTransportRef.current = transport;

  // The Chat instance must live for the whole session. useChat swaps to any
  // new instance it is handed, which resets status to "ready" and detaches
  // the UI from an in-flight stream, so the transport is resolved per request
  // instead of being baked into the memo.
  const chat = useMemo(
    () =>
      new Chat<SyntheoUIMessage>({
        id: sessionId,
        messages: initialMessagesRef.current,
        transport: guardChatTransport(
          {
            sendMessages: (options) =>
              (
                latestTransportRef.current ?? unavailableChatTransport
              ).sendMessages(options),
            reconnectToStream: (options) =>
              (
                latestTransportRef.current ?? unavailableChatTransport
              ).reconnectToStream(options),
          },
          chatPreflights,
          { beforeSend: takeTransportPreflight },
        ),
        onFinish: createChatFinishHandler(
          {
            latestChatGroupIdRef,
            latestUserIdRef,
            submittedChatGroupIdsRef,
            pendingTransportPreflightsRef,
            pendingRegenerationTombstonesRef,
            pendingFinishedChatPersistsRef,
            acceptFinishedChatPersistenceRef,
            regenerateRequestInFlightRef,
          },
          chatPreflights,
        ),
      }),
    [chatPreflights, sessionId, takeTransportPreflight],
  );

  const {
    messages,
    sendMessage: chatSendMessage,
    regenerate: chatRegenerate,
    stop: chatStop,
    status,
    error,
    setMessages: chatSetMessages,
  } = useChat<SyntheoUIMessage>({ chat });
  const latestChatStopRef = useRef(chatStop);
  latestChatStopRef.current = chatStop;
  const isTranscriptUnavailable =
    isBatchTranscriptionPending && !hasAvailableTranscript;

  useMountEffect(() => {
    acceptFinishedChatPersistenceRef.current = true;
    chatPreflights.resume();
    return () =>
      cleanupChatSession(
        {
          latestChatGroupIdRef,
          latestUserIdRef,
          submittedChatGroupIdsRef,
          pendingTransportPreflightsRef,
          pendingRegenerationTombstonesRef,
          pendingFinishedChatPersistsRef,
          acceptFinishedChatPersistenceRef,
          regenerateRequestInFlightRef,
        },
        chatPreflights,
        latestChatStopRef,
      );
  });

  useEffect(() => {
    if (
      status !== "ready" ||
      !chatGroupId ||
      // An outbound send's write (with retries) may still be in flight; the
      // persisted set is legitimately behind it and reconciling now would
      // wipe the turn the user just sent.
      hasPendingChatPersist(chatGroupId) ||
      // The SDK becomes ready before onFinish's assistant write settles.
      // Keep the completed in-memory response visible until SQLite catches up.
      pendingFinishedChatPersistsRef.current.size > 0 ||
      areMessagesEqual(messages, persistedVisibleMessages)
    ) {
      return;
    }

    chatSetMessages(persistedVisibleMessages);
  }, [
    chatGroupId,
    messages,
    persistedVisibleMessages,
    status,
    chatSetMessages,
  ]);

  const sendMessage = useCallback(
    (message: SyntheoUIMessage, options?: ChatSendOptions) => {
      const targetChatGroupId =
        options?.chatGroupId ?? latestChatGroupIdRef.current;
      if (isTranscriptUnavailable && targetChatGroupId && ownerUserId) {
        respondWithoutTranscript({
          message,
          options,
          targetChatGroupId,
          ownerUserId,
          text: t`This recording is using batch transcription, so the transcript isn't available to chat yet. Ask again after transcription finishes, or switch to a Pro model for live transcription.`,
          chatSetMessages,
          chatPreflights,
          pendingFinishedChatPersistsRef,
        });
        return;
      }
      if (targetChatGroupId) {
        submittedChatGroupIdsRef.current.set(message.id, targetChatGroupId);
      }
      const preflight = options?.beforeSend;
      if (preflight) {
        const queue =
          pendingTransportPreflightsRef.current.get(message.id) ?? [];
        queue.push({ run: preflight, persistOnCancel: true });
        pendingTransportPreflightsRef.current.set(message.id, queue);
      }
      // SyntheoUIMessage is structurally compatible with CreateUIMessage<SyntheoUIMessage>:
      // no `text`/`files` so the SDK takes the `else` branch and uses message.id as the message id.
      let sending: Promise<void>;
      try {
        sending = Promise.resolve(
          chatSendMessage(message as Parameters<typeof chatSendMessage>[0]),
        );
      } catch (error) {
        if (preflight) {
          removeTransportPreflight(message.id, preflight);
        }
        submittedChatGroupIdsRef.current.delete(message.id);
        console.error("Failed to send chat message", error);
        return;
      }
      void sending.catch((error) => {
        if (preflight) {
          removeTransportPreflight(message.id, preflight);
        }
        submittedChatGroupIdsRef.current.delete(message.id);
        console.error("Failed to send chat message", error);
      });
    },
    [
      chatPreflights,
      chatSendMessage,
      chatSetMessages,
      isTranscriptUnavailable,
      ownerUserId,
      removeTransportPreflight,
      t,
    ],
  );

  const regenerate = useCallback(() => {
    if (
      isTranscriptUnavailable ||
      !chatGroupId ||
      (status !== "ready" && status !== "error") ||
      regenerateRequestInFlightRef.current
    ) {
      return;
    }
    let submittedUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        submittedUserIndex = i;
        break;
      }
    }
    const submittedUserMessage = messages[submittedUserIndex];
    if (!submittedUserMessage) {
      return;
    }
    const submittedUser = submittedUserMessage;
    const priorFinishedPersist = pendingFinishedChatPersistsRef.current.get(
      submittedUser.id,
    );

    const runRegenerate = (assistantMessageId?: string) =>
      runChatRegeneration(
        {
          latestChatGroupIdRef,
          latestUserIdRef,
          submittedChatGroupIdsRef,
          pendingTransportPreflightsRef,
          pendingRegenerationTombstonesRef,
          pendingFinishedChatPersistsRef,
          acceptFinishedChatPersistenceRef,
          regenerateRequestInFlightRef,
        },
        { chatGroupId, submittedUser, priorFinishedPersist, chatRegenerate },
        assistantMessageId,
      );

    for (let i = messages.length - 1; i > submittedUserIndex; i--) {
      if (messages[i].role !== "assistant") {
        continue;
      }

      runRegenerate(messages[i].id);
      return;
    }
    runRegenerate();
  }, [chatGroupId, messages, chatRegenerate, isTranscriptUnavailable, status]);

  const stop = useCallback(() => {
    void Promise.resolve(chatStop()).catch((error) => {
      console.error("Failed to stop chat response", error);
    });
  }, [chatStop]);

  const setMessages = useCallback(
    (
      next:
        | SyntheoUIMessage[]
        | ((prev: SyntheoUIMessage[]) => SyntheoUIMessage[]),
    ) => {
      chatSetMessages(next);
      if (!chatGroupId) return;
      const resolved = typeof next === "function" ? next(messages) : next;
      void deleteChatMessagesExcept(
        chatGroupId,
        resolved.map((message) => message.id),
      ).catch((error) => {
        console.error("Failed to reconcile persisted chat messages", error);
      });
    },
    [chatGroupId, messages, chatSetMessages],
  );

  const prevUserMsgCountRef = useRef(0);
  useEffect(() => {
    const count = messages.filter((message) => message.role === "user").length;
    if (count > prevUserMsgCountRef.current) {
      setPendingManualRefs([]);
      setPendingDraftRefs([]);
    }
    prevUserMsgCountRef.current = count;
  }, [messages]);

  const pendingMessageRefs = useMemo(
    () => dedupeByKey([pendingManualRefs, pendingDraftRefs]),
    [pendingManualRefs, pendingDraftRefs],
  );

  const { contextEntities, pendingRefs } = useChatContextPipeline({
    messages,
    currentSessionId,
    folderId,
    pendingManualRefs: pendingMessageRefs,
  });

  const content = children({
    sessionId,
    messages,
    setMessages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    contextEntities,
    pendingRefs,
    onAddContextEntity,
    onDraftContextRefsChange,
    isSystemPromptReady,
  });

  if (unstyled) {
    return content;
  }

  return <div className="flex min-h-0 flex-1 flex-col">{content}</div>;
}

const unavailableChatTransport: ChatTransport<SyntheoUIMessage> = {
  sendMessages: () => Promise.reject(new Error("Chat model is not ready")),
  reconnectToStream: () => Promise.resolve(null),
};

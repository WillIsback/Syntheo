import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedChatMessage } from "~/chat/store/persisted-messages";

const mocks = vi.hoisted(() => ({
  chatRegenerate: vi.fn(),
  chatSendMessage: vi.fn(),
  chatSetMessages: vi.fn(),
  chatStop: vi.fn(),
  chatInits: [] as unknown[],
  deleteChatMessage: vi.fn().mockResolvedValue(undefined),
  deleteChatMessagesExcept: vi.fn().mockResolvedValue(undefined),
  flushDatabaseWritesByPrefix: vi.fn().mockResolvedValue(undefined),
  getChatMessageGroupId: vi.fn().mockResolvedValue(null),
  messages: [] as unknown[],
  persistedMessages: [] as PersistedChatMessage[],
  replaceChatMessage: vi.fn().mockResolvedValue(undefined),
  status: "ready",
  store: {} as unknown,
  transport: {} as unknown,
  upsertChatMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/db/write-queue", () => ({
  flushDatabaseWritesByPrefix: mocks.flushDatabaseWritesByPrefix,
}));

vi.mock("@ai-sdk/react", () => ({
  Chat: class MockChat {
    id: string;

    constructor(init: { id: string }) {
      this.id = init.id;
      mocks.chatInits.push(init);
    }
  },
  useChat: () => ({
    messages: mocks.messages,
    sendMessage: mocks.chatSendMessage,
    regenerate: mocks.chatRegenerate,
    stop: mocks.chatStop,
    status: mocks.status,
    error: undefined,
    setMessages: mocks.chatSetMessages,
  }),
}));

vi.mock("~/chat/context/use-chat-context-pipeline", () => ({
  useChatContextPipeline: () => ({
    contextEntities: [],
    pendingRefs: [],
  }),
}));

vi.mock("~/chat/store/queries", () => ({
  deleteChatMessage: mocks.deleteChatMessage,
  deleteChatMessagesExcept: mocks.deleteChatMessagesExcept,
  getChatMessageGroupId: mocks.getChatMessageGroupId,
  replaceChatMessage: mocks.replaceChatMessage,
  upsertChatMessage: mocks.upsertChatMessage,
  usePersistedChatMessages: () => mocks.persistedMessages,
}));

vi.mock("~/chat/transport/use-transport", () => ({
  useTransport: () => ({
    transport: mocks.transport,
    isSystemPromptReady: true,
  }),
}));

vi.mock("~/shared/owner-user", () => ({
  useOwnerUserId: () => "user-1",
}));

import { ChatSession, type ChatSessionRenderProps } from "./session-provider";

import {
  clearFailedChatGroupCreate,
  isFailedChatGroupCreate,
  markFailedChatGroupCreate,
} from "~/chat/store/pending-persists";
import {
  buildPersistedChatMessage,
  type ChatMessageRecord,
} from "~/chat/store/persisted-messages";
import type { SyntheoUIMessage } from "~/chat/types";

function persistedMessage(
  message: SyntheoUIMessage,
  chatGroupId = "group-1",
): PersistedChatMessage {
  const record: ChatMessageRecord = buildPersistedChatMessage({
    message,
    chatGroupId,
    ownerUserId: "user-1",
    status: "ready",
  });
  return { id: message.id, message, record, status: "ready" };
}

type SessionProps = Omit<ComponentProps<typeof ChatSession>, "children">;

const DEFAULT_PROPS: SessionProps = {
  chatGroupId: "group-1",
  sessionId: "session-1",
};

function message(
  id: string,
  role: "user" | "assistant",
  text?: string,
): SyntheoUIMessage {
  return {
    id,
    role,
    parts: text === undefined ? [] : [{ type: "text", text }],
  };
}

const USER = message("user-1", "user", "Question");
const OLD_ASSISTANT = message("assistant-old", "assistant", "Old answer");

type FinishParams = {
  message: SyntheoUIMessage;
  messages: SyntheoUIMessage[];
  isAbort: boolean;
  isError?: boolean;
};
type ChatInit = {
  onFinish: (params: FinishParams) => void;
  transport: {
    sendMessages: (options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: SyntheoUIMessage[];
      abortSignal: AbortSignal;
    }) => Promise<ReadableStream>;
  };
};

const chatInit = (index = 0) => mocks.chatInits[index] as ChatInit;
const latestChatInit = () => chatInit(mocks.chatInits.length - 1);

// Simule la fin d'une réponse du SDK.
function finish(
  finished: SyntheoUIMessage,
  messages: SyntheoUIMessage[],
  { isAbort = false, isError = false } = {},
  init = chatInit(),
) {
  init.onFinish({ isAbort, isError, message: finished, messages });
}

function installTransport() {
  const sendMessages = vi
    .fn()
    .mockResolvedValue(
      new ReadableStream({ start: (controller) => controller.close() }),
    );
  mocks.transport = {
    sendMessages,
    reconnectToStream: vi.fn().mockResolvedValue(null),
  };
  return sendMessages;
}

function sendThroughTransport(
  trigger: "submit-message" | "regenerate-message",
  messages: SyntheoUIMessage[],
) {
  return latestChatInit().transport.sendMessages({
    trigger,
    chatId: "session-1",
    messageId: undefined,
    messages,
    abortSignal: new AbortController().signal,
  });
}

function connectChatSendToTransport() {
  const sendMessages = installTransport();
  mocks.chatSendMessage.mockImplementation((sent: SyntheoUIMessage) =>
    sendThroughTransport("submit-message", [sent]),
  );
  return sendMessages;
}

function connectChatRegenerateToTransport() {
  const sendMessages = installTransport();
  mocks.chatRegenerate.mockImplementation(() =>
    sendThroughTransport(
      "regenerate-message",
      mocks.messages as SyntheoUIMessage[],
    ),
  );
  return sendMessages;
}

// Rend la session avec un bouton Regenerate et garde les dernières props
// passées aux enfants.
function renderSession(
  props: Partial<SessionProps> = {},
  { strict = false } = {},
) {
  const captured = {} as ChatSessionRenderProps;
  const tree = (next: Partial<SessionProps>) => {
    const session = (
      <ChatSession {...DEFAULT_PROPS} {...next}>
        {(renderProps) => {
          Object.assign(captured, renderProps);
          return (
            <button type="button" onClick={renderProps.regenerate}>
              Regenerate
            </button>
          );
        }}
      </ChatSession>
    );
    return strict ? <StrictMode>{session}</StrictMode> : session;
  };
  const view = render(tree(props));
  return {
    captured,
    view,
    rerender: (next: Partial<SessionProps> = {}) => view.rerender(tree(next)),
  };
}

const clickRegenerate = () =>
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

const silenceConsoleError = () =>
  vi.spyOn(console, "error").mockImplementation(() => undefined);

const BATCH_PENDING: Partial<SessionProps> = {
  currentSessionId: "session-1",
  isBatchTranscriptionPending: true,
  sessionId: "chat-1",
};

// Mises à jour fonctionnelles passées à setMessages.
const messageUpdates = () =>
  mocks.chatSetMessages.mock.calls
    .map(([next]) => next)
    .filter(
      (next): next is (current: SyntheoUIMessage[]) => SyntheoUIMessage[] =>
        typeof next === "function",
    );

describe("ChatSession", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.chatInits = [];
    mocks.messages = [];
    mocks.persistedMessages = [];
    mocks.status = "ready";
    mocks.store = {};
    mocks.transport = {};
    mocks.chatSendMessage.mockReset().mockResolvedValue(undefined);
    mocks.chatRegenerate.mockReset().mockResolvedValue(undefined);
    mocks.chatStop.mockReset().mockResolvedValue(undefined);
    mocks.deleteChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.deleteChatMessagesExcept.mockReset().mockResolvedValue(undefined);
    mocks.flushDatabaseWritesByPrefix.mockReset().mockResolvedValue(undefined);
    mocks.getChatMessageGroupId.mockReset().mockResolvedValue(null);
    mocks.replaceChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.upsertChatMessage.mockReset().mockResolvedValue(undefined);
  });

  describe("pending batch transcription", () => {
    const question = (id: string) => message(id, "user", "What did they say?");

    it("responds locally while batch transcription is pending", async () => {
      const { captured } = renderSession(BATCH_PENDING);
      const userCreatedAt = Date.now() + 60_000;
      const userMessage: SyntheoUIMessage = {
        ...question("user-message"),
        metadata: { createdAt: userCreatedAt },
      };
      let finishBeforeSend: (() => void) | undefined;
      const beforeSend = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishBeforeSend = resolve;
          }),
      );

      captured.sendMessage(userMessage, { chatGroupId: "group-1", beforeSend });

      expect(mocks.chatSendMessage).not.toHaveBeenCalled();
      await waitFor(() => expect(beforeSend).toHaveBeenCalledOnce());
      expect(messageUpdates()[0]?.([])).toEqual([
        userMessage,
        expect.objectContaining({ role: "assistant" }),
      ]);

      finishBeforeSend?.();
      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledOnce(),
      );
      expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatGroupId: "group-1",
          role: "assistant",
          createdAt: new Date(userCreatedAt + 1).toISOString(),
          content:
            "This recording is using batch transcription, so the transcript isn't available to chat yet. Ask again after transcription finishes, or switch to a Pro model for live transcription.",
        }),
      );
    });

    it("uses an existing transcript while batch retranscription is pending", () => {
      const { captured } = renderSession({
        ...BATCH_PENDING,
        hasAvailableTranscript: true,
      });
      const userMessage = question("user-message");

      captured.sendMessage(userMessage, { chatGroupId: "group-1" });

      expect(mocks.chatSendMessage).toHaveBeenCalledWith(userMessage);
      expect(mocks.chatSetMessages).not.toHaveBeenCalled();
    });

    it("removes local batch guidance when persistence fails", async () => {
      const consoleError = silenceConsoleError();
      const { captured } = renderSession(BATCH_PENDING);
      const userMessage = question("failed-user-message");

      captured.sendMessage(userMessage, {
        chatGroupId: "group-1",
        beforeSend: vi.fn().mockRejectedValue(new Error("create failed")),
      });

      await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
      const updates = messageUpdates();
      const optimisticMessages = updates[0]?.([]) ?? [];
      expect(optimisticMessages).toEqual([
        userMessage,
        expect.objectContaining({ role: "assistant" }),
      ]);
      expect(updates[1]?.(optimisticMessages)).toEqual([]);
      expect(mocks.deleteChatMessage).toHaveBeenCalledTimes(2);
      expect(mocks.deleteChatMessage).toHaveBeenCalledWith(
        "group-1",
        "failed-user-message",
      );
      expect(mocks.chatSendMessage).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("deletes the persisted user turn when batch guidance fails to save", async () => {
      const consoleError = silenceConsoleError();
      mocks.upsertChatMessage.mockRejectedValueOnce(
        new Error("assistant save failed"),
      );
      const { captured } = renderSession(BATCH_PENDING);

      captured.sendMessage(question("persisted-user-message"), {
        chatGroupId: "group-1",
        beforeSend: vi.fn().mockResolvedValue(undefined),
      });

      await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
      expect(mocks.deleteChatMessage).toHaveBeenCalledTimes(2);
      expect(mocks.deleteChatMessage).toHaveBeenCalledWith(
        "group-1",
        "persisted-user-message",
      );
      expect(mocks.chatSendMessage).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it.each([
      { transcript: "a pending batch transcript", available: false, calls: 0 },
      {
        transcript: "an existing transcript during batch retranscription",
        available: true,
        calls: 1,
      },
    ])(
      "regenerates against $transcript only when one is available",
      ({ available, calls }) => {
        if (available) mocks.messages = [question("user-message")];
        renderSession({
          isBatchTranscriptionPending: true,
          hasAvailableTranscript: available,
          sessionId: "chat-1",
        });

        clickRegenerate();

        expect(mocks.chatRegenerate).toHaveBeenCalledTimes(calls);
      },
    );
  });

  describe("regeneration", () => {
    const replacement = (id: string, text = "Replacement answer") =>
      message(id, "assistant", text);
    const startRegeneration = async () => {
      mocks.messages = [USER, OLD_ASSISTANT];
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");
      const sendTransport = connectChatRegenerateToTransport();
      const session = renderSession();
      clickRegenerate();
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());
      return { ...session, sendTransport };
    };
    const expectReplaced = (id: string, previousMessageId = OLD_ASSISTANT.id) =>
      expect(mocks.replaceChatMessage).toHaveBeenCalledWith({
        message: expect.objectContaining({ id }),
        previousMessageId,
      });

    it.each([
      {
        name: "empty",
        replacement: message("assistant-new", "assistant"),
        isAbort: false,
        isError: false,
        shouldReplace: false,
      },
      {
        name: "aborted",
        replacement: replacement("assistant-new", "Partial answer"),
        isAbort: true,
        isError: false,
        shouldReplace: false,
      },
      {
        name: "failed",
        replacement: replacement("assistant-new", "Partial answer"),
        isAbort: false,
        isError: true,
        shouldReplace: false,
      },
      {
        name: "failed-same-id",
        replacement: replacement("assistant-old", "Partial answer"),
        isAbort: false,
        isError: true,
        shouldReplace: false,
      },
      {
        name: "same-id",
        replacement: replacement("assistant-old"),
        isAbort: false,
        isError: false,
        shouldReplace: true,
      },
    ])(
      "keeps the prior assistant for a $name replacement",
      async ({ replacement: next, isAbort, isError, shouldReplace }) => {
        await startRegeneration();
        finish(next, [USER, next], { isAbort, isError });

        if (shouldReplace) {
          await waitFor(() => expectReplaced(next.id));
        } else {
          await Promise.resolve();
          await Promise.resolve();
          expect(mocks.replaceChatMessage).not.toHaveBeenCalled();
        }
        expect(mocks.upsertChatMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ id: next.id }),
        );
      },
    );

    it("keeps persisting partial failures for normal sends", async () => {
      const partialAssistant = replacement(
        "assistant-partial",
        "Partial answer",
      );
      mocks.messages = [USER];
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");

      renderSession();
      finish(partialAssistant, [USER, partialAssistant], { isError: true });

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id: partialAssistant.id }),
        ),
      );
      expect(mocks.replaceChatMessage).not.toHaveBeenCalled();
    });

    it("does not replace an assistant from before the latest user", async () => {
      const firstUser = message("user-1", "user", "First question");
      const firstAssistant = message(
        "assistant-1",
        "assistant",
        "First answer",
      );
      const latestUser = message("user-2", "user", "Second question");
      const latestAssistant = message(
        "assistant-2",
        "assistant",
        "Second answer",
      );
      mocks.status = "error";
      mocks.messages = [firstUser, firstAssistant, latestUser];
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");
      const sendTransport = connectChatRegenerateToTransport();

      renderSession();
      clickRegenerate();
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());
      finish(latestAssistant, [
        firstUser,
        firstAssistant,
        latestUser,
        latestAssistant,
      ]);

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id: latestAssistant.id }),
        ),
      );
      expect(mocks.replaceChatMessage).not.toHaveBeenCalled();
      expect(mocks.deleteChatMessage).not.toHaveBeenCalledWith(
        "group-1",
        firstAssistant.id,
      );
    });

    it.each([
      {
        name: "partial error",
        failedMessage: replacement("assistant-failed", "Partial answer"),
        isAbort: false,
        isError: true,
      },
      {
        name: "empty response",
        failedMessage: message("assistant-empty", "assistant"),
        isAbort: false,
        isError: false,
      },
      {
        name: "aborted response",
        failedMessage: replacement("assistant-aborted", "Partial answer"),
        isAbort: true,
        isError: false,
      },
    ])(
      "keeps the original durable target across a $name retry",
      async ({ failedMessage, isAbort, isError }) => {
        const next = replacement("assistant-new");
        const { rerender, sendTransport } = await startRegeneration();
        finish(failedMessage, [USER, failedMessage], { isAbort, isError });
        await Promise.resolve();
        expect(mocks.replaceChatMessage).not.toHaveBeenCalled();
        expect(mocks.upsertChatMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ id: failedMessage.id }),
        );

        mocks.messages = failedMessage.parts.length
          ? [USER, failedMessage]
          : [USER];
        rerender();
        await nextTask();
        clickRegenerate();
        await waitFor(() => expect(sendTransport).toHaveBeenCalledTimes(2));
        finish(next, [USER, next]);

        await waitFor(() => expectReplaced(next.id));
      },
    );

    it("keeps the original target when atomic replacement fails", async () => {
      const transactionError = new Error("database unavailable");
      const consoleError = silenceConsoleError();
      const failedReplacement = replacement(
        "assistant-failed",
        "Failed replacement",
      );
      const successfulReplacement = replacement(
        "assistant-success",
        "Successful replacement",
      );
      mocks.replaceChatMessage
        .mockRejectedValueOnce(transactionError)
        .mockResolvedValueOnce(undefined);
      const { rerender, sendTransport } = await startRegeneration();
      finish(failedReplacement, [USER, failedReplacement]);
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          "Failed to persist finished chat message",
          transactionError,
        ),
      );

      mocks.messages = [USER, failedReplacement];
      rerender();
      await nextTask();
      clickRegenerate();
      await waitFor(() => expect(sendTransport).toHaveBeenCalledTimes(2));
      finish(successfulReplacement, [USER, successfulReplacement]);

      await waitFor(() =>
        expect(mocks.replaceChatMessage).toHaveBeenLastCalledWith({
          message: expect.objectContaining({ id: successfulReplacement.id }),
          previousMessageId: OLD_ASSISTANT.id,
        }),
      );
      consoleError.mockRestore();
    });

    it("replaces the regenerated answer through one atomic write", async () => {
      let finishReplacement: (() => void) | undefined;
      const pendingReplacement = new Promise<void>((resolve) => {
        finishReplacement = resolve;
      });
      const next = replacement("assistant-new");
      mocks.replaceChatMessage.mockReturnValueOnce(pendingReplacement);
      await startRegeneration();
      finish(next, [USER, next]);

      await waitFor(() => expectReplaced(next.id));

      finishReplacement?.();
      await pendingReplacement;
    });

    // Régénération qui passe par le transport puis termine la réponse, selon
    // le rang de la requête.
    const regenerateThenFinish = (
      answerFor: (request: number) => SyntheoUIMessage | undefined,
    ) => {
      const sendTransport = installTransport();
      let requestCount = 0;
      mocks.chatRegenerate.mockImplementation(async () => {
        await sendThroughTransport(
          "regenerate-message",
          mocks.messages as SyntheoUIMessage[],
        );
        const answer = answerFor(requestCount++);
        if (answer) finish(answer, [USER, answer], {}, latestChatInit());
      });
      return sendTransport;
    };

    it("keeps the next prior assistant when cleanup cancels an active regeneration preflight", async () => {
      let finishFirstPersist: (() => void) | undefined;
      const firstPersist = new Promise<void>((resolve) => {
        finishFirstPersist = resolve;
      });
      const firstReplacement = replacement(
        "assistant-first",
        "First replacement",
      );
      mocks.messages = [USER, OLD_ASSISTANT];
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");
      mocks.replaceChatMessage.mockReturnValueOnce(firstPersist);
      const sendTransport = regenerateThenFinish((request) =>
        request === 0 ? firstReplacement : undefined,
      );
      const consoleError = silenceConsoleError();

      const { rerender, view } = renderSession();
      clickRegenerate();
      await waitFor(() => expectReplaced(firstReplacement.id));

      mocks.messages = [USER, firstReplacement];
      rerender();
      await Promise.resolve();
      clickRegenerate();
      await waitFor(() =>
        expect(mocks.chatRegenerate).toHaveBeenCalledTimes(2),
      );
      expect(sendTransport).toHaveBeenCalledOnce();

      view.unmount();
      finishFirstPersist?.();
      await firstPersist;

      expect(mocks.replaceChatMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ previousMessageId: firstReplacement.id }),
      );
      expect(sendTransport).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    });

    it("waits for regenerated assistant persistence before another retry", async () => {
      let finishAssistantPersist: (() => void) | undefined;
      const assistantPersist = new Promise<void>((resolve) => {
        finishAssistantPersist = resolve;
      });
      const regeneratedAssistant = replacement(
        "assistant-regenerated",
        "Regenerated answer",
      );
      mocks.messages = [USER, OLD_ASSISTANT];
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");
      mocks.replaceChatMessage.mockReturnValueOnce(assistantPersist);
      const sendTransport = regenerateThenFinish((request) =>
        request === 0
          ? regeneratedAssistant
          : replacement("assistant-next", "Next answer"),
      );

      const { rerender } = renderSession();
      clickRegenerate();
      await waitFor(() => expectReplaced(regeneratedAssistant.id));

      mocks.messages = [USER, regeneratedAssistant];
      rerender();
      await nextTask();
      clickRegenerate();
      expect(mocks.chatRegenerate).toHaveBeenCalledTimes(2);
      expect(mocks.replaceChatMessage).toHaveBeenCalledOnce();
      expect(sendTransport).toHaveBeenCalledOnce();

      finishAssistantPersist?.();
      await assistantPersist;

      await waitFor(() => expect(sendTransport).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(mocks.replaceChatMessage).toHaveBeenLastCalledWith({
          message: expect.objectContaining({ id: "assistant-next" }),
          previousMessageId: regeneratedAssistant.id,
        }),
      );
    });

    it("ignores overlapping regeneration attempts", async () => {
      let finishTombstone: (() => void) | undefined;
      mocks.deleteChatMessage.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishTombstone = resolve;
        }),
      );
      mocks.messages = [
        message("user-1", "user", "Q"),
        message("assistant-1", "assistant", "Old answer"),
      ];
      connectChatRegenerateToTransport();

      renderSession();
      clickRegenerate();
      clickRegenerate();

      expect(mocks.chatRegenerate).toHaveBeenCalledOnce();
      finishTombstone?.();
    });

    it("allows regeneration retries from the error state", async () => {
      mocks.status = "error";
      mocks.messages = [
        message("user-1", "user", "Q"),
        message("assistant-1", "assistant", "Failed answer"),
      ];
      connectChatRegenerateToTransport();

      renderSession();
      clickRegenerate();

      await waitFor(() => expect(mocks.chatRegenerate).toHaveBeenCalledOnce());
    });
  });

  describe("SDK chat lifecycle", () => {
    it("keeps one SDK chat and sends through the latest transport", async () => {
      const initialTransport = {
        sendMessages: vi.fn(),
        reconnectToStream: vi.fn(),
      };
      mocks.transport = initialTransport;
      const { rerender } = renderSession();

      const readySend = installTransport();
      rerender();

      expect(mocks.chatInits).toHaveLength(1);
      await sendThroughTransport("submit-message", [
        message("user-1", "user", "Q"),
      ]);

      expect(readySend).toHaveBeenCalledOnce();
      expect(initialTransport.sendMessages).not.toHaveBeenCalled();
    });

    it("syncs SDK messages when SQLite rows load later", async () => {
      const { rerender } = renderSession();
      expect(mocks.chatInits).toHaveLength(1);

      mocks.persistedMessages = [persistedMessage(USER)];
      rerender();

      await waitFor(() => {
        expect(mocks.chatSetMessages).toHaveBeenCalledWith([USER]);
      });
      expect(mocks.chatInits).toHaveLength(1);
    });

    it("keeps the SDK chat when first send creates a chat group", () => {
      const { rerender } = renderSession({ chatGroupId: undefined });

      rerender();

      expect(mocks.chatInits).toHaveLength(1);
    });

    it("stops the active response when switching chat sessions", async () => {
      const sendTransport = connectChatSendToTransport();
      const { captured, rerender } = renderSession();

      captured.sendMessage(USER);
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());
      const oldChat = chatInit();
      mocks.chatStop.mockImplementationOnce(() => {
        finish(
          message("assistant-1", "assistant"),
          [USER],
          { isAbort: true },
          oldChat,
        );
      });

      rerender({ chatGroupId: "group-2", sessionId: "session-2" });

      expect(mocks.chatStop).toHaveBeenCalledOnce();
      expect(mocks.chatInits).toHaveLength(2);
    });

    it("does not replace streaming SDK messages with stale SQLite rows", () => {
      mocks.persistedMessages = [persistedMessage(USER)];
      mocks.messages = [
        USER,
        message("assistant-1", "assistant", "Partial answer"),
      ];
      mocks.status = "streaming";

      renderSession();

      expect(mocks.chatSetMessages).not.toHaveBeenCalled();
    });

    it("does not replace a finished response while its SQLite write is pending", async () => {
      let finishAssistantPersist: (() => void) | undefined;
      mocks.getChatMessageGroupId.mockResolvedValue("group-1");
      mocks.upsertChatMessage.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishAssistantPersist = resolve;
        }),
      );
      const assistantMessage = message(
        "assistant-1",
        "assistant",
        "Finished answer",
      );
      mocks.persistedMessages = [persistedMessage(USER)];
      mocks.messages = [USER, assistantMessage];
      mocks.status = "streaming";

      const { rerender } = renderSession();
      finish(assistantMessage, [USER, assistantMessage]);

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id: assistantMessage.id }),
        ),
      );
      mocks.status = "ready";
      rerender();

      await Promise.resolve();
      expect(mocks.chatSetMessages).not.toHaveBeenCalled();

      finishAssistantPersist?.();
    });
  });

  describe("persistence routing", () => {
    const ANSWER = message("assistant-1", "assistant", "Answer");

    it("persists a first-send assistant response to the newly created group", async () => {
      const { captured } = renderSession({ chatGroupId: undefined });

      captured.sendMessage(USER, { chatGroupId: "new-group" });
      finish(ANSWER, [USER, ANSWER]);

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledTimes(2),
      );
      // The user row was missing at finish time, so the turn is repaired
      // before the assistant lands in the same group.
      expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1", chatGroupId: "new-group" }),
      );
      expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "assistant-1",
          chatGroupId: "new-group",
          content: "Answer",
        }),
      );
    });

    it("falls back to the selected group when persisted routing lookup fails", async () => {
      const lookupError = new Error("database unavailable");
      mocks.getChatMessageGroupId.mockRejectedValue(lookupError);
      const consoleError = silenceConsoleError();
      renderSession();

      finish(ANSWER, [USER, ANSWER]);

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "assistant-1",
            chatGroupId: "group-1",
          }),
        ),
      );
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to resolve the persisted chat message group",
        lookupError,
      );
      consoleError.mockRestore();
    });

    it("persists overlapping assistant responses to their submitted groups", async () => {
      const { captured } = renderSession({ chatGroupId: "initial-group" });
      const userOne = message("user-1", "user", "First question");
      const userTwo = message("user-2", "user", "Second question");
      const assistantOne = message("assistant-1", "assistant", "First answer");
      const assistantTwo = message("assistant-2", "assistant", "Second answer");
      captured.sendMessage(userOne, { chatGroupId: "group-1" });
      captured.sendMessage(userTwo, { chatGroupId: "group-2" });

      finish(assistantOne, [userOne, assistantOne, userTwo]);
      finish(assistantTwo, [userOne, assistantOne, userTwo, assistantTwo]);

      await waitFor(() =>
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "assistant-2",
            chatGroupId: "group-2",
          }),
        ),
      );
      // Unpersisted user turns are repaired alongside their assistant rows.
      for (const [id, chatGroupId] of [
        ["assistant-1", "group-1"],
        ["user-1", "group-1"],
        ["user-2", "group-2"],
      ]) {
        expect(mocks.upsertChatMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id, chatGroupId }),
        );
      }
    });
  });

  describe("stop and teardown", () => {
    const EMPTY_ASSISTANT = message("assistant-1", "assistant");

    it("does not persist an aborted response", async () => {
      connectChatSendToTransport();
      const { captured } = renderSession();

      captured.sendMessage(USER);
      await waitFor(() => expect(mocks.chatSendMessage).toHaveBeenCalledOnce());
      captured.stop();
      expect(mocks.chatStop).toHaveBeenCalledOnce();

      finish(EMPTY_ASSISTANT, [USER, EMPTY_ASSISTANT], { isAbort: true });

      await Promise.resolve();
      expect(mocks.upsertChatMessage).not.toHaveBeenCalled();
    });

    it("flushes durable writes on unmount even when SDK stop never settles", async () => {
      let finishWriteFlush: (() => void) | undefined;
      mocks.chatStop.mockReturnValueOnce(new Promise<void>(() => {}));
      mocks.flushDatabaseWritesByPrefix.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishWriteFlush = resolve;
        }),
      );
      const sendTransport = connectChatSendToTransport();
      const { captured, view } = renderSession();

      captured.sendMessage(USER);
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());

      view.unmount();
      await waitFor(() =>
        expect(mocks.flushDatabaseWritesByPrefix).toHaveBeenCalledWith([
          "chat:",
        ]),
      );
      expect(mocks.chatStop).toHaveBeenCalledOnce();

      finishWriteFlush?.();

      mocks.upsertChatMessage.mockClear();
      const late = message("assistant-late", "assistant", "Late answer");
      finish(late, [USER, late]);
      await Promise.resolve();

      expect(mocks.upsertChatMessage).not.toHaveBeenCalled();
    });

    it("retains a failed new-group marker for a finish callback after teardown", async () => {
      const groupId = "failed-group-after-unmount";
      markFailedChatGroupCreate(groupId);
      const { view } = renderSession({ chatGroupId: groupId });

      view.unmount();
      await waitFor(() =>
        expect(mocks.flushDatabaseWritesByPrefix).toHaveBeenCalledWith([
          "chat:",
        ]),
      );

      expect(isFailedChatGroupCreate(groupId)).toBe(true);
      clearFailedChatGroupCreate(groupId);
    });

    it("can start chat after StrictMode replays mount cleanup", async () => {
      const sendTransport = connectChatSendToTransport();
      const { captured } = renderSession({}, { strict: true });

      captured.sendMessage(USER);
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());

      finish(
        EMPTY_ASSISTANT,
        [USER, EMPTY_ASSISTANT],
        { isAbort: true },
        latestChatInit(),
      );
      expect(mocks.upsertChatMessage).not.toHaveBeenCalled();
    });

    it("waits for the durable preflight before transport", async () => {
      let finishPreflight: (() => void) | undefined;
      const beforeSend = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishPreflight = resolve;
          }),
      );
      const sendTransport = connectChatSendToTransport();
      const { captured, view } = renderSession();

      captured.sendMessage(USER, { beforeSend });

      expect(mocks.chatSendMessage).toHaveBeenCalledWith(USER);
      await waitFor(() => expect(beforeSend).toHaveBeenCalledOnce());
      expect(sendTransport).not.toHaveBeenCalled();

      finishPreflight?.();
      await waitFor(() => expect(sendTransport).toHaveBeenCalledOnce());

      finish(EMPTY_ASSISTANT, [USER, EMPTY_ASSISTANT], { isAbort: true });
      view.unmount();
    });
  });
});

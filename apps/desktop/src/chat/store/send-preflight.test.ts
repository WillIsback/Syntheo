import type { ChatTransport, UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  createChatPreflightController,
  guardChatTransport,
  type GuardedChatPreflight,
} from "./send-preflight";

const userMessage: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Question" }],
};

function createTransport() {
  const sendMessages = vi.fn().mockResolvedValue(new ReadableStream());
  const transport: ChatTransport<UIMessage> = {
    sendMessages,
    reconnectToStream: vi.fn().mockResolvedValue(null),
  };
  return { transport, sendMessages };
}

function send(
  transport: ChatTransport<UIMessage>,
  abortSignal = new AbortController().signal,
) {
  return transport.sendMessages({
    trigger: "submit-message",
    chatId: "chat-1",
    messageId: undefined,
    messages: [userMessage],
    abortSignal,
  });
}

describe("chat send preflight", () => {
  it("runs the preflight before the transport", async () => {
    const order: string[] = [];
    const { transport, sendMessages } = createTransport();
    sendMessages.mockImplementation(async () => {
      order.push("send");
      return new ReadableStream();
    });
    const preflight: GuardedChatPreflight = {
      run: async () => {
        order.push("preflight");
      },
      persistOnCancel: true,
    };
    const guarded = guardChatTransport(
      transport,
      createChatPreflightController(),
      { beforeSend: () => preflight },
    );

    await send(guarded);

    expect(order).toEqual(["preflight", "send"]);
  });

  it("does not send when the preflight fails and replays it before the reply is saved", async () => {
    const { transport, sendMessages } = createTransport();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce(undefined);
    const controller = createChatPreflightController();
    const guarded = guardChatTransport(transport, controller, {
      beforeSend: () => ({ run, persistOnCancel: true }),
    });

    await expect(send(guarded)).rejects.toThrow("database is locked");
    expect(sendMessages).not.toHaveBeenCalled();
    // Une reprise immédiate a été tentée.
    expect(run).toHaveBeenCalledTimes(2);

    const persistReply = vi.fn().mockResolvedValue("saved");
    await expect(
      controller.runAfterPreflight("user-1", persistReply),
    ).resolves.toBe("saved");
    expect(run).toHaveBeenCalledTimes(3);
    expect(persistReply).toHaveBeenCalledOnce();
  });

  it("skips a cancellable preflight once the request is aborted", async () => {
    const { transport, sendMessages } = createTransport();
    const run = vi.fn();
    const guarded = guardChatTransport(
      transport,
      createChatPreflightController(),
      { beforeSend: () => ({ run, persistOnCancel: false }) },
    );
    const abort = new AbortController();
    abort.abort();

    await expect(send(guarded, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(run).not.toHaveBeenCalled();
    expect(sendMessages).not.toHaveBeenCalled();
  });

  it("refuses new requests after disposal until resumed", async () => {
    const { transport, sendMessages } = createTransport();
    const controller = createChatPreflightController();
    const guarded = guardChatTransport(transport, controller);

    controller.dispose();
    await expect(send(guarded)).rejects.toMatchObject({ name: "AbortError" });
    expect(sendMessages).not.toHaveBeenCalled();

    controller.resume();
    await send(guarded);
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  it("normalizes a bare string rejection from the transport", async () => {
    const { transport, sendMessages } = createTransport();
    sendMessages.mockRejectedValueOnce("database_is_locked");
    const guarded = guardChatTransport(
      transport,
      createChatPreflightController(),
    );

    await expect(send(guarded)).rejects.toThrow(
      new Error("database_is_locked"),
    );
  });
});

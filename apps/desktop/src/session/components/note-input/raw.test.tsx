import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RawEditor as SessionRawEditor } from "./raw";

const hoisted = vi.hoisted(() => ({
  rawMd: JSON.stringify({ type: "doc", content: [] }),
  sessionTitle: "Weekly sync",
  persistChange: vi.fn(() => Promise.resolve()),
  fileUpload: vi.fn(),
  processAudioFile: vi.fn(),
  showWindow: vi.fn(),
  unminimizeWindow: vi.fn(),
  focusWindow: vi.fn(),
  meetingChatRecords: [] as unknown[],
  noteEditorProps: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: hoisted.showWindow,
    unminimize: hoisted.unminimizeWindow,
    setFocus: hoisted.focusWindow,
  }),
}));

vi.mock("@syntheo/editor/markdown", () => ({
  parseJsonContent: (value: string) => JSON.parse(value),
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (input: TemplateStringsArray) => input.join(""),
  }),
}));

vi.mock("@syntheo/editor/note", () => {
  return {
    normalizePortableAttachmentUrls: (value: unknown) => value,
    NoteEditor: (props: Record<string, unknown>) => {
      hoisted.noteEditorProps.push(props);
      return <div>Note editor</div>;
    },
  };
});

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: vi.fn() },
}));

vi.mock("~/editor-bridge/app-link-view", () => ({
  AppLinkView: () => null,
}));

vi.mock("~/editor-bridge/mention-config", () => ({
  useMentionConfig: () => ({ users: [] }),
}));

vi.mock("~/editor-bridge/open-editor-link", () => ({
  openEditorLink: vi.fn(),
}));

vi.mock("~/editor-bridge/session-mention-drop", () => ({
  sessionMentionDropConfig: { read: () => null },
}));

vi.mock("~/editor-bridge/session-view", () => ({
  SessionNodeView: () => null,
}));

vi.mock("~/session-sharing/comment-anchors", () => ({
  useSessionCommentAnchors: () => ({
    onViewReady: vi.fn(),
    onViewDisposed: vi.fn(),
  }),
}));

vi.mock("~/session/queries", () => ({
  useUpdateSession: () => hoisted.persistChange,
}));

vi.mock("~/session/hooks/useAttachmentResolver", () => ({
  useAttachmentResolver: () => () => null,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: () => "inactive",
}));

function RawEditor({ sessionId }: { sessionId: string }) {
  return (
    <SessionRawEditor
      sessionId={sessionId}
      rawMd={hoisted.rawMd}
      sessionTitle={hoisted.sessionTitle}
    />
  );
}

function lastEditorProps() {
  return hoisted.noteEditorProps[hoisted.noteEditorProps.length - 1];
}

vi.mock("~/stt/meeting-chat-records", () => ({
  formatMeetingPlatform: (platform: string) =>
    ({
      zoom: "Zoom",
      googleMeet: "Google Meet",
      microsoftTeams: "Microsoft Teams",
      slack: "Slack",
      discord: "Discord",
      webex: "Webex",
      unknown: "Meeting app",
    })[platform] ?? "Meeting app",
  useMeetingChatRecords: () => hoisted.meetingChatRecords,
}));

vi.mock("./meeting-screen-gallery", () => ({
  MeetingScreenGallery: () => null,
}));

vi.mock("~/shared/hooks/useFileUpload", () => ({
  useFileUpload: () => hoisted.fileUpload,
}));

vi.mock("~/stt/useUploadFile", () => ({
  AUDIO_EXTENSIONS: ["wav", "mp3", "ogg", "mp4", "m4a", "flac", "webm", "aac"],
  isAudioUploadFile: (file: Pick<File, "name" | "type">) =>
    file.type.startsWith("audio/") ||
    ["wav", "mp3", "ogg", "mp4", "m4a", "flac", "webm", "aac", "qta"].some(
      (extension) => file.name.endsWith(`.${extension}`),
    ),
  useUploadFile: () => ({ processAudioFile: hoisted.processAudioFile }),
}));

// Rend explicite le cas où NoteEditor n'a pas été rendu ou n'a pas reçu le
// rappel attendu : le test échoue avec un message clair au lieu d'un TypeError.
function requireCallback<T extends (...args: never[]) => unknown>(
  props: Record<string, unknown> | undefined,
  name: string,
): T {
  const callback = props?.[name];
  if (typeof callback !== "function") {
    throw new Error(`NoteEditor n'a pas reçu de rappel « ${name} »`);
  }
  return callback as T;
}

describe("RawEditor", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hoisted.noteEditorProps = [];
    hoisted.rawMd = JSON.stringify({ type: "doc", content: [] });
    hoisted.sessionTitle = "Weekly sync";
    hoisted.persistChange = vi.fn(() => Promise.resolve());
    hoisted.fileUpload = vi.fn();
    hoisted.processAudioFile = vi.fn();
    hoisted.meetingChatRecords = [];
    hoisted.showWindow.mockReset();
    hoisted.unminimizeWindow.mockReset();
    hoisted.focusWindow.mockReset();
    hoisted.showWindow.mockResolvedValue(undefined);
    hoisted.unminimizeWindow.mockResolvedValue(undefined);
    hoisted.focusWindow.mockResolvedValue(undefined);
  });

  it("removes a legacy session title from the memo body", () => {
    hoisted.rawMd = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Weekly sync" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Follow up" }],
        },
      ],
    });

    render(<RawEditor sessionId="session-1" />);

    const props = lastEditorProps();
    expect(props?.initialContent).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Follow up" }],
        },
      ],
    });
  });

  it("persists memo content without changing the session title", async () => {
    render(<RawEditor sessionId="session-1" />);

    const props = lastEditorProps();
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Follow up" }],
        },
      ],
    };
    requireCallback<(content: unknown) => void>(props, "handleChange")(content);

    await waitFor(() =>
      expect(hoisted.persistChange).toHaveBeenCalledWith({
        raw_md: JSON.stringify(content),
      }),
    );
  });

  it("shows the placeholder only while the whole memo is empty (issue 430)", () => {
    render(<RawEditor sessionId="session-1" />);

    const props = lastEditorProps();
    const placeholder = requireCallback<
      (props: { isEmptyDoc: boolean }) => string
    >(props, "placeholderComponent");
    expect(placeholder({ isEmptyDoc: true })).toBe("Start writing...");
    expect(placeholder({ isEmptyDoc: false })).toBe("");
  });

  it("renders captured chat without mutating the active memo editor", () => {
    const { rerender } = render(<RawEditor sessionId="session-1" />);
    hoisted.meetingChatRecords = [
      {
        id: "msg-1",
        platform: "zoom",
        surface: "native",
        sender: "Ada",
        timestamp: "10:42 AM",
        direction: "incoming",
        text: "Review this together",
        links: [],
        capturedAt: "2026-07-13T10:00:00.000Z",
      },
    ];

    rerender(<RawEditor sessionId="session-1" />);

    expect(screen.getByText("Review this together")).not.toBeNull();
    expect(hoisted.persistChange).not.toHaveBeenCalled();
  });

  it.each(
    (() => {
      const mp3 = { name: "clip.mp3", type: "audio/mpeg" } as File;
      const image = new File(["image"], "photo.png", { type: "image/png" });
      const untyped = new File(["audio"], "clip", { type: "" });
      const second = { name: "second.m4a", type: "" } as File;
      return [
        ["a single audio file", [mp3], undefined, true, [mp3]],
        [
          "audio with attachments",
          [mp3, image],
          undefined,
          { remainingFiles: [image] },
          [mp3],
        ],
        [
          "untyped audio identified by drag item MIME",
          [untyped, image],
          ["audio/mpeg", image.type],
          { remainingFiles: [image] },
          [untyped, { allowUnknownAudio: true, contentType: "audio/mpeg" }],
        ],
        [
          "multiple audio files",
          [mp3, second],
          undefined,
          { remainingFiles: [second] },
          [mp3],
        ],
      ] as const;
    })(),
  )(
    "imports only the first audio file from an editor drop of %s",
    (_label, files, itemTypes, expected, importArgs) => {
      render(<RawEditor sessionId="session-1" />);

      const props = lastEditorProps();
      const fileHandlerConfig = props?.fileHandlerConfig as {
        onDrop: (
          files: File[],
          pos?: number,
          items?: DataTransferItemList,
        ) => boolean | void | { remainingFiles: File[] };
      };
      const items = itemTypes
        ? audioDataTransfer([...files], [...itemTypes]).items
        : undefined;

      expect(fileHandlerConfig.onDrop([...files], undefined, items)).toEqual(
        expected,
      );
      expect(hoisted.processAudioFile).toHaveBeenCalledTimes(1);
      expect(hoisted.processAudioFile).toHaveBeenCalledWith(...importArgs);
    },
  );

  it("routes pasted Voice Memos audio to transcription", () => {
    render(<RawEditor sessionId="session-1" />);

    const props = lastEditorProps();
    const fileHandlerConfig = props?.fileHandlerConfig as {
      onPaste: (
        files: File[],
        items?: DataTransferItemList,
      ) => boolean | void | { remainingFiles: File[] };
    };
    const file = new File(["audio"], "Brian Shin.qta", { type: "" });
    const dataTransfer = audioDataTransfer(file, "audio/quicktime");

    expect(fileHandlerConfig.onPaste([file], dataTransfer.items)).toBe(true);
    expect(hoisted.processAudioFile).toHaveBeenCalledWith(file);
  });

  it("does not capture mixed audio and attachment drops on the wrapper", () => {
    render(<RawEditor sessionId="session-1" />);

    const audioFile = new File(["audio"], "clip.mp3", { type: "audio/mpeg" });
    const imageFile = new File(["image"], "photo.png", { type: "image/png" });
    const dataTransfer = audioDataTransfer([audioFile, imageFile]);
    const dropTarget = screen.getByText("Note editor").parentElement;

    expect(dropTarget).not.toBeNull();
    const dropEvent = createEvent.drop(dropTarget!, { dataTransfer });
    fireEvent(dropTarget!, dropEvent);

    expect(dropEvent.defaultPrevented).toBe(false);
    expect(hoisted.processAudioFile).not.toHaveBeenCalled();
  });

  it("activates the drop zone for an mp4 announced as video while hovering (issue 464)", () => {
    render(<RawEditor sessionId="session-1" />);

    const file = new File(["audio"], "archive.mp4", { type: "video/mp4" });
    // Pendant le survol, WebKitGTK et WebView2 ne livrent pas le fichier.
    const hovering = {
      ...audioDataTransfer(file),
      items: [{ kind: "file", type: "video/mp4", getAsFile: () => null }],
    } as unknown as DataTransfer;
    const dropTarget = screen.getByText("Note editor").parentElement;

    expect(dropTarget).not.toBeNull();
    const dragOver = createEvent.dragOver(dropTarget!, {
      dataTransfer: hovering,
    });
    fireEvent(dropTarget!, dragOver);

    expect(dragOver.defaultPrevented).toBe(true);
    expect(
      screen.getByText("Drop to upload and transcribe audio"),
    ).not.toBeNull();

    fireEvent.drop(dropTarget!, { dataTransfer: audioDataTransfer(file) });

    expect(hoisted.processAudioFile).toHaveBeenCalledWith(file);
  });

  it.each([
    [
      "an audio extension",
      new File(["audio"], "clip.flac", { type: "" }),
      undefined,
      [],
    ],
    [
      "the drag item MIME only",
      new File(["audio"], "clip", { type: "" }),
      "audio/mpeg",
      [{ allowUnknownAudio: true, contentType: "audio/mpeg" }],
    ],
  ])(
    "shows an audio upload overlay and intercepts drops recognised by %s",
    async (_label, file, itemType, extraArgs) => {
      render(<RawEditor sessionId="session-1" />);

      const dataTransfer = audioDataTransfer(file, itemType);
      const dropTarget = screen.getByText("Note editor").parentElement;

      expect(dropTarget).not.toBeNull();
      fireEvent.dragEnter(dropTarget!, { dataTransfer });

      expect(
        screen.getByText("Drop to upload and transcribe audio"),
      ).not.toBeNull();
      await waitFor(() => expect(hoisted.focusWindow).toHaveBeenCalled());

      fireEvent.drop(dropTarget!, { dataTransfer });

      expect(hoisted.processAudioFile).toHaveBeenCalledWith(file, ...extraArgs);
      expect(
        screen.queryByText("Drop to upload and transcribe audio"),
      ).toBeNull();
    },
  );
});

function audioDataTransfer(input: File | File[], itemType?: string | string[]) {
  const files = Array.isArray(input) ? input : [input];
  const itemTypes = Array.isArray(itemType)
    ? itemType
    : files.map((file) => itemType ?? file.type);

  return {
    files,
    items: files.map((file, index) => ({
      kind: "file",
      type: itemTypes[index] ?? file.type,
      getAsFile: () => file,
    })),
    types: ["Files"],
    dropEffect: "none",
  } as unknown as DataTransfer;
}

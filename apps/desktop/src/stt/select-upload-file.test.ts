import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveUploadDefaultPath,
  selectUploadFile,
} from "./select-upload-file";

const { downloadDirMock, homeDirMock, openMock } = vi.hoisted(() => ({
  downloadDirMock: vi.fn(),
  homeDirMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: downloadDirMock,
  homeDir: homeDirMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));

beforeEach(() => {
  vi.clearAllMocks();
  downloadDirMock.mockResolvedValue("/home/user/Downloads");
  homeDirMock.mockResolvedValue("/home/user");
  openMock.mockResolvedValue("/home/user/audio.wav");
});

describe("resolveUploadDefaultPath", () => {
  it("prefers the Downloads folder", async () => {
    await expect(resolveUploadDefaultPath()).resolves.toBe(
      "/home/user/Downloads",
    );
    expect(homeDirMock).not.toHaveBeenCalled();
  });

  it("falls back to the home folder without an XDG Downloads folder", async () => {
    downloadDirMock.mockRejectedValue("unknown path");

    await expect(resolveUploadDefaultPath()).resolves.toBe("/home/user");
  });

  it("leaves the default folder to the dialog when neither exists", async () => {
    downloadDirMock.mockRejectedValue("unknown path");
    homeDirMock.mockRejectedValue("unknown path");

    await expect(resolveUploadDefaultPath()).resolves.toBeUndefined();
  });
});

describe("selectUploadFile", () => {
  it("still opens the dialog when downloadDir rejects", async () => {
    downloadDirMock.mockRejectedValue("unknown path");
    homeDirMock.mockRejectedValue("unknown path");

    await expect(selectUploadFile("audio", ["wav"])).resolves.toBe(
      "/home/user/audio.wav",
    );
    expect(openMock).toHaveBeenCalledTimes(1);
    const options = openMock.mock.calls[0][0];
    expect(options).toMatchObject({
      title: "Upload audio",
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: ["wav"] }],
    });
    expect(options.defaultPath).toBeUndefined();
  });

  it("opens in the home folder with a translated title", async () => {
    downloadDirMock.mockRejectedValue("unknown path");

    await selectUploadFile("transcript", ["srt"]);

    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload transcript",
        defaultPath: "/home/user",
      }),
    );
  });

  it("returns the first path of a multiple selection and null on cancel", async () => {
    openMock.mockResolvedValueOnce(["/a.wav", "/b.wav"]);
    await expect(selectUploadFile("audio", ["wav"])).resolves.toBe("/a.wav");

    openMock.mockResolvedValueOnce(null);
    await expect(selectUploadFile("audio", ["wav"])).resolves.toBeNull();
  });
});

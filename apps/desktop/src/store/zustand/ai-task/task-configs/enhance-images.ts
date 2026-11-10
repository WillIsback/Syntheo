import {
  type AttachmentInfo,
  commands as fsSyncCommands,
} from "@syntheo/plugin-fs-sync";

import {
  type EnhanceImageContext,
  type ImageReference,
  type IndexedImageReference,
  MAX_SOURCE_IMAGE_BYTES,
  collectImageReferences,
  getBase64ByteLength,
  getImageMimeType,
  getPathFilename,
} from "./enhance-image-references";

export {
  type EnhanceImageContext,
  collectImageReferences,
  getBase64ByteLength,
} from "./enhance-image-references";

const MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_BYTES = 128 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 768 * 1024;
const COMPRESSED_IMAGE_MIME_TYPE = "image/jpeg";
const MAX_COMPRESSED_IMAGE_EDGE = 1280;
const MIN_COMPRESSED_IMAGE_EDGE = 512;
const COMPRESSED_IMAGE_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52];

export async function collectEnhanceImageContext(
  sessionId: string,
  rawContent: string | string[],
): Promise<EnhanceImageContext[]> {
  const references = Array.isArray(rawContent)
    ? rawContent.flatMap(collectImageReferences)
    : collectImageReferences(rawContent);
  const candidateRefs = getCandidateImageReferences(references);
  const images: Array<{ index: number; image: EnhanceImageContext }> = [];
  let totalImageBytes = 0;
  const seen = new Set<string>();
  let attachmentLookup:
    | {
        byId: Map<string, AttachmentInfo>;
        byFilename: Map<string, AttachmentInfo>;
      }
    | null
    | undefined;

  async function getAttachmentLookup() {
    if (attachmentLookup !== undefined) {
      return attachmentLookup;
    }

    const listResult = await fsSyncCommands.attachmentList(sessionId);
    if (listResult.status === "error") {
      console.warn(
        "[enhance] failed to list image attachments",
        listResult.error,
      );
      attachmentLookup = null;
      return attachmentLookup;
    }

    attachmentLookup = {
      byId: new Map(
        listResult.data.map((attachment) => [
          attachment.attachmentId,
          attachment,
        ]),
      ),
      byFilename: new Map(
        listResult.data.map((attachment) => [
          getPathFilename(attachment.path) || attachment.attachmentId,
          attachment,
        ]),
      ),
    };
    return attachmentLookup;
  }

  for (const ref of prioritizeImageReferences(candidateRefs)) {
    let sourceImage: EnhanceImageContext | null = null;

    if (ref.dataUrl) {
      sourceImage = ref.dataUrl;
    } else {
      const lookup = await getAttachmentLookup();
      const attachment =
        (ref.attachmentId ? lookup?.byId.get(ref.attachmentId) : undefined) ??
        (ref.filename ? lookup?.byId.get(ref.filename) : undefined) ??
        (ref.filename ? lookup?.byFilename.get(ref.filename) : undefined);

      if (!attachment || seen.has(attachment.attachmentId)) {
        continue;
      }

      seen.add(attachment.attachmentId);
      sourceImage = await readImageAttachment(sessionId, attachment);
    }

    if (!sourceImage) {
      continue;
    }

    const budgetedImage = await prepareImageForBudget(
      sourceImage,
      totalImageBytes,
    );
    if (!budgetedImage) {
      continue;
    }

    const imageBytes = getBase64ByteLength(budgetedImage.base64);
    images.push({ index: ref.index, image: budgetedImage });
    totalImageBytes += imageBytes;
    if (images.length >= MAX_IMAGE_COUNT) {
      return sortImageContexts(images);
    }
  }

  return sortImageContexts(images);
}

async function prepareImageForBudget(
  image: EnhanceImageContext,
  currentTotalBytes: number,
): Promise<EnhanceImageContext | null> {
  const targetBytes = Math.min(
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES - currentTotalBytes,
  );
  if (targetBytes <= 0) {
    return null;
  }

  const imageBytes = getBase64ByteLength(image.base64);
  if (imageBytes <= targetBytes) {
    return image;
  }

  return compressImageContext(image, targetBytes);
}

async function compressImageContext(
  image: EnhanceImageContext,
  targetBytes: number,
): Promise<EnhanceImageContext | null> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof fetch !== "function" ||
    typeof document === "undefined"
  ) {
    return null;
  }

  let bitmap: ImageBitmap;
  try {
    const response = await fetch(toDataUrl(image));
    bitmap = await createImageBitmap(await response.blob());
  } catch {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    let maxEdge = MAX_COMPRESSED_IMAGE_EDGE;
    while (maxEdge >= MIN_COMPRESSED_IMAGE_EDGE) {
      const scale = Math.min(
        1,
        maxEdge / Math.max(bitmap.width, bitmap.height),
      );
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of COMPRESSED_IMAGE_QUALITY_STEPS) {
        const compressed = parseGeneratedImageDataUrl(
          canvas.toDataURL(COMPRESSED_IMAGE_MIME_TYPE, quality),
          image.filename,
        );
        if (
          compressed &&
          getBase64ByteLength(compressed.base64) <= targetBytes
        ) {
          return compressed;
        }
      }

      maxEdge = Math.floor(maxEdge * 0.75);
    }
  } finally {
    bitmap.close?.();
  }

  return null;
}

function getCandidateImageReferences(
  references: ImageReference[],
): IndexedImageReference[] {
  return references.flatMap((ref, index) =>
    ref.dataUrl || ref.attachmentId || ref.filename ? [{ ...ref, index }] : [],
  );
}

function prioritizeImageReferences(
  references: IndexedImageReference[],
): IndexedImageReference[] {
  if (references.length <= MAX_IMAGE_COUNT) {
    return references;
  }

  const selectedIndexes = new Set<number>();
  for (let i = 0; i < MAX_IMAGE_COUNT; i++) {
    selectedIndexes.add(
      Math.round((i * (references.length - 1)) / (MAX_IMAGE_COUNT - 1)),
    );
  }

  const sampled = [...selectedIndexes].map((index) => references[index]);
  const remaining = references.filter(
    (_, index) => !selectedIndexes.has(index),
  );
  return [...sampled, ...remaining];
}

function sortImageContexts(
  images: Array<{ index: number; image: EnhanceImageContext }>,
): EnhanceImageContext[] {
  return images.sort((a, b) => a.index - b.index).map(({ image }) => image);
}

function toDataUrl(image: EnhanceImageContext): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

function parseGeneratedImageDataUrl(
  src: string,
  filename: string | undefined,
): EnhanceImageContext | null {
  const match = src.match(
    /^data:(image\/(?:gif|jpe?g|png|webp));base64,(.+)$/i,
  );
  if (!match) {
    return null;
  }

  return {
    base64: match[2],
    mimeType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1],
    filename,
  };
}

async function readImageAttachment(
  sessionId: string,
  attachment: AttachmentInfo,
): Promise<EnhanceImageContext | null> {
  const mimeType = getImageMimeType(attachment.extension);
  if (!mimeType) {
    return null;
  }

  const readResult = await fsSyncCommands.attachmentRead(
    sessionId,
    attachment.attachmentId,
  );
  if (readResult.status === "error") {
    console.warn("[enhance] failed to read image attachment", readResult.error);
    return null;
  }

  if (readResult.data.length > MAX_SOURCE_IMAGE_BYTES) {
    return null;
  }

  return {
    base64: bytesToBase64(readResult.data),
    mimeType,
    filename: attachment.attachmentId,
  };
}

function bytesToBase64(bytes: number[]): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }

  return btoa(binary);
}

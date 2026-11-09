import { APICallError } from "ai";

import { attributeAIError, withAIErrorSource } from "./shared/error-source";

export function extractUnderlyingError(err: unknown, providerId = ""): Error {
  const underlying = findUnderlyingError(err);
  const error =
    underlying instanceof Error
      ? normalizeTaskError(underlying)
      : errorFromPayload(underlying);
  return withAIErrorSource(error, attributeAIError(underlying, providerId));
}

function errorFromPayload(value: unknown): Error {
  if (typeof value === "object" && value !== null) {
    const { message } = value as { message?: unknown };
    if (typeof message === "string" && message.trim()) {
      return normalizeTaskError(new Error(message));
    }
  }
  return new Error(String(value));
}

function findUnderlyingError(err: unknown): unknown {
  if (!(err instanceof Error)) {
    return err;
  }

  if (err.name === "AI_RetryError") {
    if ("cause" in err && err.cause instanceof Error) {
      return err.cause;
    }

    if ("lastError" in err && err.lastError instanceof Error) {
      return err.lastError;
    }

    if ("errors" in err && Array.isArray((err as any).errors)) {
      const errors = (err as any).errors;
      if (errors.length > 0 && errors[errors.length - 1] instanceof Error) {
        return errors[errors.length - 1];
      }
    }

    const match = err.message.match(/Last error: (.+)$/);
    if (match) {
      const underlyingMessage = match[1];
      const underlyingError = new Error(underlyingMessage);
      underlyingError.name = "AI_ProviderError";
      return underlyingError;
    }
  }

  return err;
}

const TRANSIENT_AI_ERROR_MESSAGE =
  "The AI model is overloaded right now. Wait a moment, then retry.";

const TRANSIENT_AI_ERROR_PATTERNS = [
  "overload",
  "rate limit",
  "rate_limit",
  "too many requests",
  "429",
  "timeout",
  "timed out",
  "temporarily unavailable",
  "service unavailable",
  "502",
  "503",
  "504",
];

function normalizeTaskError(error: Error): Error {
  if (!isRetryableAIError(error)) {
    return error;
  }

  const normalized = new Error(TRANSIENT_AI_ERROR_MESSAGE);
  normalized.name = error.name;
  return normalized;
}

const MAX_CLASSIFIABLE_MESSAGE_LENGTH = 1_000;

export function isRetryableAIError(error: Error): boolean {
  if (APICallError.isInstance(error) || isAPICallErrorShape(error)) {
    const apiError = error as Error & {
      statusCode?: number;
      isRetryable?: boolean;
    };
    if (apiError.statusCode === 409) {
      return false;
    }

    return (
      apiError.isRetryable === true ||
      apiError.statusCode === 429 ||
      apiError.statusCode === 408 ||
      (typeof apiError.statusCode === "number" && apiError.statusCode >= 500)
    );
  }

  // API call error messages embed the request body, so scanning long messages
  // would match transient-looking words inside user content and misclassify
  // permanent failures as retryable.
  if (error.message.length > MAX_CLASSIFIABLE_MESSAGE_LENGTH) {
    return false;
  }

  const message = error.message.toLowerCase();
  return TRANSIENT_AI_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

// A duplicated `ai` package in the bundle defeats APICallError.isInstance, so
// also match the serialized shape.
function isAPICallErrorShape(error: Error): boolean {
  return (
    error.name === "AI_APICallError" &&
    typeof (error as { isRetryable?: unknown }).isRetryable === "boolean"
  );
}

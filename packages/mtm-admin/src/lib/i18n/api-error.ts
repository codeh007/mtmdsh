export type ApiErrorBody = { error?: { code?: unknown; message?: unknown } };

export function translateApiError<MessageKey extends string>(
  body: unknown,
  fallback: string,
  errorKeys: Record<string, MessageKey>,
  translate: (key: MessageKey) => string,
): string {
  const payload = body as ApiErrorBody;
  const code = typeof payload.error?.code === "string" ? payload.error.code : undefined;
  const messageKey = code === undefined ? undefined : errorKeys[code];
  return messageKey === undefined
    ? typeof payload.error?.message === "string"
      ? payload.error.message
      : fallback
    : translate(messageKey);
}

export function resolvePrompt(draft: string, selectedPrompt: string | undefined): string {
  return draft.trim() || selectedPrompt?.trim() || "";
}

import { ArrowUp, LoaderCircle, MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NormalizedClientConfig } from "@/app/config";
import { MtmHarnessRuntime, type ChatMessage, type RuntimeSnapshot } from "@/runtime";

function statusLabel(snapshot: RuntimeSnapshot): string {
  if (snapshot.status === "loading") return "Connecting";
  if (snapshot.status === "streaming") return "Working";
  if (snapshot.status === "auth-required") return "Sign in required";
  if (snapshot.status === "error") return "Unavailable";
  return "Ready";
}

function statusVariant(snapshot: RuntimeSnapshot): "default" | "secondary" | "destructive" | "outline" {
  if (snapshot.status === "error") return "destructive";
  if (snapshot.status === "loading" || snapshot.status === "streaming" || snapshot.status === "auth-required") return "secondary";
  return "outline";
}

function useRuntimeSnapshot(runtime: MtmHarnessRuntime): RuntimeSnapshot {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot());
  useEffect(() => {
    setSnapshot(runtime.getSnapshot());
    return runtime.subscribe(setSnapshot);
  }, [runtime]);
  return snapshot;
}

function MessageRow({ message }: { message: ChatMessage }): ReactElement {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm leading-6",
          isUser ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/60 text-foreground",
        )}
      >
        {message.text || (message.streaming ? "..." : "")}
      </div>
    </article>
  );
}

export interface ConversationSurfaceProps {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  compact?: boolean;
  connectOnMount?: boolean;
  showHeader?: boolean;
}

export function ConversationSurface({ config, runtime, compact = false, connectOnMount = false, showHeader = true }: ConversationSurfaceProps): ReactElement {
  const snapshot = useRuntimeSnapshot(runtime);
  const [draft, setDraft] = useState("");
  const busy = snapshot.status === "loading" || snapshot.status === "streaming";

  useEffect(() => {
    if (connectOnMount) void runtime.connect().catch(() => undefined);
  }, [connectOnMount, runtime]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy || snapshot.status === "auth-required") return;
    setDraft("");
    await runtime.prompt(value);
  }

  const empty = snapshot.messages.length === 0 && snapshot.status !== "auth-required" && snapshot.status !== "error";

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", compact ? "bg-background" : "rounded-xl border bg-card shadow-sm")} aria-label="DSH conversation">
      {showHeader ? (
        <>
          <div className={cn("flex items-center justify-between gap-3", compact ? "px-4 py-3" : "px-5 py-4")}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <MessageCircle />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-semibold text-base">Agent conversation</h1>
                <p className="truncate text-muted-foreground text-xs">One DSH session, streamed from the host</p>
              </div>
            </div>
            <Badge variant={statusVariant(snapshot)}>{statusLabel(snapshot)}</Badge>
          </div>
          <Separator />
        </>
      ) : null}
      {snapshot.status === "auth-required" ? (
        <div className="mx-4 mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" role="status">
          Sign in above or continue anonymously on the sign-in page to start a conversation.
        </div>
      ) : null}
      {snapshot.status === "error" ? (
        <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" role="alert">
          <span>{snapshot.error ?? "The conversation is temporarily unavailable."}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void runtime.connect()}>
            <RotateCcw data-icon="inline-start" /> Retry
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {empty ? (
          <div className="m-auto max-w-xs text-center">
            <p className="font-medium text-sm">Ask the agent a question</p>
            <p className="mt-1 text-muted-foreground text-sm leading-6">Your session history and streamed replies will appear here.</p>
          </div>
        ) : null}
        {snapshot.messages.map((message) => <MessageRow key={message.id} message={message} />)}
        {busy ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <LoaderCircle className="animate-spin" /> Agent is working
          </div>
        ) : null}
      </div>
      <Separator />
      <form className={cn("flex items-end gap-2", compact ? "p-3" : "p-4")} onSubmit={submit}>
        <label className="sr-only" htmlFor="mtmharness-prompt">Message</label>
        <Textarea
          id="mtmharness-prompt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question"
          rows={2}
          disabled={busy || snapshot.status === "auth-required"}
          className="min-h-12 resize-none bg-background text-sm"
        />
        <Button type="submit" size="icon-lg" aria-label="Send message" disabled={!draft.trim() || busy || snapshot.status === "auth-required"}>
          <ArrowUp data-icon="inline-start" />
        </Button>
      </form>
    </section>
  );
}

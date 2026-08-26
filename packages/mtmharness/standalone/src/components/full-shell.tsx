import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, Folder, GitFork, LayoutDashboard, Menu, PanelLeft, Pencil, Plus, RefreshCcw, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { MtmHarnessAuthClient } from "@/app/auth";
import { AuthControls } from "@/app/auth-controls";
import type { MtmSessionSummary } from "@/dsh/adapter";
import { MtmHarnessRuntime, type RuntimeSnapshot } from "@/runtime";

export interface FullShellFrameProps {
  children: ReactNode;
  runtime: MtmHarnessRuntime;
  auth?: MtmHarnessAuthClient;
}

function useRuntimeSnapshot(runtime: MtmHarnessRuntime): RuntimeSnapshot {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot());
  useEffect(() => {
    setSnapshot(runtime.getSnapshot());
    return runtime.subscribe(setSnapshot);
  }, [runtime]);
  return snapshot;
}

function sessionTitle(session: MtmSessionSummary): string {
  return session.title || session.sessionId;
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function formatUpdatedAt(updatedAt: number): string {
  const age = Math.max(0, Date.now() - updatedAt);
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return Math.floor(age / 60_000) + "m ago";
  if (age < 86_400_000) return Math.floor(age / 3_600_000) + "h ago";
  return DATE_FORMATTER.format(updatedAt);
}

function statusLabel(snapshot: RuntimeSnapshot): string {
  if (snapshot.sandboxCatalogStatus === "loading" || snapshot.operation === "switching-sandbox") return "Loading sandbox";
  if (snapshot.operation === "creating-sandbox") return "Creating sandbox";
  if (snapshot.sandboxCatalogStatus === "error") return "Sandbox unavailable";
  if (snapshot.registryStatus === "loading" || snapshot.operation === "refreshing") return "Loading";
  if (snapshot.status === "auth-required") return "Sign in required";
  if (snapshot.registryStatus === "error") return "Unavailable";
  if (snapshot.operation === "creating") return "Creating";
  if (snapshot.operation === "selecting") return "Opening";
  if (snapshot.operation === "renaming") return "Renaming";
  if (snapshot.operation === "forking") return "Forking";
  if (snapshot.status === "streaming") return "Working";
  if (snapshot.status === "error") return "Attention";
  return "Connected";
}

function statusVariant(snapshot: RuntimeSnapshot): "default" | "secondary" | "destructive" | "outline" {
  if (snapshot.status === "auth-required" || snapshot.registryStatus === "error" || snapshot.sandboxCatalogStatus === "error" || snapshot.status === "error") return "destructive";
  if (snapshot.registryStatus === "loading" || snapshot.sandboxCatalogStatus === "loading" || snapshot.operation !== undefined || snapshot.status === "streaming") return "secondary";
  return "outline";
}

function SandboxControl({ runtime, snapshot }: { runtime: MtmHarnessRuntime; snapshot: RuntimeSnapshot }): ReactElement {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const selected = snapshot.sandboxes.find((sandbox) => sandbox.id === snapshot.selectedSandboxId);
  const busy = snapshot.sandboxCatalogStatus === "loading" || snapshot.operation === "switching-sandbox" || snapshot.operation === "creating-sandbox";
  const status = busy ? (snapshot.operation === "creating-sandbox" ? "Creating" : "Switching") : snapshot.sandboxCatalogStatus === "error" ? "Unavailable" : selected ? selected.status : "No sandbox";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim() || busy) return;
    try {
      await runtime.createSandbox(name);
      setName("");
      setCreating(false);
    } catch {
      // Runtime publishes the failure in the shell overlay.
    }
  }

  return (
    <div data-slot="sandbox.control" className="flex min-w-0 flex-1 max-w-[18rem] flex-col gap-1 sm:flex-none">
      <label className="text-muted-foreground text-[0.68rem]" htmlFor="full-shell-sandbox">Sandbox</label>
      <div className="flex min-w-0 items-center gap-1">
        <select
          id="full-shell-sandbox"
          aria-label="Sandbox"
          className="h-8 min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={snapshot.selectedSandboxId ?? ""}
          disabled={busy || snapshot.sandboxes.length === 0}
          onChange={(event) => runRuntimeAction(runtime.selectSandbox(event.target.value))}
        >
          {snapshot.sandboxes.length === 0 ? <option value="">No sandbox selected</option> : null}
          {snapshot.sandboxes.map((sandbox) => <option key={sandbox.id} value={sandbox.id} disabled={sandbox.status === "destroyed"}>{sandbox.name} - {sandbox.status}</option>)}
        </select>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Create sandbox" title="Create sandbox" onClick={() => setCreating((value) => !value)} disabled={busy}>
          {creating ? <X /> : <Plus />}
        </Button>
      </div>
      <span aria-live="polite" className={cn("truncate text-[0.68rem]", snapshot.sandboxCatalogStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
        {status}{selected ? " · " + selected.workspaceId : ""}
      </span>
      {creating ? (
        <form className="flex min-w-0 items-center gap-1" onSubmit={(event) => void submit(event)}>
          <input className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={name} onChange={(event) => setName(event.target.value)} placeholder="Sandbox name" aria-label="New sandbox name" autoFocus disabled={busy} />
          <Button type="submit" size="icon-sm" aria-label="Save sandbox" title="Save sandbox" disabled={busy || !name.trim()}><Check /></Button>
        </form>
      ) : null}
    </div>
  );
}

function runRuntimeAction(action: Promise<unknown>): void {
  void action.catch(() => undefined);
}

function AdapterBadge(): ReactElement {
  return <Badge variant="outline" className="hidden border-border text-muted-foreground sm:inline-flex">Live adapter</Badge>;
}

function SessionRow({ session, selected, onSelect }: { session: MtmSessionSummary; selected: boolean; onSelect: () => void }): ReactElement {
  return (
    <button
      type="button"
      data-session-id={session.sessionId}
      className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
      role="treeitem"
      aria-current={selected ? "page" : undefined}
      aria-label={sessionTitle(session)}
      onClick={onSelect}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", session.running ? "bg-amber-500" : selected ? "bg-emerald-500" : "bg-muted-foreground/50")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{sessionTitle(session)}</span>
      <span className="shrink-0 text-[0.68rem]">{formatUpdatedAt(session.updatedAt)}</span>
    </button>
  );
}

function WorkspaceSessionTree({ snapshot, collapsed, onSelect, onRetry }: { snapshot: RuntimeSnapshot; collapsed: boolean; onSelect: (sessionId: string) => void; onRetry: () => void }): ReactElement {
  if (snapshot.registryStatus === "loading" && snapshot.workspaces.length === 0 && snapshot.sessions.length === 0) {
    return <div data-slot="sidebar.workspaces" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 text-muted-foreground text-xs"><span>Loading workspaces</span><span className="h-2 w-4/5 animate-pulse rounded bg-muted" /><span className="h-2 w-3/5 animate-pulse rounded bg-muted" /></div>;
  }

  if (snapshot.registryStatus === "error") {
    return (
      <div data-slot="sidebar.workspaces" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" role="alert">
        <div className="flex items-center gap-2 text-destructive text-xs"><CircleAlert className="size-4 shrink-0" /> <span className="min-w-0">{snapshot.registryError ?? "Workspace data is unavailable."}</span></div>
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={snapshot.operation !== undefined}>Retry</Button>
      </div>
    );
  }

  const archived = new Set(snapshot.archivedSessionIds);
  const activeSessions = snapshot.sessions.filter((session) => !archived.has(session.sessionId));
  const assigned = new Set<string>();
  const workspaceItems = snapshot.workspaces.map((workspace) => {
    const sessions = snapshot.sessions.filter((session) => !archived.has(session.sessionId) && workspace.sessionIds.includes(session.sessionId));
    for (const session of sessions) assigned.add(session.sessionId);
    return { workspace, sessions };
  });
  const unassigned = snapshot.sessions.filter((session) => !archived.has(session.sessionId) && !assigned.has(session.sessionId));

  if (workspaceItems.length === 0 && unassigned.length === 0) {
    return <div data-slot="sidebar.workspaces" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center text-muted-foreground text-xs"><Folder className="size-4" /><span>No sessions yet</span></div>;
  }

  if (collapsed) {
    return (
      <div data-slot="sidebar.workspaces" className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-2 py-3" aria-label="Workspaces">
        <Folder aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground text-xs">{activeSessions.length}</span>
      </div>
    );
  }

  return (
    <div data-slot="sidebar.workspaces" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
      <div className="flex items-center justify-between px-2 pb-2 text-muted-foreground text-[0.68rem] uppercase"><span>Workspaces</span><span>{snapshot.workspaces.length}</span></div>
      <div className="space-y-2" role="tree" aria-label="Workspaces and sessions">
        {workspaceItems.map(({ workspace, sessions }) => (
          <div key={workspace.workspaceId}>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" role="treeitem" aria-expanded="true">
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <Folder aria-hidden="true" className="size-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">{workspace.title}</span>
              <span className="text-muted-foreground text-xs">{sessions.length}</span>
            </div>
            {sessions.length > 0 ? <div className="ml-4 border-border border-l pl-2" role="group">{sessions.map((session) => <SessionRow key={session.sessionId} session={session} selected={session.sessionId === snapshot.selectedSessionId} onSelect={() => onSelect(session.sessionId)} />)}</div> : <p className="ml-8 py-1 text-muted-foreground text-xs">No sessions</p>}
          </div>
        ))}
        {unassigned.length > 0 ? <div><div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs"><Ellipsis className="size-4" />Other sessions</div><div className="ml-4 border-border border-l pl-2" role="group">{unassigned.map((session) => <SessionRow key={session.sessionId} session={session} selected={session.sessionId === snapshot.selectedSessionId} onSelect={() => onSelect(session.sessionId)} />)}</div></div> : null}
      </div>
    </div>
  );
}

function FullShellSidebar({ runtime, snapshot, collapsed, mobileOpen, onToggle, onCloseMobile, onSelect }: { runtime: MtmHarnessRuntime; snapshot: RuntimeSnapshot; collapsed: boolean; mobileOpen: boolean; onToggle: () => void; onCloseMobile: () => void; onSelect: (sessionId: string) => void }): ReactElement {
  const selectedWorkspace = snapshot.workspaces.find((workspace) => workspace.sessionIds.includes(snapshot.selectedSessionId ?? "")) ?? snapshot.workspaces[0];
  const busy = snapshot.operation !== undefined || snapshot.registryStatus === "loading";
  return (
    <>
      {mobileOpen ? <button type="button" className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-label="Close navigation" onClick={onCloseMobile} /> : null}
      <aside data-slot="sidebar" className={cn("fixed inset-y-0 -left-72 z-40 flex w-72 flex-col border-border border-r bg-card transition-[width,left] md:relative md:left-0 md:z-0", collapsed ? "md:w-16" : "md:w-72", mobileOpen && "left-0")}>
        <div className={cn("flex h-14 shrink-0 items-center gap-3 px-3", collapsed && "md:justify-center md:px-0")}>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-xs">MTM</span>
          {!collapsed ? <div className="min-w-0 flex-1"><p className="truncate font-semibold text-sm">DSH Web Client</p><p className="truncate text-muted-foreground text-xs">FullShell</p></div> : null}
          <Button type="button" variant="ghost" size="icon-sm" className="md:hidden" title="Close sidebar" aria-label="Close sidebar" onClick={onCloseMobile}><ChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon-sm" className="hidden md:inline-flex" title={collapsed ? "Open sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"} onClick={onToggle}>{collapsed ? <ChevronRight /> : <PanelLeft />}</Button>
        </div>
        <Separator />
        <div className={cn("flex items-center gap-2 px-3 py-3", collapsed && "md:justify-center md:px-0")}>
          <Button type="button" size={collapsed ? "icon" : "default"} className={cn("w-full", collapsed && "md:w-8")} onClick={() => runRuntimeAction(runtime.createSession(selectedWorkspace?.workspaceId))} disabled={busy || snapshot.status === "auth-required" || snapshot.selectedSandboxId === undefined} title="Create a new session" aria-label="Create session"><Plus data-icon="inline-start" />{!collapsed ? "New session" : null}</Button>
        </div>
        <WorkspaceSessionTree snapshot={snapshot} collapsed={collapsed} onRetry={() => runRuntimeAction(runtime.refreshRegistry())} onSelect={(sessionId) => { onSelect(sessionId); onCloseMobile(); }} />
        <Separator />
        <div className={cn("flex items-center gap-2 p-3", collapsed && "md:justify-center md:px-0")}>
          <Button type="button" variant="ghost" size={collapsed ? "icon" : "default"} className={cn("w-full justify-start", collapsed && "md:w-8 md:justify-center")} disabled title="Settings are not connected" aria-label="Settings"><Settings2 data-icon="inline-start" />{!collapsed ? "Settings" : null}</Button>
        </div>
      </aside>
    </>
  );
}

function SessionHeader({ runtime, snapshot }: { runtime: MtmHarnessRuntime; snapshot: RuntimeSnapshot }): ReactElement {
  const selected = snapshot.sessions.find((session) => session.sessionId === snapshot.selectedSessionId);
  const workspace = snapshot.workspaces.find((item) => item.sessionIds.includes(selected?.sessionId ?? ""));
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(() => selected ? sessionTitle(selected) : "");
  const busy = snapshot.operation !== undefined;

  function beginRename(): void {
    if (!selected) return;
    setDraft(sessionTitle(selected));
    setRenaming(true);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    try {
      await runtime.renameSession(selected.sessionId, draft);
      setRenaming(false);
    } catch {
      // Runtime publishes the operation error in the shell overlay.
    }
  }

  return (
    <header data-slot="conversation.session.header" className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-border border-b px-4 py-3 md:px-6">
      <div className="min-w-0 flex-1">
        {renaming && selected ? <form className="flex max-w-xl items-center gap-2" onSubmit={(event) => void submitRename(event)}><input className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)} aria-label="Session title" autoFocus disabled={busy} /><Button type="submit" size="sm" disabled={busy || !draft.trim()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)} disabled={busy}>Cancel</Button></form> : <><div className="flex items-center gap-2"><h1 className="truncate font-semibold text-sm md:text-base">{selected ? sessionTitle(selected) : "No session selected"}</h1>{selected ? <span className={cn("size-2 rounded-full", selected.running ? "bg-amber-500" : "bg-emerald-500")} title={selected.running ? "Session is running" : "Session is ready"} aria-label={selected.running ? "Session is running" : "Session is ready"} /> : null}</div><p className="mt-1 truncate text-muted-foreground text-xs">{workspace ? workspace.title + " / " + workspace.path : "Select a session from the sidebar"}</p></>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" disabled title="Search sessions" aria-label="Search sessions"><Search /></Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={beginRename} disabled={!selected || busy} title="Rename session" aria-label="Rename session"><Pencil /></Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => { if (selected) runRuntimeAction(runtime.forkSession(selected.sessionId)); }} disabled={!selected || busy} title="Fork session" aria-label="Fork session"><GitFork /></Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => runRuntimeAction(runtime.refreshRegistry())} disabled={busy} title="Refresh sessions" aria-label="Refresh sessions"><RefreshCcw /></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled title="Session options" aria-label="Session options"><SlidersHorizontal /></Button>
      </div>
    </header>
  );
}

function DetailsPanel({ snapshot }: { snapshot: RuntimeSnapshot }): ReactElement {
  const selected = snapshot.sessions.find((session) => session.sessionId === snapshot.selectedSessionId);
  const selectedSandbox = snapshot.sandboxes.find((sandbox) => sandbox.id === snapshot.selectedSandboxId);
  const workspace = snapshot.workspaces.find((item) => item.sessionIds.includes(selected?.sessionId ?? ""));
  return (
    <aside data-slot="details" className="hidden w-72 shrink-0 flex-col border-border border-l bg-card xl:flex">
      <div className="flex h-16 items-center justify-between border-border border-b px-4"><div><h2 className="font-semibold text-sm">Details</h2><p className="mt-1 text-muted-foreground text-xs">Selected session</p></div><Badge variant={selected ? "secondary" : "outline"}>{selected ? "Ready" : "Empty"}</Badge></div>
      {selected ? <dl className="space-y-4 px-4 py-5 text-sm"><div><dt className="text-muted-foreground text-xs">Title</dt><dd className="mt-1 break-words">{sessionTitle(selected)}</dd></div><div><dt className="text-muted-foreground text-xs">Session ID</dt><dd className="mt-1 break-all font-mono text-xs">{selected.sessionId}</dd></div><div><dt className="text-muted-foreground text-xs">Sandbox</dt><dd className="mt-1 break-words">{selectedSandbox?.name ?? "Unselected"}</dd></div><div><dt className="text-muted-foreground text-xs">Sandbox ID</dt><dd className="mt-1 break-all font-mono text-xs">{selectedSandbox?.id ?? "-"}</dd></div><div><dt className="text-muted-foreground text-xs">Workspace ID</dt><dd className="mt-1 break-all font-mono text-xs">{snapshot.workspaceId ?? "-"}</dd></div><div><dt className="text-muted-foreground text-xs">Workspace</dt><dd className="mt-1 break-words">{workspace?.path ?? "Unassigned"}</dd></div><div><dt className="text-muted-foreground text-xs">Updated</dt><dd className="mt-1">{formatUpdatedAt(selected.updatedAt)}</dd></div></dl> : <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"><CircleAlert aria-hidden="true" className="size-5" /><p className="text-sm">Create or select a session to see details.</p></div>}
    </aside>
  );
}

export function FullShellFrame({ children, runtime, auth }: FullShellFrameProps): ReactElement {
  const snapshot = useRuntimeSnapshot(runtime);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    void runtime.refreshRegistry().catch(() => undefined);
  }, [runtime]);

  return (
    <div data-slot="root" data-shell-profile="full" data-runtime="adapter" data-registry-status={snapshot.registryStatus} className="relative flex h-screen min-h-[560px] w-full overflow-hidden bg-background text-foreground">
      <FullShellSidebar runtime={runtime} snapshot={snapshot} collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed((value) => !value)} onCloseMobile={() => setMobileOpen(false)} onSelect={(sessionId) => runRuntimeAction(runtime.selectSession(sessionId))} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-border border-b px-3 py-2 md:px-5">
          <div className="flex min-w-0 items-center gap-2"><Button type="button" variant="ghost" size="icon-sm" className="md:hidden" title="Open sidebar" aria-label="Open sidebar" onClick={() => setMobileOpen(true)}><Menu /></Button><LayoutDashboard aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" /><span className="truncate font-medium text-sm">DSH workspace</span></div>
          <div className="flex w-full min-w-0 items-end gap-2 sm:w-auto sm:shrink-0"><SandboxControl runtime={runtime} snapshot={snapshot} /><AdapterBadge /><Badge variant={statusVariant(snapshot)}>{statusLabel(snapshot)}</Badge><AuthControls auth={auth} /></div>
        </header>
        <div className="relative flex min-h-0 flex-1">
          <section data-slot="conversation" className="flex min-w-0 flex-1 flex-col"><SessionHeader key={snapshot.selectedSessionId ?? "none"} runtime={runtime} snapshot={snapshot} /><div data-slot="conversation.view" className="min-h-0 flex-1 overflow-hidden"><div data-slot="conversation.composer" className="h-full min-h-0">{children}</div></div></section>
          <DetailsPanel snapshot={snapshot} />
        </div>
        <div data-slot="shell.overlay" className={cn("border-border border-t px-4 py-2 text-xs md:px-6", snapshot.error || snapshot.registryError || snapshot.sandboxError ? "bg-destructive/5 text-destructive" : "bg-muted/30 text-muted-foreground")} role={snapshot.error || snapshot.registryError || snapshot.sandboxError ? "alert" : undefined}>{snapshot.error ?? snapshot.registryError ?? snapshot.sandboxError ?? ""}</div>
      </main>
    </div>
  );
}

export function WorkspaceOverview({ runtime }: { runtime: MtmHarnessRuntime }): ReactElement {
  const snapshot = useRuntimeSnapshot(runtime);
  const selected = snapshot.sessions.find((session) => session.sessionId === snapshot.selectedSessionId);
  const selectedSandbox = snapshot.sandboxes.find((sandbox) => sandbox.id === snapshot.selectedSandboxId);
  const archived = new Set(snapshot.archivedSessionIds);
  const activeSessions = snapshot.sessions.filter((session) => !archived.has(session.sessionId));
  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6" aria-label="Workspace overview">
      <div className="flex items-start justify-between gap-4"><div><p className="text-muted-foreground text-xs uppercase">Workspace</p><h2 className="mt-1 font-semibold text-xl">{snapshot.workspaces[0]?.title ?? "workspace"}</h2><p className="mt-2 text-muted-foreground text-sm">{selectedSandbox ? selectedSandbox.name + " · " + selectedSandbox.status : "No sandbox selected"}</p><p className="mt-1 break-all font-mono text-muted-foreground text-xs">{snapshot.selectedSandboxId ?? "-"} / {snapshot.workspaceId ?? "-"}</p></div><AdapterBadge /></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">{[["Workspaces", String(snapshot.workspaces.length), snapshot.registryStatus === "loading" ? "Loading" : "Registry records"], ["Sessions", String(activeSessions.length), selected ? "Selected session: " + sessionTitle(selected) : "No session selected"], ["Archived", String(snapshot.archivedSessionIds.length), "Hidden from active tree"]].map(([label, value, hint]) => <div key={label} className="border-border border bg-card p-4"><p className="text-muted-foreground text-xs">{label}</p><p className="mt-2 truncate font-semibold text-sm">{value}</p><p className="mt-1 truncate text-muted-foreground text-xs">{hint}</p></div>)}</div>
      <div className="mt-6 border-border border bg-card p-4"><div className="flex items-center gap-2"><Folder aria-hidden="true" className="size-4 text-primary" /><h3 className="font-medium text-sm">Session registry</h3></div><div className="mt-4 divide-y divide-border border-border border-y">{activeSessions.length === 0 ? <p className="py-6 text-center text-muted-foreground text-sm">No sessions are available.</p> : activeSessions.map((session) => <button type="button" key={session.sessionId} className="flex w-full items-center gap-3 py-3 text-left text-sm hover:bg-accent" onClick={() => runRuntimeAction(runtime.selectSession(session.sessionId))}><span className={cn("size-2 shrink-0 rounded-full", session.running ? "bg-amber-500" : "bg-muted-foreground/50")} /><span className="min-w-0 flex-1 truncate">{sessionTitle(session)}</span><span className="text-muted-foreground text-xs">{formatUpdatedAt(session.updatedAt)}</span></button>)}</div></div>
    </section>
  );
}

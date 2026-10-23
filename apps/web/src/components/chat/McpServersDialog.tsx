import type {
  EnvironmentId,
  ThreadId,
  ThreadMcpServer,
  ThreadMcpServersResult,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  groupThreadMcpServers,
  THREAD_MCP_SERVER_STATUS_LABELS,
} from "@t3tools/client-runtime/thread-mcp-servers";
import type * as Cause from "effect/Cause";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import { threadMcpServerEnvironment } from "~/state/threadMcpServers";
import { useAtomCommand } from "~/state/use-atom-command";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";

const STATUS_BADGE_VARIANTS = {
  connected: "success",
  pending: "info",
  "needs-auth": "warning",
  failed: "error",
  disabled: "secondary",
} as const satisfies Record<ThreadMcpServer["status"], string>;

const STATUS_DOT_CLASS: Record<ThreadMcpServer["status"], string> = {
  connected: "bg-success",
  pending: "bg-info",
  "needs-auth": "bg-warning",
  failed: "bg-destructive",
  disabled: "bg-muted-foreground/40",
};

const FILTER_MIN_SERVERS = 8;

function failureMessage(result: { readonly cause: Cause.Cause<unknown> }) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The MCP server request failed.";
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function serversSummary(servers: ReadonlyArray<ThreadMcpServer>) {
  const count = (status: ThreadMcpServer["status"]) =>
    servers.filter((server) => server.status === status).length;
  return [
    plural(servers.length, "server"),
    count("failed") > 0 ? `${count("failed")} failed` : undefined,
    count("needs-auth") > 0 ? `${count("needs-auth")} need sign-in` : undefined,
    count("disabled") > 0 ? `${count("disabled")} disabled` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

function ServerListRow(props: {
  readonly server: ThreadMcpServer;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { server } = props;
  return (
    <button
      type="button"
      aria-current={props.selected}
      onClick={props.onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground"
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_CLASS[server.status])}
      />
      <span className="min-w-0 flex-1 truncate">{server.name}</span>
      <span className="sr-only">{THREAD_MCP_SERVER_STATUS_LABELS[server.status]}</span>
      {server.tools.length > 0 ? (
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {server.tools.length}
        </span>
      ) : null}
    </button>
  );
}

function ServerDetail(props: {
  readonly server: ThreadMcpServer;
  readonly busy: boolean;
  readonly canOperate: boolean;
  readonly onReconnect: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
}) {
  const { server } = props;
  const enabled = server.status !== "disabled";
  const connection = [
    server.transport,
    server.target,
    server.version === undefined ? undefined : `v${server.version}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-semibold text-base">{server.name}</h3>
            <Badge variant={STATUS_BADGE_VARIANTS[server.status]} size="sm">
              {THREAD_MCP_SERVER_STATUS_LABELS[server.status]}
            </Badge>
          </div>
          {connection ? (
            <p className="truncate text-muted-foreground text-xs">{connection}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {props.busy ? <Spinner size="sm" /> : null}
          {enabled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!props.canOperate}
              onClick={props.onReconnect}
            >
              Reconnect
            </Button>
          ) : null}
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <Switch
              size="sm"
              checked={enabled}
              disabled={!props.canOperate}
              onCheckedChange={props.onSetEnabled}
            />
            Enabled
          </label>
        </div>
      </div>
      {server.error ? (
        <Alert variant="error">
          <AlertDescription>
            <span className="wrap-anywhere">{server.error}</span>
          </AlertDescription>
        </Alert>
      ) : null}
      {server.status === "needs-auth" ? (
        <Alert variant="warning">
          <AlertDescription>
            To sign in, run <code>claude</code> in a terminal on this machine, then open{" "}
            <code>/mcp</code>.
          </AlertDescription>
        </Alert>
      ) : null}
      <section className="flex flex-col gap-2">
        <h4 className="font-medium text-muted-foreground text-xs">
          {plural(server.tools.length, "tool")}
        </h4>
        {server.tools.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {server.status === "connected"
              ? "This server offers no tools."
              : "Tools appear once the server connects."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {server.tools.map((tool) => (
              <li key={tool.name} className="px-3 py-2">
                <p className="wrap-anywhere font-mono text-xs">{tool.name}</p>
                {tool.description ? (
                  <p className="mt-0.5 text-muted-foreground text-xs">{tool.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function McpServersPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { environmentId, threadId } = props;
  const listed = useEnvironmentQuery(
    threadMcpServerEnvironment.list({ environmentId, input: { threadId } }),
  );
  const reconnect = useAtomCommand(threadMcpServerEnvironment.reconnect, { reportFailure: false });
  const setEnabled = useAtomCommand(threadMcpServerEnvironment.setEnabled, {
    reportFailure: false,
  });
  const canOperate = useAtomValue(
    threadMcpServerEnvironment.setEnabled.permissionAtom(environmentId),
  );
  const [updatedServers, setUpdatedServers] = useState<ReadonlyArray<ThreadMcpServer> | null>(null);
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const servers = updatedServers ?? listed.data?.servers ?? null;
  const query = filter.trim().toLowerCase();
  const groups = groupThreadMcpServers(
    (servers ?? []).filter(
      (server) =>
        query === "" ||
        server.name.toLowerCase().includes(query) ||
        server.target?.toLowerCase().includes(query) === true,
    ),
  );
  const visible = groups.flatMap((group) => group.servers);
  const selected = visible.find((server) => server.name === selectedName) ?? visible[0] ?? null;

  const runAction = (
    server: string,
    title: string,
    action: Promise<AtomCommandResult<ThreadMcpServersResult, unknown>>,
  ) => {
    setBusyServer(server);
    void action.then((result) => {
      setBusyServer(null);
      if (result._tag === "Success") {
        setUpdatedServers(result.value.servers);
      } else if (!isAtomCommandInterrupted(result)) {
        toastManager.add({ type: "error", title, description: failureMessage(result) });
      }
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>MCP servers</DialogTitle>
        <DialogDescription>
          {servers === null
            ? "Servers loaded by this thread's Claude session."
            : `This thread's Claude session · ${serversSummary(servers)}`}
        </DialogDescription>
      </DialogHeader>
      {servers === null && listed.error !== null ? (
        <div className="flex flex-col items-start gap-3 px-6 pb-6">
          <p className="text-sm">{listed.error}</p>
          <Button size="sm" variant="outline" onClick={listed.refresh}>
            Try again
          </Button>
        </div>
      ) : servers === null ? (
        <div className="flex items-center gap-2 px-6 pb-6 text-muted-foreground text-sm">
          <Spinner size="sm" />
          Loading servers…
        </div>
      ) : servers.length === 0 ? (
        <p className="px-6 pb-6 text-muted-foreground text-sm">This session has no MCP servers.</p>
      ) : (
        <div className="grid min-h-0 flex-1 border-t sm:h-[min(34rem,70dvh)] sm:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col max-sm:max-h-56 max-sm:border-b sm:border-r">
            {servers.length >= FILTER_MIN_SERVERS ? (
              <div className="p-2">
                <Input
                  type="search"
                  size="sm"
                  placeholder="Filter servers"
                  aria-label="Filter servers"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
            ) : null}
            <ScrollArea scrollFade className="min-h-0 flex-1">
              <nav aria-label="MCP servers" className="flex flex-col gap-3 p-2">
                {groups.map((group) => (
                  <section key={group.label} className="flex flex-col gap-0.5">
                    <h3 className="px-2.5 pb-1 font-medium text-muted-foreground text-xs">
                      {group.label}
                    </h3>
                    {group.servers.map((server) => (
                      <ServerListRow
                        key={server.name}
                        server={server}
                        selected={server.name === selected?.name}
                        onSelect={() => setSelectedName(server.name)}
                      />
                    ))}
                  </section>
                ))}
                {visible.length === 0 ? (
                  <p className="px-2.5 text-muted-foreground text-sm">No server matches.</p>
                ) : null}
              </nav>
            </ScrollArea>
          </div>
          <ScrollArea scrollFade className="min-h-0">
            {selected === null ? null : (
              <ServerDetail
                server={selected}
                busy={busyServer === selected.name}
                canOperate={canOperate && busyServer === null}
                onReconnect={() =>
                  runAction(
                    selected.name,
                    `Could not reconnect ${selected.name}`,
                    reconnect({ environmentId, input: { threadId, server: selected.name } }),
                  )
                }
                onSetEnabled={(enabled) =>
                  runAction(
                    selected.name,
                    `Could not ${enabled ? "enable" : "disable"} ${selected.name}`,
                    setEnabled({
                      environmentId,
                      input: { threadId, server: selected.name, enabled },
                    }),
                  )
                }
              />
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
}

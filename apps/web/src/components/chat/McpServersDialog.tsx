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

import { useEnvironmentQuery } from "~/state/query";
import { threadMcpServerEnvironment } from "~/state/threadMcpServers";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { DialogDescription, DialogHeader, DialogPanel, DialogTitle } from "../ui/dialog";
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

function failureMessage(result: { readonly cause: Cause.Cause<unknown> }) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The MCP server request failed.";
}

function ServerRow(props: {
  readonly server: ThreadMcpServer;
  readonly busy: boolean;
  readonly canOperate: boolean;
  readonly onReconnect: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
}) {
  const { server } = props;
  const enabled = server.status !== "disabled";
  const details = [server.target, server.version === undefined ? undefined : `v${server.version}`]
    .filter((detail) => detail !== undefined)
    .join(" · ");
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-medium text-sm">{server.name}</span>
        <Badge variant={STATUS_BADGE_VARIANTS[server.status]} size="sm">
          {THREAD_MCP_SERVER_STATUS_LABELS[server.status]}
        </Badge>
        {props.busy ? <Spinner size="sm" /> : null}
        <div className="ms-auto flex shrink-0 items-center gap-2">
          {enabled ? (
            <Button
              size="xs"
              variant="outline"
              disabled={props.busy || !props.canOperate}
              onClick={props.onReconnect}
            >
              Reconnect
            </Button>
          ) : null}
          <Switch
            size="sm"
            aria-label={enabled ? `Disable ${server.name}` : `Enable ${server.name}`}
            checked={enabled}
            disabled={props.busy || !props.canOperate}
            onCheckedChange={props.onSetEnabled}
          />
        </div>
      </div>
      {details ? <p className="truncate text-muted-foreground text-xs">{details}</p> : null}
      {server.error ? (
        <p className="wrap-anywhere text-destructive-foreground text-xs">{server.error}</p>
      ) : null}
      {server.status === "needs-auth" ? (
        <p className="text-muted-foreground text-xs">
          To sign in, run <code>claude</code> in a terminal on this machine, then open{" "}
          <code>/mcp</code>.
        </p>
      ) : null}
      {server.tools.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground text-xs hover:text-foreground">
            {server.tools.length === 1 ? "1 tool" : `${server.tools.length} tools`}
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <ul className="mt-1.5 flex flex-col gap-1">
              {server.tools.map((tool) => (
                <li key={tool.name} className="text-xs">
                  <code>{tool.name}</code>
                  {tool.description ? (
                    <span className="text-muted-foreground">: {tool.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CollapsiblePanel>
        </Collapsible>
      ) : null}
    </li>
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
  const servers = updatedServers ?? listed.data?.servers ?? null;

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
        <DialogDescription>Servers loaded by this thread's Claude session.</DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {servers === null && listed.error !== null ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm">{listed.error}</p>
            <Button size="sm" variant="outline" onClick={listed.refresh}>
              Try again
            </Button>
          </div>
        ) : servers === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner size="sm" />
            Loading servers…
          </div>
        ) : servers.length === 0 ? (
          <p className="text-muted-foreground text-sm">This session has no MCP servers.</p>
        ) : (
          groupThreadMcpServers(servers).map((group) => (
            <section key={group.label}>
              <h3 className="font-medium text-muted-foreground text-xs">{group.label}</h3>
              <ul className="divide-y">
                {group.servers.map((server) => (
                  <ServerRow
                    key={server.name}
                    server={server}
                    busy={busyServer === server.name}
                    canOperate={canOperate && busyServer === null}
                    onReconnect={() =>
                      runAction(
                        server.name,
                        `Could not reconnect ${server.name}`,
                        reconnect({ environmentId, input: { threadId, server: server.name } }),
                      )
                    }
                    onSetEnabled={(enabled) =>
                      runAction(
                        server.name,
                        `Could not ${enabled ? "enable" : "disable"} ${server.name}`,
                        setEnabled({
                          environmentId,
                          input: { threadId, server: server.name, enabled },
                        }),
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </DialogPanel>
    </>
  );
}

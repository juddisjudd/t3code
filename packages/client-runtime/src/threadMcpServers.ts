import type {
  ProviderDriverKind,
  ThreadMcpServer,
  ThreadMcpServerStatus,
} from "@t3tools/contracts";

// Only the Claude adapter reports its live servers; other providers keep their native /mcp.
export function offersThreadMcpServers(driver: ProviderDriverKind | null | undefined): boolean {
  return driver === "claudeAgent";
}

export const THREAD_MCP_SERVER_STATUS_LABELS: Record<ThreadMcpServerStatus, string> = {
  connected: "Connected",
  pending: "Connecting",
  "needs-auth": "Needs sign-in",
  failed: "Failed",
  disabled: "Disabled",
};

const SCOPE_GROUPS: ReadonlyArray<{ readonly scope: string; readonly label: string }> = [
  { scope: "project", label: "Project" },
  { scope: "local", label: "Local" },
  { scope: "user", label: "User" },
  { scope: "plugin", label: "Plugins" },
  { scope: "claudeai", label: "Claude.ai" },
  { scope: "managed", label: "Managed" },
  { scope: "enterprise", label: "Enterprise" },
  // T3 Code adds its own tools server to each session at runtime.
  { scope: "dynamic", label: "T3 Code" },
];

const STATUS_ORDER: Record<ThreadMcpServerStatus, number> = {
  failed: 0,
  "needs-auth": 1,
  pending: 2,
  connected: 3,
  disabled: 4,
};

export interface ThreadMcpServerGroup {
  readonly label: string;
  readonly servers: ReadonlyArray<ThreadMcpServer>;
}

export function groupThreadMcpServers(
  servers: ReadonlyArray<ThreadMcpServer>,
): ReadonlyArray<ThreadMcpServerGroup> {
  const known = new Set(SCOPE_GROUPS.map((group) => group.scope));
  const byScope = new Map<string, Array<ThreadMcpServer>>();
  for (const server of servers) {
    const scope = server.scope !== undefined && known.has(server.scope) ? server.scope : "";
    byScope.set(scope, [...(byScope.get(scope) ?? []), server]);
  }
  return [...SCOPE_GROUPS, { scope: "", label: "Other" }].flatMap(({ scope, label }) => {
    const members = byScope.get(scope);
    if (members === undefined) return [];
    return [
      {
        label,
        servers: [...members].sort(
          (left, right) =>
            STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
            left.name.localeCompare(right.name),
        ),
      },
    ];
  });
}

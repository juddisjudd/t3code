import type { ThreadMcpServer } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { groupThreadMcpServers } from "./threadMcpServers.ts";

const server = (
  name: string,
  status: ThreadMcpServer["status"],
  scope?: string,
): ThreadMcpServer => ({ name, status, ...(scope === undefined ? {} : { scope }), tools: [] });

describe("groupThreadMcpServers", () => {
  it("groups servers by where they are configured and lists problems first", () => {
    const groups = groupThreadMcpServers([
      server("t3-code", "connected", "dynamic"),
      server("docs", "connected", "user"),
      server("issues", "failed", "user"),
      server("browser", "disabled", "user"),
      server("repo", "needs-auth", "project"),
      server("custom", "connected", "experimental-scope"),
      server("unscoped", "pending"),
    ]);
    expect(
      groups.map((group) => ({
        label: group.label,
        servers: group.servers.map((entry) => entry.name),
      })),
    ).toEqual([
      { label: "Project", servers: ["repo"] },
      { label: "User", servers: ["issues", "docs", "browser"] },
      { label: "T3 Code", servers: ["t3-code"] },
      { label: "Other", servers: ["unscoped", "custom"] },
    ]);
  });
});

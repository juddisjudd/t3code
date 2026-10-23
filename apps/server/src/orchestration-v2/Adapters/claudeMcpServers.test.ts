import { describe, expect, it } from "vite-plus/test";

import { claudeMcpServers } from "./claudeMcpServers.ts";

describe("claudeMcpServers", () => {
  it("shows only a command name or URL origin for each server's connection", () => {
    expect(
      claudeMcpServers([
        {
          name: "files",
          status: "connected",
          scope: "user",
          serverInfo: { name: "files", version: "1.2.0" },
          config: {
            command: "/usr/local/bin/files-mcp",
            args: ["--token", "stdio-secret-token"],
            env: { API_KEY: "env-secret-value" },
          },
          tools: [{ name: "read_file", description: "Read a file.\nLong usage notes." }],
        },
        {
          name: "issues",
          status: "connected",
          source: "plugin",
          scope: "user",
          config: {
            type: "http",
            url: "https://user:pass@mcp.example.com/v1/path-secret-segment/mcp?key=query-secret",
            headers: { Authorization: "Bearer header-secret-token" },
          },
        },
      ]),
    ).toEqual([
      {
        name: "files",
        status: "connected",
        scope: "user",
        transport: "stdio",
        target: "files-mcp",
        version: "1.2.0",
        tools: [{ name: "read_file", description: "Read a file." }],
      },
      {
        name: "issues",
        status: "connected",
        scope: "plugin",
        transport: "http",
        target: "https://mcp.example.com",
        tools: [],
      },
    ]);
  });

  it("removes configured credentials that a failure message echoes", () => {
    const [server] = claudeMcpServers([
      {
        name: "issues",
        status: "failed",
        error:
          "POST https://mcp.example.com/v1/path-secret-segment/mcp?key=query-secret failed with Authorization: Bearer header-secret-token",
        config: {
          type: "sse",
          url: "https://mcp.example.com/v1/path-secret-segment/mcp?key=query-secret",
          headers: { Authorization: "Bearer header-secret-token" },
        },
      },
    ]);
    expect(server?.error).toBe("POST [redacted] failed with Authorization: [redacted]");
    expect(
      claudeMcpServers([
        {
          name: "files",
          status: "failed",
          error: "files-mcp --token stdio-secret-token exited with env-secret-value",
          config: {
            command: "files-mcp",
            args: ["--token", "stdio-secret-token"],
            env: { API_KEY: "env-secret-value" },
          },
        },
      ])[0]?.error,
    ).toBe("files-mcp --token [redacted] exited with [redacted]");
  });

  it("reports a status this version does not know as failed and drops unnamed servers", () => {
    expect(
      claudeMcpServers([
        { name: " ", status: "connected" },
        { name: "later", status: "suspended" as never },
      ]),
    ).toEqual([
      {
        name: "later",
        status: "failed",
        error: "Claude reported an unknown status: suspended",
        tools: [],
      },
    ]);
  });
});

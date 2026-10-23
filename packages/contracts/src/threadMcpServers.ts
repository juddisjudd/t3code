import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ThreadMcpServerStatus = Schema.Literals([
  "connected",
  "pending",
  "needs-auth",
  "failed",
  "disabled",
]);
export type ThreadMcpServerStatus = typeof ThreadMcpServerStatus.Type;

export const ThreadMcpServerTool = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
export type ThreadMcpServerTool = typeof ThreadMcpServerTool.Type;

/**
 * `target` is only a command name or a URL origin: arguments, paths, headers
 * and environment values can carry credentials and never leave the server.
 */
export const ThreadMcpServer = Schema.Struct({
  name: TrimmedNonEmptyString,
  status: ThreadMcpServerStatus,
  scope: Schema.optional(Schema.String),
  transport: Schema.optional(Schema.String),
  target: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  tools: Schema.Array(ThreadMcpServerTool),
});
export type ThreadMcpServer = typeof ThreadMcpServer.Type;

export const ThreadMcpServersListInput = Schema.Struct({
  threadId: ThreadId,
});
export type ThreadMcpServersListInput = typeof ThreadMcpServersListInput.Type;

export const ThreadMcpServerReconnectInput = Schema.Struct({
  threadId: ThreadId,
  server: TrimmedNonEmptyString,
});
export type ThreadMcpServerReconnectInput = typeof ThreadMcpServerReconnectInput.Type;

export const ThreadMcpServerSetEnabledInput = Schema.Struct({
  threadId: ThreadId,
  server: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
});
export type ThreadMcpServerSetEnabledInput = typeof ThreadMcpServerSetEnabledInput.Type;

export const ThreadMcpServersResult = Schema.Struct({
  servers: Schema.Array(ThreadMcpServer),
});
export type ThreadMcpServersResult = typeof ThreadMcpServersResult.Type;

export const ThreadMcpServersErrorReason = Schema.Literals([
  "session-stopped",
  "provider-unsupported",
  "request-failed",
]);
export type ThreadMcpServersErrorReason = typeof ThreadMcpServersErrorReason.Type;

export class ThreadMcpServersError extends Schema.TaggedError<ThreadMcpServersError>()(
  "ThreadMcpServersError",
  {
    threadId: ThreadId,
    reason: ThreadMcpServersErrorReason,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "session-stopped":
        return "This thread's agent is not running. Send a message, then open /mcp again.";
      case "provider-unsupported":
        return "This thread's provider cannot list its MCP servers.";
      case "request-failed":
        return "The agent did not answer the MCP server request.";
    }
  }
}

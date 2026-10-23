import {
  ProviderSessionId,
  ProviderThreadId,
  ThreadId,
  type OrchestrationV2ProviderThread,
  type ThreadMcpServer,
  type ThreadMcpServersError,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ThreadMcpServers from "./ThreadMcpServers.ts";

const threadId = ThreadId.make("thread-mcp");
const providerThreadId = ProviderThreadId.make("provider-thread-mcp");
const providerSessionId = ProviderSessionId.make("provider-session-mcp");

const server = (status: ThreadMcpServer["status"]): ThreadMcpServer => ({
  name: "issues",
  status,
  tools: [],
});

function makeLayer(input: {
  readonly mcpServers?: ProviderAdapter.ProviderAdapterV2McpServers;
  readonly live?: boolean;
  readonly sessionId?: ProviderSessionId | null;
}) {
  return ThreadMcpServers.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: () =>
            Effect.succeed({
              thread: { activeProviderThreadId: providerThreadId },
              providerThreads: [
                {
                  id: providerThreadId,
                  providerSessionId:
                    input.sessionId === undefined ? providerSessionId : input.sessionId,
                } as OrchestrationV2ProviderThread,
              ],
            } as never),
        }),
        Layer.mock(ProviderSessionManager.ProviderSessionManagerV2)({
          get: () =>
            Effect.succeed(
              input.live === false
                ? Option.none()
                : Option.some(
                    (input.mcpServers === undefined
                      ? {}
                      : {
                          mcpServers: input.mcpServers,
                        }) as ProviderAdapter.ProviderAdapterV2SessionRuntime,
                  ),
            ),
        }),
      ),
    ),
  );
}

const reason = <A, R>(effect: Effect.Effect<A, ThreadMcpServersError, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
  );

describe("ThreadMcpServers", () => {
  const toggles: Array<{ server: string; enabled: boolean }> = [];
  const mcpServers: ProviderAdapter.ProviderAdapterV2McpServers = {
    list: () => Effect.succeedSome([server("connected")]),
    reconnect: () => Effect.succeedSome([server("failed")]),
    setEnabled: (request) =>
      Effect.sync(() => {
        toggles.push({ server: request.server, enabled: request.enabled });
        return Option.some([server(request.enabled ? "connected" : "disabled")]);
      }),
  };

  it.effect("returns the refreshed server list after each action", () =>
    Effect.gen(function* () {
      const service = yield* ThreadMcpServers.ThreadMcpServers;
      assert.deepEqual(yield* service.list({ threadId }), { servers: [server("connected")] });
      assert.deepEqual(yield* service.reconnect({ threadId, server: "issues" }), {
        servers: [server("failed")],
      });
      assert.deepEqual(yield* service.setEnabled({ threadId, server: "issues", enabled: false }), {
        servers: [server("disabled")],
      });
      assert.deepEqual(toggles, [{ server: "issues", enabled: false }]);
    }).pipe(Effect.provide(makeLayer({ mcpServers }))),
  );

  it.effect("reports a thread without a running agent instead of starting one", () =>
    Effect.gen(function* () {
      const service = yield* ThreadMcpServers.ThreadMcpServers;
      assert.equal(yield* reason(service.list({ threadId })), "session-stopped");
    }).pipe(Effect.provide(makeLayer({ mcpServers, live: false }))),
  );

  it.effect("reports a thread whose provider thread never opened a session", () =>
    Effect.gen(function* () {
      const service = yield* ThreadMcpServers.ThreadMcpServers;
      assert.equal(yield* reason(service.list({ threadId })), "session-stopped");
    }).pipe(Effect.provide(makeLayer({ mcpServers, sessionId: null }))),
  );

  it.effect("reports a session whose native query has closed", () =>
    Effect.gen(function* () {
      const service = yield* ThreadMcpServers.ThreadMcpServers;
      assert.equal(
        yield* reason(service.setEnabled({ threadId, server: "issues", enabled: true })),
        "session-stopped",
      );
    }).pipe(
      Effect.provide(
        makeLayer({
          mcpServers: {
            list: () => Effect.succeedNone,
            reconnect: () => Effect.succeedNone,
            setEnabled: () => Effect.succeedNone,
          },
        }),
      ),
    ),
  );

  it.effect("reports providers that cannot list their MCP servers", () =>
    Effect.gen(function* () {
      const service = yield* ThreadMcpServers.ThreadMcpServers;
      assert.equal(yield* reason(service.list({ threadId })), "provider-unsupported");
    }).pipe(Effect.provide(makeLayer({}))),
  );
});

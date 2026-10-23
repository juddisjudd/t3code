import {
  ThreadMcpServersError,
  type ThreadId,
  type ThreadMcpServer,
  type ThreadMcpServerReconnectInput,
  type ThreadMcpServerSetEnabledInput,
  type ThreadMcpServersErrorReason,
  type ThreadMcpServersListInput,
  type ThreadMcpServersResult,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";

/** A stopped session is reported, never started: opening /mcp must not launch an agent. */
export class ThreadMcpServers extends Context.Service<
  ThreadMcpServers,
  {
    readonly list: (
      input: ThreadMcpServersListInput,
    ) => Effect.Effect<ThreadMcpServersResult, ThreadMcpServersError>;
    readonly reconnect: (
      input: ThreadMcpServerReconnectInput,
    ) => Effect.Effect<ThreadMcpServersResult, ThreadMcpServersError>;
    readonly setEnabled: (
      input: ThreadMcpServerSetEnabledInput,
    ) => Effect.Effect<ThreadMcpServersResult, ThreadMcpServersError>;
  }
>()("t3/provider/ThreadMcpServers") {}

const make = Effect.gen(function* () {
  const threadManagement = yield* ThreadManagementService.ThreadManagementService;
  const providerSessions = yield* ProviderSessionManager.ProviderSessionManagerV2;

  const fail = (threadId: ThreadId, reason: ThreadMcpServersErrorReason, cause?: unknown) =>
    new ThreadMcpServersError({ threadId, reason, ...(cause === undefined ? {} : { cause }) });

  const resolve = Effect.fn("ThreadMcpServers.resolve")(function* (threadId: ThreadId) {
    const records = yield* threadManagement
      .getThreadRecords(threadId, ["providerThreads"])
      .pipe(Effect.mapError((cause) => fail(threadId, "request-failed", cause)));
    const providerThread = records.providerThreads.find(
      (candidate) => candidate.id === records.thread.activeProviderThreadId,
    );
    if (providerThread?.providerSessionId == null) {
      return yield* fail(threadId, "session-stopped");
    }
    const runtime = Option.getOrUndefined(
      yield* providerSessions
        .get(providerThread.providerSessionId)
        .pipe(Effect.mapError((cause) => fail(threadId, "request-failed", cause))),
    );
    if (runtime === undefined) return yield* fail(threadId, "session-stopped");
    if (runtime.mcpServers === undefined) return yield* fail(threadId, "provider-unsupported");
    return { providerThread, mcpServers: runtime.mcpServers };
  });

  const respond = Effect.fn("ThreadMcpServers.respond")(function* (
    threadId: ThreadId,
    request: Effect.Effect<
      Option.Option<ReadonlyArray<ThreadMcpServer>>,
      ProviderAdapter.ProviderAdapterV2Error
    >,
  ) {
    const servers = yield* request.pipe(
      Effect.mapError((cause) => fail(threadId, "request-failed", cause)),
    );
    if (Option.isNone(servers)) return yield* fail(threadId, "session-stopped");
    return { servers: servers.value } satisfies ThreadMcpServersResult;
  });

  const list = Effect.fn("ThreadMcpServers.list")(function* (input: ThreadMcpServersListInput) {
    const { providerThread, mcpServers } = yield* resolve(input.threadId);
    return yield* respond(input.threadId, mcpServers.list({ providerThread }));
  });

  const reconnect = Effect.fn("ThreadMcpServers.reconnect")(function* (
    input: ThreadMcpServerReconnectInput,
  ) {
    const { providerThread, mcpServers } = yield* resolve(input.threadId);
    return yield* respond(
      input.threadId,
      mcpServers.reconnect({ providerThread, server: input.server }),
    );
  });

  const setEnabled = Effect.fn("ThreadMcpServers.setEnabled")(function* (
    input: ThreadMcpServerSetEnabledInput,
  ) {
    const { providerThread, mcpServers } = yield* resolve(input.threadId);
    return yield* respond(
      input.threadId,
      mcpServers.setEnabled({ providerThread, server: input.server, enabled: input.enabled }),
    );
  });

  return ThreadMcpServers.of({ list, reconnect, setEnabled });
});

export const layer = Layer.effect(ThreadMcpServers, make);

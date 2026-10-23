import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createThreadMcpServerEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:thread-mcp-servers:list",
      tag: WS_METHODS.threadMcpServersList,
      staleTimeMs: 0,
      idleTtlMs: 0,
    }),
    reconnect: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:thread-mcp-servers:reconnect",
      tag: WS_METHODS.threadMcpServersReconnect,
    }),
    setEnabled: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:thread-mcp-servers:set-enabled",
      tag: WS_METHODS.threadMcpServersSetEnabled,
    }),
  };
}

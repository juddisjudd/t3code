import { createThreadMcpServerEnvironmentAtoms } from "@t3tools/client-runtime/state/thread-mcp-servers";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadMcpServerEnvironment =
  createThreadMcpServerEnvironmentAtoms(connectionAtomRuntime);

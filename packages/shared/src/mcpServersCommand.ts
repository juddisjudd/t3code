import type { ServerProviderSlashCommand } from "@t3tools/contracts";

export const MCP_SERVERS_COMMAND = {
  name: "mcp",
  description: "Manage this thread's MCP servers",
} satisfies ServerProviderSlashCommand;

export function isMcpServersCommand(prompt: string): boolean {
  return prompt.trim().toLowerCase() === `/${MCP_SERVERS_COMMAND.name}`;
}

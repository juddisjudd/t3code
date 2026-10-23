import type { McpServerStatus } from "@anthropic-ai/claude-agent-sdk";
import { ThreadMcpServerStatus, type ThreadMcpServer } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

// Shorter config values are too likely to be ordinary words in an error message.
const MIN_SECRET_LENGTH = 8;
const MAX_TOOL_DESCRIPTION_LENGTH = 200;

const isKnownStatus = Schema.is(ThreadMcpServerStatus);

function connection(config: McpServerStatus["config"]): {
  readonly transport?: string;
  readonly target?: string;
} {
  if (config === undefined) return {};
  if (config.type === "sdk") return { transport: "sdk" };
  if (config.type === "http" || config.type === "sse" || config.type === "claudeai-proxy") {
    const origin = URL.parse(config.url)?.origin;
    return {
      transport: config.type,
      ...(origin === undefined || origin === "null" ? {} : { target: origin }),
    };
  }
  const command = config.command.split(/[\\/]/u).at(-1)?.trim();
  return { transport: "stdio", ...(command ? { target: command } : {}) };
}

function configSecrets(config: McpServerStatus["config"]): ReadonlyArray<string> {
  if (config === undefined || config.type === "sdk") return [];
  const values =
    config.type === "claudeai-proxy"
      ? [config.url]
      : "url" in config
        ? [config.url, ...Object.values(config.headers ?? {})]
        : [...(config.args ?? []), ...Object.values(config.env ?? {})];
  const url = config.type === "claudeai-proxy" || "url" in config ? URL.parse(config.url) : null;
  const urlParts = url
    ? [...url.pathname.split("/"), ...url.searchParams.values(), url.username, url.password]
    : [];
  return [...values, ...values.flatMap((value) => value.split(/\s+/u)), ...urlParts]
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
    .toSorted((left, right) => right.length - left.length);
}

function scrub(text: string, secrets: ReadonlyArray<string>): string {
  return secrets.reduce((result, secret) => result.replaceAll(secret, "[redacted]"), text);
}

function toolDescription(description: string | undefined): string | undefined {
  const firstLine = description?.trim().split("\n", 1)[0]?.trim();
  if (!firstLine) return undefined;
  return firstLine.length > MAX_TOOL_DESCRIPTION_LENGTH
    ? `${firstLine.slice(0, MAX_TOOL_DESCRIPTION_LENGTH - 1)}…`
    : firstLine;
}

export function claudeMcpServers(
  statuses: ReadonlyArray<McpServerStatus>,
): ReadonlyArray<ThreadMcpServer> {
  return statuses.flatMap((status) => {
    const name = status.name.trim();
    if (name.length === 0) return [];
    const secrets = configSecrets(status.config);
    const error = isKnownStatus(status.status)
      ? status.error?.trim()
      : `Claude reported an unknown status: ${String(status.status)}`;
    const scope = status.source ?? status.scope;
    const version = status.serverInfo?.version;
    return [
      {
        name,
        status: isKnownStatus(status.status) ? status.status : "failed",
        ...(scope ? { scope } : {}),
        ...connection(status.config),
        ...(version ? { version } : {}),
        ...(error ? { error: scrub(error, secrets) } : {}),
        tools: (status.tools ?? []).map((tool) => {
          const description = toolDescription(tool.description);
          return { name: tool.name, ...(description ? { description } : {}) };
        }),
      } satisfies ThreadMcpServer,
    ];
  });
}

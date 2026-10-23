import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  groupThreadMcpServers,
  THREAD_MCP_SERVER_STATUS_LABELS,
} from "@t3tools/client-runtime/thread-mcp-servers";
import type {
  EnvironmentId,
  ThreadId,
  ThreadMcpServer,
  ThreadMcpServersResult,
} from "@t3tools/contracts";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { ScreenStack } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidSheetHeader } from "../../components/ui/AndroidScreenHeader";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { NativeSwitch } from "../../components/ui/NativeSwitch";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { NativeStackScreenOptions, nativeHeaderScrollEdgeEffects } from "../../native/StackHeader";
import { NativeHeader, NativeScreen } from "../../native/ThemedScreenStack";
import { useEnvironmentQuery } from "../../state/query";
import { threadMcpServerEnvironment } from "../../state/threadMcpServers";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";

const HEADER_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(Platform.OS, Platform.Version);
const TITLE = "MCP servers";
const STATUS_TEXT_CLASS_NAMES = {
  connected: "text-foreground-muted",
  pending: "text-foreground-muted",
  "needs-auth": "text-warning-foreground",
  failed: "text-danger-foreground",
  disabled: "text-foreground-muted",
} as const satisfies Record<ThreadMcpServer["status"], string>;

type McpServersTarget = { readonly environmentId: EnvironmentId; readonly threadId: ThreadId };

export function ThreadMcpServersSheet({ route }: StaticScreenProps<McpServersTarget>) {
  const { layout } = useAdaptiveWorkspaceLayout();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { environmentId, threadId } = route.params;
  const listed = useEnvironmentQuery(
    threadMcpServerEnvironment.list({ environmentId, input: { threadId } }),
  );
  const reconnect = useAtomCommand(threadMcpServerEnvironment.reconnect, { reportFailure: false });
  const setEnabled = useAtomCommand(threadMcpServerEnvironment.setEnabled, {
    reportFailure: false,
  });
  const canOperate = useAtomValue(
    threadMcpServerEnvironment.setEnabled.permissionAtom(environmentId),
  );
  const [updatedServers, setUpdatedServers] = useState<ReadonlyArray<ThreadMcpServer> | null>(null);
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const servers = updatedServers ?? listed.data?.servers ?? null;

  const runAction = (
    server: string,
    title: string,
    action: Promise<AtomCommandResult<ThreadMcpServersResult, unknown>>,
  ) => {
    setBusyServer(server);
    void action.then((result) => {
      setBusyServer(null);
      if (result._tag === "Success") {
        setUpdatedServers(result.value.servers);
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        Dialog.alert(title, error instanceof Error ? error.message : "The request failed.");
      }
    });
  };

  const content = (
    <ScrollView
      nestedScrollEnabled
      className="flex-1"
      contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
      contentContainerClassName="px-5 pb-6"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
    >
      {servers === null && listed.error !== null ? (
        <View className="items-center gap-3 pt-6">
          <Text className="text-center text-sm text-foreground">{listed.error}</Text>
          <Pressable accessibilityRole="button" onPress={listed.refresh}>
            <Text className="font-t3-medium text-sm text-primary-text">Try again</Text>
          </Pressable>
        </View>
      ) : servers === null ? (
        <View className="items-center pt-6">
          <AppActivityIndicator />
        </View>
      ) : servers.length === 0 ? (
        <Text className="pt-6 text-center text-sm text-foreground-muted">
          This session has no MCP servers.
        </Text>
      ) : (
        groupThreadMcpServers(servers).map((group) => (
          <View key={group.label} className="pt-4">
            <Text className="font-t3-medium text-xs text-foreground-muted">{group.label}</Text>
            {group.servers.map((server) => (
              <ServerRow
                key={server.name}
                server={server}
                busy={busyServer === server.name}
                canOperate={canOperate && busyServer === null}
                onReconnect={() =>
                  runAction(
                    server.name,
                    `Could not reconnect ${server.name}`,
                    reconnect({ environmentId, input: { threadId, server: server.name } }),
                  )
                }
                onSetEnabled={(enabled) =>
                  runAction(
                    server.name,
                    `Could not ${enabled ? "enable" : "disable"} ${server.name}`,
                    setEnabled({
                      environmentId,
                      input: { threadId, server: server.name, enabled },
                    }),
                  )
                }
              />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );

  if (Platform.OS === "ios") {
    return (
      <View collapsable={false} className="flex-1 bg-sheet">
        <ScreenStack style={{ flex: 1 }}>
          <NativeScreen
            activityState={2}
            enabled
            isNativeStack
            screenId="thread-mcp-servers-sheet-native"
            scrollEdgeEffects={HEADER_SCROLL_EDGE_EFFECTS}
            className="flex-1 bg-sheet"
          >
            {content}
            <NativeHeader
              backgroundColor="rgba(0,0,0,0)"
              tintColorClassName="accent-foreground"
              hideBackButton
              hideShadow={false}
              title={TITLE}
              titleColorClassName="accent-foreground"
              titleFontSize={18}
              titleFontWeight="800"
              translucent
            />
          </NativeScreen>
        </ScreenStack>
      </View>
    );
  }
  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <NativeStackScreenOptions options={{ sheetCornerRadius: 28 }} />
      <AndroidSheetHeader title={TITLE} onBack={() => navigation.goBack()} />
      <ScreenContent insetHorizontal={layout.usesSplitView}>{content}</ScreenContent>
    </View>
  );
}

function ServerRow(props: {
  readonly server: ThreadMcpServer;
  readonly busy: boolean;
  readonly canOperate: boolean;
  readonly onReconnect: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
}) {
  const { server } = props;
  const enabled = server.status !== "disabled";
  const details = [
    THREAD_MCP_SERVER_STATUS_LABELS[server.status],
    server.target,
    server.tools.length === 0
      ? undefined
      : server.tools.length === 1
        ? "1 tool"
        : `${server.tools.length} tools`,
  ]
    .filter((detail) => detail !== undefined)
    .join(" · ");
  return (
    <View className="gap-1 border-b border-border py-3.5">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-t3-medium text-sm text-foreground">{server.name}</Text>
          <Text className={`text-xs ${STATUS_TEXT_CLASS_NAMES[server.status]}`}>{details}</Text>
        </View>
        {props.busy ? <AppActivityIndicator /> : null}
        {enabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reconnect ${server.name}`}
            disabled={!props.canOperate}
            onPress={props.onReconnect}
            className="active:opacity-70 disabled:opacity-40"
          >
            <Text className="font-t3-medium text-sm text-primary-text">Reconnect</Text>
          </Pressable>
        ) : null}
        <NativeSwitch
          accessibilityLabel={enabled ? `Disable ${server.name}` : `Enable ${server.name}`}
          value={enabled}
          disabled={!props.canOperate}
          onValueChange={props.onSetEnabled}
        />
      </View>
      {server.error ? <Text className="text-xs text-danger-foreground">{server.error}</Text> : null}
      {server.status === "needs-auth" ? (
        <Text className="text-xs text-foreground-muted">
          To sign in, run claude in a terminal on the host machine, then open /mcp.
        </Text>
      ) : null}
    </View>
  );
}

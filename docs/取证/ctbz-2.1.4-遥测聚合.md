# 取证 ctbz-2.1.4-遥测聚合（token 速度数据源）+ 2.1.5 图标（Web 端可配置）

生成时间: 2026-09-30T04:13:03+08:00
zcode 工作区: /Users/master/CODEX/zcode
zcode 基线 commit: baeaffea49e941f87d96d6893f3dd112c21fcc43
ctbz 工作区: /Users/master/CODEX/草台班子/源码

## §1 子代理被任务列表显式排除 → 客户端无法枚举子会话

命令: `sed -n "1,22p" apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/task-list-session-membership.ts`

```
import type { SessionTaskType } from "@zcode/contracts";

/**
 * 左侧任务列表的 session 类型投影。
 *
 * 列表可见性不能用 `parent_id is null` 的层级查询代替：显式 fork
 * 这类有 parent 的主任务会在 CLI 重启后被冷启动种子过滤。可见性必须由 taskType 决定，
 * 而辅助对话、subagent 与 workflow child 继续由各自专用投影承载。
 */
export const TASK_LIST_SESSION_TYPES = [
  "interactive",
  "fork",
  "workflow_parent",
] as const satisfies readonly SessionTaskType[];

const TASK_LIST_SESSION_TYPE_SET = new Set<SessionTaskType>(
  TASK_LIST_SESSION_TYPES,
);

export function isTaskListSessionType(
  taskType: SessionTaskType | undefined,
): boolean {
```

命令: `sed -n "1541,1562p" apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts`

```
    getSessionWorkspaceId: (sessionId) => {
      const record = context.sessions.get(sessionId);
      return !record || !isTaskListSessionType(record.taskType)
        ? null
        : record.workspace.workspaceKey;
    },
    getSessionIndexMeta: (sessionId) => {
      const record = context.sessions.get(sessionId);
      if (!record) return null;
      return {
        createdAt: record.createdAt,
        lastActivityAt: record.updatedAt,
        ...(record.parentSessionId ? { parentSessionId: String(record.parentSessionId) } : {}),
      };
    },
    listWorkspaceSessionIds: (workspaceId) =>
      [...context.sessions.values()]
        .filter(
          (record) =>
            isTaskListSessionType(record.taskType) && record.workspace.workspaceKey === workspaceId,
        )
        .map((record) => record.app.sessionId),
```

## §2 子代理 token 的实际去处：usage.delta 事实（放行 main/subagent/workflow_child）

命令: `sed -n "251,262p" apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts`

```
}

function isStepUsageQuerySource(querySource: string | undefined): boolean {
  // `workflow_child`：动态工作流子代理。
  // 该来源必须放行，否则子代理的 token 进不了业务埋点。
  return (
    querySource === undefined ||
    querySource === "main_turn" ||
    querySource === "subagent" ||
    querySource === "workflow_child"
  );
}
```

命令: `sed -n "783,795p" apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`

```
    try {
      const config =
        this.publishers.get(sessionId)?.getSnapshot().config ??
        this.host.getSessionConfigSeed?.(sessionId) ??
        undefined;
      const fact = this.telemetryNormalizer.normalize(sessionId, event, {
        memoryEnabled: this.host.getSessionMemoryEnabled?.(sessionId),
        modelName: config?.model,
        modelProvider: config?.provider,
      });
      if (fact) {
        this.host.emitConversationTelemetryFact?.(fact);
      }
```

## §3 父会话 cumulative 刻意排除子代理（isMainTurn）——不能直接复用

命令: `sed -n "4478,4484p;4499,4523p" apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`

```
    const retryClearDeltas = this.acceptsActiveModelEvent(event) ? this.setApiRetry(null) : [];
    // 与旧 reducer 同一裁决：只有主会话往返才能覆盖 context 水位。
    const isMainTurn =
      payload.querySource !== undefined
        ? payload.querySource === "main_turn"
        : payload.stopReason !== "tool_internal";
    if (isMainTurn) this.outputContinuationTextRowId = null;
  ...（省略 15 行）...
      }
    }
    if (!isMainTurn) return [...deltas, ...retryClearDeltas];
    const usage = payload.usage as ModelUsage;
```

## §4 帧上已有可选字段先例（ttft / ttftRelated）

命令: `sed -n "190,206p" packages/shared/src/zcode-protocol-v4/transport.ts`

```
// 传输外壳/黄金测试用它做帧合法性校验；host 通道层 复用。
export const conversationTopicFrameSchema = createTopicFrameSchema(
  conversationSnapshotSchema,
  conversationDeltaSchema,
)
  .extend({
    ttft: localTtftFactsSchema.optional(),
    ttftRelated: z.array(localTtftFactsSchema).max(16).optional(),
  })
  .superRefine((frame, context) => {
    if (!frame.topic.startsWith("conversation/") || frame.topic.length === "conversation/".length) {
      context.addIssue({ code: "custom", message: "invalid conversation topic", path: ["topic"] });
    }
  });
export type ConversationTopicFrame = z.infer<typeof conversationTopicFrameSchema>;
export const conversationTopicWireFrameSchema = createTopicWireFrameSchema(
  conversationTopicFrameSchema,
```

## §5 Web favicon 与标题的静态落点

命令: `grep -n "rel=\"icon\"\|<title>" packages/web/index.html`

```
10:      rel="icon"
15:    <title>M</title>
```

命令: `grep -n "zcodeTitleTemplate\|document.title" packages/ui/src/i18n/IntlProvider.tsx packages/web/src/main.tsx | head`

```
packages/ui/src/i18n/IntlProvider.tsx:417:    const template = document.documentElement.dataset.zcodeTitleTemplate;
packages/ui/src/i18n/IntlProvider.tsx:419:    document.title = template.replace("{brand}", brandName);
packages/web/src/main.tsx:100:  document.documentElement.dataset.zcodeTitleTemplate = "{brand} - Sign In";
packages/web/src/main.tsx:101:  document.title = `${APP_BRAND_NAME_DEFAULT} - Sign In`;
packages/web/src/main.tsx:126:  document.title =
packages/web/src/main.tsx:424:  document.title = `${APP_BRAND_NAME_DEFAULT} - Web`;
packages/web/src/main.tsx:456:    document.documentElement.dataset.zcodeTitleTemplate = "{brand} - Web + Server";
packages/web/src/main.tsx:457:    document.title = `${APP_BRAND_NAME_DEFAULT} - Web + Server`;
```

## §6 设置项既有惯例（appBrandName 四件套）

命令: `grep -n "appBrandName" packages/shared/src/protocol.ts packages/shared/src/validationAppSettings.ts packages/services/src/setting/normalizeSettingsPatch.ts | head`

```
packages/shared/src/protocol.ts:112:/** 界面默认展示的产品名称；可由设置项 appBrandName 覆盖，仅影响显示文案。 */
packages/shared/src/protocol.ts:306:  appBrandName?: string;
packages/shared/src/validationAppSettings.ts:430:  appBrandName: nonEmptyStringSchema.default(APP_BRAND_NAME_DEFAULT),
packages/shared/src/validationAppSettings.ts:504:  appBrandName: nonEmptyStringSchema.optional(),
packages/services/src/setting/normalizeSettingsPatch.ts:42:  if ("appBrandName" in normalizedPatch && typeof normalizedPatch.appBrandName === "string") {
packages/services/src/setting/normalizeSettingsPatch.ts:45:    const trimmedAppBrandName = normalizedPatch.appBrandName.trim();
packages/services/src/setting/normalizeSettingsPatch.ts:46:    normalizedPatch.appBrandName = trimmedAppBrandName.length > 0 ? trimmedAppBrandName : undefined;
```

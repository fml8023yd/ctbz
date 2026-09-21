import { join } from "node:path";
import { execSync } from "node:child_process";

// 退役（注册链由 T4 处置）：ZCode 凭据发现（~/.zcode/v2/config.json）与 profile 加载根
// （~/.zcode/agents/）不再有默认值，也不提供任何 dsh 等价物。保留 null 导出兼容旧 import：
// 下游 `?? DEFAULT_X` 取到 null 后会显式报"必须显式传参"，不会被当作真实路径使用。
export const DEFAULT_CONFIG = null;
export const DEFAULT_AGENTS = null;

// 工作区状态一律落在 ctbz 自有目录 <ws>/.ctbz-record/ 下，不再借用宿主专属目录。
export const WORKSPACE_RECORD_DIR = ".ctbz-record";

// 退役：ZCode 宿主专属的工作区状态目录，仅作为存量迁移的读取源保留（不写入、不删除）。
export const LEGACY_WORKSPACE_STATE_DIR = ".zcode";

// 显式 --workspace 优先：git 仓库可嵌套（父目录本身也是 git 根），
// `git rev-parse --show-toplevel` 只返回最近的仓库根，可能与项目根不符。
export function discoverWorkspace(explicit) {
  if (explicit) return explicit;
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(
      "workspace not discovered: run inside a git repository or pass --workspace <absolute-project-root> (git root may be nested)",
    );
  }
}

export function defaultTeamConfig(workspace) {
  return join(workspace, WORKSPACE_RECORD_DIR, "team-dev.json");
}

export function defaultCatalog(workspace) {
  return join(workspace, WORKSPACE_RECORD_DIR, "catalog-dev.json");
}

export function defaultStateDir(workspace) {
  return join(workspace, WORKSPACE_RECORD_DIR, "state");
}

export function defaultAttestationOutput(stateDir, team) {
  return join(stateDir, team, "attestation.json");
}

export function defaultWorktreeRoot(workspace) {
  return join(workspace, WORKSPACE_RECORD_DIR, "worktrees");
}

export function defaultRunManifest(stateDir, team, runId) {
  return join(stateDir, team, "runs", `${runId}.json`);
}

export function defaultTeamName(teamConfigPath) {
  const base = teamConfigPath.split("/").pop();
  return base.replace(/^team-/, "").replace(/\.json$/, "");
}

// 存量迁移：旧工作区状态根（只读源）。
export function legacyWorkspaceStateRoot(workspace) {
  return join(workspace, LEGACY_WORKSPACE_STATE_DIR);
}

// 存量迁移项：source 存在才纳入；target 已存在一律跳过（绝不覆盖）。
// worktrees 标记 manual：目录内含 git 元数据与绝对路径绑定，复制后不可用，默认不迁移。
export function workspaceMigrationItems(workspace) {
  const source = legacyWorkspaceStateRoot(workspace);
  const target = join(workspace, WORKSPACE_RECORD_DIR);
  return [
    { name: "team-dev.json", kind: "file", manual: false, source: join(source, "team-dev.json"), target: join(target, "team-dev.json") },
    { name: "catalog-dev.json", kind: "file", manual: false, source: join(source, "catalog-dev.json"), target: join(target, "catalog-dev.json") },
    { name: "state", kind: "directory", manual: false, source: join(source, "state"), target: join(target, "state") },
    { name: "worktrees", kind: "directory", manual: true, source: join(source, "worktrees"), target: join(target, "worktrees") },
  ];
}

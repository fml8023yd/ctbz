import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const DEFAULT_CONFIG = join(homedir(), ".zcode/v2/config.json");
export const DEFAULT_AGENTS = join(homedir(), ".zcode/agents/");

export function discoverWorkspace(explicit) {
  if (explicit) return explicit;
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(
      "workspace not discovered: run inside a git repository or pass --workspace <absolute-git-root>",
    );
  }
}

export function defaultTeamConfig(workspace) {
  return join(workspace, ".zcode/team-dev.json");
}

export function defaultCatalog(workspace) {
  return join(workspace, ".zcode/catalog-dev.json");
}

export function defaultStateDir(workspace) {
  return join(workspace, ".zcode/state");
}

export function defaultAttestationOutput(stateDir, team) {
  return join(stateDir, team, "attestation.json");
}

export function defaultWorktreeRoot(workspace) {
  return join(workspace, ".zcode/worktrees");
}

export function defaultRunManifest(stateDir, team, runId) {
  return join(stateDir, team, "runs", `${runId}.json`);
}

export function defaultTeamName(teamConfigPath) {
  const base = teamConfigPath.split("/").pop();
  return base.replace(/^team-/, "").replace(/\.json$/, "");
}

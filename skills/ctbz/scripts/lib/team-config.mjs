import { createHash } from "node:crypto";

// T4 存根：保留 teamConfigFingerprint 及其哈希依赖（scripts/team-state 仍使用），
// 其余 ZCode team-config 校验/渲染函数已退役，改为抛错存根。

export class CliError extends Error {}

export const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

export function fingerprint(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex")}`;
}

export function teamConfigFingerprint(team) {
  const { activationRequired: _activationRequired, ...managedTeam } = team;
  return fingerprint(managedTeam);
}

const retired = (name) => () => {
  throw Error(
    `dsh 版不支持 ZCode profile 注册链：${name} 已退役。角色改由 subagent 实例的 persona / toolFilter / agentOptions 表达；派发走 workflow。`
  );
};

export const readJson = retired("readJson");
export const validateTeamConfiguration = retired("validateTeamConfiguration");
export const expectedProfiles = retired("expectedProfiles");
export const renderProfile = retired("renderProfile");
export const parseProfileFrontmatter = retired("parseProfileFrontmatter");

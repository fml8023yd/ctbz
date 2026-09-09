import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rejectCredentialsBasename, StateError } from "./state.mjs";
import { normalizeModelRef, candidateModelRef } from "./model-ref.mjs";

export class CliError extends Error {}

export const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const modelRefPattern = /^custom:[^:\s]+:[^:\s]+$/;
const readOnlyRoles = new Set(["explorer", "researcher", "planner", "reviewer", "reporter"]);
const teamFields = new Set([
  "version",
  "team",
  "activationRequired",
  "profileFingerprint",
  "catalogFingerprint",
  "maxParallel",
  "maxParallelWriters",
  "roles",
  "retry",
  "worktree",
]);
const roleFields = new Set(["variants", "route"]);
const variantFields = new Set([
  "profile",
  "modelRef",
  "modelShort",
  "thoughtLevel",
  "reasoningShort",
  "description",
  "tools",
  "permissionMode",
  "maxTurns",
  "background",
  "injectAgentsMd",
  "instructions",
]);

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
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

export async function readJson(path, label) {
  try {
    rejectCredentialsBasename(path, label);
  } catch (error) {
    if (error instanceof StateError) {
      throw new CliError(`${label} must not target credentials.json`);
    }
    throw error;
  }
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new CliError(`unable to read ${label}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(`${label} must be valid JSON`);
  }
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function rejectUnknownFields(value, allowedFields, path, errors) {
  const unknownCount = Object.keys(value).filter((key) => !allowedFields.has(key)).length;
  if (unknownCount > 0) {
    addError(
      errors,
      "unsupported-field",
      path,
      "object contains unsupported fields",
    );
  }
}

function validatePositiveInteger(value, path, errors, { allowZero = false } = {}) {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < (allowZero ? 0 : 1))
  ) {
    addError(
      errors,
      "invalid-team-option",
      path,
      allowZero ? "field must be a non-negative integer" : "field must be a positive integer",
    );
  }
}

function validateTeamOptions(team, errors) {
  rejectUnknownFields(team, teamFields, "$", errors);
  if (
    team.activationRequired !== undefined &&
    typeof team.activationRequired !== "boolean"
  ) {
    addError(
      errors,
      "invalid-team-option",
      "$.activationRequired",
      "activationRequired must be a boolean",
    );
  }
  if (
    team.profileFingerprint !== undefined &&
    (typeof team.profileFingerprint !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(team.profileFingerprint))
  ) {
    addError(
      errors,
      "invalid-team-option",
      "$.profileFingerprint",
      "profileFingerprint must be a lowercase SHA-256 fingerprint",
    );
  }
  if (
    team.catalogFingerprint !== undefined &&
    (typeof team.catalogFingerprint !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(team.catalogFingerprint))
  ) {
    addError(
      errors,
      "invalid-team-option",
      "$.catalogFingerprint",
      "catalogFingerprint must be a lowercase SHA-256 fingerprint",
    );
  }
  validatePositiveInteger(team.maxParallel, "$.maxParallel", errors);
  validatePositiveInteger(team.maxParallelWriters, "$.maxParallelWriters", errors, {
    allowZero: true,
  });
  if (
    Number.isInteger(team.maxParallel) &&
    Number.isInteger(team.maxParallelWriters) &&
    team.maxParallelWriters > team.maxParallel
  ) {
    addError(
      errors,
      "invalid-team-option",
      "$.maxParallelWriters",
      "maxParallelWriters cannot exceed maxParallel",
    );
  }

  if (team.retry !== undefined) {
    if (!isRecord(team.retry)) {
      addError(errors, "invalid-team-option", "$.retry", "retry must be an object");
    } else {
      rejectUnknownFields(
        team.retry,
        new Set(["taskLevelRetries", "circuitThreshold"]),
        "$.retry",
        errors,
      );
      validatePositiveInteger(
        team.retry.taskLevelRetries,
        "$.retry.taskLevelRetries",
        errors,
        { allowZero: true },
      );
      validatePositiveInteger(
        team.retry.circuitThreshold,
        "$.retry.circuitThreshold",
        errors,
      );
      if (
        team.retry.taskLevelRetries === undefined ||
        team.retry.circuitThreshold === undefined
      ) {
        addError(
          errors,
          "invalid-team-option",
          "$.retry",
          "retry requires taskLevelRetries and circuitThreshold",
        );
      }
    }
  }

  if (team.worktree !== undefined) {
    if (!isRecord(team.worktree)) {
      addError(
        errors,
        "invalid-team-option",
        "$.worktree",
        "worktree must be an object",
      );
    } else {
      rejectUnknownFields(
        team.worktree,
        new Set(["enabledForWriters", "root", "cleanup"]),
        "$.worktree",
        errors,
      );
      if (typeof team.worktree.enabledForWriters !== "boolean") {
        addError(
          errors,
          "invalid-team-option",
          "$.worktree.enabledForWriters",
          "enabledForWriters must be a boolean",
        );
      }
      if (typeof team.worktree.root !== "string" || team.worktree.root.length === 0) {
        addError(
          errors,
          "invalid-team-option",
          "$.worktree.root",
          "root must be a non-empty string",
        );
      }
      if (
        !["after-integrated-and-clean", "manual"].includes(team.worktree.cleanup)
      ) {
        addError(
          errors,
          "invalid-team-option",
          "$.worktree.cleanup",
          "cleanup must be a supported policy",
        );
      }
    }
  }
}

function candidateMap(catalog, errors) {
  const candidates = new Map();
  if (!isRecord(catalog) || !Array.isArray(catalog.candidates)) {
    addError(errors, "invalid-catalog", "$", "catalog candidates must be an array");
    return candidates;
  }

  for (const candidate of catalog.candidates) {
    if (
      !isRecord(candidate) ||
      typeof candidate.key !== "string" ||
      !Array.isArray(candidate.reasoningVariants) ||
      candidate.reasoningVariants.some((variant) => typeof variant !== "string")
    ) {
      addError(errors, "invalid-catalog", "$", "catalog contains an invalid candidate");
      continue;
    }
    try {
      const key = candidateModelRef(candidate);
      if (candidates.has(key)) {
        addError(errors, "invalid-catalog", "$", "catalog contains duplicate model references");
      } else candidates.set(key, candidate);
    } catch {
      addError(errors, "invalid-catalog", "$", "catalog contains an invalid model reference");
    }
  }
  return candidates;
}

function validateOptionalFields(variant, path, errors) {
  for (const key of ["description", "permissionMode"]) {
    if (variant[key] !== undefined && typeof variant[key] !== "string") {
      addError(errors, "invalid-variant", `${path}.${key}`, "field must be a string");
    }
  }
  if (
    typeof variant.instructions !== "string" ||
    variant.instructions.trim().length === 0
  ) {
    addError(
      errors,
      "missing-instructions",
      `${path}.instructions`,
      "instructions must be a non-empty string; every profile needs a system prompt",
    );
  }
  for (const key of ["background", "injectAgentsMd"]) {
    if (variant[key] !== undefined && typeof variant[key] !== "boolean") {
      addError(errors, "invalid-variant", `${path}.${key}`, "field must be a boolean");
    }
  }
  if (
    variant.maxTurns !== undefined &&
    (!Number.isInteger(variant.maxTurns) || variant.maxTurns < 1)
  ) {
    addError(
      errors,
      "invalid-variant",
      `${path}.maxTurns`,
      "maxTurns must be a positive integer",
    );
  }
}

export function validateTeamConfiguration(team, catalog) {
  const errors = [];
  const warnings = [];
  const profiles = [];
  const candidates = candidateMap(catalog, errors);

  if (!isRecord(team)) {
    addError(errors, "invalid-team", "$", "team must contain a JSON object");
    return { errors, warnings, profiles };
  }
  validateTeamOptions(team, errors);
  if (team.version !== 1) {
    addError(errors, "invalid-version", "$.version", "version must be 1");
  }

  const validTeamName = typeof team.team === "string" && kebabPattern.test(team.team);
  if (!validTeamName) {
    addError(
      errors,
      "invalid-team",
      "$.team",
      "team must be lowercase ASCII kebab-case",
    );
  }
  if (!isRecord(team.roles) || Object.keys(team.roles).length === 0) {
    addError(errors, "invalid-roles", "$.roles", "roles must be a non-empty object");
    return { errors, warnings, profiles };
  }

  const nameCounts = new Map();
  const configuredProfiles = new Set();

  for (const [roleIndex, [roleName, role]] of Object.entries(team.roles).entries()) {
    const rolePath = `$.roles[${roleIndex}]`;
    const validRoleName = kebabPattern.test(roleName);
    if (!validRoleName) {
      addError(
        errors,
        "invalid-role",
        rolePath,
        "role must be lowercase ASCII kebab-case",
      );
    }
    if (!isRecord(role)) {
      addError(errors, "invalid-role", rolePath, "role must be an object");
      continue;
    }
    rejectUnknownFields(role, roleFields, rolePath, errors);
    if (!Array.isArray(role.variants) || role.variants.length === 0) {
      addError(
        errors,
        "invalid-variants",
        `${rolePath}.variants`,
        "variants must be a non-empty array",
      );
      continue;
    }

    const generatedNames = new Set();
    const variantKeys = new Set();

    for (const [variantIndex, variant] of role.variants.entries()) {
      const path = `${rolePath}.variants[${variantIndex}]`;
      if (!isRecord(variant)) {
        addError(errors, "invalid-variant", path, "variant must be an object");
        continue;
      }
      rejectUnknownFields(variant, variantFields, path, errors);
      validateOptionalFields(variant, path, errors);

      const validModelRef =
        typeof variant.modelRef === "string" && modelRefPattern.test(variant.modelRef);
      const candidate = validModelRef
        ? candidates.get(normalizeModelRef(variant.modelRef))
        : undefined;
      if (!candidate) {
        addError(
          errors,
          "unknown-model-ref",
          `${path}.modelRef`,
          "modelRef is not present in catalog candidates",
        );
      }

      const validModelShort =
        typeof variant.modelShort === "string" && kebabPattern.test(variant.modelShort);
      if (!validModelShort) {
        addError(
          errors,
          "invalid-model-short",
          `${path}.modelShort`,
          "modelShort must be lowercase ASCII kebab-case",
        );
      }

      const hasThoughtLevel = variant.thoughtLevel !== undefined;
      const validThoughtType = !hasThoughtLevel || typeof variant.thoughtLevel === "string";
      const reasoningShort = variant.reasoningShort ?? (hasThoughtLevel ? undefined : "std");
      const validReasoningShort =
        typeof reasoningShort === "string" && kebabPattern.test(reasoningShort);
      if (!validReasoningShort) {
        addError(
          errors,
          "invalid-reasoning-short",
          `${path}.reasoningShort`,
          "reasoningShort must be lowercase ASCII kebab-case",
        );
      }

      if (!validThoughtType) {
        addError(
          errors,
          "invalid-thought-level",
          `${path}.thoughtLevel`,
          "thoughtLevel must be a string when provided",
        );
      } else if (candidate !== undefined) {
        if (candidate.reasoningVariants.length === 0) {
          if (hasThoughtLevel) {
            addError(
              errors,
              "invalid-thought-level",
              `${path}.thoughtLevel`,
              "model does not support thoughtLevel",
            );
          }
          if (reasoningShort !== "std") {
            addError(
              errors,
              "invalid-reasoning-short",
              `${path}.reasoningShort`,
              "reasoningShort must be std without reasoning variants",
            );
          }
        } else if (
          hasThoughtLevel &&
          !candidate.reasoningVariants.includes(variant.thoughtLevel)
        ) {
          addError(
            errors,
            "invalid-thought-level",
            `${path}.thoughtLevel`,
            "thoughtLevel is not supported by the model candidate",
          );
        }
      }
      if (!hasThoughtLevel && reasoningShort !== "std") {
        addError(
          errors,
          "invalid-reasoning-short",
          `${path}.reasoningShort`,
          "reasoningShort must be std without thoughtLevel",
        );
      }

      const validTools =
        Array.isArray(variant.tools) &&
        variant.tools.every((tool) => typeof tool === "string" && tool.length > 0);
      if (!validTools) {
        addError(
          errors,
          "invalid-tools",
          `${path}.tools`,
          "tools must be an array of non-empty strings",
        );
      } else if (
        readOnlyRoles.has(roleName) &&
        variant.tools.some((tool) => ["edit", "write"].includes(tool.toLowerCase()))
      ) {
        addError(
          errors,
          "write-tool-on-read-only-role",
          `${path}.tools`,
          "read-only role cannot contain Edit or Write",
        );
      }

      if (validModelRef && validThoughtType) {
        const variantKey = `${normalizeModelRef(variant.modelRef)}\u0000${variant.thoughtLevel ?? ""}`;
        if (variantKeys.has(variantKey)) {
          addError(
            errors,
            "duplicate-variant",
            path,
            "role contains a duplicate model and thoughtLevel variant",
          );
        }
        variantKeys.add(variantKey);
      }

      let expectedName;
      if (validTeamName && validRoleName && validModelShort && validReasoningShort) {
        const baseName = [
          "team",
          team.team,
          roleName,
          variant.modelShort,
          reasoningShort,
        ].join("-");
        const count = (nameCounts.get(baseName) ?? 0) + 1;
        nameCounts.set(baseName, count);
        expectedName = count === 1 ? baseName : `${baseName}-${count}`;
        generatedNames.add(expectedName);
      }

      if (typeof variant.profile !== "string" || variant.profile !== expectedName) {
        addError(
          errors,
          "profile-name-mismatch",
          `${path}.profile`,
          "profile must equal the generated profile name",
        );
      }
      if (typeof variant.profile === "string") {
        if (configuredProfiles.has(variant.profile)) {
          addError(
            errors,
            "duplicate-profile",
            `${path}.profile`,
            "profile is duplicated",
          );
        }
        configuredProfiles.add(variant.profile);
      }

      if (expectedName !== undefined && validTools) {
        profiles.push({
          role: roleName,
          index: variantIndex,
          name: expectedName,
          file: `${expectedName}.md`,
          modelRef: variant.modelRef,
          modelShort: variant.modelShort,
          reasoningShort,
          thoughtLevel: variant.thoughtLevel,
          tools: [...variant.tools],
          description: variant.description,
          permissionMode: variant.permissionMode,
          maxTurns: variant.maxTurns,
          background: variant.background,
          injectAgentsMd: variant.injectAgentsMd,
          instructions: variant.instructions,
          configuredProfile: variant.profile,
        });
      }
    }

    if (!Array.isArray(role.route) || role.route.length === 0) {
      addError(
        errors,
        "invalid-route",
        `${rolePath}.route`,
        "route must be a non-empty array",
      );
      continue;
    }

    const routeProfiles = new Set();
    for (const [routeIndex, routeProfile] of role.route.entries()) {
      const path = `${rolePath}.route[${routeIndex}]`;
      if (typeof routeProfile !== "string") {
        addError(errors, "invalid-route", path, "route profile must be a string");
        continue;
      }
      if (routeProfiles.has(routeProfile)) {
        addError(
          errors,
          "duplicate-route-profile",
          path,
          "route profile is duplicated",
        );
      }
      routeProfiles.add(routeProfile);
      if (!generatedNames.has(routeProfile)) {
        addError(
          errors,
          "unknown-route-profile",
          path,
          "route must reference a generated profile",
        );
      }
    }
  }

  const routedProfileNames = new Set(
    Object.values(team.roles).flatMap((role) =>
      Array.isArray(role?.route) ? role.route : [],
    ),
  );
  const routedProfiles = profiles.filter((profile) =>
    routedProfileNames.has(profile.name),
  );

  return { errors, warnings, profiles: routedProfiles };
}

export function expectedProfiles(team, catalog) {
  const result = validateTeamConfiguration(team, catalog);
  if (result.errors.length > 0) throw new CliError("team configuration is invalid");
  return result.profiles;
}

function yamlScalar(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function inlineList(values) {
  return `[${values.map(yamlScalar).join(", ")}]`;
}

export function renderProfile(template, profile) {
  const replacements = {
    name: profile.name,
    description:
      profile.description === undefined
        ? ""
        : `description: ${yamlScalar(profile.description)}\n`,
    modelRef: yamlScalar(profile.modelRef),
    thoughtLevel:
      profile.thoughtLevel === undefined
        ? ""
        : `thoughtLevel: ${yamlScalar(profile.thoughtLevel)}\n`,
    tools: inlineList(profile.tools),
    permissionMode:
      profile.permissionMode === undefined
        ? ""
        : `permissionMode: ${yamlScalar(profile.permissionMode)}\n`,
    maxTurns:
      profile.maxTurns === undefined ? "" : `maxTurns: ${profile.maxTurns}\n`,
    background:
      profile.background === undefined
        ? ""
        : `background: ${profile.background}\n`,
    injectAgentsMd:
      profile.injectAgentsMd === undefined
        ? ""
        : `injectAgentsMd: ${profile.injectAgentsMd}\n`,
    instructions: profile.instructions ?? "",
  };

  return template.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => replacements[key] ?? "");
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    if (body === "") return [];
    return body.split(",").map((item) => parseScalar(item));
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:0|[1-9][0-9]*)$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parseProfileFrontmatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return undefined;
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (closingIndex === -1) return undefined;

  const allowedFields = new Set([
    "name",
    "description",
    "model",
    "thoughtLevel",
    "tools",
    "permissionMode",
    "maxTurns",
    "background",
    "injectAgentsMd",
  ]);
  const fields = {};
  const unknownFields = [];
  const duplicateFields = [];
  const seenKeys = new Set();
  for (let index = 1; index < closingIndex; index += 1) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(lines[index]);
    if (match === null) {
      if (lines[index].trim() !== "") {
        unknownFields.push(lines[index].trim());
      }
      continue;
    }
    const [, key, rawValue = ""] = match;
    if (!allowedFields.has(key)) {
      unknownFields.push(key);
      continue;
    }
    if (seenKeys.has(key)) {
      duplicateFields.push(key);
    }
    seenKeys.add(key);
    if (rawValue !== "") {
      fields[key] = parseScalar(rawValue);
      continue;
    }

    const items = [];
    while (index + 1 < closingIndex) {
      const itemMatch = /^\s+-\s+(.+)$/.exec(lines[index + 1]);
      if (itemMatch === null) break;
      items.push(parseScalar(itemMatch[1]));
      index += 1;
    }
    fields[key] = items;
  }
  return { fields, unknownFields, duplicateFields };
}

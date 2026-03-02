const { resolveProfessionToolCandidates } = require('./toolResolver');
const { resolveToolTierName } = require('../../data/professionToolMap');
const { getMaxTierFromLevel, getRecommendedTier } = require('./tier');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePlayerId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function collectSkillMappings(skillsPayload) {
  const skillById = new Map();
  const skillIdByName = new Map();
  const professionIds = new Set();

  const markSkill = (entry, defaultType) => {
    if (!entry || typeof entry !== "object") return;

    const skillId = toNumber(entry.id ?? entry.skill_id ?? entry.skillId, NaN);
    if (!Number.isFinite(skillId)) return;

    const name = String(entry.name ?? entry.skill_name ?? `Skill ${skillId}`);
    const type = String(entry.type ?? defaultType ?? "skill").toLowerCase();
    const category = String(entry.category ?? "").toLowerCase();
    const isProfession = type === "profession" || category === "profession";

    skillById.set(skillId, { skillId, name, isProfession });
    skillIdByName.set(name.toLowerCase(), skillId);
    if (isProfession) professionIds.add(skillId);
  };

  const markList = (items, defaultType) => {
    for (const entry of asArray(items)) {
      markSkill(entry, defaultType);
    }
  };

  markList(skillsPayload?.profession, "profession");
  markList(skillsPayload?.professions, "profession");
  markList(skillsPayload?.skills, "skill");
  markList(skillsPayload?.data?.profession, "profession");
  markList(skillsPayload?.data?.professions, "profession");
  markList(skillsPayload?.data?.skills, "skill");

  for (const [key, value] of Object.entries(skillsPayload ?? {})) {
    if (["profession", "professions", "skills", "data"].includes(key)) continue;
    markList(value, key);
  }

  return { skillById, skillIdByName, professionIds };
}

function normalizeCitizenList(citizens) {
  const citizensByPlayerId = new Map();

  for (const citizen of asArray(citizens)) {
    const playerId = normalizePlayerId(citizen?.entityId ?? citizen?.playerEntityId ?? citizen?.player?.entityId ?? citizen?.playerId);
    if (!playerId) continue;

    citizensByPlayerId.set(playerId, {
      username: citizen?.userName ?? citizen?.username ?? citizen?.player?.username,
      levelBySkillId: citizen?.skills && typeof citizen.skills === "object" ? citizen.skills : {},
    });
  }

  return citizensByPlayerId;
}

function normalizeLivePlayers(livePlayerPayloads) {
  const playersById = new Map();

  for (const payload of asArray(livePlayerPayloads)) {
    const player = payload?.player ?? payload?.data ?? payload;
    const playerId = normalizePlayerId(player?.entityId ?? player?.playerId ?? payload?.entityId ?? payload?.playerId);
    if (!playerId) continue;

    playersById.set(playerId, {
      playerId,
      username: player?.username,
      experience: asArray(player?.experience),
      levelBySkillId: player?.skills && typeof player.skills === "object" ? player.skills : {},
    });
  }

  return playersById;
}

function normalizeBaselinePlayers(snapshotPlayers, skillMappings) {
  const baselineByPlayerId = new Map();

  for (const baselinePlayer of asArray(snapshotPlayers)) {
    const playerId = normalizePlayerId(baselinePlayer?.playerId ?? baselinePlayer?.entityId);
    if (!playerId) continue;

    const xpBySkillId = new Map();
    const professionExperience = baselinePlayer?.professionExperience ?? {};

    for (const [label, entry] of Object.entries(professionExperience)) {
      let skillId = toNumber(entry?.skillId ?? entry?.skill_id, NaN);
      const resolvedLabel = String(entry?.name ?? label ?? "").trim();

      if (!Number.isFinite(skillId) && resolvedLabel) {
        const mappedSkillId = skillMappings.skillIdByName.get(resolvedLabel.toLowerCase());
        if (Number.isFinite(mappedSkillId)) {
          skillId = mappedSkillId;
        }
      }

      if (!Number.isFinite(skillId)) continue;

      xpBySkillId.set(skillId, {
        baselineXp: toNumber(entry?.xp ?? entry?.quantity, 0),
        label: resolvedLabel || `Skill ${skillId}`,
      });
    }

    baselineByPlayerId.set(playerId, {
      playerId,
      username: baselinePlayer?.username,
      xpBySkillId,
    });
  }

  return baselineByPlayerId;
}

function collectCurrentXpBySkillId(experienceEntries, skillMappings) {
  const xpBySkillId = new Map();

  for (const entry of asArray(experienceEntries)) {
    const skillId = toNumber(entry?.skill_id ?? entry?.skillId ?? entry?.id, NaN);
    if (!Number.isFinite(skillId)) continue;

    if (skillMappings.professionIds.size > 0 && !skillMappings.professionIds.has(skillId)) {
      continue;
    }

    xpBySkillId.set(skillId, toNumber(entry?.quantity ?? entry?.xp ?? entry?.value, 0));
  }

  return xpBySkillId;
}

function resolveSkillName(skillId, fallbackLabel, skillMappings) {
  return skillMappings.skillById.get(skillId)?.name ?? fallbackLabel ?? `Skill ${skillId}`;
}

function buildActivityRecommendations({
  baselineSnapshot,
  livePlayerPayloads,
  citizens,
  skillsPayload,
  itemMetadataByPlayerId = {},
  claimTier = null,
  topLimit = 3,
}) {
  const skillMappings = collectSkillMappings(skillsPayload);
  const baselinePlayers = normalizeBaselinePlayers(baselineSnapshot?.players, skillMappings);
  const livePlayers = normalizeLivePlayers(livePlayerPayloads);
  const citizensByPlayerId = normalizeCitizenList(citizens);

  const allPlayerIds = new Set([...baselinePlayers.keys(), ...livePlayers.keys(), ...citizensByPlayerId.keys()]);
  const recommendations = [];

  for (const playerId of allPlayerIds) {
    const baseline = baselinePlayers.get(playerId);
    const live = livePlayers.get(playerId);
    const citizen = citizensByPlayerId.get(playerId);

    const baselineXpBySkillId = baseline?.xpBySkillId ?? new Map();
    const currentXpBySkillId = collectCurrentXpBySkillId(live?.experience ?? [], skillMappings);

    const allSkillIds = new Set([...baselineXpBySkillId.keys(), ...currentXpBySkillId.keys()]);
    const topProfessions = [];

    for (const skillId of allSkillIds) {
      const baselineEntry = baselineXpBySkillId.get(skillId);
      const baselineXp = baselineEntry?.baselineXp ?? 0;
      const currentXp = currentXpBySkillId.get(skillId) ?? 0;
      const deltaXp = Math.max(0, currentXp - baselineXp);

      const citizenLevel = toNumber(citizen?.levelBySkillId?.[skillId], NaN);
      const playerLevel = toNumber(live?.levelBySkillId?.[skillId], NaN);
      const professionLevel = Number.isFinite(citizenLevel)
        ? citizenLevel
        : Number.isFinite(playerLevel)
          ? playerLevel
          : 0;

      const normalizedClaimTier = toNumber(claimTier, NaN);
      const claimTierCap = Number.isFinite(normalizedClaimTier) ? normalizedClaimTier : null;
      const maxTierByLevel = getMaxTierFromLevel(professionLevel);
      const baseRecommendedTier = getRecommendedTier({ professionLevel, claimTier: claimTierCap });
      const professionName = resolveSkillName(skillId, baselineEntry?.label, skillMappings);

      const toolRecommendation = resolveProfessionToolCandidates({
        professionId: skillId,
        professionName,
        tier: baseRecommendedTier,
        itemMetadata: itemMetadataByPlayerId[playerId],
      });

      const availableTierCap = toolRecommendation.availableTiers.length > 0
        ? toolRecommendation.availableTiers[toolRecommendation.availableTiers.length - 1]
        : null;
      const recommendedTier = Number.isFinite(availableTierCap)
        ? Math.min(baseRecommendedTier, availableTierCap)
        : baseRecommendedTier;

      const limitingFactors = [];
      if (Number.isFinite(claimTierCap) && claimTierCap < maxTierByLevel) {
        limitingFactors.push('claimTier');
      }
      if (Number.isFinite(availableTierCap) && availableTierCap < baseRecommendedTier) {
        limitingFactors.push('itemAvailability');
      }
      if (limitingFactors.length === 0 && maxTierByLevel <= baseRecommendedTier) {
        limitingFactors.push('playerLevel');
      }

      topProfessions.push({
        skillId,
        name: professionName,
        baselineXp,
        currentXp,
        deltaXp,
        level: professionLevel,
        playerLevel: professionLevel,
        maxTierByLevel,
        claimTierCap,
        recommendedTier,
        claimTierIsLimitingFactor: limitingFactors.includes('claimTier'),
        tierLimitingFactors: limitingFactors,
        toolRecommendation: {
          ...toolRecommendation,
          recommendedNameStem: toolRecommendation.mappingMissing
            ? toolRecommendation.recommendedNameStem
            : (() => {
              const currentStem = toolRecommendation.recommendedNameStem;
              const tierName = resolveToolTierName(recommendedTier);
              if (!currentStem || !tierName) return currentStem;
              const words = currentStem.split(' ');
              if (words.length <= 1) return currentStem;
              return `${tierName} ${words.slice(1).join(' ')}`;
            })(),
        },
      });
    }

    topProfessions.sort((a, b) => b.deltaXp - a.deltaXp || b.currentXp - a.currentXp || a.skillId - b.skillId);

    recommendations.push({
      playerId,
      username: live?.username ?? citizen?.username ?? baseline?.username ?? `Player ${playerId}`,
      topProfessions: topProfessions.slice(0, topLimit),
    });
  }

  return recommendations;
}

module.exports = {
  buildActivityRecommendations,
  collectSkillMappings,
};

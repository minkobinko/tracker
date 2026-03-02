#!/usr/bin/env node

const fs = require('node:fs/promises');
const { resolveProfessionToolFamily } = require('./src/recommendations/toolResolver');

const API_BASE = 'https://bitjita.com';

function usage() {
  console.log('Usage: node snapshot-player-exp.js <claimId> [outputFile]');
  console.log('Example: node snapshot-player-exp.js 1008806316547592462 snapshots/claim-exp.json');
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function pluckArray(payload, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function collectSkillDefinitions(skillsPayload) {
  const skillsById = new Map();
  const professionIds = new Set();

  const markDefinitions = (items, type) => {
    for (const item of toArray(items)) {
      if (!item || typeof item !== 'object') continue;
      const skillId = Number(item.id ?? item.skill_id ?? item.skillId);
      if (!Number.isFinite(skillId)) continue;

      const name = item.name ?? item.skill_name ?? `Skill ${skillId}`;
      const normalizedType = item.type ?? type ?? 'skill';
      const isProfession = normalizedType === 'profession' || item.category === 'profession';

      skillsById.set(skillId, {
        id: skillId,
        name,
        type: isProfession ? 'profession' : normalizedType,
      });

      if (isProfession) {
        professionIds.add(skillId);
      }
    }
  };

  markDefinitions(skillsPayload?.profession, 'profession');
  markDefinitions(skillsPayload?.professions, 'profession');
  markDefinitions(skillsPayload?.skills, 'skill');
  markDefinitions(skillsPayload?.data?.skills, 'skill');
  markDefinitions(skillsPayload?.data?.profession, 'profession');
  markDefinitions(skillsPayload?.data?.professions, 'profession');

  for (const [key, value] of Object.entries(skillsPayload ?? {})) {
    if (['profession', 'professions', 'skills', 'data'].includes(key)) continue;
    markDefinitions(value, key);
  }

  return { skillsById, professionIds };
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-app-identifier': 'tracker-snapshot-script',
      'User-Agent': 'tracker-snapshot-script/1.0',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return response.json();
}

async function main() {
  const claimId = process.argv[2];
  if (!claimId) {
    usage();
    process.exit(1);
  }

  const outputFile = process.argv[3] ?? `snapshot-${claimId}-${new Date().toISOString().replace(/[.:]/g, '-')}.json`;

  console.log(`Loading claim ${claimId} data...`);

  const [claimPayload, citizensPayload, skillsPayload] = await Promise.all([
    apiGet(`/api/claims/${claimId}`),
    apiGet(`/api/claims/${claimId}/citizens`),
    apiGet('/api/skills'),
  ]);

  const claim = claimPayload?.claim ?? claimPayload?.data ?? claimPayload;
  const citizens = pluckArray(citizensPayload, 'citizens');
  const { skillsById, professionIds } = collectSkillDefinitions(skillsPayload);

  const players = [];

  for (const citizen of citizens) {
    const playerId = citizen.entityId ?? citizen.playerEntityId ?? citizen.player?.entityId;
    if (!playerId) continue;

    const playerPayload = await apiGet(`/api/players/${playerId}`);
    const player = playerPayload?.player ?? playerPayload?.data ?? playerPayload;
    const experience = pluckArray(player, 'experience');

    const professionExperience = {};
    const skillExperience = {};
    const professionToolMapping = {};

    for (const expEntry of experience) {
      const skillId = Number(expEntry.skill_id ?? expEntry.skillId ?? expEntry.id);
      if (!Number.isFinite(skillId)) continue;

      const quantity = Number(expEntry.quantity ?? expEntry.value ?? 0);
      const skillMeta = skillsById.get(skillId);
      const skillName = skillMeta?.name ?? `Skill ${skillId}`;
      const lineItem = {
        skillId,
        name: skillName,
        xp: quantity,
      };

      if (professionIds.has(skillId) || skillMeta?.type === 'profession') {
        professionExperience[skillName] = lineItem;
        const mapping = resolveProfessionToolFamily({
          professionId: skillId,
          professionName: skillName,
          tier: claim?.tier,
        });
        professionToolMapping[skillName] = {
          skillId,
          mappingMissing: mapping.mappingMissing,
          recommendedNameStem: mapping.recommendedNameStem,
          uiMessage: mapping.uiMessage,
        };
      } else {
        skillExperience[skillName] = lineItem;
      }
    }

    players.push({
      playerId,
      username: citizen.userName ?? citizen.username ?? citizen.player?.username ?? `Player ${playerId}`,
      professionExperience,
      skillExperience,
      totalProfessionXp: Object.values(professionExperience).reduce((sum, item) => sum + item.xp, 0),
      professionToolMapping,
      totalSkillXp: Object.values(skillExperience).reduce((sum, item) => sum + item.xp, 0),
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    claim: {
      id: claim?.entityId ?? claimId,
      name: claim?.name ?? claim?.entityName ?? null,
      region: claim?.regionName ?? claim?.region?.name ?? null,
      tier: claim?.tier ?? null,
    },
    totals: {
      players: players.length,
      professionXp: players.reduce((sum, p) => sum + p.totalProfessionXp, 0),
      skillXp: players.reduce((sum, p) => sum + p.totalSkillXp, 0),
    },
    players,
  };

  await fs.writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Snapshot written to ${outputFile}`);
}

main().catch((error) => {
  console.error(`Failed to build snapshot: ${error.message}`);
  process.exit(1);
});

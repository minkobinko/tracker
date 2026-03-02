const test = require('node:test');
const assert = require('node:assert/strict');

const { buildActivityRecommendations } = require('./activity');
const { getMaxTierFromLevel, getRecommendedTier } = require('./tier');

test('tier helpers respect level progression and claim cap', () => {
  assert.equal(getMaxTierFromLevel(0), 1);
  assert.equal(getMaxTierFromLevel(9), 1);
  assert.equal(getMaxTierFromLevel(10), 2);
  assert.equal(getMaxTierFromLevel(89), 9);
  assert.equal(getMaxTierFromLevel(90), 10);

  assert.equal(getRecommendedTier({ professionLevel: 35, claimTier: 2 }), 2);
  assert.equal(getRecommendedTier({ professionLevel: 35, claimTier: 8 }), 4);
  assert.equal(getRecommendedTier({ professionLevel: 95, claimTier: null }), 10);
});

test('buildActivityRecommendations computes top profession deltas with profession-specific tool recommendations', () => {
  const baselineSnapshot = {
    players: [
      {
        playerId: '1',
        username: 'Alpha',
        professionExperience: {
          Miner: { skillId: 2, name: 'Miner', xp: 100 },
          Smith: { skillId: 3, name: 'Smith', xp: 50 },
        },
      },
    ],
  };

  const skillsPayload = {
    profession: [
      { id: 2, name: 'Miner', type: 'profession' },
      { id: 3, name: 'Smith', type: 'profession' },
    ],
  };

  const result = buildActivityRecommendations({
    baselineSnapshot,
    livePlayerPayloads: [
      {
        player: {
          entityId: '1',
          username: 'AlphaNow',
          experience: [
            { skill_id: 2, quantity: 250 },
            { skill_id: 3, quantity: 90 },
          ],
        },
      },
    ],
    citizens: [{ entityId: '1', userName: 'AlphaCitizen', skills: { 2: 35, 3: 22 } }],
    skillsPayload,
    claimTier: 2,
    itemMetadataByPlayerId: {
      1: {
        1001: { name: 'Pyrelite Pickaxe', tags: 'mining tool', tier: 2 },
        1002: { name: 'Pyrelite Hammer', tags: 'smithing tool', tier: 2 },
      },
    },
  });

  const alpha = result.find((p) => p.playerId === '1');
  assert.equal(alpha.username, 'AlphaNow');
  assert.equal(alpha.topProfessions[0].name, 'Miner');
  assert.equal(alpha.topProfessions[0].playerLevel, 35);
  assert.equal(alpha.topProfessions[0].maxTierByLevel, 4);
  assert.equal(alpha.topProfessions[0].claimTierCap, 2);
  assert.equal(alpha.topProfessions[0].recommendedTier, 2);
  assert.equal(alpha.topProfessions[0].claimTierIsLimitingFactor, true);
  assert.equal(alpha.topProfessions[0].toolRecommendation.mappingMissing, false);
  assert.equal(alpha.topProfessions[0].toolRecommendation.recommendedNameStem, 'Pyrelite Pickaxe');
  assert.equal(alpha.topProfessions[0].toolRecommendation.candidates[0].name, 'Pyrelite Pickaxe');
  assert.equal(alpha.topProfessions[1].toolRecommendation.recommendedNameStem, 'Pyrelite Hammer');
});

test('buildActivityRecommendations floors negative delta to zero and caps top list', () => {
  const result = buildActivityRecommendations({
    baselineSnapshot: {
      players: [
        {
          playerId: '9',
          professionExperience: {
            Miner: { skillId: 2, xp: 500 },
            Smith: { skillId: 3, xp: 10 },
            Tailor: { skillId: 4, xp: 0 },
            Hunter: { skillId: 5, xp: 0 },
          },
        },
      ],
    },
    livePlayerPayloads: [
      {
        player: {
          entityId: '9',
          experience: [
            { skill_id: 2, quantity: 100 },
            { skill_id: 3, quantity: 30 },
            { skill_id: 4, quantity: 20 },
            { skill_id: 5, quantity: 10 },
          ],
        },
      },
    ],
    citizens: [],
    skillsPayload: {
      profession: [
        { id: 2, name: 'Miner', type: 'profession' },
        { id: 3, name: 'Smith', type: 'profession' },
        { id: 4, name: 'Tailor', type: 'profession' },
        { id: 5, name: 'Hunter', type: 'profession' },
      ],
    },
  });

  assert.equal(result[0].topProfessions.length, 3);
  assert.equal(result[0].topProfessions[0].deltaXp, 20);
  assert.equal(result[0].topProfessions[2].deltaXp, 10);
  const minerEntry = result[0].topProfessions.find((entry) => entry.skillId === 2);
  assert.equal(minerEntry, undefined);
});

test('buildActivityRecommendations flags unmapped professions for UI guardrails', () => {
  const result = buildActivityRecommendations({
    baselineSnapshot: {
      players: [
        {
          playerId: '4',
          professionExperience: {
            Unknown: { skillId: 999, xp: 20 },
          },
        },
      ],
    },
    livePlayerPayloads: [
      {
        player: {
          entityId: '4',
          experience: [{ skill_id: 999, quantity: 40 }],
        },
      },
    ],
    citizens: [],
    skillsPayload: {
      profession: [{ id: 999, name: 'Mystery', type: 'profession' }],
    },
  });

  assert.equal(result[0].topProfessions[0].toolRecommendation.mappingMissing, true);
  assert.equal(result[0].topProfessions[0].toolRecommendation.uiMessage, 'No tool mapping configured');
  assert.deepEqual(result[0].topProfessions[0].toolRecommendation.candidates, []);
});

test('buildActivityRecommendations downgrades recommended tier to highest available item tier', () => {
  const result = buildActivityRecommendations({
    baselineSnapshot: {
      players: [
        {
          playerId: '7',
          professionExperience: {
            Miner: { skillId: 2, xp: 0 },
          },
        },
      ],
    },
    livePlayerPayloads: [
      {
        player: {
          entityId: '7',
          experience: [{ skill_id: 2, quantity: 200 }],
        },
      },
    ],
    citizens: [{ entityId: '7', skills: { 2: 65 } }],
    skillsPayload: {
      profession: [{ id: 2, name: 'Miner', type: 'profession' }],
    },
    claimTier: 9,
    itemMetadataByPlayerId: {
      7: {
        1001: { name: 'Emarium Pickaxe', tags: 'mining tool', tier: 3 },
      },
    },
  });

  const profession = result[0].topProfessions[0];
  assert.equal(profession.maxTierByLevel, 7);
  assert.equal(profession.claimTierCap, 9);
  assert.equal(profession.recommendedTier, 3);
  assert.deepEqual(profession.tierLimitingFactors, ['itemAvailability']);
  assert.equal(profession.toolRecommendation.recommendedNameStem, 'Emarium Pickaxe');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildActivityRecommendations } = require('./activity');

test('buildActivityRecommendations computes top profession deltas with fallbacks', () => {
  const baselineSnapshot = {
    players: [
      {
        playerId: '1',
        username: 'Alpha',
        professionExperience: {
          Gather: { skillId: 2, name: 'Gather', xp: 100 },
          OldCraft: { skillId: 3, name: 'Craft', xp: 50 },
        },
      },
    ],
  };

  const skillsPayload = {
    profession: [
      { id: 2, name: 'Gather', type: 'profession' },
      { id: 3, name: 'Crafting', type: 'profession' },
    ],
  };

  const livePlayerPayloads = [
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
    {
      player: {
        entityId: '2',
        username: 'Beta',
        experience: [{ skill_id: 2, quantity: 75 }],
      },
    },
  ];

  const citizens = [
    { entityId: '1', userName: 'AlphaCitizen', skills: { 2: 5, 3: 2 } },
    { entityId: '2', userName: 'BetaCitizen', skills: { 2: 4 } },
  ];

  const result = buildActivityRecommendations({
    baselineSnapshot,
    livePlayerPayloads,
    citizens,
    skillsPayload,
  });

  assert.equal(result.length, 2);

  const alpha = result.find((p) => p.playerId === '1');
  assert.equal(alpha.username, 'AlphaNow');
  assert.deepEqual(alpha.topProfessions[0], {
    skillId: 2,
    name: 'Gather',
    baselineXp: 100,
    currentXp: 250,
    deltaXp: 150,
    level: 5,
  });
  assert.deepEqual(alpha.topProfessions[1], {
    skillId: 3,
    name: 'Crafting',
    baselineXp: 50,
    currentXp: 90,
    deltaXp: 40,
    level: 2,
  });

  const beta = result.find((p) => p.playerId === '2');
  assert.equal(beta.topProfessions[0].baselineXp, 0);
  assert.equal(beta.topProfessions[0].deltaXp, 75);
});

test('buildActivityRecommendations floors negative delta to zero and caps top list', () => {
  const result = buildActivityRecommendations({
    baselineSnapshot: {
      players: [
        {
          playerId: '9',
          professionExperience: {
            A: { skillId: 2, xp: 500 },
            B: { skillId: 3, xp: 10 },
            C: { skillId: 4, xp: 0 },
            D: { skillId: 5, xp: 0 },
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
        { id: 2, name: 'A', type: 'profession' },
        { id: 3, name: 'B', type: 'profession' },
        { id: 4, name: 'C', type: 'profession' },
        { id: 5, name: 'D', type: 'profession' },
      ],
    },
  });

  assert.equal(result[0].topProfessions.length, 3);
  assert.equal(result[0].topProfessions[0].deltaXp, 20);
  assert.equal(result[0].topProfessions[2].deltaXp, 10);
  const aEntry = result[0].topProfessions.find((entry) => entry.skillId === 2);
  assert.equal(aEntry, undefined);
});

const toolTierNames = {
  1: 'Flint',
  2: 'Pyrelite',
  3: 'Emarium',
  4: 'Elenvar',
  5: 'Luminite',
  6: 'Rathium',
  7: 'Aurumite',
  8: 'Celestium',
  9: 'Umbracite',
  10: 'Astralite',
};

const professionToolMapByName = {
  forester: { tags: ['forester', 'woodcutting', 'lumber'], namePatterns: ['axe'], recommendedToolName: 'Axe' },
  carpenter: { tags: ['carpenter', 'carpentry', 'woodwork'], namePatterns: ['saw'], recommendedToolName: 'Saw' },
  mason: { tags: ['mason', 'masonry', 'stone'], namePatterns: ['chisel'], recommendedToolName: 'Chisel' },
  miner: { tags: ['miner', 'mining', 'ore'], namePatterns: ['pickaxe'], recommendedToolName: 'Pickaxe' },
  smith: { tags: ['smith', 'smithing', 'forge'], namePatterns: ['hammer'], recommendedToolName: 'Hammer' },
  leatherworker: { tags: ['leatherworker', 'leather'], namePatterns: ['knife'], recommendedToolName: 'Knife' },
  hunter: { tags: ['hunter', 'hunting'], namePatterns: ['bow'], recommendedToolName: 'Bow' },
  tailor: { tags: ['tailor', 'tailoring', 'cloth'], namePatterns: ['scissors', 'shears'], recommendedToolName: 'Scissors' },
  farmer: { tags: ['farmer', 'farming', 'crop'], namePatterns: ['hoe'], recommendedToolName: 'Hoe' },
  fishing: { tags: ['fishing', 'fish'], namePatterns: ['rod'], recommendedToolName: 'Rod' },
  cook: { tags: ['cook', 'cooking', 'kitchen'], namePatterns: ['cooking pot', 'pot'], recommendedToolName: 'Cooking Pot' },
  forager: { tags: ['forager', 'foraging', 'gather'], namePatterns: ['machete'], recommendedToolName: 'Machete' },
  scholar: { tags: ['scholar', 'research', 'study'], namePatterns: ['quill'], recommendedToolName: 'Quill' },
  building: { tags: ['building', 'builder', 'construction'], namePatterns: ['mallet'], recommendedToolName: 'Mallet' },
};

const professionToolMapBySkillId = {};

function normalizeProfessionName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveToolTierName(tier) {
  const normalizedTier = Number(tier);
  return toolTierNames[normalizedTier] ?? null;
}

if (typeof window !== 'undefined') {
  window.professionToolMapByName = professionToolMapByName;
  window.professionToolMapBySkillId = professionToolMapBySkillId;
  window.toolTierNames = toolTierNames;
}

module.exports = {
  professionToolMapByName,
  professionToolMapBySkillId,
  toolTierNames,
  normalizeProfessionName,
  resolveToolTierName,
};

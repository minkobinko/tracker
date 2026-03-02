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

const TOOL_FAMILIES = {
  forestry: { tags: ['forester', 'forestry', 'woodcutting', 'lumber'], namePatterns: ['axe'], recommendedToolName: 'Axe' },
  carpentry: { tags: ['carpenter', 'carpentry', 'woodwork'], namePatterns: ['saw'], recommendedToolName: 'Saw' },
  masonry: { tags: ['mason', 'masonry', 'stone'], namePatterns: ['chisel'], recommendedToolName: 'Chisel' },
  mining: { tags: ['miner', 'mining', 'ore'], namePatterns: ['pickaxe'], recommendedToolName: 'Pickaxe' },
  smithing: { tags: ['smith', 'smithing', 'forge'], namePatterns: ['hammer'], recommendedToolName: 'Hammer' },
  leatherworking: { tags: ['leatherworker', 'leatherworking', 'leather'], namePatterns: ['knife'], recommendedToolName: 'Knife' },
  hunting: { tags: ['hunter', 'hunting'], namePatterns: ['bow'], recommendedToolName: 'Bow' },
  tailoring: { tags: ['tailor', 'tailoring', 'cloth'], namePatterns: ['scissors', 'shears'], recommendedToolName: 'Scissors' },
  farming: { tags: ['farmer', 'farming', 'crop'], namePatterns: ['hoe'], recommendedToolName: 'Hoe' },
  fishing: { tags: ['fishing', 'fish'], namePatterns: ['rod'], recommendedToolName: 'Rod' },
  cooking: { tags: ['cook', 'cooking', 'kitchen'], namePatterns: ['cooking pot', 'pot'], recommendedToolName: 'Cooking Pot' },
  foraging: { tags: ['forager', 'foraging', 'gather'], namePatterns: ['machete'], recommendedToolName: 'Machete' },
  scholar: { tags: ['scholar', 'research', 'study'], namePatterns: ['quill'], recommendedToolName: 'Quill' },
  building: { tags: ['building', 'builder', 'construction'], namePatterns: ['mallet'], recommendedToolName: 'Mallet' },
};

const PROFESSION_ALIASES = {
  forester: 'forestry',
  forestry: 'forestry',
  carpenter: 'carpentry',
  carpentry: 'carpentry',
  mason: 'masonry',
  masonry: 'masonry',
  miner: 'mining',
  mining: 'mining',
  smith: 'smithing',
  smithing: 'smithing',
  leatherworker: 'leatherworking',
  leatherworking: 'leatherworking',
  hunter: 'hunting',
  hunting: 'hunting',
  tailor: 'tailoring',
  tailoring: 'tailoring',
  farmer: 'farming',
  farming: 'farming',
  fishing: 'fishing',
  cook: 'cooking',
  cooking: 'cooking',
  forager: 'foraging',
  foraging: 'foraging',
  scholar: 'scholar',
  building: 'building',
};

const professionToolMapByName = Object.fromEntries(
  Object.entries(PROFESSION_ALIASES)
    .map(([alias, canonical]) => [alias, TOOL_FAMILIES[canonical]])
    .filter(([, config]) => Boolean(config)),
);

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

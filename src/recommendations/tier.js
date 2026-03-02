function toNumber(value, fallback = NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

// Based on the game's profession progression breakpoints.
// A new craft tier unlocks every 10 profession levels, capping at tier 10.
const LEVEL_TO_MAX_TIER_TABLE = [
  { minLevel: 0, maxTier: 1 },
  { minLevel: 10, maxTier: 2 },
  { minLevel: 20, maxTier: 3 },
  { minLevel: 30, maxTier: 4 },
  { minLevel: 40, maxTier: 5 },
  { minLevel: 50, maxTier: 6 },
  { minLevel: 60, maxTier: 7 },
  { minLevel: 70, maxTier: 8 },
  { minLevel: 80, maxTier: 9 },
  { minLevel: 90, maxTier: 10 },
];

function getMaxTierFromLevel(level) {
  const normalizedLevel = Math.max(0, toNumber(level, 0));

  let maxTier = 1;
  for (const row of LEVEL_TO_MAX_TIER_TABLE) {
    if (normalizedLevel >= row.minLevel) {
      maxTier = row.maxTier;
      continue;
    }
    break;
  }

  return maxTier;
}

function getRecommendedTier({ professionLevel, claimTier }) {
  const maxTierFromLevel = getMaxTierFromLevel(professionLevel);
  if (claimTier === null || claimTier === undefined || claimTier === '') {
    return maxTierFromLevel;
  }

  const normalizedClaimTier = toNumber(claimTier, NaN);

  if (!Number.isFinite(normalizedClaimTier)) {
    return maxTierFromLevel;
  }

  return Math.min(maxTierFromLevel, Math.max(1, normalizedClaimTier));
}

module.exports = {
  LEVEL_TO_MAX_TIER_TABLE,
  getMaxTierFromLevel,
  getRecommendedTier,
};

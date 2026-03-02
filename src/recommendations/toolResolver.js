const {
  professionToolMapByName,
  professionToolMapBySkillId,
  normalizeProfessionName,
  resolveToolTierName,
  toolTierNames,
} = require('../../data/professionToolMap');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeItems(itemMetadata) {
  if (Array.isArray(itemMetadata)) return itemMetadata;
  if (itemMetadata && typeof itemMetadata === 'object') {
    return Object.entries(itemMetadata).map(([id, item]) => ({
      itemId: Number(id),
      ...item,
    }));
  }
  return [];
}

function detectItemTier(item) {
  const directTier = toNumber(item?.tier ?? item?.itemTier ?? item?.toolTier, NaN);
  if (Number.isFinite(directTier)) return directTier;

  const normalizedName = String(item?.name ?? '').toLowerCase();
  for (const [tier, tierName] of Object.entries(toolTierNames)) {
    if (normalizedName.includes(String(tierName).toLowerCase())) {
      return toNumber(tier, NaN);
    }
  }

  return NaN;
}

function resolveProfessionToolFamily({ professionId, professionName, tier }) {
  const normalizedProfessionId = toNumber(professionId);
  const normalizedName = normalizeProfessionName(professionName);

  const mapping = professionToolMapBySkillId[normalizedProfessionId] ?? professionToolMapByName[normalizedName];

  if (!mapping) {
    return {
      professionId: normalizedProfessionId,
      professionName: professionName ?? null,
      mappingMissing: true,
      expectedToolFamily: null,
      recommendedNameStem: null,
      uiMessage: 'No tool mapping configured',
    };
  }

  const tierName = resolveToolTierName(tier);
  const recommendedToolName = mapping.recommendedToolName ?? 'Tool';

  return {
    professionId: normalizedProfessionId,
    professionName: professionName ?? null,
    mappingMissing: false,
    expectedToolFamily: {
      toolType: asArray(mapping.toolType),
      tags: asArray(mapping.tags),
      namePatterns: asArray(mapping.namePatterns),
    },
    recommendedNameStem: tierName ? `${tierName} ${recommendedToolName}` : recommendedToolName,
    uiMessage: null,
  };
}

function findCandidateItemsForFamily(itemMetadata, family) {
  if (!family) return [];

  const acceptedToolTypes = new Set(asArray(family.toolType).map((value) => toNumber(value)).filter(Number.isFinite));
  const acceptedTags = asArray(family.tags).map((tag) => String(tag).toLowerCase());
  const acceptedPatterns = asArray(family.namePatterns).map((pattern) => String(pattern).toLowerCase());

  return normalizeItems(itemMetadata)
    .filter((item) => {
      const toolType = toNumber(item?.toolType);
      const itemTags = String(item?.tag ?? item?.tags ?? '').toLowerCase();
      const itemName = String(item?.name ?? '').toLowerCase();

      return (
        (acceptedToolTypes.size > 0 && Number.isFinite(toolType) && acceptedToolTypes.has(toolType)) ||
        acceptedTags.some((tag) => itemTags.includes(tag)) ||
        acceptedPatterns.some((pattern) => itemName.includes(pattern))
      );
    })
    .map((item) => {
      const tier = detectItemTier(item);
      return {
        itemId: toNumber(item.itemId ?? item.id, null),
        name: item.name ?? `Item ${item.itemId ?? item.id}`,
        toolType: toNumber(item.toolType, null),
        tags: item.tag ?? item.tags ?? null,
        tier: Number.isFinite(tier) ? tier : null,
      };
    });
}

function resolveProfessionToolCandidates({ professionId, professionName, tier, itemMetadata }) {
  const familyResolution = resolveProfessionToolFamily({ professionId, professionName, tier });
  const candidates = findCandidateItemsForFamily(itemMetadata, familyResolution.expectedToolFamily);
  const availableTiers = [...new Set(candidates.map((candidate) => candidate.tier).filter(Number.isFinite))].sort((a, b) => a - b);

  return {
    ...familyResolution,
    candidates,
    availableTiers,
  };
}

module.exports = {
  resolveProfessionToolFamily,
  findCandidateItemsForFamily,
  resolveProfessionToolCandidates,
};

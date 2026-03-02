const API_BASE = "https://bitjita.com";
const CORS_PROXY = "https://corsproxy.io/?";
const DEFAULT_BASELINE_FILE = "snapshot-1008806316547592462-2026-03-02T07-40-09-231Z.json";
const statusEl = document.getElementById("status");
const claimSummaryEl = document.getElementById("claim-summary");
const professionSummaryEl = document.getElementById("profession-summary");
const professionGridEl = document.getElementById("profession-grid");
const playerTableEl = document.getElementById("player-table");
const playersBodyEl = document.getElementById("players-body");
const recommendationsEl = document.getElementById("recommendations");
const recommendationsBodyEl = document.getElementById("recommendations-body");
const recommendationsStateEl = document.getElementById("recommendations-state");
const form = document.getElementById("claim-form");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", !isError);
}

function isBrowser() {
  return typeof window !== "undefined";
}

function apiUrl(path) {
  const directUrl = `${API_BASE}${path}`;
  if (!isBrowser()) return directUrl;
  return `${CORS_PROXY}${encodeURIComponent(directUrl)}`;
}

async function apiGet(path) {
  const response = await fetch(apiUrl(path), {
    headers: {
      Accept: "application/json",
      "x-app-identifier": "tracker-web-ui",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return response.json();
}

function pluckArray(payload, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getProfessionToolMapByName() {
  if (
    typeof window !== "undefined" &&
    window.professionToolMapByName &&
    typeof window.professionToolMapByName === "object"
  ) {
    return window.professionToolMapByName;
  }
  return {};
}

function getToolTierName(tier) {
  const tiers = typeof window !== "undefined" && window.toolTierNames ? window.toolTierNames : {};
  return tiers[String(tier)] ?? tiers[Number(tier)] ?? null;
}

function normalizeProfessionName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveToolMappingForProfession(professionName, claimTier) {
  const mapByName = getProfessionToolMapByName();
  const mapping = mapByName[normalizeProfessionName(professionName)];

  if (!mapping) {
    return {
      mappingMissing: true,
      uiMessage: "Mapping missing",
      recommendedNameStem: null,
      recommendedFamily: "Unknown",
      namePatterns: [],
    };
  }

  const tierName = getToolTierName(claimTier);
  const recommendedToolName = mapping.recommendedToolName ?? "Tool";

  return {
    mappingMissing: false,
    uiMessage: null,
    recommendedNameStem: tierName ? `${tierName} ${recommendedToolName}` : recommendedToolName,
    recommendedFamily: recommendedToolName,
    namePatterns: Array.isArray(mapping.namePatterns) ? mapping.namePatterns : [],
  };
}

function resolveCurrentToolForProfession(professionName, gear) {
  const tools = gear?.tools ?? [];
  if (!tools.length) return "None detected";

  const mapping = resolveToolMappingForProfession(professionName, null);
  if (mapping.mappingMissing || !mapping.namePatterns.length) return tools[0];

  const loweredTools = tools.map((tool) => String(tool).toLowerCase());
  for (const pattern of mapping.namePatterns) {
    const normalizedPattern = String(pattern).toLowerCase();
    const index = loweredTools.findIndex((tool) => tool.includes(normalizedPattern));
    if (index >= 0) return tools[index];
  }

  return tools[0];
}

function detectToolTierFromLabel(label) {
  const normalized = String(label ?? "").toLowerCase();
  for (const [tier, tierName] of Object.entries(typeof window !== "undefined" && window.toolTierNames ? window.toolTierNames : {})) {
    if (normalized.includes(String(tierName).toLowerCase())) {
      return toNumber(tier, NaN);
    }
  }
  return NaN;
}

function getBestOwnedToolTierForProfession(professionName, gear) {
  const tools = gear?.tools ?? [];
  if (!tools.length) return null;

  const mapping = resolveToolMappingForProfession(professionName, null);
  if (mapping.mappingMissing || !mapping.namePatterns.length) return null;

  const normalizedPatterns = mapping.namePatterns.map((pattern) => String(pattern).toLowerCase());
  let bestTier = NaN;

  for (const toolLabel of tools) {
    const normalizedTool = String(toolLabel).toLowerCase();
    const matchesProfessionFamily = normalizedPatterns.some((pattern) => normalizedTool.includes(pattern));
    if (!matchesProfessionFamily) continue;

    const detectedTier = detectToolTierFromLabel(toolLabel);
    if (Number.isFinite(detectedTier)) {
      bestTier = Number.isFinite(bestTier) ? Math.max(bestTier, detectedTier) : detectedTier;
    }
  }

  return Number.isFinite(bestTier) ? bestTier : null;
}

function getMaxTierFromLevel(level) {
  const normalizedLevel = Math.max(0, toNumber(level, 0));
  if (normalizedLevel >= 70) return 10;
  if (normalizedLevel >= 60) return 9;
  if (normalizedLevel >= 50) return 8;
  if (normalizedLevel >= 40) return 7;
  if (normalizedLevel >= 32) return 6;
  if (normalizedLevel >= 24) return 5;
  if (normalizedLevel >= 16) return 4;
  if (normalizedLevel >= 8) return 3;
  if (normalizedLevel >= 4) return 2;
  return 1;
}

function getRecommendedTier(professionLevel, claimTier) {
  const maxTierFromLevel = getMaxTierFromLevel(professionLevel);
  const claimTierNum = toNumber(claimTier, NaN);
  if (!Number.isFinite(claimTierNum)) return maxTierFromLevel;
  return Math.min(maxTierFromLevel, Math.max(1, claimTierNum));
}

function detectGearCategory(entry, item) {
  const slot = (entry.primary ?? entry.slot ?? entry.slotName ?? item.slot ?? "").toLowerCase();
  const tags = (item.tags ?? item.tag ?? "").toLowerCase();

  if (slot.includes("hand_clothing")) return "clothesArmor";
  if (slot.includes("artifact") || slot.includes("ring") || slot.includes("neck") || tags.includes("accessor")) {
    return "accessories";
  }
  if (slot.includes("clothing") || slot.includes("armor") || slot.includes("head") || tags.includes("cloth")) {
    return "clothesArmor";
  }
  if (slot.includes("hand") || slot.includes("tool") || tags.includes("tool")) return "tools";
  return "accessories";
}

function addUnique(list, item) {
  if (!list.includes(item)) list.push(item);
}

function categorizedGearFromEquipmentPayload(payload) {
  const arr = pluckArray(payload, "equipment", "items", "data");
  const categories = { tools: [], clothesArmor: [], accessories: [] };

  for (const entry of arr) {
    const item = entry.item ?? entry;
    const name = item?.name ?? entry?.name;
    if (!name) continue;
    const slot = entry.primary ?? entry.slot ?? entry.slotName ?? item.slot ?? "slot";
    const category = detectGearCategory(entry, item);
    addUnique(categories[category], `${name} (${slot})`);
  }

  return categories;
}

function mergeCategories(base, incoming) {
  if (!incoming) return base;
  for (const key of ["tools", "clothesArmor", "accessories"]) {
    for (const item of incoming[key] ?? []) addUnique(base[key], item);
  }
  return base;
}

function categorizedToolsFromInventoriesPayload(payload) {
  const categories = { tools: [], clothesArmor: [], accessories: [] };
  const inventories = pluckArray(payload, "inventories");
  const itemsById = payload?.items ?? {};

  for (const inventory of inventories) {
    for (const pocket of inventory.pockets ?? []) {
      const contents = pocket.contents;
      if (!contents?.itemId) continue;
      const itemMeta = itemsById[String(contents.itemId)] ?? {};
      const tag = (itemMeta.tag ?? itemMeta.tags ?? "").toLowerCase();
      const isTool = Number.isFinite(Number(itemMeta.toolType)) || tag.includes("tool") || tag.includes("weapon");
      if (!isTool) continue;
      const quantity = Number(contents.quantity ?? 1);
      const quantitySuffix = quantity > 1 ? ` x${quantity}` : "";
      addUnique(categories.tools, `${itemMeta.name ?? `Item ${contents.itemId}`} (toolbelt${quantitySuffix})`);
    }
  }

  return categories;
}

function renderClaimSummary(claim) {
  claimSummaryEl.classList.remove("hidden");
  claimSummaryEl.innerHTML = `
    <h2>Claim: ${claim.name ?? claim.entityName ?? claim.entityId}</h2>
    <p class="small">
      Entity ID: ${claim.entityId ?? "-"} • Region: ${claim.regionName ?? claim.region?.name ?? "Unknown"} • Tier: ${claim.tier ?? "-"}
    </p>
  `;
}

function renderProfessionSummary(professionMap, playerCount) {
  const entries = Object.entries(professionMap).sort((a, b) => b[1].totalXp - a[1].totalXp);
  professionGridEl.innerHTML = "";

  for (const [name, stat] of entries) {
    const avgLevel = playerCount ? (stat.totalLevel / playerCount).toFixed(2) : "0.00";
    const tile = document.createElement("article");
    tile.className = "profession-tile";
    tile.innerHTML = `
      <h3>${name}</h3>
      <div>Total XP: <strong>${stat.totalXp.toLocaleString()}</strong></div>
      <div>Avg Level: <strong>${avgLevel}</strong></div>
      <div>Tracked players: <strong>${stat.players}</strong></div>
    `;
    professionGridEl.appendChild(tile);
  }

  professionSummaryEl.classList.remove("hidden");
}

function renderGearList(items, previewCount = 4) {
  if (!items.length) return '<span class="small">None</span>';
  const previewItems = items.slice(0, previewCount);
  const remainingCount = items.length - previewItems.length;
  const previewHtml = `<ul>${previewItems.map((item) => `<li>${item}</li>`).join("")}</ul>`;
  if (remainingCount <= 0) return previewHtml;
  return `${previewHtml}<div class="small">+${remainingCount} more</div>`;
}

function renderGearCategories(gear) {
  const sections = [["Tools", gear.tools], ["Clothes / Armor", gear.clothesArmor], ["Accessories", gear.accessories]];
  const chips = sections.map(([title, items]) => `<span class="gear-chip">${title}: ${items.length}</span>`).join("");
  const detailContent = sections
    .map(([title, items]) => `<div class="gear-group"><strong>${title}:</strong>${renderGearList(items)}</div>`)
    .join("");

  return `<details class="gear-preview"><summary>Preview</summary><div class="gear-chips">${chips}</div><div class="gear-categories">${detailContent}</div></details>`;
}

function renderPlayers(rows) {
  playersBodyEl.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a href="#recommendation-${row.playerId}" class="table-link">${row.username}</a></td>
      <td>${row.highestProfession}</td>
      <td>${row.professionXp.toLocaleString()}</td>
      <td>${row.gear ? renderGearCategories(row.gear) : "No equipped gear found"}</td>
    `;
    playersBodyEl.appendChild(tr);
  }
  playerTableEl.classList.remove("hidden");
}

function getSkillMappings(skillsPayload) {
  const professionSkills = pluckArray(skillsPayload, "profession", "professions");
  return new Map(professionSkills.map((skill) => [Number(skill.id), skill.name]));
}

async function loadBaselineSnapshot(path = DEFAULT_BASELINE_FILE) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Baseline snapshot unavailable");
  return response.json();
}

function buildBaselineByPlayer(snapshot, skillNameById) {
  const byPlayer = new Map();
  for (const player of snapshot?.players ?? []) {
    const playerId = String(player.playerId ?? player.entityId ?? "");
    if (!playerId) continue;
    const xpBySkillId = new Map();
    for (const [label, entry] of Object.entries(player.professionExperience ?? {})) {
      let sid = Number(entry.skillId ?? entry.skill_id);
      if (!Number.isFinite(sid)) {
        sid = [...skillNameById.entries()].find(([, name]) => String(name).toLowerCase() === String(label).toLowerCase())?.[0];
      }
      if (!Number.isFinite(sid)) continue;
      xpBySkillId.set(sid, toNumber(entry.xp ?? entry.quantity, 0));
    }
    byPlayer.set(playerId, xpBySkillId);
  }
  return byPlayer;
}

function getBadgeForFactors(factors) {
  if (factors.includes("claimTier")) return "Claim cap";
  return "Level cap";
}

function renderRecommendations(data, states) {
  recommendationsBodyEl.innerHTML = "";
  recommendationsEl.classList.remove("hidden");

  const warnings = [];
  if (states.baselineMissing) warnings.push("Baseline missing");
  if (states.mappingMissing) warnings.push("Mapping missing for one or more professions");
  if (states.tierDataUnavailable) warnings.push("Tier data unavailable for one or more entries");
  recommendationsStateEl.textContent = warnings.length ? warnings.join(" • ") : "Recommendations ready.";

  if (!data.length) {
    recommendationsBodyEl.innerHTML = `<tr><td colspan="7" class="small">No recommendation data available.</td></tr>`;
    return;
  }

  for (const player of data) {
    for (const [index, profession] of player.top3.entries()) {
      const tr = document.createElement("tr");
      const recommendedTool = (() => {
        const family = profession.recommendedFamily ?? "Unknown";
        if (!Number.isFinite(profession.recommendedTier)) return family;
        const tierName = getToolTierName(profession.recommendedTier) ?? `Tier ${profession.recommendedTier}`;
        return `${tierName} ${family}`;
      })();
      const currentTool = resolveCurrentToolForProfession(profession.name, player.gear);
      tr.innerHTML = `
        <td id="recommendation-${player.playerId}">${index === 0 ? player.username : ""}</td>
        <td>${profession.name}</td>
        <td>${profession.deltaXp.toLocaleString()}</td>
        <td>${profession.level}</td>
        <td>${currentTool}</td>
        <td>${recommendedTool}</td>
        <td><span class="limit-badge">${profession.limitBadge}</span></td>
      `;
      recommendationsBodyEl.appendChild(tr);
    }
  }
}

async function loadClaim(claimId) {
  setStatus("Loading claim, citizens, and player equipment…");

  const [claimPayload, citizensPayload, skillsPayload] = await Promise.all([
    apiGet(`/api/claims/${claimId}`),
    apiGet(`/api/claims/${claimId}/citizens`),
    apiGet(`/api/skills`),
  ]);

  const claim = claimPayload.claim ?? claimPayload.data ?? claimPayload;
  const citizens = pluckArray(citizensPayload, "citizens");
  const skillNameById = getSkillMappings(skillsPayload);

  renderClaimSummary(claim);

  const professionStats = {};
  const rows = [];
  const liveByPlayerId = new Map();

  for (const citizen of citizens) {
    const username = citizen.userName ?? citizen.username ?? citizen.player?.username ?? `Player ${citizen.entityId}`;
    const playerId = String(citizen.entityId ?? citizen.playerEntityId ?? citizen.player?.entityId ?? "");
    let professionXp = Number(citizen.totalXP ?? 0);
    let highestProfession = "N/A";

    const levelBySkillId = citizen.skills ?? {};
    let rankedProfessions = [];
    if (levelBySkillId && typeof levelBySkillId === "object") {
      rankedProfessions = Object.entries(levelBySkillId)
        .map(([skillId, level]) => ({ skillId: Number(skillId), level: Number(level ?? 0), name: skillNameById.get(Number(skillId)) }))
        .filter((entry) => entry.name)
        .sort((a, b) => b.level - a.level);
      if (rankedProfessions.length) highestProfession = `${rankedProfessions[0].name} (Lv ${rankedProfessions[0].level})`;
    }

    let gear = null;
    if (playerId) {
      try {
        const [equipmentPayload, playerPayload, inventoriesPayload] = await Promise.all([
          apiGet(`/api/players/${playerId}/equipment`),
          apiGet(`/api/players/${playerId}`),
          apiGet(`/api/players/${playerId}/inventories`),
        ]);

        gear = categorizedGearFromEquipmentPayload(equipmentPayload);
        mergeCategories(gear, categorizedToolsFromInventoriesPayload(inventoriesPayload));

        const player = playerPayload?.player ?? playerPayload;
        liveByPlayerId.set(playerId, {
          username,
          experience: pluckArray(player, "experience"),
          skills: player.skills ?? citizen.skills ?? {},
        });

        const experienceEntries = pluckArray(player, "experience");
        const professionXpEntries = experienceEntries.filter((entry) => skillNameById.has(Number(entry.skill_id)));
        if (professionXpEntries.length) {
          professionXp = professionXpEntries.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
        }

        for (const entry of professionXpEntries) {
          const skillName = skillNameById.get(Number(entry.skill_id));
          if (!skillName) continue;
          if (!professionStats[skillName]) professionStats[skillName] = { totalXp: 0, totalLevel: 0, players: 0 };
          professionStats[skillName].totalXp += Number(entry.quantity ?? 0);
        }
      } catch (error) {
        gear = { tools: [`Unable to load player details (${error.message})`], clothesArmor: [], accessories: [] };
      }
    }

    for (const [skillId, level] of Object.entries(levelBySkillId)) {
      const skillName = skillNameById.get(Number(skillId));
      if (!skillName) continue;
      if (!professionStats[skillName]) professionStats[skillName] = { totalXp: 0, totalLevel: 0, players: 0 };
      const numericLevel = Number(level ?? 0);
      professionStats[skillName].totalLevel += numericLevel;
      if (numericLevel > 0) professionStats[skillName].players += 1;
    }

    rows.push({
      playerId,
      username,
      highestProfession,
      professionXp,
      gear,
      recommendedToolLabel: (() => {
        const top = rankedProfessions[0]?.name;
        if (!top) return '<span class="small">No profession data</span>';
        const resolved = resolveToolMappingForProfession(top, claim?.tier);
        return resolved.mappingMissing ? '<span class="small">No tool mapping configured</span>' : resolved.recommendedNameStem;
      })(),
    });

    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  const baselineState = { baselineMissing: false, mappingMissing: false, tierDataUnavailable: false };
  let baselineByPlayer = new Map();
  try {
    const baseline = await loadBaselineSnapshot();
    baselineByPlayer = buildBaselineByPlayer(baseline, skillNameById);
  } catch (error) {
    baselineState.baselineMissing = true;
  }

  const recommendations = [];
  for (const row of rows) {
    const live = liveByPlayerId.get(row.playerId);
    const baselineXpBySkillId = baselineByPlayer.get(row.playerId) ?? new Map();
    const currentBySkillId = new Map();

    for (const exp of live?.experience ?? []) {
      const skillId = Number(exp.skill_id ?? exp.skillId);
      if (!skillNameById.has(skillId)) continue;
      currentBySkillId.set(skillId, toNumber(exp.quantity ?? exp.xp, 0));
    }

    const profs = [];
    for (const [skillId, currentXp] of currentBySkillId.entries()) {
      const baselineXp = baselineXpBySkillId.get(skillId) ?? 0;
      const deltaXp = Math.max(0, currentXp - baselineXp);
      if (deltaXp <= 0) continue;
      const name = skillNameById.get(skillId) ?? `Skill ${skillId}`;
      const level = toNumber(live?.skills?.[skillId] ?? 0, 0);
      const mapping = resolveToolMappingForProfession(name, claim?.tier);
      if (mapping.mappingMissing) baselineState.mappingMissing = true;

      const baseTier = getRecommendedTier(level, claim?.tier);
      const tierName = getToolTierName(baseTier);
      if (!tierName) baselineState.tierDataUnavailable = true;
      const limitBadge = Number.isFinite(toNumber(claim?.tier, NaN)) && toNumber(claim?.tier, NaN) < getMaxTierFromLevel(level) ? "Claim cap" : "Level cap";

      const bestOwnedTier = getBestOwnedToolTierForProfession(name, row.gear);
      if (Number.isFinite(baseTier) && Number.isFinite(bestOwnedTier) && bestOwnedTier >= baseTier) {
        continue;
      }

      profs.push({
        skillId,
        name,
        deltaXp,
        level,
        recommendedFamily: mapping.recommendedFamily,
        recommendedTier: baseTier,
        limitBadge,
      });
    }

    profs.sort((a, b) => b.deltaXp - a.deltaXp);
    const top3 = profs.slice(0, 3);
    const totalDelta = top3.reduce((sum, item) => sum + item.deltaXp, 0);
    recommendations.push({ playerId: row.playerId, username: row.username, gear: row.gear, totalDelta, top3 });
  }

  recommendations.sort((a, b) => b.totalDelta - a.totalDelta);

  renderProfessionSummary(professionStats, rows.length);
  renderPlayers(rows.sort((a, b) => b.professionXp - a.professionXp));
  renderRecommendations(recommendations, baselineState);

  setStatus(`Loaded ${rows.length} players from claim ${claimId}.`);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const claimId = new FormData(form).get("claimId")?.toString().trim();
  if (!claimId) return;
  try {
    await loadClaim(claimId);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
});

loadClaim("1008806316547592462").catch((error) => setStatus(`Error: ${error.message}`, true));

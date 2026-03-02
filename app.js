const API_BASE = "https://bitjita.com";
const CORS_PROXY = "https://corsproxy.io/?";
const statusEl = document.getElementById("status");
const claimSummaryEl = document.getElementById("claim-summary");
const professionSummaryEl = document.getElementById("profession-summary");
const professionGridEl = document.getElementById("profession-grid");
const playerTableEl = document.getElementById("player-table");
const playersBodyEl = document.getElementById("players-body");
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

  // Bitjita API responses do not include CORS headers for browser-based cross-origin fetches.
  // Route requests through a public CORS proxy for this static client.
  return `${CORS_PROXY}${encodeURIComponent(directUrl)}`;
}

async function apiGet(path) {
  const response = await fetch(apiUrl(path), {
    headers: {
      Accept: "application/json",
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

function detectGearCategory(entry, item) {
  const slot = (entry.primary ?? entry.slot ?? entry.slotName ?? item.slot ?? "").toLowerCase();
  const tags = (item.tags ?? item.tag ?? "").toLowerCase();

  if (slot.includes("hand_clothing")) {
    return "clothesArmor";
  }

  if (
    slot.includes("artifact") ||
    slot.includes("ring") ||
    slot.includes("neck") ||
    slot.includes("amulet") ||
    slot.includes("trinket") ||
    tags.includes("accessor")
  ) {
    return "accessories";
  }

  if (
    slot.includes("clothing") ||
    slot.includes("armor") ||
    slot.includes("head") ||
    slot.includes("torso") ||
    slot.includes("leg") ||
    slot.includes("feet") ||
    slot.includes("belt") ||
    tags.includes("cloth") ||
    tags.includes("armor")
  ) {
    return "clothesArmor";
  }

  if (slot.includes("hand") || slot.includes("tool") || tags.includes("tool")) {
    return "tools";
  }

  return "accessories";
}

function addUnique(list, item) {
  if (!list.includes(item)) {
    list.push(item);
  }
}

function categorizedGearFromEquipmentPayload(payload) {
  const arr = pluckArray(payload, "equipment", "items", "data");
  const categories = {
    tools: [],
    clothesArmor: [],
    accessories: [],
  };

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
    for (const item of incoming[key] ?? []) {
      addUnique(base[key], item);
    }
  }
  return base;
}

function categorizedToolsFromInventoriesPayload(payload) {
  const categories = {
    tools: [],
    clothesArmor: [],
    accessories: [],
  };

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
      const label = `${itemMeta.name ?? `Item ${contents.itemId}`} (toolbelt${quantitySuffix})`;
      addUnique(categories.tools, label);
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
  const sections = [
    ["Tools", gear.tools],
    ["Clothes / Armor", gear.clothesArmor],
    ["Accessories", gear.accessories],
  ];

  const chips = sections
    .map(([title, items]) => `<span class="gear-chip">${title}: ${items.length}</span>`)
    .join("");

  const detailContent = sections
    .map(([title, items]) => `<div class="gear-group"><strong>${title}:</strong>${renderGearList(items)}</div>`)
    .join("");

  return `
    <details class="gear-preview">
      <summary>Preview</summary>
      <div class="gear-chips">${chips}</div>
      <div class="gear-categories">${detailContent}</div>
    </details>
  `;
}

function renderPlayers(rows) {
  playersBodyEl.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.username}</td>
      <td>${row.highestProfession}</td>
      <td>${row.professionXp.toLocaleString()}</td>
      <td>${row.gear ? renderGearCategories(row.gear) : "No equipped gear found"}</td>
    `;
    playersBodyEl.appendChild(tr);
  }
  playerTableEl.classList.remove("hidden");
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
  const professionSkills = pluckArray(skillsPayload, "profession", "professions");
  const skillNameById = new Map(professionSkills.map((skill) => [Number(skill.id), skill.name]));

  renderClaimSummary(claim);

  const professionStats = {};
  const rows = [];

  for (const citizen of citizens) {
    const username = citizen.userName ?? citizen.username ?? citizen.player?.username ?? `Player ${citizen.entityId}`;
    const playerId = citizen.entityId ?? citizen.playerEntityId ?? citizen.player?.entityId;

    let professionXp = Number(citizen.totalXP ?? 0);
    let highestProfession = "N/A";

    const levelBySkillId = citizen.skills ?? {};
    if (levelBySkillId && typeof levelBySkillId === "object") {
      const ranked = Object.entries(levelBySkillId)
        .map(([skillId, level]) => ({
          skillId: Number(skillId),
          level: Number(level ?? 0),
          name: skillNameById.get(Number(skillId)),
        }))
        .filter((entry) => entry.name)
        .sort((a, b) => b.level - a.level);

      if (ranked.length) {
        highestProfession = `${ranked[0].name} (Lv ${ranked[0].level})`;
      }
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

        const experienceEntries = pluckArray(playerPayload?.player ?? playerPayload, "experience");
        const professionXpEntries = experienceEntries.filter((entry) => skillNameById.has(Number(entry.skill_id)));
        if (professionXpEntries.length) {
          professionXp = professionXpEntries.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
        }

        for (const entry of professionXpEntries) {
          const skillName = skillNameById.get(Number(entry.skill_id));
          if (!skillName) continue;

          if (!professionStats[skillName]) {
            professionStats[skillName] = { totalXp: 0, totalLevel: 0, players: 0 };
          }

          professionStats[skillName].totalXp += Number(entry.quantity ?? 0);
        }
      } catch (error) {
        gear = {
          tools: [`Unable to load player details (${error.message})`],
          clothesArmor: [],
          accessories: [],
        };
      }
    }

    for (const [skillId, level] of Object.entries(levelBySkillId)) {
      const skillName = skillNameById.get(Number(skillId));
      if (!skillName) continue;

      if (!professionStats[skillName]) {
        professionStats[skillName] = { totalXp: 0, totalLevel: 0, players: 0 };
      }

      const numericLevel = Number(level ?? 0);
      professionStats[skillName].totalLevel += numericLevel;
      if (numericLevel > 0) {
        professionStats[skillName].players += 1;
      }
    }

    rows.push({
      username,
      highestProfession,
      professionXp,
      gear,
    });

    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  renderProfessionSummary(professionStats, rows.length);
  renderPlayers(rows.sort((a, b) => b.professionXp - a.professionXp));

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

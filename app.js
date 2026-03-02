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

function toolNamesFromEquipmentPayload(payload) {
  const arr = pluckArray(payload, "equipment", "items", "data");
  return arr
    .map((entry) => {
      const item = entry.item ?? entry;
      const name = item.name ?? entry.name;
      if (!name) return null;
      const slot = entry.slot ?? entry.slotName ?? item.slot ?? "slot";
      return `${name} (${slot})`;
    })
    .filter(Boolean);
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

function renderPlayers(rows) {
  playersBodyEl.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.username}</td>
      <td>${row.highestProfession}</td>
      <td>${row.professionXp.toLocaleString()}</td>
      <td>${row.tools.length ? `<ul>${row.tools.map((t) => `<li>${t}</li>`).join("")}</ul>` : "No equipped tools/gear found"}</td>
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

    let tools = [];
    if (playerId) {
      try {
        const [equipmentPayload, playerPayload] = await Promise.all([
          apiGet(`/api/players/${playerId}/equipment`),
          apiGet(`/api/players/${playerId}`),
        ]);

        tools = toolNamesFromEquipmentPayload(equipmentPayload);

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
        tools = [`Unable to load player details (${error.message})`];
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
      tools,
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

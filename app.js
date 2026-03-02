const API_BASE = "https://bitjita.com";
const USER_AGENT = "bitjita-claim-xp-tool-tracker/1.0";

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

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "x-app-identifier": USER_AGENT,
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

function normalizeSkill(skill) {
  return {
    name: skill.name ?? skill.skillName ?? "Unknown",
    level: Number(skill.level ?? skill.currentLevel ?? 0),
    xp: Number(skill.experience ?? skill.xp ?? skill.totalXp ?? 0),
  };
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

  const claim = claimPayload.data ?? claimPayload;
  const citizens = pluckArray(citizensPayload, "citizens");
  const professionNames = new Set([
    ...pluckArray(skillsPayload, "profession", "professions").map((s) => s.name),
    ...pluckArray(skillsPayload, "data").map((s) => s.name),
  ].filter(Boolean));

  renderClaimSummary(claim);

  const professionStats = {};
  const rows = [];

  for (const citizen of citizens) {
    const username = citizen.username ?? citizen.player?.username ?? `Player ${citizen.entityId}`;
    const playerId = citizen.entityId ?? citizen.playerEntityId ?? citizen.player?.entityId;
    const skillEntries = pluckArray(citizen, "skills").map(normalizeSkill);
    const professionSkills = skillEntries.filter((s) => professionNames.has(s.name) || s.name.toLowerCase().includes("craft") || s.name.toLowerCase().includes("smith") || s.name.toLowerCase().includes("wood") || s.name.toLowerCase().includes("mining"));

    for (const skill of professionSkills) {
      if (!professionStats[skill.name]) {
        professionStats[skill.name] = { totalXp: 0, totalLevel: 0, players: 0 };
      }
      professionStats[skill.name].totalXp += skill.xp;
      professionStats[skill.name].totalLevel += skill.level;
      professionStats[skill.name].players += 1;
    }

    const highest = professionSkills.sort((a, b) => b.level - a.level)[0];
    const professionXp = professionSkills.reduce((sum, s) => sum + s.xp, 0);

    let tools = [];
    if (playerId) {
      try {
        const equipmentPayload = await apiGet(`/api/players/${playerId}/equipment`);
        tools = toolNamesFromEquipmentPayload(equipmentPayload);
      } catch (error) {
        tools = [`Unable to load equipment (${error.message})`];
      }
    }

    rows.push({
      username,
      highestProfession: highest ? `${highest.name} (Lv ${highest.level})` : "N/A",
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

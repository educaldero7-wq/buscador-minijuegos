const state = {
  query: "",
  selectedTags: new Set(),
  pace: "all",
  session: JSON.parse(localStorage.getItem("virusPartySession") || "[]"),
  presets: JSON.parse(localStorage.getItem("virusPartyPresets") || "[]"),
};

let games = [];
let allTags = [];

const els = {
  searchInput: document.querySelector("#searchInput"),
  tagFilters: document.querySelector("#tagFilters"),
  paceFilters: document.querySelector("#paceFilters"),
  gamesGrid: document.querySelector("#gamesGrid"),
  resultCount: document.querySelector("#resultCount"),
  selectedCount: document.querySelector("#selectedCount"),
  sessionList: document.querySelector("#sessionList"),
  sessionMeta: document.querySelector("#sessionMeta"),
  recommendationList: document.querySelector("#recommendationList"),
  clearSession: document.querySelector("#clearSession"),
  presetForm: document.querySelector("#presetForm"),
  presetName: document.querySelector("#presetName"),
  presetList: document.querySelector("#presetList"),
  installApp: document.querySelector("#installApp"),
  installHint: document.querySelector("#installHint"),
};

const colors = ["#187c7a", "#d55f4c", "#4c9a67", "#725ac1", "#f3b84b", "#3b82a0", "#a8552f", "#2f855a"];
let deferredInstallPrompt = null;

async function loadCatalog() {
  try {
    const response = await fetch("catalogo-minijuegos.json");
    if (!response.ok) throw new Error("No se pudo cargar el catálogo");
    const catalog = await response.json();
    games = catalog.map(normalizeGame);
    allTags = [...new Set(games.flatMap((game) => game.tags))].sort((a, b) => a.localeCompare(b, "es"));
    state.session = state.session.filter((id) => getGame(id));
    state.presets = state.presets.map((preset) => ({
      ...preset,
      session: preset.session.filter((id) => games.some((game) => game.id === id)),
    }));
    saveState();
    renderAll();
  } catch (error) {
    els.gamesGrid.innerHTML = `<div class="empty-state">No he podido cargar catalogo-minijuegos.json. Abre la app desde el servidor local.</div>`;
    els.resultCount.textContent = "Catálogo no disponible";
  }
}

function normalizeGame(raw, index) {
  const tags = [
    ...(raw.tags || []),
    toTag(raw.categoria_principal),
    raw.energia ? `energia-${raw.energia}` : "",
    raw.dificultad_gm ? `gm-${raw.dificultad_gm}` : "",
    raw.espacio ? `espacio-${raw.espacio}` : "",
    toTag(raw.modo),
    raw.edad && raw.edad !== "mixto" ? toTag(raw.edad) : "",
  ].filter(Boolean);

  return {
    id: raw.id,
    name: raw.nombre,
    description: raw.descripcion_corta,
    category: raw.categoria_principal,
    duration: raw.duracion_minutos,
    players: `${raw.jugadores_min}-${raw.jugadores_max}`,
    pace: raw.energia,
    physical: raw.actividad_fisica,
    gmDifficulty: raw.dificultad_gm,
    space: raw.espacio,
    noise: raw.ruido,
    setup: raw.montaje,
    mode: raw.modo,
    age: raw.edad,
    material: raw.material || [],
    preparation: raw.preparacion || [],
    howToPlay: raw.como_se_juega || [],
    scoring: raw.puntuacion,
    variants: raw.variantes || [],
    gmLine: raw.frase_gm,
    recommended: raw.recomendados || [],
    tags: [...new Set(tags)],
    color: colors[index % colors.length],
  };
}

function saveState() {
  localStorage.setItem("virusPartySession", JSON.stringify(state.session));
  localStorage.setItem("virusPartyPresets", JSON.stringify(state.presets));
}

function getGame(id) {
  return games.find((game) => game.id === id);
}

function gameMatches(game) {
  const searchable = [
    game.name,
    game.description,
    game.category,
    game.pace,
    game.players,
    `${game.duration} min`,
    game.gmDifficulty,
    game.space,
    game.noise,
    game.setup,
    game.mode,
    game.age,
    ...game.tags,
    ...game.material,
  ]
    .join(" ")
    .toLowerCase();
  const matchesQuery = searchable.includes(state.query.toLowerCase().trim());
  const matchesTags = [...state.selectedTags].every((tag) => game.tags.includes(tag));
  const matchesPace = state.pace === "all" || game.pace === state.pace;
  return matchesQuery && matchesTags && matchesPace;
}

function renderTagFilters() {
  els.tagFilters.innerHTML = allTags
    .map((tag) => {
      const active = state.selectedTags.has(tag) ? " active" : "";
      return `<button class="chip${active}" type="button" data-tag="${tag}">${tag}</button>`;
    })
    .join("");
}

function renderGames() {
  const filtered = games.filter(gameMatches);
  els.resultCount.textContent = `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`;

  if (filtered.length === 0) {
    els.gamesGrid.innerHTML = `<div class="empty-state">No hay minijuegos con esos filtros.</div>`;
    return;
  }

  els.gamesGrid.innerHTML = filtered
    .map((game) => {
      const selected = state.session.includes(game.id);
      const initials = game.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2);
      return `
        <article class="game-card">
          <div class="logo" style="background:${game.color}">${initials}</div>
          <h3>${game.name}</h3>
          <p class="game-description">${game.description}</p>
          <div class="card-meta">
            <span>${game.duration} min</span>
            <span>${game.players} jugadores</span>
            <span>${energyLabel(game.pace)}</span>
            <span>GM ${game.gmDifficulty}</span>
          </div>
          <div class="game-tags">${game.tags.slice(0, 8).map((tag) => `<span>${tag}</span>`).join("")}</div>
          <details>
            <summary>Ficha GM</summary>
            <div class="game-details">
              <p><strong>Material:</strong> ${listText(game.material)}</p>
              <p><strong>Preparación:</strong> ${listText(game.preparation)}</p>
              <p><strong>Puntuación:</strong> ${game.scoring}</p>
              <p><strong>Frase GM:</strong> ${game.gmLine}</p>
            </div>
          </details>
          <button class="${selected ? "selected" : ""}" type="button" data-game="${game.id}">
            ${selected ? "Quitar" : "Añadir"}
          </button>
        </article>
      `;
    })
    .join("");
}

function renderSession() {
  const selectedGames = state.session.map(getGame).filter(Boolean);
  const totalDuration = selectedGames.reduce((sum, game) => sum + game.duration, 0);
  els.selectedCount.textContent = selectedGames.length;
  els.sessionMeta.textContent = selectedGames.length
    ? `${totalDuration} min aprox. · ${selectedGames.map((game) => `${game.players} jug.`).join(", ")}`
    : "Añade juegos para empezar";
  els.sessionList.innerHTML = selectedGames.length
    ? selectedGames
        .map(
          (game) => `
            <li>
              <strong>${game.name}</strong>
              <small>${game.duration} min · ${energyLabel(game.pace)} · ${game.category} · ${game.tags.slice(0, 3).join(", ")}</small>
            </li>
          `,
        )
        .join("")
    : `<li><strong>Sesión vacía</strong><small>Elige minijuegos del buscador.</small></li>`;
}

function renderRecommendations() {
  const selectedGames = state.session.map(getGame).filter(Boolean);
  const directIds = selectedGames.flatMap((game) => game.recommended);
  const usedTags = new Set(selectedGames.flatMap((game) => game.tags));
  const directRecommendations = directIds
    .map(getGame)
    .filter((game, index, list) => game && !state.session.includes(game.id) && list.findIndex((item) => item?.id === game.id) === index);
  const tagRecommendations = games
    .filter((game) => !state.session.includes(game.id) && !directRecommendations.some((item) => item.id === game.id))
    .map((game) => ({
      ...game,
      score:
        game.tags.filter((tag) => usedTags.has(tag)).length * 2 +
        (game.pace === "media" ? 1 : 0) +
        (game.gmDifficulty === "facil" ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const candidates = [...directRecommendations, ...tagRecommendations].slice(0, 3);

  els.recommendationList.innerHTML = candidates.length
    ? candidates
        .map(
          (game) => `
            <article class="recommendation">
              <strong>${game.name}</strong>
              <p>${reasonFor(game, usedTags, directIds)}</p>
              <button type="button" data-recommendation="${game.id}">Añadir</button>
            </article>
          `,
        )
        .join("")
    : `<span class="card-meta">Añade un juego para generar recomendaciones.</span>`;
}

function renderPresets() {
  els.presetList.innerHTML = state.presets.length
    ? state.presets
        .map(
          (preset) => `
            <span class="preset-item">
              <button class="preset-pill" type="button" data-preset="${preset.id}">
                ${preset.name}
              </button>
              <button class="preset-delete" type="button" aria-label="Borrar ${preset.name}" data-delete-preset="${preset.id}">
                x
              </button>
            </span>
          `,
        )
        .join("")
    : `<span class="card-meta">Aún no hay presets guardados.</span>`;
}

function energyLabel(energy) {
  return {
    baja: "Energía baja",
    media: "Energía media",
    alta: "Energía alta",
  }[energy] || "Energía sin definir";
}

function listText(items) {
  return items.length ? items.join(", ") : "Sin material especial";
}

function toTag(value) {
  return value
    ?.toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function reasonFor(game, usedTags, directIds) {
  const shared = game.tags.filter((tag) => usedTags.has(tag));
  if (directIds.includes(game.id)) return "Recomendado directamente por el catálogo.";
  if (shared.length) return `Conecta con ${shared.slice(0, 2).join(" y ")}.`;
  return "Encaja como variación para ampliar la sesión.";
}

function renderAll() {
  renderTagFilters();
  renderGames();
  renderSession();
  renderRecommendations();
  renderPresets();
}

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderGames();
});

els.tagFilters.addEventListener("click", (event) => {
  const tag = event.target.dataset.tag;
  if (!tag) return;
  if (state.selectedTags.has(tag)) state.selectedTags.delete(tag);
  else state.selectedTags.add(tag);
  renderAll();
});

els.paceFilters.addEventListener("click", (event) => {
  const pace = event.target.dataset.pace;
  if (!pace) return;
  state.pace = pace;
  els.paceFilters.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.pace === pace);
  });
  renderGames();
});

els.gamesGrid.addEventListener("click", (event) => {
  const gameId = event.target.dataset.game;
  if (!gameId) return;
  if (state.session.includes(gameId)) state.session = state.session.filter((id) => id !== gameId);
  else state.session.push(gameId);
  saveState();
  renderAll();
});

els.recommendationList.addEventListener("click", (event) => {
  const gameId = event.target.dataset.recommendation;
  if (!gameId || state.session.includes(gameId)) return;
  state.session.push(gameId);
  saveState();
  renderAll();
});

els.clearSession.addEventListener("click", () => {
  state.session = [];
  saveState();
  renderAll();
});

els.presetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.presetName.value.trim();
  if (!name || state.session.length === 0) return;
  state.presets = [
    { id: crypto.randomUUID(), name, session: [...state.session], createdAt: new Date().toISOString() },
    ...state.presets,
  ];
  els.presetName.value = "";
  saveState();
  renderPresets();
});

els.presetList.addEventListener("click", (event) => {
  const deletePresetId = event.target.dataset.deletePreset;
  if (deletePresetId) {
    state.presets = state.presets.filter((item) => item.id !== deletePresetId);
    saveState();
    renderPresets();
    return;
  }

  const presetId = event.target.dataset.preset;
  const preset = state.presets.find((item) => item.id === presetId);
  if (!preset) return;
  state.session = [...preset.session];
  saveState();
  renderAll();
});

function setupPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  if (isStandalone) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installApp.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installApp.hidden = true;
    els.installHint.hidden = true;
  });

  if (isIos) {
    els.installHint.hidden = false;
  }
}

els.installApp.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installApp.hidden = true;
});

setupPwa();
loadCatalog();

(function () {
  "use strict";

  const query = new URLSearchParams(window.location.search);
  const demo = query.get("demo") === "1";
  const state = {
    meta: null,
    phase: "",
    participants: {},
    players: {},
    leaderboard: [],
    previousRanks: new Map(),
    previousGold: new Map(),
    refs: [],
    renderTimer: null,
    clock: null
  };
  const dom = {};

  function safeKey(value) {
    return String(value || "sense-id").trim().replace(/[.#$\[\]/]/g, "_").slice(0, 100) || "sense-id";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function normalisePlayer(player) {
    return {
      studentId: String(player.studentId || player.AlumneId || ""),
      name: String(player.name || player.Nom || "Jugador"),
      gold: Number(player.gold != null ? player.gold : player.Or || 0),
      correct: Number(player.correct != null ? player.correct : player.Encerts || 0),
      incorrect: Number(player.incorrect != null ? player.incorrect : player.Errors || 0),
      position: Number(player.position || player.Posicio || 0)
    };
  }

  function rankedPlayers() {
    const final = state.phase === "RESULTS" && Array.isArray(state.leaderboard) && state.leaderboard.length;
    const players = final ? state.leaderboard.map(normalisePlayer) : Object.values(state.players || {}).map(normalisePlayer);
    if (!final) {
      const joined = new Set(players.map((player) => player.studentId));
      Object.values(state.participants || {}).forEach((participant) => {
        if (!joined.has(participant.studentId)) players.push(normalisePlayer(participant));
      });
    }
    return players.sort((a, b) => b.gold - a.gold || b.correct - a.correct || a.name.localeCompare(b.name, "ca", { sensitivity: "base" }));
  }

  function scheduleRender() {
    if (state.renderTimer) return;
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = null;
      renderRanking();
      tick();
    }, 120);
  }

  function rowFor(player) {
    const key = safeKey(player.studentId);
    let row = [...dom.ranking.children].find((item) => item.dataset.player === key);
    if (!row) {
      row = document.createElement("article");
      row.className = "projector-row";
      row.dataset.player = key;
      row.innerHTML = '<b class="projector-rank"></b><strong class="projector-name"></strong><span class="projector-gold"><b></b><i>◆</i></span>';
    }
    return row;
  }

  function renderRanking() {
    const players = rankedPlayers();
    dom.empty.classList.toggle("hidden", Boolean(state.meta));
    dom.ranking.classList.toggle("hidden", !state.meta);
    if (!state.meta) return;

    const twoColumns = players.length > 12;
    dom.ranking.classList.toggle("two-columns", twoColumns);
    dom.ranking.style.gridTemplateRows = twoColumns ? `repeat(${Math.ceil(players.length / 2)}, minmax(0, 1fr))` : "";

    const oldRects = new Map([...dom.ranking.children].map((row) => [row.dataset.player, row.getBoundingClientRect()]));
    const activeKeys = new Set();
    players.forEach((player, index) => {
      const key = safeKey(player.studentId);
      const row = rowFor(player);
      const oldRank = state.previousRanks.get(key);
      const oldGold = state.previousGold.get(key);
      activeKeys.add(key);
      row.querySelector(".projector-rank").textContent = index + 1;
      row.querySelector(".projector-name").textContent = player.name;
      row.querySelector(".projector-gold b").textContent = Math.round(player.gold);
      dom.ranking.appendChild(row);
      row.classList.remove("rise", "fall", "gold-change");
      if (oldRank != null && oldRank !== index + 1) row.classList.add(oldRank > index + 1 ? "rise" : "fall");
      if (oldGold != null && oldGold !== player.gold) row.classList.add("gold-change");
      state.previousRanks.set(key, index + 1);
      state.previousGold.set(key, player.gold);
    });
    [...dom.ranking.children].forEach((row) => { if (!activeKeys.has(row.dataset.player)) row.remove(); });

    [...dom.ranking.children].forEach((row) => {
      const oldRect = oldRects.get(row.dataset.player);
      if (!oldRect || !row.animate) return;
      const newRect = row.getBoundingClientRect();
      const delta = oldRect.top - newRect.top;
      if (Math.abs(delta) > 1) row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 620, easing: "cubic-bezier(.2,.8,.25,1)" });
    });
  }

  function formatTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function tick() {
    if (!state.meta) return;
    const now = Date.now();
    const startAt = Number(state.meta.startAt || 0);
    const remaining = Math.max(0, Number(state.meta.endAt || 0) - now);
    const blindSeconds = Number(state.meta.blindSeconds || 20);
    const sealed = state.phase !== "RESULTS" && now >= startAt && remaining > 0 && remaining <= blindSeconds * 1000;
    dom.title.textContent = state.phase === "RESULTS" ? "Classificació final" : (state.meta.title || "Golden Quest");
    dom.phase.textContent = state.phase === "RESULTS" ? "RESULTAT FINAL" : now < startAt ? "COMPTE ARRERE" : "CLASSIFICACIÓ EN DIRECTE";
    dom.timer.textContent = state.phase === "RESULTS" ? "FINAL" : formatTime(now < startAt ? startAt - now : remaining);
    dom.seal.classList.toggle("hidden", !sealed);
    dom.sealTimer.textContent = Math.max(1, Math.ceil(remaining / 1000));
  }

  function listen(ref, path, key) {
    const child = ref.child(path);
    const listener = (snapshot) => {
      const value = snapshot.val();
      state[key] = value != null ? value : (key === "meta" ? null : key === "phase" ? "" : key === "leaderboard" ? [] : {});
      scheduleRender();
    };
    child.on("value", listener, () => {
      dom.empty.querySelector("strong").textContent = "No s’ha pogut llegir la batalla";
      dom.empty.querySelector("small").textContent = "Revisa les regles de Firebase i torna-ho a provar.";
    });
    state.refs.push({ child, listener });
  }

  function startFirebase() {
    if (!window.firebase || !window.firebaseConfig || !window.GAMIFICACIO_CONFIG) return;
    if (window.GAMIFICACIO_CONFIG.firebaseEnabled !== true) {
      dom.empty.querySelector("strong").textContent = "La batalla en directe està desactivada";
      dom.empty.querySelector("small").textContent = "Activa Firebase només després de publicar i validar les regles V2.";
      return;
    }
    if (!window.firebase.apps.length) window.firebase.initializeApp(window.firebaseConfig);
    const db = window.firebase.database();
    const config = window.GAMIFICACIO_CONFIG;
    const ref = db.ref(`${safeKey(config.firebaseRoot)}/battles/${safeKey(config.groupId)}/current`);
    listen(ref, "meta", "meta");
    listen(ref, "phase", "phase");
    listen(ref, "participants", "participants");
    listen(ref, "players", "players");
    listen(ref, "leaderboard", "leaderboard");
  }

  function startDemo() {
    const sealDemo = query.get("seal") === "1";
    state.meta = { title: "Batalla del dia · Enters", startAt: Date.now() - 60000, endAt: Date.now() + (sealDemo ? 18000 : 110000), blindSeconds: 20 };
    state.phase = "RUNNING";
    state.players = {
      a: { studentId: "a", name: "Aina", gold: 240, correct: 8 }, b: { studentId: "b", name: "Biel", gold: 195, correct: 7 },
      c: { studentId: "c", name: "Carla", gold: 160, correct: 7 }, d: { studentId: "d", name: "Dídac", gold: 130, correct: 6 },
      e: { studentId: "e", name: "Elena", gold: 95, correct: 5 }, f: { studentId: "f", name: "Ferran", gold: 70, correct: 4 }
    };
    if (query.get("crowd") === "1") {
      ["Gala", "Hèctor", "Iris", "Joan", "Khadija", "Lluc", "Mar", "Núria", "Omar", "Pau", "Queralt", "Roc", "Sara", "Toni"].forEach((name, index) => {
        state.players[`extra-${index}`] = { studentId: `extra-${index}`, name, gold: 65 - index * 3, correct: Math.max(1, 4 - Math.floor(index / 4)) };
      });
    }
    scheduleRender();
    window.setInterval(() => {
      const keys = Object.keys(state.players);
      const key = keys[Math.floor(Math.random() * keys.length)];
      state.players[key].gold += 10 + Math.floor(Math.random() * 35);
      state.players[key].correct += 1;
      scheduleRender();
    }, 1800);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  function init() {
    dom.title = document.getElementById("projectorTitle");
    dom.phase = document.getElementById("projectorPhase");
    dom.timer = document.getElementById("projectorTimer");
    dom.fullscreen = document.getElementById("projectorFullscreen");
    dom.empty = document.getElementById("projectorEmpty");
    dom.ranking = document.getElementById("projectorRanking");
    dom.seal = document.getElementById("projectorSeal");
    dom.sealTimer = document.getElementById("projectorSealTimer");
    dom.fullscreen.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", () => { dom.fullscreen.textContent = document.fullscreenElement ? "✕ Eixir de pantalla completa" : "⛶ Pantalla completa"; });
    state.clock = window.setInterval(tick, 250);
    if (demo) startDemo(); else startFirebase();
  }

  document.addEventListener("DOMContentLoaded", init);
}());

(function () {
  "use strict";

  const state = {
    bridge: null,
    battle: null,
    setupType: "DIA",
    unsubscribe: null,
    timer: null,
    finalizing: false,
    started: false
  };
  const dom = {};

  function cacheDom() {
    [
      "battleMissionSelect", "prepareDailyBattleButton", "prepareFinalBattleButton", "battleFinalAvailability", "battleHistoryButton",
      "teacherBattleLive", "teacherBattlePhase", "teacherBattleTitle", "teacherBattleTimer", "teacherBattleRanking", "openBattleProjectorButton", "finishBattleButton", "clearBattleButton",
      "battleSetupDialog", "battleSetupTitle", "battleSetupDescription", "battleParticipantList", "battleSelectedCount", "selectAllActiveButton", "launchBattleButton",
      "battleHistoryDialog", "battleHistoryBody"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function start(bridge) {
    state.bridge = bridge;
    if (state.started) {
      refreshCatalog();
      return;
    }
    state.started = true;
    bindEvents();
    refreshCatalog();
    state.unsubscribe = window.GameBattle.subscribeTeacher(handleBattle, (error) => bridge.toast(error.message, "error"));
    state.timer = window.setInterval(tick, 500);
  }

  function stop() {
    if (state.unsubscribe) state.unsubscribe();
    if (state.timer) window.clearInterval(state.timer);
    state.unsubscribe = null;
    state.timer = null;
    state.started = false;
  }

  function catalog() {
    return state.bridge ? state.bridge.getCatalog() : { missions: [] };
  }

  function liveItems() {
    return state.bridge ? state.bridge.getItems() : [];
  }

  function uniqueLiveItems() {
    const byStudent = {};
    liveItems().forEach((item) => {
      if (!item.studentId) return;
      if (!byStudent[item.studentId] || Number(item.updatedAt || 0) > Number(byStudent[item.studentId].updatedAt || 0)) byStudent[item.studentId] = item;
    });
    return Object.values(byStudent).sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));
  }

  function refreshCatalog() {
    if (!dom.battleMissionSelect) return;
    const current = dom.battleMissionSelect.value;
    const missions = (catalog().missions || []).filter((mission) => mission.unlocked);
    dom.battleMissionSelect.innerHTML = '<option value="">Tria la missió treballada</option>';
    missions.forEach((mission) => {
      const option = document.createElement("option");
      option.value = mission.missionId;
      const sectorMissions = missions.filter((item) => item.sectorId === mission.sectorId).sort((a, b) => a.order - b.order);
      const position = sectorMissions.findIndex((item) => item.missionId === mission.missionId) + 1;
      option.textContent = `${mission.sectorId || "Sector"} · Missió ${position || "?"}: ${mission.title}`;
      dom.battleMissionSelect.appendChild(option);
    });
    if (current && missions.some((mission) => mission.missionId === current)) dom.battleMissionSelect.value = current;
    else {
      const active = uniqueLiveItems().filter((item) => Date.now() - Number(item.updatedAt || 0) <= 10 * 60 * 1000);
      const missionCounts = {};
      active.forEach((item) => { missionCounts[item.missionId] = Number(missionCounts[item.missionId] || 0) + 1; });
      const dominant = Object.keys(missionCounts).sort((a, b) => missionCounts[b] - missionCounts[a])[0];
      dom.battleMissionSelect.value = dominant && missions.some((mission) => mission.missionId === dominant) ? dominant : (missions.length ? missions[missions.length - 1].missionId : "");
    }
    updateFinalAvailability();
  }

  function selectedMission() {
    return (catalog().missions || []).find((mission) => mission.missionId === dom.battleMissionSelect.value) || null;
  }

  function isFifthMission(mission) {
    if (!mission) return false;
    const sectorMissions = (catalog().missions || []).filter((item) => item.sectorId === mission.sectorId).sort((a, b) => a.order - b.order).slice(0, 5);
    return Boolean(sectorMissions[4] && sectorMissions[4].missionId === mission.missionId);
  }

  function updateFinalAvailability() {
    const mission = selectedMission();
    const finalAvailable = isFifthMission(mission);
    dom.prepareDailyBattleButton.disabled = !mission || Boolean(state.battle && state.battle.phase !== "RESULTS");
    dom.prepareFinalBattleButton.disabled = !mission || !finalAvailable || Boolean(state.battle && state.battle.phase !== "RESULTS");
    dom.battleFinalAvailability.textContent = finalAvailable
      ? "Missió 5: pots triar la batalla del dia o el repàs de les cinc missions (20 preguntes)."
      : "La batalla final apareix en seleccionar la missió 5 d'un sector.";
  }

  function prepare(type) {
    const mission = selectedMission();
    if (!mission) {
      state.bridge.toast("Tria primer una missió.", "warning");
      return;
    }
    if (type === "FINAL_SECTOR" && !isFifthMission(mission)) return;
    state.setupType = type;
    dom.battleSetupTitle.textContent = type === "FINAL_SECTOR" ? "Batalla final del sector" : "Batalla del dia";
    dom.battleSetupDescription.textContent = type === "FINAL_SECTOR"
      ? "Es carregaran 20 preguntes: quatre de cadascuna de les cinc missions. Duració: 10 minuts."
      : "Es carregaran les 15 preguntes de la missió: cinc de cada nivell. Duració: 7 minuts.";
    renderParticipantList();
    dom.battleSetupDialog.showModal();
  }

  function renderParticipantList() {
    const now = Date.now();
    const items = uniqueLiveItems();
    dom.battleParticipantList.innerHTML = "";
    items.forEach((item) => {
      const active = now - Number(item.updatedAt || 0) <= 10 * 60 * 1000;
      const label = document.createElement("label");
      label.className = `battle-participant${active ? " active" : ""}`;
      label.innerHTML = `<input type="checkbox" value="${window.GameMath.escapeHtml(item.studentId)}" ${active ? "checked" : ""}><span><strong>${window.GameMath.escapeHtml(item.studentName || item.studentId)}</strong><small>${active ? "Actiu en els últims 10 min" : "Inactiu"}</small></span>`;
      label.querySelector("input").addEventListener("change", updateSelectedCount);
      dom.battleParticipantList.appendChild(label);
    });
    if (!items.length) dom.battleParticipantList.innerHTML = '<p class="empty-mini">Encara no hi ha alumnat connectat. Han d’entrar primer en una missió.</p>';
    updateSelectedCount();
  }

  function updateSelectedCount() {
    const count = dom.battleParticipantList.querySelectorAll('input[type="checkbox"]:checked').length;
    dom.battleSelectedCount.textContent = `${count} seleccionats`;
    dom.launchBattleButton.disabled = count < 2;
  }

  function markActive() {
    const now = Date.now();
    const activeIds = uniqueLiveItems().filter((item) => now - Number(item.updatedAt || 0) <= 10 * 60 * 1000).map((item) => item.studentId);
    dom.battleParticipantList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = activeIds.includes(input.value); });
    updateSelectedCount();
  }

  async function launch() {
    const participantIds = [...dom.battleParticipantList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    if (participantIds.length < 2) return;
    dom.launchBattleButton.disabled = true;
    state.bridge.setLoading(true, "Carregant preguntes i solucions en local…");
    try {
      const data = await window.GameData.call("battle_prepare", {
        battleType: state.setupType,
        missionId: dom.battleMissionSelect.value,
        participantIds
      });
      if (!data.battle || !data.battle.questions || data.battle.questions.length < (state.setupType === "FINAL_SECTOR" ? 20 : 15)) {
        throw new Error("El banc de batalla no té totes les preguntes necessàries.");
      }
      await window.GameBattle.teacherLaunch(data.battle);
      dom.battleSetupDialog.close();
      state.bridge.toast(`${data.questionCount} preguntes precarregades. Comença el compte arrere.`, "good", 7000);
    } catch (error) {
      state.bridge.toast(error.message, "error", 8500);
    } finally {
      state.bridge.setLoading(false);
      updateSelectedCount();
    }
  }

  function handleBattle(battle) {
    state.battle = battle;
    dom.teacherBattleLive.classList.toggle("hidden", !battle || !battle.meta);
    updateFinalAvailability();
    renderLive();
  }

  function sortedPlayers(includeWaiting) {
    const players = Object.values(state.battle && state.battle.players || {});
    if (includeWaiting) {
      const joined = new Set(players.map((player) => player.studentId));
      Object.values(state.battle && state.battle.participants || {}).forEach((participant) => {
        if (!joined.has(participant.studentId)) players.push({ ...participant, gold: 0, correct: 0, incorrect: 0, attempts: 0, waiting: true });
      });
    }
    return players.sort((a, b) =>
      Number(b.gold || 0) - Number(a.gold || 0) || Number(b.correct || 0) - Number(a.correct || 0) || String(a.name || "").localeCompare(String(b.name || ""))
    );
  }

  function teacherPlayers() {
    const ranked = sortedPlayers(true);
    const positions = new Map(ranked.map((player, index) => [player.studentId, index + 1]));
    return ranked.slice().sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "ca", { sensitivity: "base" })
    ).map((player) => ({ ...player, position: positions.get(player.studentId) || "—" }));
  }

  function tick() {
    if (!state.battle || !state.battle.meta) return;
    const now = Date.now();
    const startAt = Number(state.battle.meta.startAt || 0);
    const remaining = Math.max(0, Number(state.battle.meta.endAt || 0) - now);
    dom.teacherBattleTimer.textContent = formatTime(now < startAt ? startAt - now : remaining);
    renderLive();
    if (remaining <= 0 && state.battle.phase !== "RESULTS" && !state.finalizing) finalize(false);
  }

  function formatTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function renderLive() {
    if (!state.battle || !state.battle.meta) return;
    const remaining = Math.max(0, Number(state.battle.meta.endAt || 0) - Date.now());
    dom.teacherBattleTitle.textContent = state.battle.meta.title || "Batalla";
    dom.teacherBattlePhase.textContent = state.battle.phase === "RESULTS" ? "FINALITZADA" : remaining <= 0 ? "GUARDANT" : Date.now() < Number(state.battle.meta.startAt || 0) ? "COMPTE ARRERE" : "EN DIRECTE";
    dom.finishBattleButton.disabled = state.finalizing || state.battle.phase === "RESULTS";
    dom.teacherBattleRanking.classList.remove("blind");
    dom.teacherBattleRanking.innerHTML = "";
    teacherPlayers().forEach((player) => {
      const row = document.createElement("div");
      row.className = `teacher-rank-row${player.waiting ? " waiting" : ""}`;
      row.innerHTML = `<b title="Posició actual">${player.position}</b><strong>${window.GameMath.escapeHtml(player.name || "Jugador")}</strong><span>${Math.round(Number(player.gold || 0))} ◆</span><small>${player.waiting ? "Esperant connexió…" : `${Number(player.correct || 0)} encerts · ${Number(player.incorrect || 0)} errors · ${Number(player.attempts || 0)} intents`}</small>`;
      dom.teacherBattleRanking.appendChild(row);
    });
  }

  function openProjector() {
    const demo = window.GameData.isDemo() ? "?demo=1" : "";
    const projector = window.open(`batalla-classificacio.html${demo}`, "gamificacio-battle-projector");
    if (!projector) state.bridge.toast("El navegador ha bloquejat la finestra del projector.", "warning", 7000);
    else projector.focus();
  }

  async function finalize(early) {
    if (!state.battle || !state.battle.meta || state.finalizing || state.battle.phase === "RESULTS") return;
    state.finalizing = true;
    dom.finishBattleButton.disabled = true;
    state.bridge.setLoading(true, "Guardant el resultat i preparant els premis…");
    try {
      if (early) {
        state.battle.meta.endAt = Date.now();
        await window.GameBattle.battleRef().child("meta/endAt").set(state.battle.meta.endAt);
      }
      const players = sortedPlayers(false);
      const response = await window.GameData.call("battle_finalize", {
        battle: { ...state.battle.meta, groupId: window.GAMIFICACIO_CONFIG.groupId },
        results: players.map((player) => ({
          studentId: player.studentId, name: player.name, gold: player.gold, correct: player.correct,
          incorrect: player.incorrect, attempts: player.attempts, specials: player.specials, avatar: player.avatar || ""
        })),
        attempts: state.battle.attempts || {}
      });
      const capture = response.capture || { winners: [], pool: [] };
      await window.GameBattle.setPhase("RESULTS", {
        finishedAt: window.firebase && window.firebase.database ? window.firebase.database.ServerValue.TIMESTAMP : Date.now(),
        leaderboard: response.leaderboard || players,
        capture: {
          winners: capture.winners || [],
          pool: capture.pool || [],
          currentWinnerId: capture.currentWinnerId || (capture.winners && capture.winners.length && capture.pool && capture.pool.length ? capture.winners[0] : ""),
          claims: {}
        }
      });
      state.bridge.toast("Batalla guardada. Els guanyadors ja poden triar avatar.", "good", 8000);
    } catch (error) {
      state.bridge.toast(error.message, "error", 9000);
    } finally {
      state.finalizing = false;
      state.bridge.setLoading(false);
    }
  }

  async function clearBattle() {
    if (!window.confirm("Vols cancel·lar la partida actual? No es guardaran resultats ni premis.")) return;
    await window.GameBattle.clearBattle();
    state.bridge.toast("Partida cancel·lada.", "warning");
  }

  async function openHistory() {
    state.bridge.setLoading(true, "Carregant l'historial…");
    try {
      const data = await window.GameData.call("battle_history");
      dom.battleHistoryBody.innerHTML = "";
      (data.summary || []).sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${window.GameMath.escapeHtml(row.name || row.studentId)}</td><td>${row.weekBadges}</td><td>${row.monthBadges}</td><td>${row.totalBadges}</td><td>${row.battles}</td>`;
        dom.battleHistoryBody.appendChild(tr);
      });
      dom.battleHistoryDialog.showModal();
    } catch (error) {
      state.bridge.toast(error.message, "error", 7000);
    } finally {
      state.bridge.setLoading(false);
    }
  }

  function bindEvents() {
    dom.battleMissionSelect.addEventListener("change", updateFinalAvailability);
    dom.prepareDailyBattleButton.addEventListener("click", () => prepare("DIA"));
    dom.prepareFinalBattleButton.addEventListener("click", () => prepare("FINAL_SECTOR"));
    dom.selectAllActiveButton.addEventListener("click", markActive);
    dom.launchBattleButton.addEventListener("click", launch);
    dom.openBattleProjectorButton.addEventListener("click", openProjector);
    dom.finishBattleButton.addEventListener("click", () => finalize(true));
    dom.clearBattleButton.addEventListener("click", clearBattle);
    dom.battleHistoryButton.addEventListener("click", openHistory);
  }

  function init() {
    cacheDom();
  }

  window.GameBattleTeacher = Object.freeze({ start, stop, refreshCatalog });
  document.addEventListener("DOMContentLoaded", init);
}());

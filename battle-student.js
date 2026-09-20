(function () {
  "use strict";

  const state = {
    student: null,
    battle: null,
    player: null,
    unsubscribe: null,
    timer: null,
    pendingChest: false,
    targetEffect: "",
    lastQuestionKey: "",
    penaltyHint: "",
    activeDuelId: "",
    duelResolving: {},
    dismissedBattleId: "",
    captureBusy: false,
    demoLaunched: false,
    subscribedStudentId: ""
  };
  const dom = {};

  function cacheDom() {
    [
      "battleArena", "battleTitle", "battleOwnGold", "battleTimer",
      "battleCountdown", "battleCountdownNumber", "battleQuestionScreen", "battleQuestionLevel", "battleQuestionProgress", "battleQuestion",
      "battleAnswerForm", "battleOptionGrid", "battleTextAnswerWrap", "battleAnswerInput", "battleChestScreen", "battleEffectScreen",
      "battleEffectIcon", "battleEffectTitle", "battleEffectText", "battlePenalty", "battlePenaltyTime", "battlePenaltyHint",
      "battleResults", "battleOwnFinalPosition", "battlePodium", "battleCapturePanel", "battleCaptureTitle", "battleCaptureCards", "battleLeaveButton",
      "battleTargetDialog", "battleTargetTitle", "battleTargetList", "battleCancelTarget", "battleDuelDialog", "battleDuelTitle",
      "battleDuelQuestion", "battleDuelForm", "battleDuelAnswer", "battleDuelTimer"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function setStudent(student) {
    state.student = student ? {
      studentId: student.studentId,
      name: student.name,
      avatar: student.avatar || ""
    } : null;
    const nextStudentId = state.student ? state.student.studentId : "";
    if (nextStudentId !== state.subscribedStudentId) {
      if (state.unsubscribe) state.unsubscribe();
      if (state.timer) window.clearInterval(state.timer);
      state.unsubscribe = null;
      state.timer = null;
      state.battle = null;
      state.player = null;
      state.subscribedStudentId = nextStudentId;
      hideArena();
    }
    if (state.student && !state.unsubscribe && window.GameBattle) {
      state.unsubscribe = window.GameBattle.subscribeStudent(state.student.studentId, handleBattle, () => {});
      state.timer = window.setInterval(tick, 250);
    }
    if (state.battle) handleBattle(state.battle);
    if (student && window.GameData.isDemo() && new URLSearchParams(window.location.search).get("battle") === "1" && !state.demoLaunched) launchLocalDemoBattle();
  }

  async function launchLocalDemoBattle() {
    state.demoLaunched = true;
    try {
      const data = await window.GameData.call("battle_prepare", { battleType: "DIA", missionId: "M01", participantIds: ["DEMO-01", "DEMO-02", "DEMO-03"] });
      await window.GameBattle.teacherLaunch(data.battle);
      const playersRef = window.GameBattle.battleRef().child("players");
      const now = Date.now();
      await playersRef.set({
        "DEMO-01": { studentId: "DEMO-01", name: "Aina", avatar: "avatar-01", gold: 40, correct: 2, incorrect: 0, attempts: 2, specials: 0, questionIndex: 2, penaltyUntil: 0, updatedAt: now },
        "DEMO-02": { studentId: "DEMO-02", name: "Biel", avatar: "avatar-06", gold: 80, correct: 3, incorrect: 1, attempts: 4, specials: 0, questionIndex: 4, penaltyUntil: 0, updatedAt: now },
        "DEMO-03": { studentId: "DEMO-03", name: "Carla", avatar: "avatar-11", gold: 20, correct: 1, incorrect: 1, attempts: 2, specials: 0, questionIndex: 2, penaltyUntil: 0, updatedAt: now }
      });
    } catch (error) {
      state.demoLaunched = false;
    }
  }

  function participantForMe(battle) {
    if (!state.student || !battle || !battle.participants) return null;
    return battle.participants[window.GameBattle.safeStudentId(state.student.studentId)] || null;
  }

  async function handleBattle(battle) {
    state.battle = battle;
    if (!battle || !battle.meta || !participantForMe(battle) || state.dismissedBattleId === battle.meta.battleId) {
      hideArena();
      return;
    }
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      if (!dialog.classList.contains("battle-target-dialog") && !dialog.classList.contains("battle-duel-dialog")) dialog.close();
    });
    if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    dom.battleArena.classList.remove("hidden");
    document.body.classList.add("battle-active");
    dom.battleTitle.textContent = battle.meta.title || "Batalla matemàtica";
    const key = window.GameBattle.safeStudentId(state.student.studentId);
    state.player = battle.players && battle.players[key] || null;
    if (!state.player && battle.phase !== "RESULTS") {
      await window.GameBattle.joinPlayer({ ...state.student, avatar: participantForMe(battle).avatar || state.student.avatar });
      return;
    }
    dom.battleOwnGold.textContent = Math.round(Number(state.player && state.player.gold || 0));
    processDuels();
    tick();
  }

  function hideArena() {
    if (!dom.battleArena) return;
    dom.battleArena.classList.add("hidden");
    document.body.classList.remove("battle-active");
    closeDialog(dom.battleTargetDialog);
    closeDialog(dom.battleDuelDialog);
  }

  function showOnly(name) {
    const mapping = {
      countdown: dom.battleCountdown,
      question: dom.battleQuestionScreen,
      chest: dom.battleChestScreen,
      effect: dom.battleEffectScreen,
      penalty: dom.battlePenalty,
      results: dom.battleResults
    };
    Object.entries(mapping).forEach(([key, element]) => element.classList.toggle("hidden", key !== name));
  }

  function remainingMs() {
    return Math.max(0, Number(state.battle && state.battle.meta && state.battle.meta.endAt || 0) - Date.now());
  }

  function isBlind() {
    return remainingMs() > 0 && remainingMs() <= Number(state.battle && state.battle.meta && state.battle.meta.blindSeconds || 20) * 1000;
  }

  function formatTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function tick() {
    if (!state.battle || !state.battle.meta || !participantForMe(state.battle)) return;
    const now = Date.now();
    const startAt = Number(state.battle.meta.startAt || 0);
    const endAt = Number(state.battle.meta.endAt || 0);
    if (state.battle.phase === "RESULTS") {
      dom.battleTimer.textContent = "FINAL";
      dom.battleTimer.classList.remove("danger");
      renderResults();
      return;
    }
    if (now < startAt) {
      showOnly("countdown");
      dom.battleCountdownNumber.textContent = Math.max(1, Math.ceil((startAt - now) / 1000));
      dom.battleTimer.textContent = formatTime(endAt - startAt);
      return;
    }
    if (state.battle.phase === "COUNTDOWN") window.GameBattle.setPhase("RUNNING").catch(() => {});
    const remaining = Math.max(0, endAt - now);
    dom.battleTimer.textContent = formatTime(remaining);
    dom.battleTimer.classList.toggle("danger", remaining <= 15000);
    if (remaining <= 0) {
      showOnly("countdown");
      dom.battleCountdownNumber.textContent = "◆";
      dom.battleCountdown.querySelector("p").textContent = "Calculant el tresor final…";
      return;
    }
    if (state.player && Number(state.player.penaltyUntil || 0) > now) {
      showOnly("penalty");
      dom.battlePenaltyTime.textContent = Math.ceil((Number(state.player.penaltyUntil) - now) / 1000);
      dom.battlePenaltyHint.textContent = state.penaltyHint || "Respira i torna a llegir la pregunta.";
      return;
    }
    if (state.pendingChest) return;
    renderQuestion();
    processDuelTimeout();
  }

  function playersSorted() {
    const finalPlayers = state.battle && Array.isArray(state.battle.leaderboard) && state.battle.leaderboard.length
      ? state.battle.leaderboard
      : Object.values(state.battle && state.battle.players || {});
    return finalPlayers.slice().sort((a, b) =>
      Number(b.gold || 0) - Number(a.gold || 0) || Number(b.correct || 0) - Number(a.correct || 0) || String(a.name || "").localeCompare(String(b.name || ""))
    );
  }

  function battleRivals() {
    return Object.values(state.battle && state.battle.participants || {}).filter((participant) =>
      participant.studentId !== (state.student && state.student.studentId)
    );
  }

  function avatarSpan(avatar, className = "") {
    const valid = /^avatar-(0[1-9]|1[0-5])$/.test(String(avatar || ""));
    return `<span class="avatar-sprite ${valid ? avatar : "avatar-locked"} ${className}" aria-hidden="true">${valid ? "" : "?"}</span>`;
  }

  function currentQuestion() {
    const questions = state.battle && state.battle.questions || [];
    if (!questions.length) return null;
    const index = Number(state.player && state.player.questionIndex || 0);
    return questions[index % questions.length];
  }

  async function renderQuestion() {
    const question = currentQuestion();
    if (!question) return;
    showOnly("question");
    const index = Number(state.player && state.player.questionIndex || 0);
    const key = `${question.id}|${index}`;
    if (state.lastQuestionKey === key) return;
    state.lastQuestionKey = key;
    dom.battleQuestionLevel.textContent = question.level || "MIXT";
    dom.battleQuestionProgress.textContent = `Pregunta ${index % (state.battle.questions || []).length + 1} · ronda ${Math.floor(index / (state.battle.questions || []).length) + 1}`;
    await window.GameMath.setHtml(dom.battleQuestion, question.questionHtml || "");
    const isOption = question.format === "OPCIO" && Array.isArray(question.options) && question.options.length;
    dom.battleOptionGrid.classList.toggle("hidden", !isOption);
    dom.battleTextAnswerWrap.classList.toggle("hidden", isOption);
    dom.battleOptionGrid.innerHTML = "";
    if (isOption) {
      question.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "battle-option math-content";
        button.textContent = option;
        button.addEventListener("click", () => submitAnswer(option));
        dom.battleOptionGrid.appendChild(button);
      });
      await window.GameMath.typeset(dom.battleOptionGrid);
    } else {
      dom.battleAnswerInput.value = "";
      window.setTimeout(() => dom.battleAnswerInput.focus({ preventScroll: true }), 40);
    }
  }

  async function submitAnswer(answer) {
    const question = currentQuestion();
    if (!question || state.pendingChest || remainingMs() <= 0) return;
    const correct = window.GameBattle.isCorrect(question, answer);
    state.lastQuestionKey = "";
    await window.GameBattle.recordAnswer(state.student.studentId, correct, state.battle.meta.errorPenaltySeconds || 10, question);
    if (correct) {
      state.pendingChest = true;
      showOnly("chest");
      dom.battleChestScreen.querySelectorAll(".battle-chest").forEach((chest) => { chest.disabled = false; chest.classList.remove("open"); });
    } else {
      state.penaltyHint = question.errorHint || "Revisa el primer pas.";
      showOnly("penalty");
      dom.battlePenaltyTime.textContent = state.battle.meta.errorPenaltySeconds || 10;
      dom.battlePenaltyHint.textContent = state.penaltyHint;
    }
  }

  function effectNeedsTarget(effect) {
    return ["FURTAR_10", "FURTAR_25", "INTERCANVIAR", "RETAR"].includes(effect);
  }

  async function chooseChest(button) {
    if (!state.pendingChest || button.disabled) return;
    dom.battleChestScreen.querySelectorAll(".battle-chest").forEach((chest) => { chest.disabled = true; });
    button.classList.add("open");
    let effect = window.GameBattle.pickChestEffect(state.battle.chestWeights);
    const rivals = battleRivals();
    if (!rivals.length && effectNeedsTarget(effect)) effect = "GUANYAR";
    if (isBlind() && effect === "RETAR") effect = "FURTAR_10";
    if (effectNeedsTarget(effect)) {
      state.targetEffect = effect;
      window.setTimeout(() => openTargetDialog(effect), 520);
      return;
    }
    const detail = await window.GameBattle.applySelfEffect(state.student.studentId, effect);
    window.setTimeout(() => showEffect(effect, detail), 450);
  }

  function openTargetDialog(effect) {
    const labels = { FURTAR_10: "A qui vols furtar el 10%?", FURTAR_25: "A qui vols furtar el 25%?", INTERCANVIAR: "Amb qui vols intercanviar tot l'or?", RETAR: "A qui vols reptar?" };
    dom.battleTargetTitle.textContent = labels[effect] || "Tria un contrincant";
    dom.battleTargetList.innerHTML = "";
    const anonymous = isBlind();
    battleRivals().forEach((player, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "battle-target";
      button.innerHTML = `${avatarSpan(player.avatar)}<strong>${anonymous ? `Rival ${String.fromCharCode(65 + index)}` : window.GameMath.escapeHtml(player.name || "Rival")}</strong>`;
      button.addEventListener("click", () => chooseTarget(player));
      dom.battleTargetList.appendChild(button);
    });
    if (!dom.battleTargetDialog.open) dom.battleTargetDialog.showModal();
  }

  async function chooseTarget(target) {
    const effect = state.targetEffect;
    closeDialog(dom.battleTargetDialog);
    if (effect === "RETAR") {
      const question = currentQuestion() || (state.battle.questions || [])[0];
      await window.GameBattle.createDuel(state.student.studentId, target.studentId, question);
      showEffect("RETAR", { target: target.name });
      return;
    }
    const detail = await window.GameBattle.applyOpponentEffect(state.student.studentId, target.studentId, effect);
    showEffect(effect, { ...detail, target: target.name });
  }

  function showEffect(effect, detail = {}) {
    const content = {
      GUANYAR: ["💰", `+${detail.amount || Math.max(0, Number(detail.after || 0) - Number(detail.before || 0))} d'or`, "El cofre estava ple!"],
      DOBLAR: ["✖️2", "Or duplicat", `Ara tens ${detail.after || 0} d'or.`],
      TRIPLICAR: ["✖️3", "Or triplicat", `Ara tens ${detail.after || 0} d'or.`],
      PERDRE_25: ["💥", "Has perdut el 25%", "Una trampa amagada dins del cofre."],
      PERDRE_50: ["🕳️", "Has perdut la meitat", "Encara pots remuntar en qualsevol moment."],
      RES: ["🌫️", "No passa res", "El cofre estava buit."],
      FURTAR_10: ["🦹", "Furt del 10%", `Has aconseguit ${detail.amount || 0} d'or.`],
      FURTAR_25: ["🥷", "Furt del 25%", `Has aconseguit ${detail.amount || 0} d'or.`],
      INTERCANVIAR: ["🔄", "Or intercanviat", "Totes dues fortunes han canviat de mans."],
      RETAR: ["⚔️", "Duel llançat", `Tens 15 segons contra ${detail.target || "un rival"}.`],
      SORPRESA: ["🎁", "Sorpresa especial!", "+150 d'or i un fragment especial."]
    }[effect] || ["✨", "Sorpresa", "El cofre ha canviat la partida."];
    dom.battleEffectScreen.className = `battle-effect-screen ${effect.includes("PERDRE") ? "loss" : effect.includes("FURTAR") ? "steal" : effect === "INTERCANVIAR" ? "swap" : ""}`;
    dom.battleEffectIcon.textContent = content[0];
    dom.battleEffectTitle.textContent = content[1];
    dom.battleEffectText.textContent = content[2];
    showOnly("effect");
    window.setTimeout(() => {
      state.pendingChest = false;
      state.targetEffect = "";
      state.lastQuestionKey = "";
      renderQuestion();
    }, effect === "RETAR" ? 900 : 1800);
  }

  function processDuels() {
    if (!state.battle || !state.student) return;
    const active = Object.values(state.battle.duels || {}).find((duel) =>
      duel && duel.state === "ACTIVE" && [duel.challengerId, duel.targetId].includes(state.student.studentId)
    );
    if (!active) {
      if (dom.battleDuelDialog.open) closeDialog(dom.battleDuelDialog);
      state.activeDuelId = "";
      return;
    }
    state.activeDuelId = active.duelId;
    const ownAnswer = active.answers && active.answers[window.GameBattle.safeStudentId(state.student.studentId)];
    if (!ownAnswer && Date.now() < Number(active.endAt || 0)) {
      dom.battleDuelTitle.textContent = active.challengerId === state.student.studentId ? "Has llançat el repte" : "T'han reptat!";
      window.GameMath.setHtml(dom.battleDuelQuestion, active.question && active.question.questionHtml || "");
      dom.battleDuelAnswer.value = "";
      dom.battleDuelAnswer.disabled = false;
      if (!dom.battleDuelDialog.open) dom.battleDuelDialog.showModal();
    } else if (ownAnswer) {
      dom.battleDuelAnswer.disabled = true;
      dom.battleDuelTitle.textContent = "Resposta enviada. Esperant el rival…";
    }
    maybeResolveDuel(active);
  }

  function processDuelTimeout() {
    if (!state.battle || !state.activeDuelId) return;
    const duel = state.battle.duels && state.battle.duels[state.activeDuelId];
    if (duel) {
      dom.battleDuelTimer.textContent = Math.max(0, Math.ceil((Number(duel.endAt || 0) - Date.now()) / 1000));
      maybeResolveDuel(duel);
    }
  }

  async function maybeResolveDuel(duel) {
    if (!duel || duel.challengerId !== state.student.studentId || state.duelResolving[duel.duelId]) return;
    const answers = duel.answers || {};
    if (Object.keys(answers).length < 2 && Date.now() < Number(duel.endAt || 0)) return;
    state.duelResolving[duel.duelId] = true;
    try { await window.GameBattle.resolveDuel(duel); } finally { window.setTimeout(() => { delete state.duelResolving[duel.duelId]; }, 2500); }
  }

  async function submitDuel(event) {
    event.preventDefault();
    const duel = state.battle && state.battle.duels && state.battle.duels[state.activeDuelId];
    if (!duel || Date.now() > Number(duel.endAt || 0)) return;
    const correct = window.GameBattle.isCorrect(duel.question, dom.battleDuelAnswer.value);
    dom.battleDuelAnswer.disabled = true;
    await window.GameBattle.answerDuel(duel.duelId, state.student.studentId, correct);
  }

  function renderResults() {
    showOnly("results");
    const players = playersSorted();
    const ownIndex = players.findIndex((player) => player.studentId === state.student.studentId);
    const ownPlayer = ownIndex >= 0 ? players[ownIndex] : state.player;
    dom.battleOwnFinalPosition.innerHTML = ownIndex >= 0
      ? `<span>La teua posició final</span><strong>${ownIndex + 1}<small> de ${players.length}</small></strong><p>${Math.round(Number(ownPlayer && ownPlayer.gold || 0))} ◆ · ${Number(ownPlayer && ownPlayer.correct || 0)} encerts · ${Number(ownPlayer && ownPlayer.incorrect || 0)} errors</p>`
      : "";
    dom.battlePodium.innerHTML = "";
    const order = [players[1], players[0], players[2]].filter(Boolean);
    order.forEach((player) => {
      const position = players.indexOf(player) + 1;
      const item = document.createElement("article");
      item.className = `podium-place ${position === 1 ? "first" : position === 2 ? "second" : "third"}`;
      const ordinal = position === 1 ? "1r" : position === 2 ? "2n" : position === 3 ? "3r" : position === 4 ? "4t" : `${position}é`;
      item.innerHTML = `${avatarSpan(player.avatar)}<b>${ordinal}</b><strong>${window.GameMath.escapeHtml(player.name || "Jugador")}</strong><small>${Math.round(Number(player.gold || 0))} ◆</small>`;
      dom.battlePodium.appendChild(item);
    });
    renderCapture();
  }

  function renderCapture() {
    const capture = state.battle && state.battle.capture;
    if (!capture || !(capture.winners || []).includes(state.student.studentId)) {
      dom.battleCapturePanel.classList.add("hidden");
      return;
    }
    dom.battleCapturePanel.classList.remove("hidden");
    const myTurn = capture.currentWinnerId === state.student.studentId;
    dom.battleCaptureTitle.textContent = myTurn ? "És el teu torn: tria una carta" : (capture.claims && capture.claims[window.GameBattle.safeStudentId(state.student.studentId)] ? "Avatar capturat!" : "Espera el teu torn de triar");
    dom.battleCaptureCards.innerHTML = "";
    if (!myTurn) return;
    (capture.pool || []).forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "capture-card";
      button.innerHTML = avatarSpan(card.avatar);
      button.addEventListener("click", () => captureAvatar(button, card));
      dom.battleCaptureCards.appendChild(button);
    });
  }

  async function captureAvatar(button, card) {
    if (state.captureBusy) return;
    state.captureBusy = true;
    button.classList.add("claimed");
    try {
      const result = await window.GameData.call("battle_capture", {
        battleId: state.battle.meta.battleId,
        studentId: state.student.studentId,
        cardToken: card.token
      });
      await window.GameBattle.battleRef().child("capture").transaction((capture) => {
        if (!capture) return capture;
        capture.pool = (capture.pool || []).filter((item) => item.token !== card.token);
        capture.claims = capture.claims || {};
        capture.claims[window.GameBattle.safeStudentId(state.student.studentId)] = { avatar: result.avatar, until: result.until };
        capture.currentWinnerId = result.nextWinnerId || "";
        return capture;
      });
      state.student.avatar = result.avatar;
    } catch (error) {
      button.classList.remove("claimed");
      window.alert(error.message);
    } finally {
      state.captureBusy = false;
    }
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function bindEvents() {
    dom.battleAnswerForm.addEventListener("submit", (event) => { event.preventDefault(); submitAnswer(dom.battleAnswerInput.value); });
    dom.battleChestScreen.querySelectorAll(".battle-chest").forEach((chest) => chest.addEventListener("click", () => chooseChest(chest)));
    dom.battleCancelTarget.addEventListener("click", () => {
      closeDialog(dom.battleTargetDialog);
      state.pendingChest = false;
      state.targetEffect = "";
      renderQuestion();
    });
    dom.battleDuelForm.addEventListener("submit", submitDuel);
    dom.battleLeaveButton.addEventListener("click", () => {
      state.dismissedBattleId = state.battle && state.battle.meta && state.battle.meta.battleId || "";
      hideArena();
    });
  }

  function init() {
    cacheDom();
    bindEvents();
  }

  window.GameBattleStudent = Object.freeze({ setStudent });
  document.addEventListener("DOMContentLoaded", init);
}());

(function () {
  "use strict";

  const config = window.GAMIFICACIO_CONFIG;
  let demoStore = null;
  const demoListeners = new Set();

  function demoValueAt(path) {
    return path.reduce((value, part) => value && value[part], demoStore);
  }

  function setDemoValue(path, value) {
    if (!path.length) demoStore = value;
    else {
      if (!demoStore) demoStore = {};
      let cursor = demoStore;
      path.slice(0, -1).forEach((part) => { cursor[part] = cursor[part] || {}; cursor = cursor[part]; });
      if (value === null || value === undefined) delete cursor[path[path.length - 1]];
      else cursor[path[path.length - 1]] = value;
    }
    demoListeners.forEach((entry) => entry.listener({ val: () => demoValueAt(entry.path) }));
  }

  function demoRef(path = []) {
    return {
      child: (childPath) => demoRef(path.concat(String(childPath).split("/").filter(Boolean))),
      set: async (value) => setDemoValue(path, JSON.parse(JSON.stringify(value))),
      update: async (changes) => {
        const current = demoValueAt(path) || {};
        setDemoValue(path, { ...current, ...JSON.parse(JSON.stringify(changes)) });
      },
      remove: async () => setDemoValue(path, null),
      transaction: async (updater) => {
        const current = demoValueAt(path);
        const next = updater(current == null ? null : JSON.parse(JSON.stringify(current)));
        if (next !== undefined) setDemoValue(path, next);
        return { committed: next !== undefined, snapshot: { val: () => next } };
      },
      on: (event, listener) => {
        demoListeners.add({ path: path.slice(), listener });
        listener({ val: () => demoValueAt(path) });
      },
      off: (event, listener) => {
        [...demoListeners].forEach((entry) => {
          if (entry.listener === listener && entry.path.join("/") === path.join("/")) demoListeners.delete(entry);
        });
      }
    };
  }

  function db() {
    return window.GameLive && window.GameLive.getDb();
  }

  function battleRef() {
    if (window.GameData && window.GameData.isDemo()) return demoRef();
    const database = db();
    return database ? database.ref(window.GameLive.pathFor("battles", "current")) : null;
  }

  function safeStudentId(studentId) {
    return window.GameLive.safeKey(studentId);
  }

  function participantsObject(participants) {
    const result = {};
    (participants || []).forEach((participant) => { result[safeStudentId(participant.studentId)] = participant; });
    return result;
  }

  async function teacherLaunch(prepared) {
    const ref = battleRef();
    if (!ref) throw new Error("Firebase no està disponible.");
    const startAt = Date.now() + 7000;
    const durationSeconds = Number(prepared.durationSeconds || 420);
    const payload = {
      meta: {
        battleId: prepared.battleId,
        type: prepared.type,
        title: prepared.title,
        missionId: prepared.missionId,
        sectorId: prepared.sectorId,
        durationSeconds,
        blindSeconds: Number(prepared.blindSeconds || 20),
        errorPenaltySeconds: Number(prepared.errorPenaltySeconds || 10),
        startAt,
        endAt: startAt + durationSeconds * 1000,
        createdAt: window.firebase && window.firebase.database ? window.firebase.database.ServerValue.TIMESTAMP : Date.now()
      },
      phase: "COUNTDOWN",
      participants: participantsObject(prepared.participants),
      questions: prepared.questions || [],
      questionPackages: prepared.questionPackages || {},
      chestWeights: prepared.chestWeights || [],
      players: {},
      attempts: {},
      duels: {}
    };
    await ref.set(payload);
    return payload;
  }

  function subscribe(callback, errorCallback) {
    const ref = battleRef();
    if (!ref) return () => {};
    const listener = (snapshot) => callback(snapshot.val() || null);
    ref.on("value", listener, errorCallback);
    return () => ref.off("value", listener);
  }

  function subscribeParts(parts, callback, errorCallback) {
    const ref = battleRef();
    if (!ref) return () => {};
    const values = {};
    const listeners = parts.map((part) => {
      const partRef = ref.child(part.path);
      const listener = (snapshot) => {
        values[part.key] = snapshot.val();
        if (!values.meta) {
          callback(null);
          return;
        }
        callback({
          meta: values.meta,
          phase: values.phase || "COUNTDOWN",
          participants: values.participants || {},
          questions: values.questions || [],
          chestWeights: values.chestWeights || [],
          players: values.ownPlayer ? { [values.ownPlayerKey]: values.ownPlayer } : (values.players || {}),
          duels: values.duels || {}, attempts: values.attempts || {},
          capture: values.capture || null,
          leaderboard: values.leaderboard || [],
          finishedAt: values.finishedAt || null
        });
      };
      partRef.on("value", listener, errorCallback);
      return { partRef, listener };
    });
    return () => listeners.forEach(({ partRef, listener }) => partRef.off("value", listener));
  }

  function subscribeTeacher(callback, errorCallback) {
    return subscribeParts([
      { path: "meta", key: "meta" }, { path: "phase", key: "phase" },
      { path: "participants", key: "participants" }, { path: "players", key: "players" },
      { path: "attempts", key: "attempts" },
      { path: "capture", key: "capture" }, { path: "leaderboard", key: "leaderboard" },
      { path: "finishedAt", key: "finishedAt" }
    ], callback, errorCallback);
  }

  function subscribeStudent(studentId, callback, errorCallback) {
    const ownPlayerKey = safeStudentId(studentId);
    const ref = battleRef();
    if (!ref) return () => {};
    const parts = [
      { path: "meta", key: "meta" }, { path: "phase", key: "phase" },
      { path: "participants", key: "participants" }, { path: "questions", key: "questions" },
      { path: `questionPackages/${ownPlayerKey}`, key: "ownQuestions" },
      { path: "chestWeights", key: "chestWeights" }, { path: `players/${ownPlayerKey}`, key: "ownPlayer" },
      { path: "duels", key: "duels" }, { path: "capture", key: "capture" },
      { path: "leaderboard", key: "leaderboard" }, { path: "finishedAt", key: "finishedAt" }
    ];
    const values = { ownPlayerKey };
    const listeners = parts.map((part) => {
      const partRef = ref.child(part.path);
      const listener = (snapshot) => {
        values[part.key] = snapshot.val();
        if (!values.meta) {
          callback(null);
          return;
        }
        callback({
          meta: values.meta, phase: values.phase || "COUNTDOWN", participants: values.participants || {},
          questions: values.ownQuestions || values.questions || [], chestWeights: values.chestWeights || [],
          players: values.ownPlayer ? { [ownPlayerKey]: values.ownPlayer } : {}, duels: values.duels || {},
          capture: values.capture || null, leaderboard: values.leaderboard || [], finishedAt: values.finishedAt || null
        });
      };
      partRef.on("value", listener, errorCallback);
      return { partRef, listener };
    });
    return () => listeners.forEach(({ partRef, listener }) => partRef.off("value", listener));
  }

  async function setPhase(phase, extra = {}) {
    const ref = battleRef();
    if (!ref) return;
    await ref.update({ phase, ...extra });
  }

  async function clearBattle() {
    const ref = battleRef();
    if (ref) await ref.remove();
  }

  async function joinPlayer(student) {
    const ref = battleRef();
    if (!ref || !student) return;
    const playerRef = ref.child(`players/${safeStudentId(student.studentId)}`);
    await playerRef.transaction((current) => current || {
      studentId: student.studentId,
      name: student.name,
      avatar: student.avatar || "",
      gold: 0,
      correct: 0,
      incorrect: 0,
      attempts: 0,
      specials: 0,
      questionIndex: 0,
      penaltyUntil: 0,
      joinedAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  async function recordAnswer(studentId, correct, penaltySeconds, question) {
    const ref = battleRef();
    if (!ref) return;
    const playerRef = ref.child(`players/${safeStudentId(studentId)}`);
    const transaction = await playerRef.transaction((player) => {
      if (!player) return player;
      player.attempts = Number(player.attempts || 0) + 1;
      player.questionIndex = Number(player.questionIndex || 0) + 1;
      if (correct) player.correct = Number(player.correct || 0) + 1;
      else {
        player.incorrect = Number(player.incorrect || 0) + 1;
        player.penaltyUntil = Date.now() + Number(penaltySeconds || 10) * 1000;
      }
      player.updatedAt = Date.now();
      return player;
    });
    if (question) {
      const player = transaction && transaction.snapshot ? transaction.snapshot.val() : {};
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await ref.child(`attempts/${safeStudentId(studentId)}/${key}`).set({
        studentId,
        questionId: question.questionId || question.id || "",
        skillId: question.skillId || "",
        curriculumLevel: Number(question.curriculumLevel || 1),
        phase: question.level || "BASE",
        errorCode: question.errorCode || "",
        correct: Boolean(correct),
        timeMs: 0,
        goldBefore: Number(player && player.gold || 0),
        goldAfter: Number(player && player.gold || 0),
        date: Date.now()
      });
    }
  }

  function pickChestEffect(weights) {
    const roll = Math.random() * 100;
    let cursor = 0;
    const list = Array.isArray(weights) && weights.length ? weights : [
      { id: "GUANYAR", weight: 48 }, { id: "DOBLAR", weight: 10 }, { id: "TRIPLICAR", weight: 4 },
      { id: "PERDRE_25", weight: 6 }, { id: "PERDRE_50", weight: 3 }, { id: "RES", weight: 4 },
      { id: "FURTAR_10", weight: 7 }, { id: "FURTAR_25", weight: 5 }, { id: "INTERCANVIAR", weight: 6 },
      { id: "RETAR", weight: 5 }, { id: "SORPRESA", weight: 2 }
    ];
    for (const item of list) {
      cursor += Number(item.weight || 0);
      if (roll < cursor) return item.id;
    }
    return "GUANYAR";
  }

  async function applySelfEffect(studentId, effect) {
    const ref = battleRef();
    if (!ref) return null;
    let detail = {};
    const playerRef = ref.child(`players/${safeStudentId(studentId)}`);
    await playerRef.transaction((player) => {
      if (!player) return player;
      const before = Math.max(0, Number(player.gold || 0));
      let after = before;
      if (effect === "GUANYAR") {
        const amount = (Math.floor(Math.random() * 10) + 1) * 10;
        after += amount;
        detail = { amount };
      } else if (effect === "DOBLAR") {
        after = before ? before * 2 : 50;
      } else if (effect === "TRIPLICAR") {
        after = before ? before * 3 : 100;
      } else if (effect === "PERDRE_25") {
        after = Math.floor(before * 0.75);
      } else if (effect === "PERDRE_50") {
        after = Math.floor(before * 0.5);
      } else if (effect === "SORPRESA") {
        after += 150;
        player.specials = Number(player.specials || 0) + 1;
        detail = { amount: 150 };
      }
      player.gold = Math.max(0, Math.round(after));
      player.updatedAt = Date.now();
      detail.before = before;
      detail.after = player.gold;
      return player;
    });
    return detail;
  }

  async function applyOpponentEffect(studentId, targetId, effect) {
    const ref = battleRef();
    if (!ref) return null;
    let detail = {};
    await ref.child("players").transaction((players) => {
      if (!players) return players;
      const self = players[safeStudentId(studentId)];
      const target = players[safeStudentId(targetId)];
      if (!self || !target) return players;
      const selfBefore = Math.max(0, Number(self.gold || 0));
      const targetBefore = Math.max(0, Number(target.gold || 0));
      if (effect === "INTERCANVIAR") {
        self.gold = targetBefore;
        target.gold = selfBefore;
        detail = { selfBefore, selfAfter: targetBefore, targetBefore, targetAfter: selfBefore };
      } else {
        const rate = effect === "FURTAR_25" ? 0.25 : 0.10;
        const amount = Math.floor(targetBefore * rate);
        self.gold = selfBefore + amount;
        target.gold = Math.max(0, targetBefore - amount);
        detail = { amount, selfBefore, selfAfter: self.gold, targetBefore, targetAfter: target.gold };
      }
      self.updatedAt = Date.now();
      target.updatedAt = Date.now();
      return players;
    });
    return detail;
  }

  async function createDuel(studentId, targetId, question) {
    const ref = battleRef();
    if (!ref) return "";
    const duelId = `duel-${Date.now()}-${safeStudentId(studentId)}`;
    await ref.child(`duels/${duelId}`).set({
      duelId,
      challengerId: studentId,
      targetId,
      question,
      startAt: Date.now() + 1000,
      endAt: Date.now() + 16000,
      state: "ACTIVE",
      answers: {}
    });
    return duelId;
  }

  async function answerDuel(duelId, studentId, correct) {
    const ref = battleRef();
    if (!ref) return;
    await ref.child(`duels/${duelId}/answers/${safeStudentId(studentId)}`).set({ correct: Boolean(correct), answeredAt: Date.now() });
  }

  async function resolveDuel(duel) {
    if (!duel || duel.state !== "ACTIVE") return null;
    const ref = battleRef();
    if (!ref) return null;
    const answers = duel.answers || {};
    const challenger = answers[safeStudentId(duel.challengerId)];
    const target = answers[safeStudentId(duel.targetId)];
    if (!(challenger && target) && Date.now() < Number(duel.endAt || 0)) return null;
    let winnerId = "";
    if (challenger && challenger.correct && (!target || !target.correct || challenger.answeredAt < target.answeredAt)) winnerId = duel.challengerId;
    else if (target && target.correct && (!challenger || !challenger.correct || target.answeredAt < challenger.answeredAt)) winnerId = duel.targetId;
    await ref.child("players").transaction((players) => {
      if (!players) return players;
      const first = players[safeStudentId(duel.challengerId)];
      const second = players[safeStudentId(duel.targetId)];
      if (!first || !second) return players;
      if (winnerId === duel.challengerId) {
        const amount = Math.floor(Number(second.gold || 0) * 0.20);
        second.gold = Math.max(0, Number(second.gold || 0) - amount);
        first.gold = Number(first.gold || 0) + amount;
      } else if (winnerId === duel.targetId) {
        const amount = Math.floor(Number(first.gold || 0) * 0.10);
        first.gold = Math.max(0, Number(first.gold || 0) - amount);
        second.gold = Number(second.gold || 0) + amount;
      }
      return players;
    });
    await ref.child(`duels/${duel.duelId}`).update({ state: "RESOLVED", winnerId, resolvedAt: Date.now() });
    return winnerId;
  }

  function normaliseAnswer(value) {
    let text = String(value == null ? "" : value).trim().toLowerCase();
    if (text.includes("=")) text = text.split("=").pop().trim();
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, "")
      .replace(/\\cdot|·/g, "*").replace(/,/g, ".").replace(/\s+/g, "").replace(/[−–—]/g, "-");
  }

  function numericValue(value) {
    let normal = normaliseAnswer(value);
    normal = normal.replace(/\\frac\{(-?\d+(?:\.\d+)?)\}\{(-?\d+(?:\.\d+)?)\}/g, "$1/$2");
    const fraction = normal.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
    if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
    const number = Number(normal);
    return Number.isFinite(number) ? number : null;
  }

  function isCorrect(question, answer) {
    const expectedNumber = numericValue(question.expectedAnswer);
    const answerNumber = numericValue(answer);
    if (expectedNumber !== null && answerNumber !== null) return Math.abs(expectedNumber - answerNumber) < 1e-9;
    return normaliseAnswer(question.expectedAnswer) === normaliseAnswer(answer);
  }

  window.GameBattle = Object.freeze({
    battleRef, subscribe, subscribeTeacher, subscribeStudent, teacherLaunch, setPhase, clearBattle, joinPlayer, recordAnswer,
    pickChestEffect, applySelfEffect, applyOpponentEffect, createDuel, answerDuel, resolveDuel,
    isCorrect, safeStudentId
  });
}());

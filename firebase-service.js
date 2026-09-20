(function () {
  "use strict";

  const config = window.GAMIFICACIO_CONFIG;
  let db = null;
  let context = null;
  let liveRef = null;
  let commentRef = null;
  let commentCallback = null;
  let globalCommentRef = null;
  let globalCommentCallback = null;
  let ownershipRef = null;
  let ownershipCallback = null;
  let classControlRef = null;
  let classControlCallback = null;
  let heartbeatId = null;
  let lastAnswer = null;
  let lastGlobalCommentAt = 0;
  let currentOwner = false;
  let replacementNotified = false;
  let recoveredDraft = null;
  let hasLiveRecord = false;

  function safeKey(value) {
    return String(value || "sense-id").trim().replace(/[.#$\[\]/]/g, "_").slice(0, 100) || "sense-id";
  }

  function init() {
    if (db) return true;
    if (config.firebaseEnabled !== true) return false;
    if (!window.firebase || !window.firebaseConfig) return false;
    if (!window.firebase.apps.length) window.firebase.initializeApp(window.firebaseConfig);
    db = window.firebase.database();
    return true;
  }

  function pathFor(section, sessionId) {
    const parts = [safeKey(config.firebaseRoot), section, safeKey(config.groupId)];
    if (sessionId) parts.push(safeKey(sessionId));
    return parts.join("/");
  }

  async function start(studentContext) {
    stopListeners();
    context = { ...studentContext, startedAt: Date.now() };
    currentOwner = false;
    replacementNotified = false;
    recoveredDraft = null;
    hasLiveRecord = false;
    if (!init() || window.GameData.isDemo()) return { active: false, previous: null };

    // Una única targeta per alumne. sessionId continua dins de la targeta i
    // identifica quin dispositiu és el propietari de la connexió actual.
    liveRef = db.ref(pathFor("live", context.studentId));
    commentRef = db.ref(pathFor("comments", context.sessionId));

    const previousSnapshot = await liveRef.once("value");
    const previous = previousSnapshot.val();
    hasLiveRecord = Boolean(previous);
    const ttlMs = Math.max(1, Number(config.liveTtlHours || 72)) * 60 * 60 * 1000;
    if (previous && Date.now() - Number(previous.updatedAt || previous.startedAt || 0) <= ttlMs) {
      recoveredDraft = {
        exerciseId: String(previous.exerciseId || ""),
        answer: String(previous.answer || ""),
        answerPreviewHtml: String(previous.answerPreviewHtml || ""),
        helpCount: Number(previous.helpCount || 0)
      };
    }

    if (previous) {
      // Entrar de nou sempre reclama la targeta de l'alumne. No comparem hores
      // dels dispositius: poden estar desajustades i bloquejar una reconnexió
      // legítima. La transacció conserva l'esborrany i canvia només el
      // propietari; l'altra pantalla rebrà el nou sessionId i es tancarà.
      const claim = await liveRef.transaction((value) => ({
        ...(value || previous),
        sessionId: context.sessionId,
        studentId: context.studentId,
        studentName: context.studentName,
        startedAt: context.startedAt,
        updatedAt: window.firebase.database.ServerValue.TIMESTAMP
      }), undefined, false);
      currentOwner = Boolean(claim.committed && claim.snapshot.val() && claim.snapshot.val().sessionId === context.sessionId);
    } else {
      currentOwner = true;
    }

    ownershipRef = liveRef.child("sessionId");
    ownershipCallback = (snapshot) => {
      const ownerSessionId = String(snapshot.val() || "");
      if (!ownerSessionId) return;
      if (ownerSessionId === context.sessionId) {
        currentOwner = true;
        startHeartbeat();
        return;
      }
      relinquishOwnership();
    };
    ownershipRef.on("value", ownershipCallback);

    commentCallback = (snapshot) => {
      const comment = snapshot.val();
      if (comment && comment.text && typeof context.onComment === "function") context.onComment(comment);
    };
    commentRef.on("value", commentCallback);
    globalCommentRef = db.ref(pathFor("comments", "_global"));
    globalCommentCallback = (snapshot) => {
      const comment = snapshot.val();
      const commentAt = Number(comment && comment.updatedAt || 0);
      const recentEnough = commentAt >= context.startedAt - 10 * 60 * 1000;
      if (comment && comment.text && recentEnough && commentAt > lastGlobalCommentAt && typeof context.onComment === "function") {
        lastGlobalCommentAt = commentAt;
        context.onComment(comment);
      }
    };
    globalCommentRef.on("value", globalCommentCallback);
    if (currentOwner) startHeartbeat();
    return { active: currentOwner, replaced: !currentOwner, previous: recoveredDraft };
  }

  function startHeartbeat() {
    if (heartbeatId || !currentOwner || !hasLiveRecord) return;
    heartbeatId = window.setInterval(() => updateDynamic({ heartbeat: true }), config.liveHeartbeatMs);
  }

  function relinquishOwnership() {
    currentOwner = false;
    if (heartbeatId) window.clearInterval(heartbeatId);
    heartbeatId = null;
    if (!replacementNotified && context && typeof context.onReplaced === "function") {
      replacementNotified = true;
      context.onReplaced();
    }
  }

  async function publishExercise(exercise, mission, extra = {}) {
    if (!liveRef || !context || !currentOwner) return false;
    const now = window.firebase.database.ServerValue.TIMESTAMP;
    const canRecover = recoveredDraft && recoveredDraft.exerciseId === String(exercise.exerciseId || "");
    const initialAnswer = String(exercise.savedAnswer || (canRecover ? recoveredDraft.answer : "")).slice(0, config.maxAnswerChars);
    const initialPreview = String(exercise.savedAnswerPreviewHtml || (canRecover ? recoveredDraft.answerPreviewHtml : "")).slice(0, 20000);
    const payload = {
      groupId: config.groupId,
      sessionId: context.sessionId,
      studentId: context.studentId,
      studentName: context.studentName,
      route: extra.route || "BASE",
      levelPlan: String(extra.levelPlan || "SUPORT,BASE,REPTE"),
      exerciseId: exercise.exerciseId,
      missionId: exercise.missionId || (mission && mission.missionId) || "",
      missionTitle: (mission && mission.title) || "Missió",
      questionHtml: String(exercise.questionHtml || "").slice(0, 50000),
      expectedAnswer: String(exercise.expectedAnswer || "").slice(0, 5000),
      interactionType: String(exercise.interactionType || ""),
      answer: initialAnswer,
      answerPreviewHtml: initialPreview || (initialAnswer ? window.GameMath.studentTextToHtml(initialAnswer).slice(0, 20000) : ""),
      helpCount: Math.max(Number(extra.helpCount || 0), canRecover ? recoveredDraft.helpCount : 0),
      state: "WORKING",
      focusState: "VISIBLE",
      submissionReason: "normal",
      startedAt: context.startedAt,
      updatedAt: now
    };
    const result = await liveRef.transaction((value) => {
      // Una pantalla antiga no pot recuperar la targeta després que una nova
      // sessió l'haja reclamada, independentment del rellotge de cada aparell.
      if (value && value.sessionId && value.sessionId !== context.sessionId) return;
      return payload;
    }, undefined, false);
    currentOwner = Boolean(result.committed && result.snapshot.val() && result.snapshot.val().sessionId === context.sessionId);
    if (!currentOwner) {
      relinquishOwnership();
      return false;
    }
    lastAnswer = initialAnswer;
    recoveredDraft = null;
    hasLiveRecord = true;
    startHeartbeat();
    return true;
  }

  async function updateDynamic(changes = {}) {
    if (!liveRef || !currentOwner) return false;
    const payload = { updatedAt: window.firebase.database.ServerValue.TIMESTAMP };
    if (Object.prototype.hasOwnProperty.call(changes, "answer")) {
      const answer = String(changes.answer || "").slice(0, config.maxAnswerChars);
      if (answer === lastAnswer && !changes.force) return true;
      lastAnswer = answer;
      payload.answer = answer;
      payload.answerPreviewHtml = Object.prototype.hasOwnProperty.call(changes, "answerPreviewHtml")
        ? String(changes.answerPreviewHtml || "").slice(0, 20000)
        : window.GameMath.studentTextToHtml(answer).slice(0, 20000);
    }
    ["helpCount", "state", "focusState", "submissionReason"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(changes, key)) payload[key] = changes[key];
    });
    await liveRef.update(payload);
    return true;
  }

  async function markSubmitted(reason, answer, answerPreviewHtml) {
    return updateDynamic({ answer, answerPreviewHtml, state: "SUBMITTED", submissionReason: reason || "normal", force: true });
  }

  async function contributeClass(missionId, amount) {
    if (!db || !missionId || !amount) return;
    const ref = db.ref(`${pathFor("classGoal")}/${safeKey(missionId)}/value`);
    await ref.transaction((value) => Math.min(100, Number(value || 0) + Number(amount || 0)));
  }

  async function publishClassControl(control) {
    if (!init() || window.GameData.isDemo()) return false;
    const ref = db.ref(pathFor("classControl"));
    await ref.set({
      missionId: String(control.missionId || "M01").slice(0, 100),
      macroLevel: Math.max(1, Math.min(3, Number(control.macroLevel || 1))),
      command: String(control.command || "READY").slice(0, 20),
      explanationVersion: Number(control.explanationVersion || 0),
      activityVersion: Number(control.activityVersion || 0),
      updatedAt: window.firebase.database.ServerValue.TIMESTAMP
    });
    return true;
  }

  function subscribeClassControl(callback) {
    if (!init() || window.GameData.isDemo()) return () => {};
    if (classControlRef && classControlCallback) classControlRef.off("value", classControlCallback);
    classControlRef = db.ref(pathFor("classControl"));
    classControlCallback = (snapshot) => callback(snapshot.val() || null);
    classControlRef.on("value", classControlCallback);
    return () => {
      if (classControlRef && classControlCallback) classControlRef.off("value", classControlCallback);
      classControlRef = null; classControlCallback = null;
    };
  }

  async function removeCurrent() {
    if (!liveRef || !context || !currentOwner) return;
    // No s'elimina en eixir: l'última resposta queda visible fins a 72 h.
    // La transacció evita que un ordinador antic toque la sessió nova.
    await liveRef.transaction((value) => {
      if (!value || value.sessionId !== context.sessionId) return;
      return {
        ...value,
        focusState: "VISIBLE",
        updatedAt: window.firebase.database.ServerValue.TIMESTAMP
      };
    }, undefined, false);
  }

  function stopListeners() {
    if (commentRef && commentCallback) commentRef.off("value", commentCallback);
    if (globalCommentRef && globalCommentCallback) globalCommentRef.off("value", globalCommentCallback);
    if (ownershipRef && ownershipCallback) ownershipRef.off("value", ownershipCallback);
    if (classControlRef && classControlCallback) classControlRef.off("value", classControlCallback);
    if (heartbeatId) window.clearInterval(heartbeatId);
    commentRef = null;
    commentCallback = null;
    globalCommentRef = null;
    globalCommentCallback = null;
    ownershipRef = null;
    ownershipCallback = null;
    classControlRef = null;
    classControlCallback = null;
    heartbeatId = null;
    liveRef = null;
    currentOwner = false;
    hasLiveRecord = false;
  }

  function getDb() {
    init();
    return db;
  }

  window.addEventListener("beforeunload", stopListeners);
  window.GameLive = Object.freeze({ init, start, publishExercise, updateDynamic, markSubmitted, contributeClass, publishClassControl, subscribeClassControl, removeCurrent, stopListeners, getDb, pathFor, safeKey });
}());

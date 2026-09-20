(function () {
  "use strict";
  if (!window.ReforcCore) return;
  const core = window.ReforcCore;
  const KEY = "gamificacio-reforc-demo-v1";
  const USERS = [
    { studentId: "DEMO-01", name: "Aina", route: "BASE", avatar: "" },
    { studentId: "DEMO-02", name: "Biel", route: "SUPORT", avatar: "" },
    { studentId: "DEMO-03", name: "Carla", route: "REPTE", avatar: "" },
    { studentId: "DEMO-04", name: "Dani", route: "SUPORT", avatar: "", newcomer: true }
  ];
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (error) { return {}; }
  }
  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
  function rootState() {
    const state = read();
    state.control = state.control || { missionId: "M01", macroLevel: 1, mode: "CLASS", explanationVersion: 0, activityVersion: 0, updatedAt: Date.now() };
    state.students = state.students || {};
    state.reports = state.reports || [];
    state.advances = state.advances || [];
    return state;
  }
  function studentState(state, id) {
    state.students[id] = state.students[id] || { completed: [], attempts: [], helps: {}, phaseByMission: {}, energy: 0, streak: 0, badges: [], avatar: "", avatarChanges: 0 };
    return state.students[id];
  }
  function mission(id) { return core.MISSIONS.find((item) => item.missionId === id) || core.MISSIONS[0]; }
  function currentPhase(user, missionId) {
    return user.phaseByMission[missionId] || "SUPORT";
  }
  function activeExercise(user, missionId) {
    const phase = currentPhase(user, missionId);
    const list = core.exercisesForMission(missionId).filter((item) => item.route === phase);
    const pending = list.find((item) => !user.completed.includes(item.exerciseId));
    if (pending) return { ...pending, levelLabel: phase, levelPlan: "SUPORT,BASE,REPTE", totalSteps: 15, requiresProcedure: false };
    const accuracyRows = user.attempts.filter((a) => a.missionId === missionId && a.route === phase).slice(-8);
    const accuracy = accuracyRows.length ? accuracyRows.filter((a) => a.correct).length / accuracyRows.length : 0;
    if (phase === "SUPORT") user.phaseByMission[missionId] = accuracy >= .55 ? "BASE" : "SUPORT";
    else if (phase === "BASE") user.phaseByMission[missionId] = accuracy >= .8 ? "REPTE" : "SUPORT";
    else user.phaseByMission[missionId] = "REPTE";
    const next = core.exercisesForMission(missionId).find((item) => item.route === user.phaseByMission[missionId] && !user.completed.includes(item.exerciseId));
    return next ? { ...next, levelLabel: user.phaseByMission[missionId], levelPlan: "SUPORT,BASE,REPTE", totalSteps: 15, requiresProcedure: false } : null;
  }
  function avatarList(user) {
    const count = user.completed.length >= 5 ? Math.min(15, 3 + Math.floor(user.completed.length / 15)) : 0;
    return Array.from({ length: count }, (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`);
  }
  function missionStates(control, user, exercise) {
    const sector = mission(control.missionId).sector;
    return core.MISSIONS.filter((m) => m.sector === sector).map((m) => ({
      ...m, description: m.subtitle, total: 15, unlocked: m.order <= mission(control.missionId).order,
      done: user.completed.filter((id) => id.startsWith(`${m.missionId}-`)).length >= 5,
      status: m.missionId === control.missionId ? "CURRENT" : (m.order < mission(control.missionId).order ? "DONE" : "LOCKED")
    }));
  }
  function bootstrap(studentId) {
    const state = rootState(); const profile = USERS.find((u) => u.studentId === studentId) || USERS[0];
    const user = studentState(state, profile.studentId); const current = mission(state.control.missionId);
    const exercise = activeExercise(user, current.missionId); write(state);
    const missions = missionStates(state.control, user, exercise);
    const totalDone = user.completed.length;
    return {
      ok: true, demo: true, sessionId: `demo-${profile.studentId}-${Date.now()}`, trimester: 1,
      student: { ...profile, avatar: user.avatar, avatarUnlocked: avatarList(user).length > 0, avatarChanges: user.avatarChanges, availableAvatars: avatarList(user) },
      missions, sector: { sectorId: current.sectorId, title: `Bloc ${current.sector}`, subtitle: current.title, description: current.subtitle, visualCode: "orbital", order: current.sector, trimester: 1 },
      currentExercise: exercise, currentMission: missions.find((m) => m.missionId === current.missionId), waitingForUnlock: !exercise, waitingForContent: false,
      classControl: state.control,
      stats: { energy: user.energy, streak: user.streak, progress: Math.min(100, Math.round(totalDone / 15 * 100)), completed: totalDone, total: 15 },
      badges: user.badges, classGoal: { title: "Treball de l'equip", value: Math.min(100, 15 + totalDone * 3), target: 100 }
    };
  }
  function catalog() {
    const state = rootState(); const currentOrder = mission(state.control.missionId).order;
    const questions = core.allExercises();
    return { ok: true,
      sectors: Array.from({ length: 5 }, (_, i) => ({ sectorId: `S${i + 1}`, title: `Bloc ${i + 1}`, trimester: 1, order: i + 1, visualCode: "orbital" })),
      missions: core.MISSIONS.map((m) => ({ ...m, description: m.subtitle, unlocked: m.order <= currentOrder, targetExercises: 15 })),
      nextLockedMission: core.MISSIONS.find((m) => m.order > currentOrder) || null,
      questions: questions.map((x) => ({ id: x.exerciseId, missionId: x.missionId, title: x.questionHtml.replace(/<[^>]+>/g, " "), route: x.route })),
      solutions: questions.map((x) => ({ id: x.exerciseId, modelSolution: x.hint2, expectedAnswer: x.expectedAnswer })), levelPlans: [], classControl: state.control };
  }
  function assessmentFor(studentId) {
    const state = rootState(); const user = studentState(state, studentId);
    const result = core.calculateAssessment(user.attempts);
    const recommendation = core.shouldRecommendReport({
      sessionsWithoutProgress: user.attempts.length > 12 && user.completed.length < 5 ? 3 : 0,
      lowMissionCount: new Set(user.attempts.filter((a) => !a.correct).map((a) => a.missionId)).size,
      repeatedErrorCount: Math.max(0, ...Object.values(user.attempts.reduce((acc, a) => { if (!a.correct) acc[a.errorCode] = (acc[a.errorCode] || 0) + 1; return acc; }, {}))),
      supportSessionsWithoutImprovement: user.attempts.filter((a) => a.route === "SUPORT" && !a.correct).length >= 5 ? 3 : 0
    });
    return { ...result, recommendation, recentAttempts: user.attempts.slice(-20), studentId };
  }
  async function call(action, payload) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = rootState();
    if (["teacher_login","teacher_check"].includes(action)) return { ok: true, authorized: true, teacherToken: "demo" };
    if (action === "teacher_logout") return { ok: true };
    if (action === "list_students") return { ok: true, students: USERS };
    if (action === "bootstrap") return bootstrap(payload.studentId);
    if (action === "catalog") return catalog();
    if (action === "class_control_get") return { ok: true, control: state.control };
    if (action === "class_control_set" || action === "force_advance") {
      const previous = state.control.missionId; const target = mission(payload.missionId || previous);
      state.control = { ...state.control, missionId: target.missionId, macroLevel: Number(payload.macroLevel || 1), updatedAt: Date.now(),
        explanationVersion: state.control.explanationVersion + (payload.command === "EXPLAIN" ? 1 : 0), activityVersion: state.control.activityVersion + (payload.command === "START" ? 1 : 0) };
      if (action === "force_advance") state.advances.push({ id: `ADV-${Date.now()}`, from: previous, to: target.missionId, reason: payload.reason || "Decisió docent", status: "advanced_by_teacher", date: new Date().toISOString() });
      write(state); return { ok: true, control: state.control, status: action === "force_advance" ? "advanced_by_teacher" : "updated", message: `Classe preparada en ${target.missionId} · ${target.title}.` };
    }
    if (action === "unlock_next_mission") {
      const next = core.MISSIONS.find((m) => m.order === mission(state.control.missionId).order + 1);
      if (!next) return { ok: true, allUnlocked: true, message: "Ja no queden missions." };
      state.control.missionId = next.missionId; state.control.updatedAt = Date.now(); state.advances.push({ from: mission(state.control.missionId).missionId, to: next.missionId, status: "advanced_by_teacher", date: new Date().toISOString() }); write(state);
      return { ok: true, mission: next, message: `${next.title} preparada. L'avanç docent no compta com a domini.` };
    }
    if (action === "submit") {
      const user = studentState(state, payload.studentId); const exercise = core.allExercises().find((x) => x.exerciseId === payload.exerciseId);
      if (!exercise) throw new Error("No s'ha trobat l'exercici.");
      const correct = core.isCorrect(String(payload.answer).split(/=|\n/).pop(), exercise.expectedAnswer);
      user.attempts.push({ date: new Date().toISOString(), missionId: exercise.missionId, exerciseId: exercise.exerciseId, route: exercise.route, competencyId: exercise.competencyId, errorCode: correct ? "" : exercise.errorCode, percent: correct ? 1 : 0, correct, helps: Number(payload.helpCount || 0) });
      if (correct && !user.completed.includes(exercise.exerciseId)) user.completed.push(exercise.exerciseId);
      user.energy += correct ? 10 : 0; user.streak = correct ? user.streak + 1 : 0;
      const reward = correct && user.completed.length === 1 ? { badgeId: "PRIMER_PAS", icon: "🚀", title: "Primer pas", description: "Has completat el primer exercici." } : null;
      if (reward && !user.badges.length) user.badges.push(reward);
      const next = correct ? activeExercise(user, state.control.missionId) : { ...exercise, exerciseId: exercise.exerciseId, questionHtml: exercise.questionHtml, levelLabel: exercise.route, levelPlan: "SUPORT,BASE,REPTE", levelTotal: 5 };
      write(state); const refreshed = bootstrap(payload.studentId);
      return { ok: true, correct, percent: correct ? 1 : 0, correctionStatus: correct ? "CORRECTE" : "INCORRECTE", mustRetry: !correct,
        feedback: correct ? "Correcte. Repetim el mateix procés amb un exemple molt semblant." : `Encara no. Mira el model: ${exercise.hint2}`,
        reward, nextExercise: next, missions: refreshed.missions, sector: refreshed.sector, currentMission: refreshed.currentMission,
        waitingForUnlock: false, waitingForContent: false, avatarUnlocked: refreshed.student.avatarUnlocked, avatarChanges: user.avatarChanges,
        availableAvatars: avatarList(user), stats: refreshed.stats, badges: user.badges, classGoal: refreshed.classGoal };
    }
    if (action === "help") {
      const ex = core.allExercises().find((x) => x.exerciseId === payload.exerciseId); const user = studentState(state, payload.studentId);
      const level = (user.helps[ex.exerciseId] || 0) + 1; user.helps[ex.exerciseId] = level; write(state);
      return { ok: true, source: "PREPARED", level, message: level === 1 ? ex.hint1 : ex.hint2, nextQuestion: level === 1 ? "Copia la transformació i calcula." : "Ara fes el mateix amb els teus nombres.", needsTeacher: level >= 4 };
    }
    if (action === "assessment") return { ok: true, assessment: assessmentFor(payload.studentId) };
    if (action === "report_recommendations") return { ok: true, students: USERS.map((u) => ({ ...u, ...assessmentFor(u.studentId).recommendation })) };
    if (action === "generate_report") {
      const profile = USERS.find((u) => u.studentId === payload.studentId); const assessment = assessmentFor(payload.studentId);
      const report = { reportId: `INF-${Date.now()}`, studentId: payload.studentId, period: payload.period || "AVALUACIO", createdAt: new Date().toISOString(),
        text: `${profile ? profile.name : "L'alumne"} mostra ${assessment.evidenceCount} evidències. Fortalesa principal: treball pautat i constància quan el procés és visible. Dificultat prioritària: revisar els errors repetits abans de canviar de concepte. Intervenció: mantindre la mateixa regla, model resolt i cinc exemples curts. Pas següent: consolidar la fase actual i recuperar buits marcats. Nota provisional suggerida: ${assessment.grade == null ? "sense evidència suficient" : assessment.grade + "/10"}. La nota ha de ser validada pel docent.` };
      state.reports.push(report); write(state); return { ok: true, report, cached: false };
    }
    if (action === "report_history") return { ok: true, reports: state.reports.filter((r) => !payload.studentId || r.studentId === payload.studentId).reverse() };
    if (action === "arrival_diagnostic") {
      const result = core.arrivalMission(state.control.missionId, payload.answers || []); return { ok: true, result, questionCount: 15 };
    }
    if (action === "battle_prepare") {
      const count = payload.battleType === "FINAL_SECTOR" ? 20 : 15; const qs = core.battleQuestions(payload.missionId || state.control.missionId, count);
      return { ok: true, questionCount: qs.length, battle: { battleId: `BT-DEMO-${Date.now()}`, type: payload.battleType || "DIA", missionId: payload.missionId || state.control.missionId,
        sectorId: mission(payload.missionId).sectorId, title: "Batalla mental", durationSeconds: payload.battleType === "FINAL_SECTOR" ? 600 : 420, blindSeconds: 20, errorPenaltySeconds: 10,
        participants: USERS.filter((u) => (payload.participantIds || []).includes(u.studentId)), questions: qs.map((q) => ({ id: q.questionId, ...q, expectedAnswer: q.answer })), chestWeights: [] } };
    }
    if (action === "battle_finalize") return { ok: true, battleId: payload.battle && payload.battle.battleId, leaderboard: (payload.results || []).sort((a,b) => Number(b.gold || 0)-Number(a.gold || 0)), capture: { count: 0, winners: [], pool: [] } };
    if (action === "battle_history") return { ok: true, summary: USERS.map((u) => ({ studentId: u.studentId, name: u.name, weekBadges: 0, monthBadges: 0, totalBadges: 0, battles: 0 })), battles: [] };
    if (action === "save_avatar") { const user = studentState(state, payload.studentId); user.avatar = payload.avatar; user.avatarChanges = 0; write(state); return { ok: true, avatar: user.avatar, avatarUnlocked: true, avatarChanges: 0, availableAvatars: avatarList(user) }; }
    if (action === "list_diagnostics") return { ok: true, diagnostics: [] };
    if (["set_mission_levels","teacher_assign","set_route","decide_review","teacher_decision"].includes(action)) return { ok: true, levels: String(payload.levels || "SUPORT,BASE,REPTE").split(","), message: "Canvi guardat." };
    if (action === "list_proposals") return { ok: true, proposals: [] };
    if (action === "list_reviews") return { ok: true, reviews: [] };
    if (action === "suggest_exercise") return { ok: true, proposal: { proposalId: `PROP-${Date.now()}`, studentId: payload.studentId, missionId: state.control.missionId, questionHtml: core.exercisesForMission(state.control.missionId)[0].questionHtml, expectedAnswer: core.exercisesForMission(state.control.missionId)[0].expectedAnswer, route: "SUPORT", methodId: "PAUTAT", explanation: "Mateix concepte amb nombres nous." } };
    throw new Error(`Acció de demostració no implementada: ${action}`);
  }
  window.GamificacioDemo = Object.freeze({ USERS, MISSIONS: core.MISSIONS, EXERCISES: core.allExercises(), call });
}());

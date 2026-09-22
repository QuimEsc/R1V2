(function () {
  "use strict";

  const config = window.GAMIFICACIO_CONFIG;
  const FOCUS_ALERT_MS = 60 * 1000;
  const LIVE_TTL_MS = Math.max(1, Number(config.liveTtlHours || 72)) * 60 * 60 * 1000;
  const state = {
    items: [],
    catalog: { sectors: [], missions: [], questions: [], solutions: [], levelPlans: [], nextLockedMission: null },
    solutionIndex: {},
    pendingProposals: [],
    pendingReviews: [],
    diagnostics: [],
    selectedItem: null,
    commentTarget: null,
    liveRef: null,
    goalRef: null,
    demoTimer: null,
    renderTimer: null,
    focusExpiryTimer: null,
    focusAlerts: {},
    focusStates: {},
    proposalTimer: null,
    readinessTimer: null,
    readinessDebounceTimer: null,
    readinessRequestSeq: 0,
    readinessLastRequestAt: 0,
    liveAvailable: false,
    questionCatalogPromise: null,
    started: false,
    eventsBound: false
  };
  const dom = {};

  function cacheDom() {
    [
      "monitorSetupNotice", "firebaseState", "activeCount", "workingCount", "helpCount", "focusCount", "monitorGoalText",
      "monitorGoalBar", "unlockMissionTitle", "unlockMissionText", "unlockNextMissionButton", "pendingProposalCard", "pendingProposalCount", "reviewProposalButton", "pendingReviewCard", "pendingReviewCount", "reviewProcedureButton", "diagnosticCard", "diagnosticCount", "diagnosticAverage", "openDiagnosticButton", "diagnosticDialog", "diagnosticRange", "diagnosticTotalBlocks", "diagnosticMeanScore", "diagnosticReinforcementCount", "diagnosticClassBody", "diagnosticStudentSelect", "diagnosticStudentDetail", "searchInput", "statusFilter", "globalMissionSelect", "assignAllButton", "globalCommentButton",
      "readinessCard", "readinessMission", "readinessStatus", "readinessExplanation", "readinessCoverage", "readinessPrepared", "readinessSupport", "readinessPopulation", "readinessSupportWrap", "readinessSupportList",
      "lastUpdateText", "studentGrid", "emptyMonitor", "assignDialog", "assignDialogTitle", "questionSelect", "questionPreview",
      "confirmAssignButton", "proposalDialog", "proposalDialogTitle", "proposalId", "proposalQuestion", "proposalMathPreview",
      "proposalAnswer", "proposalRoute", "proposalMethod", "proposalExplanation", "rejectProposalButton", "approveProposalButton",
      "procedureReviewDialog", "procedureReviewTitle", "procedureReviewId", "procedureReviewQuestion", "procedureReviewAnswer", "procedureReviewModel", "procedureReviewComment", "markIncorrectButton", "markPartialButton", "markCorrectButton",
      "commentDialog", "commentDialogTitle", "commentText", "sendCommentButton", "monitorLoading", "monitorLoadingText", "toastRegion",
      "teacherGate", "monitorApp", "teacherLoginForm", "teacherPassword", "teacherSignInButton", "teacherAuthMessage", "teacherSignOutButton"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function setLoading(visible, text) {
    if (text) dom.monitorLoadingText.textContent = text;
    dom.monitorLoading.classList.toggle("hidden", !visible);
  }

  function toast(message, type = "", duration = 4500) {
    const item = document.createElement("div");
    item.className = `toast ${type}`.trim();
    item.textContent = message;
    dom.toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), duration);
  }

  function setConnection(status, text) {
    dom.firebaseState.classList.remove("online", "error");
    if (status) dom.firebaseState.classList.add(status);
    dom.firebaseState.lastChild.textContent = ` ${text}`;
  }

  function stopMonitor() {
    if (state.liveRef) state.liveRef.off();
    if (state.goalRef) state.goalRef.off();
    if (state.demoTimer) window.clearInterval(state.demoTimer);
    if (state.renderTimer) window.clearInterval(state.renderTimer);
    if (state.focusExpiryTimer) window.clearTimeout(state.focusExpiryTimer);
    if (state.proposalTimer) window.clearInterval(state.proposalTimer);
    if (state.readinessTimer) window.clearInterval(state.readinessTimer);
    if (state.readinessDebounceTimer) window.clearTimeout(state.readinessDebounceTimer);
    state.readinessRequestSeq++;
    state.readinessLastRequestAt = 0;
    state.liveAvailable = false;
    state.liveRef = null;
    state.goalRef = null;
    state.demoTimer = null;
    state.renderTimer = null;
    state.focusExpiryTimer = null;
    state.focusAlerts = {};
    state.focusStates = {};
    state.proposalTimer = null;
    state.readinessTimer = null;
    state.readinessDebounceTimer = null;
    state.started = false;
    if (window.GameBattleTeacher) window.GameBattleTeacher.stop();
  }

  function showTeacherGate(message = "") {
    stopMonitor();
    dom.monitorApp.classList.add("hidden");
    dom.teacherGate.classList.remove("hidden");
    dom.teacherAuthMessage.textContent = message;
    dom.teacherPassword.value = "";
    window.setTimeout(() => dom.teacherPassword.focus(), 50);
  }

  async function startMonitor() {
    if (state.started) return;
    state.started = true;
    dom.teacherGate.classList.add("hidden");
    dom.monitorApp.classList.remove("hidden");
    dom.teacherAuthMessage.textContent = "";
    dom.teacherPassword.value = "";
    dom.teacherSignOutButton.classList.toggle("hidden", window.GameData.isDemo());
    if (!state.eventsBound) bindEvents();
    dom.monitorSetupNotice.classList.toggle("hidden", window.GameData.isConfigured() || window.GameData.isDemo());
    await loadCatalog();
    await loadPendingProposals();
    await loadPendingReviews();
    await loadDiagnostics();
    startLive();
    scheduleReadiness(0);
    if (window.GameBattleTeacher) window.GameBattleTeacher.start({
      getCatalog: () => state.catalog,
      getItems: () => state.items,
      toast,
      setLoading
    });
    window.dispatchEvent(new CustomEvent("reforc:teacher-ready", { detail: { catalog: state.catalog } }));
    state.renderTimer = window.setInterval(render, 30000);
    state.readinessTimer = window.setInterval(() => scheduleReadiness(0), 30000);
    if (!window.GameData.isDemo()) state.proposalTimer = window.setInterval(() => { loadPendingProposals(); loadPendingReviews(); loadDiagnostics(); }, 60000);
  }

  async function loginTeacher(event) {
    event.preventDefault();
    const password = dom.teacherPassword.value;
    if (!password) return;
    dom.teacherSignInButton.disabled = true;
    dom.teacherAuthMessage.textContent = "Comprovant la contrasenya…";
    try {
      const data = await window.GameData.call("teacher_login", { password });
      window.GameData.setTeacherToken(data.teacherToken);
      await startMonitor();
    } catch (error) {
      dom.teacherAuthMessage.textContent = error.message;
      dom.teacherPassword.select();
    } finally {
      dom.teacherSignInButton.disabled = false;
    }
  }

  async function logoutTeacher() {
    try {
      await window.GameData.call("teacher_logout");
    } catch (error) {
      // La sessió es tanca localment fins i tot si Apps Script no respon.
    }
    window.GameData.clearTeacherToken();
    showTeacherGate("Sessió tancada.");
  }

  function elapsedText(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - Number(timestamp || 0)) / 1000));
    if (seconds < 10) return "ara mateix";
    if (seconds < 60) return `fa ${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `fa ${minutes} min`;
    return `fa ${Math.floor(minutes / 60)} h`;
  }

  function statusOf(item) {
    const age = Date.now() - Number(item.updatedAt || 0);
    if (age > 10 * 60 * 1000) return "INACTIVE";
    return item.state || "WORKING";
  }

  function hasFocusIncident(item) {
    if (statusOf(item) === "INACTIVE") return false;
    if (item.focusState === "HIDDEN") return true;
    const incidentAt = Number(item.focusIncidentAt || 0);
    return incidentAt > 0 && Date.now() - incidentAt < FOCUS_ALERT_MS;
  }

  function updateFocusAlerts(items) {
    const now = Date.now();
    const seen = {};
    items.forEach((item) => {
      const key = String(item.key || item.sessionId || item.studentId || "");
      seen[key] = true;
      const current = item.focusState === "HIDDEN" ? "HIDDEN" : "VISIBLE";
      const previous = state.focusStates[key];
      if (current === "HIDDEN" && previous !== "HIDDEN") {
        const eventAt = previous === undefined ? Number(item.updatedAt || now) : now;
        if (now - eventAt < FOCUS_ALERT_MS) state.focusAlerts[key] = eventAt;
      }
      state.focusStates[key] = current;
      item.focusIncidentAt = Number(state.focusAlerts[key] || 0);
    });
    Object.keys(state.focusStates).forEach((key) => {
      if (!seen[key]) {
        delete state.focusStates[key];
        delete state.focusAlerts[key];
      }
    });
  }

  function scheduleFocusExpiry() {
    if (state.focusExpiryTimer) window.clearTimeout(state.focusExpiryTimer);
    state.focusExpiryTimer = null;
    const now = Date.now();
    const nextExpiry = state.items
      .map((item) => Number(item.focusIncidentAt || 0) + FOCUS_ALERT_MS)
      .filter((expiry) => expiry > now)
      .sort((a, b) => a - b)[0];
    if (!nextExpiry) return;
    state.focusExpiryTimer = window.setTimeout(() => {
      state.focusExpiryTimer = null;
      render();
    }, Math.max(50, nextExpiry - now + 50));
  }

  function makeDemoItems() {
    const now = Date.now();
    const base = window.GamificacioDemo.EXERCISES;
    const users = window.GamificacioDemo.USERS;
    state.items = users.map((user, index) => {
      const routeExercises = Array.isArray(base) ? base.filter((item) => item.route === user.route) : (base[user.route] || base.BASE);
      const exercise = routeExercises[index % routeExercises.length];
      return {
        key: `demo-${index}`,
        sessionId: `demo-${index}`,
        studentId: user.studentId,
        studentName: user.name,
        route: user.route,
        exerciseId: exercise.exerciseId,
        missionId: exercise.missionId,
        missionTitle: "Engegar els motors",
        questionHtml: exercise.questionHtml,
        expectedAnswer: exercise.expectedAnswer,
        answer: index === 0 ? "-7 + 12 = 5" : index === 1 ? "8 - 13 = 5" : "Estic provant -15 + 27",
        answerPreviewHtml: window.GameMath.studentTextToHtml(index === 0 ? "-7 + 12 = 5" : index === 1 ? "8 - 13 = 5" : "-15 + 27"),
        helpCount: index,
        state: index === 2 ? "NEEDS_TEACHER" : "WORKING",
        focusState: index === 1 ? "HIDDEN" : "VISIBLE",
        submissionReason: index === 1 ? "focus_hidden" : "normal",
        focusIncidentAt: index === 1 ? now - 10000 : 0,
        updatedAt: index === 1 ? now - 10000 : now - index * 47000
      };
    });
    updateFocusAlerts(state.items);
    render();
  }

  async function loadCatalog() {
    try {
      const data = await window.GameData.call("catalog");
      state.catalog.sectors = data.sectors || [];
      state.catalog.missions = data.missions || [];
      state.catalog.questions = data.questions || [];
      state.catalog.solutions = data.solutions || [];
      state.solutionIndex = state.catalog.solutions.reduce((index, solution) => {
        index[String(solution.id || "")] = solution;
        return index;
      }, {});
      state.catalog.levelPlans = data.levelPlans || [];
      state.catalog.nextLockedMission = data.nextLockedMission || null;
      dom.globalMissionSelect.innerHTML = '<option value="">Tria una missió</option>';
      state.catalog.missions.filter((mission) => mission.unlocked).forEach((mission) => {
        const option = document.createElement("option");
        option.value = mission.missionId;
        option.textContent = mission.title;
        dom.globalMissionSelect.appendChild(option);
      });
      renderUnlockControl();
      if (window.GameBattleTeacher) window.GameBattleTeacher.refreshCatalog();
    } catch (error) {
      dom.globalMissionSelect.innerHTML = '<option value="">No disponible</option>';
      toast(error.message, "error", 6500);
    }
  }

  async function ensureQuestionCatalog() {
    if (state.catalog.questions.length && state.catalog.solutions.length) return;
    if (!state.questionCatalogPromise) {
      state.questionCatalogPromise = window.GameData.call("question_catalog").then((data) => {
        state.catalog.questions = data.questions || [];
        state.catalog.solutions = data.solutions || [];
        state.solutionIndex = state.catalog.solutions.reduce((index, solution) => {
          index[String(solution.id || "")] = solution;
          return index;
        }, {});
      }).catch((error) => {
        state.questionCatalogPromise = null;
        throw error;
      });
    }
    await state.questionCatalogPromise;
  }

  function renderUnlockControl() {
    const next = state.catalog.nextLockedMission;
    if (!next) {
      dom.unlockMissionTitle.textContent = "Totes les missions del trimestre estan desbloquejades";
      dom.unlockMissionText.textContent = "Si augmentes el nombre de sectors en Configuracio, es crearan automàticament.";
      dom.unlockNextMissionButton.disabled = true;
      dom.unlockNextMissionButton.textContent = "Tot desbloquejat";
      return;
    }
    const sector = state.catalog.sectors.find((item) => item.sectorId === next.sectorId);
    dom.unlockMissionTitle.textContent = `Pròxima: ${next.title}`;
    dom.unlockMissionText.textContent = `${sector ? sector.title + " · " : ""}${next.targetExercises || 5} exercicis per fase. El desbloqueig servirà per a tot l'alumnat.`;
    dom.unlockNextMissionButton.disabled = false;
    dom.unlockNextMissionButton.textContent = "Desbloquejar missió";
  }

  async function unlockNextMission() {
    dom.unlockNextMissionButton.disabled = true;
    try {
      const data = await window.GameData.call("unlock_next_mission", {});
      toast(data.message || "Missió desbloquejada.", data.allUnlocked ? "warning" : "good", 6500);
      await loadCatalog();
    } catch (error) {
      toast(error.message, "error", 8000);
      renderUnlockControl();
    }
  }

  async function loadPendingProposals() {
    if (window.GameData.isDemo()) {
      state.pendingProposals = [];
    } else {
      try {
        const data = await window.GameData.call("list_proposals");
        state.pendingProposals = data.proposals || [];
      } catch (error) {
        return;
      }
    }
    dom.pendingProposalCount.textContent = state.pendingProposals.length;
    dom.pendingProposalCard.classList.toggle("hidden", state.pendingProposals.length < 1);
  }

  function reviewNextProposal() {
    const proposal = state.pendingProposals[0];
    if (!proposal) return;
    const liveStudent = state.items.find((item) => item.studentId === proposal.studentId);
    openProposal(proposal, liveStudent ? liveStudent.studentName : proposal.studentId);
  }

  async function loadPendingReviews() {
    if (window.GameData.isDemo()) {
      state.pendingReviews = [];
    } else {
      try {
        const data = await window.GameData.call("list_reviews");
        state.pendingReviews = data.reviews || [];
      } catch (error) {
        return;
      }
    }
    dom.pendingReviewCount.textContent = state.pendingReviews.length;
    dom.pendingReviewCard.classList.toggle("hidden", state.pendingReviews.length < 1);
  }

  async function loadDiagnostics() {
    if (window.GameData.isDemo()) {
      const now = new Date().toISOString();
      state.diagnostics = [
        { diagnosisId: "demo-d1", studentId: "u1", studentName: "Aina", missionId: "M01", route: "BASE", blockScore10: 7.5, exerciseScore10: 8, mastery: "EN_PROCES", confidence: .88, date: now, strengths: ["Calcula bé quan els signes són iguals"], difficulties: [{ code: "SIGNES_ENTERS", label: "Signes en nombres enters", confidence: .82, status: "SOSPITA", evidence: ["Exercicis 2 i 5"], recommendation: "Comparar valors absoluts abans d'operar" }], recommendation: "Practicar signes diferents." },
        { diagnosisId: "demo-d2", studentId: "u2", studentName: "Biel", missionId: "M01", route: "SUPORT", blockScore10: 5, exerciseScore10: 5, mastery: "NECESSITA_REFORC", confidence: .94, date: now, strengths: ["Identifica l'operació"], difficulties: [{ code: "FALTA_PROCEDIMENT", label: "Falta de procediment", confidence: .98, status: "CONFIRMADA", evidence: ["Exercicis 1, 3 i 5"], recommendation: "Escriure cada transformació amb =" }], recommendation: "Reforçar el treball pas a pas." }
      ];
    } else {
      try {
        const data = await window.GameData.call("list_diagnostics");
        state.diagnostics = data.diagnostics || [];
      } catch (error) {
        return;
      }
    }
    updateDiagnosticSummary();
  }

  function diagnosticsForDays(days) {
    const cutoff = Date.now() - Number(days || 31) * 24 * 60 * 60 * 1000;
    return state.diagnostics.filter((item) => {
      const timestamp = new Date(item.date || 0).getTime();
      return timestamp && timestamp >= cutoff;
    });
  }

  function updateDiagnosticSummary() {
    const recent = diagnosticsForDays(31);
    const average = recent.length ? recent.reduce((sum, item) => sum + Number(item.blockScore10 || 0), 0) / recent.length : 0;
    dom.diagnosticCount.textContent = recent.length;
    dom.diagnosticAverage.textContent = recent.length
      ? `Mitjana dels últims 31 dies: ${average.toFixed(1)} / 10`
      : "Encara no hi ha activitats diagnòstiques.";
    if (dom.diagnosticDialog.open) renderDiagnosticDashboard();
  }

  function diagnosticDifficultyRows(items) {
    const grouped = {};
    items.forEach((diagnosis) => (diagnosis.difficulties || []).forEach((difficulty) => {
      const key = String(difficulty.code || difficulty.label || "NO_DETERMINAT");
      if (!grouped[key]) grouped[key] = { label: difficulty.label || key, students: new Set(), count: 0, confidence: 0 };
      grouped[key].students.add(diagnosis.studentId);
      grouped[key].count += 1;
      grouped[key].confidence += Number(difficulty.confidence || 0);
    }));
    return Object.values(grouped).map((item) => ({ ...item, averageConfidence: item.count ? item.confidence / item.count : 0 }))
      .sort((a, b) => b.students.size - a.students.size || b.count - a.count);
  }

  function renderDiagnosticDashboard() {
    const items = diagnosticsForDays(dom.diagnosticRange.value || 31);
    const average = items.length ? items.reduce((sum, item) => sum + Number(item.blockScore10 || 0), 0) / items.length : 0;
    const reinforcementCount = state.pendingProposals.filter((item) => String(item.explanation || "").startsWith("REFORÇ DIAGNÒSTIC")).length;
    dom.diagnosticTotalBlocks.textContent = items.length;
    dom.diagnosticMeanScore.textContent = items.length ? `${average.toFixed(1)} / 10` : "—";
    dom.diagnosticReinforcementCount.textContent = reinforcementCount;

    const difficultyRows = diagnosticDifficultyRows(items);
    dom.diagnosticClassBody.innerHTML = difficultyRows.length ? difficultyRows.map((item) => `
      <tr><td>${window.GameMath.escapeHtml(item.label)}</td><td>${item.students.size}</td><td>${item.count}</td><td>${Math.round(item.averageConfidence * 100)}%</td></tr>
    `).join("") : '<tr><td colspan="4">No hi ha dificultats registrades en este període.</td></tr>';

    const selected = dom.diagnosticStudentSelect.value;
    const students = [...new Map(items.map((item) => [item.studentId, item.studentName || item.studentId])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ca", { sensitivity: "base" }));
    dom.diagnosticStudentSelect.innerHTML = '<option value="">Tria un alumne</option>' + students.map(([id, name]) => `<option value="${window.GameMath.escapeHtml(id)}">${window.GameMath.escapeHtml(name)}</option>`).join("");
    if (students.some(([id]) => id === selected)) dom.diagnosticStudentSelect.value = selected;
    renderDiagnosticStudent(items);
  }

  function renderDiagnosticStudent(filteredItems) {
    const studentId = dom.diagnosticStudentSelect.value;
    if (!studentId) {
      dom.diagnosticStudentDetail.innerHTML = "<p>Selecciona un alumne per veure la seua evolució.</p>";
      return;
    }
    const items = filteredItems.filter((item) => item.studentId === studentId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!items.length) return;
    const average = items.reduce((sum, item) => sum + Number(item.blockScore10 || 0), 0) / items.length;
    const difficulties = diagnosticDifficultyRows(items).slice(0, 5);
    const strengths = [...new Set(items.flatMap((item) => item.strengths || []))].slice(0, 4);
    const latest = items[0];
    dom.diagnosticStudentDetail.innerHTML = `
      <h4>${window.GameMath.escapeHtml(latest.studentName || studentId)} · ${average.toFixed(1)} / 10</h4>
      <p>${window.GameMath.escapeHtml(latest.recommendation || "Sense recomanació específica.")}</p>
      <div class="diagnostic-tags">${difficulties.map((item) => `<span class="diagnostic-tag">${window.GameMath.escapeHtml(item.label)} · ${item.count}</span>`).join("")}</div>
      ${strengths.length ? `<p><strong>Fortaleses:</strong> ${strengths.map(window.GameMath.escapeHtml).join(" · ")}</p>` : ""}
      <div class="diagnostic-recent">${items.slice(0, 5).map((item) => `<article><strong>${window.GameMath.escapeHtml(item.missionId)} · ${window.GameMath.escapeHtml(item.route)} · ${Number(item.blockScore10 || 0).toFixed(1)}/10</strong><small>${window.GameMath.escapeHtml(item.mastery || "NO_CONCLOENT")} · confiança ${Math.round(Number(item.confidence || 0) * 100)}%</small></article>`).join("")}</div>`;
  }

  function openDiagnostic() {
    renderDiagnosticDashboard();
    dom.diagnosticDialog.showModal();
  }

  async function openNextProcedureReview() {
    const review = state.pendingReviews[0];
    if (!review) return;
    dom.procedureReviewId.value = review.reviewId;
    dom.procedureReviewTitle.textContent = `${review.studentName || review.studentId} · ${review.exerciseId}`;
    dom.procedureReviewComment.value = review.aiReason || "";
    await window.GameMath.setHtml(dom.procedureReviewQuestion, review.questionHtml || "Sense pregunta");
    await window.GameMath.setText(dom.procedureReviewAnswer, review.studentAnswer || "Sense resposta");
    await window.GameMath.setText(dom.procedureReviewModel, review.modelSolution || "Sense solució model");
    dom.procedureReviewDialog.showModal();
  }

  async function decideProcedureReview(decision) {
    const reviewId = dom.procedureReviewId.value;
    if (!reviewId) return;
    setLoading(true, "Guardant la revisió…");
    try {
      const result = await window.GameData.call("decide_review", { reviewId, decision, comment: dom.procedureReviewComment.value });
      dom.procedureReviewDialog.close();
      state.pendingReviews = state.pendingReviews.filter((item) => item.reviewId !== reviewId);
      dom.pendingReviewCount.textContent = state.pendingReviews.length;
      dom.pendingReviewCard.classList.toggle("hidden", state.pendingReviews.length < 1);
      toast(result.retryAssigned ? "Revisió guardada. L'exercici tornarà a aparéixer a l'alumne." : "Revisió guardada i nota actualitzada.", "good", 6500);
      loadDiagnostics();
      if (state.pendingReviews.length) openNextProcedureReview();
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      setLoading(false);
    }
  }

  function renderReadiness(data, errorMessage = "") {
    const labels = {
      INSUFFICIENT_EVIDENCE: ["Evidència insuficient", "Encara no tenim prou informació per orientar el canvi de missió."],
      NEEDS_INTERVENTION: ["Cal atenció docent", "Una part significativa de l’alumnat participant necessita suport."],
      CONSIDER_ADVANCE: ["Es pot considerar avançar", "Les evidències permeten valorar el pas a la missió següent."],
      CONTINUE: ["Continuar la pràctica", "Convé continuar treballant i recollint evidències."]
    };
    const recommendation = labels[data?.recommendation] ? data.recommendation : "INSUFFICIENT_EVIDENCE";
    const [title, explanation] = labels[recommendation];
    const hasParticipants = Boolean(data?.participationSufficient);
    dom.readinessCard.dataset.recommendation = recommendation;
    dom.readinessStatus.textContent = title;
    dom.readinessMission.textContent = data?.missionLabel || "Missió activa";
    dom.readinessExplanation.textContent = errorMessage || (data?.presenceAvailable === false
      ? "No hi ha un senyal fiable de participació en viu."
      : (hasParticipants ? explanation : "No hi ha alumnat actiu detectat en aquesta sessió."));
    dom.readinessCoverage.textContent = hasParticipants ? `${data.coveragePercent}%` : "—";
    dom.readinessPrepared.textContent = hasParticipants ? `${data.preparedPercent}%` : "—";
    dom.readinessSupport.textContent = hasParticipants ? `${data.needsSupportPercent}%` : "—";
    const participating = data?.presenceAvailable ? data.participatingStudents : "—";
    const inactive = data?.presenceAvailable ? data.inactiveNowCount : "—";
    dom.readinessPopulation.textContent = `Participants detectats: ${participating} · No actius ara: ${inactive}`;
    const support = Array.isArray(data?.supportStudents) ? data.supportStudents.slice(0, 4) : [];
    dom.readinessSupportWrap.classList.toggle("hidden", !support.length);
    dom.readinessSupportList.replaceChildren();
    support.forEach((student) => {
      const item = document.createElement("li");
      item.textContent = student.name || student.studentId;
      dom.readinessSupportList.appendChild(item);
    });
  }

  function scheduleReadiness(delay = 900) {
    if (state.readinessDebounceTimer) window.clearTimeout(state.readinessDebounceTimer);
    const wait = Math.max(delay, 30000 - (Date.now() - state.readinessLastRequestAt));
    state.readinessDebounceTimer = window.setTimeout(refreshReadiness, wait);
  }

  async function refreshReadiness() {
    state.readinessDebounceTimer = null;
    if (!state.started) return;
    if (window.GameData.isDemo()) {
      renderReadiness(null, "La demostració no inclou evidència acadèmica de producció.");
      return;
    }
    const now = Date.now();
    const activeStudentIds = state.liveAvailable
      ? [...new Set(state.items.filter((item) => now - Number(item.updatedAt || 0) <= 10 * 60 * 1000)
        .map((item) => String(item.studentId || "").trim()).filter(Boolean))]
      : null;
    const requestSeq = ++state.readinessRequestSeq;
    state.readinessLastRequestAt = Date.now();
    try {
      const data = await window.GameData.call("teacher_dashboard", { activeStudentIds });
      if (state.started && requestSeq === state.readinessRequestSeq) renderReadiness(data);
    } catch (error) {
      if (state.started && requestSeq === state.readinessRequestSeq) renderReadiness(null, error.message);
    }
  }

  function startLive() {
    if (window.GameData.isDemo()) {
      setConnection("online", "Demostració");
      makeDemoItems();
      state.demoTimer = window.setInterval(() => {
        state.items.forEach((item, index) => {
          if (index === 0) item.updatedAt = Date.now();
        });
        render();
      }, 15000);
      return;
    }
    const db = window.GameLive.getDb();
    if (!db) {
      setConnection("error", "Firebase no disponible");
      state.liveAvailable = false;
      state.readinessLastRequestAt = 0;
      scheduleReadiness(0);
      return;
    }
    state.liveRef = db.ref(window.GameLive.pathFor("live"));
    state.liveRef.on("value", (snapshot) => {
      const value = snapshot.val() || {};
      const { items, removals } = normaliseLiveItems(value);
      updateFocusAlerts(items);
      state.items = items;
      if (!state.liveAvailable) state.readinessLastRequestAt = 0;
      state.liveAvailable = true;
      if (Object.keys(removals).length) {
        state.liveRef.update(removals).catch((error) => console.warn("No s'han pogut netejar sessions antigues.", error));
      }
      setConnection("online", "En directe");
      render();
      scheduleReadiness();
    }, (error) => {
      setConnection("error", "Error de Firebase");
      state.liveAvailable = false;
      state.readinessLastRequestAt = 0;
      scheduleReadiness(0);
      toast(error.message, "error", 7000);
    });
    state.goalRef = db.ref(window.GameLive.pathFor("classGoal"));
    state.goalRef.on("value", (snapshot) => {
      const goals = snapshot.val() || {};
      const value = Object.values(goals).reduce((sum, item) => sum + Number(item && item.value || 0), 0);
      const missions = Math.max(1, Object.keys(goals).length);
      renderGoal(Math.min(100, Math.round(value / missions)));
    });
  }

  function normaliseLiveItems(value) {
    const now = Date.now();
    const winners = new Map();
    const removals = {};
    Object.entries(value).forEach(([key, rawItem]) => {
      if (!rawItem || typeof rawItem !== "object") {
        removals[key] = null;
        return;
      }
      const item = { key, ...rawItem };
      const activityAt = Math.max(Number(item.updatedAt || 0), Number(item.startedAt || 0));
      if (!activityAt || now - activityAt > LIVE_TTL_MS) {
        removals[key] = null;
        return;
      }
      const studentKey = String(item.studentId || key).trim().toLocaleLowerCase("ca");
      const current = winners.get(studentKey);
      if (!current) {
        winners.set(studentKey, item);
        return;
      }
      const currentAt = Math.max(Number(current.updatedAt || 0), Number(current.startedAt || 0));
      const itemIsStableKey = key === window.GameLive.safeKey(item.studentId);
      const currentIsStableKey = current.key === window.GameLive.safeKey(current.studentId);
      const itemWins = activityAt > currentAt || (activityAt === currentAt && itemIsStableKey && !currentIsStableKey);
      if (itemWins) {
        removals[current.key] = null;
        winners.set(studentKey, item);
      } else {
        removals[key] = null;
      }
    });
    return { items: [...winners.values()], removals };
  }

  function expireLiveItems() {
    if (window.GameData.isDemo()) return;
    const now = Date.now();
    const expired = state.items.filter((item) => now - Math.max(Number(item.updatedAt || 0), Number(item.startedAt || 0)) > LIVE_TTL_MS);
    if (!expired.length) return;
    state.items = state.items.filter((item) => !expired.includes(item));
    if (state.liveRef) {
      const removals = Object.fromEntries(expired.map((item) => [item.key, null]));
      state.liveRef.update(removals).catch((error) => console.warn("No s'han pogut caducar sessions antigues.", error));
    }
  }

  function filteredItems() {
    const search = dom.searchInput.value.trim().toLowerCase();
    const filter = dom.statusFilter.value;
    return state.items
      .filter((item) => !search || String(item.studentName || "").toLowerCase().includes(search))
      .filter((item) => filter === "ALL" || statusOf(item) === filter)
      .sort((a, b) => Number(hasFocusIncident(b)) - Number(hasFocusIncident(a))
        || (hasFocusIncident(a) ? Number(b.focusIncidentAt || 0) - Number(a.focusIncidentAt || 0) : 0)
        || String(a.studentName || "").localeCompare(String(b.studentName || ""), "ca", { sensitivity: "base" })
        || String(a.studentId || "").localeCompare(String(b.studentId || "")));
  }

  function renderGoal(percent) {
    const value = Math.max(0, Math.min(100, Number(percent || 0)));
    dom.monitorGoalText.textContent = `${value}%`;
    dom.monitorGoalBar.style.width = `${value}%`;
  }

  async function render() {
    expireLiveItems();
    const items = filteredItems();
    scheduleFocusExpiry();
    const now = Date.now();
    const activeItems = state.items.filter((item) => now - Number(item.updatedAt || 0) <= 10 * 60 * 1000);
    dom.activeCount.textContent = activeItems.length;
    dom.workingCount.textContent = activeItems.filter((item) => statusOf(item) === "WORKING").length;
    dom.helpCount.textContent = activeItems.filter((item) => statusOf(item) === "NEEDS_TEACHER").length;
    dom.focusCount.textContent = activeItems.filter(hasFocusIncident).length;
    dom.lastUpdateText.textContent = state.items.length ? `Actualitzat ${elapsedText(Math.max(...state.items.map((item) => Number(item.updatedAt || 0))))}` : "Sense dades encara";
    dom.studentGrid.innerHTML = "";
    dom.emptyMonitor.classList.toggle("hidden", Boolean(items.length));
    items.forEach((item) => dom.studentGrid.appendChild(buildCard(item)));
    await window.GameMath.typeset([...dom.studentGrid.querySelectorAll(".math-content")]);
  }

  function levelPlanFor(item) {
    const saved = state.catalog.levelPlans.find((plan) => plan.studentId === item.studentId && plan.missionId === item.missionId);
    if (saved && Array.isArray(saved.levels)) return saved.levels.join(",");
    return String(item.levelPlan || "SUPORT,BASE,REPTE");
  }

  function solutionHtmlFor(item) {
    const solution = state.solutionIndex[String(item.exerciseId || "")] || {};
    const model = String(solution.modelSolution || "").trim();
    const expected = String(solution.expectedAnswer || item.expectedAnswer || "").trim();
    const value = model || (expected ? `Resposta esperada: ${expected}` : "No hi ha una solució model preparada.");
    if (/<[a-z][\s\S]*>/i.test(value)) return window.GameMath.sanitiseHtml(value);
    return window.GameMath.sanitiseHtml(window.GameMath.studentTextToHtml(value));
  }

  function buildCard(item) {
    const status = statusOf(item);
    const focusIncident = hasFocusIncident(item);
    const card = document.createElement("article");
    card.className = `student-card ${focusIncident ? "focus-loss" : ""} ${status === "NEEDS_TEACHER" ? "needs-teacher" : ""} ${status === "INACTIVE" ? "inactive" : ""}`.trim();
    const statusLabel = focusIncident ? "Fora de la pàgina" : status === "NEEDS_TEACHER" ? "Necessita ajuda" : status === "SUBMITTED" ? "Enviada" : status === "INACTIVE" ? "Inactiu" : "Treballant";
    const statusClass = focusIncident ? "focus-loss" : status === "NEEDS_TEACHER" ? "help" : status === "INACTIVE" ? "off" : "";
    const answerHtml = item.answerPreviewHtml || (item.answer ? window.GameMath.studentTextToHtml(item.answer) : "");
    const solutionHtml = solutionHtmlFor(item);
    const flags = [
      `<span class="flag">Fase actual: ${window.GameMath.escapeHtml(item.route || "SUPORT")}</span>`,
      `<span class="flag">💡 ${Number(item.helpCount || 0)} ajudes</span>`,
      focusIncident ? `<span class="flag focus">Canvi de focus: ${window.GameMath.escapeHtml(item.submissionReason || "detectat")}</span>` : ""
    ].join("");
    card.innerHTML = `
      <header class="student-card-header">
        <span class="student-initial">${window.GameMath.escapeHtml(String(item.studentName || "?").charAt(0).toUpperCase())}</span>
        <div><h2 class="student-name">${window.GameMath.escapeHtml(item.studentName || "Sense nom")}</h2><span class="student-subtitle">${elapsedText(item.updatedAt)}</span></div>
        <span class="live-status ${statusClass}">${statusLabel}</span>
      </header>
      <div class="student-card-body">
        <div class="mission-line"><span>${window.GameMath.escapeHtml(item.missionTitle || item.missionId || "Missió")}</span><small>${window.GameMath.escapeHtml(item.exerciseId || "")}</small></div>
        <div class="monitor-question math-content">${window.GameMath.sanitiseHtml(item.questionHtml || "Sense pregunta")}</div>
        <div class="monitor-answer math-content ${answerHtml ? "" : "empty"}">${answerHtml ? window.GameMath.sanitiseHtml(answerHtml) : "Encara no ha escrit res."}</div>
        <details class="monitor-solution" open>
          <summary>Solució model</summary>
          <div class="monitor-solution-content math-content">${solutionHtml}</div>
        </details>
        <div class="card-flags">${flags}</div>
        <div class="card-controls">
          <select class="level-select" aria-label="Fases de ${window.GameMath.escapeHtml(item.studentName)}">
            <option value="SUPORT,BASE,REPTE">Fases 1 + 2 + 3</option>
            <option value="SUPORT,BASE">Fases 1 + 2</option>
            <option value="BASE,REPTE">Fases 2 + 3</option>
            <option value="SUPORT">Només fase 1</option>
            <option value="BASE">Només fase 2</option>
            <option value="REPTE">Només fase 3</option>
          </select>
          <button class="secondary-button level-button" type="button">Guardar fases</button>
        </div>
        <div class="card-actions">
          <button class="comment-button" type="button">💬 Comentari</button>
          <button class="assign-button" type="button">🎯 Assignar</button>
          <button class="ai-button" type="button">✨ Reforç IA</button>
        </div>
      </div>`;
    card.querySelector(".level-select").value = levelPlanFor(item);
    card.querySelector(".level-button").addEventListener("click", () => changeMissionLevels(item, card.querySelector(".level-select").value));
    card.querySelector(".comment-button").addEventListener("click", () => openComment(item));
    card.querySelector(".assign-button").addEventListener("click", () => openAssignment(item));
    card.querySelector(".ai-button").addEventListener("click", () => generateProposal(item));
    return card;
  }

  async function changeMissionLevels(item, levels) {
    setLoading(true, "Guardant les fases…");
    try {
      const data = await window.GameData.call("set_mission_levels", { studentId: item.studentId, missionId: item.missionId, levels });
      const existing = state.catalog.levelPlans.find((plan) => plan.studentId === item.studentId && plan.missionId === item.missionId);
      if (existing) existing.levels = data.levels;
      else state.catalog.levelPlans.push({ studentId: item.studentId, missionId: item.missionId, levels: data.levels });
      item.levelPlan = data.levels.join(",");
      toast(`Fases de ${item.studentName}: ${data.levels.length}`, "good");
      render();
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      setLoading(false);
    }
  }

  async function openAssignment(item) {
    state.selectedItem = item;
    dom.assignDialogTitle.textContent = `Pròxima activitat per a ${item.studentName}`;
    setLoading(true, "Carregant el banc d'activitats…");
    try {
      await ensureQuestionCatalog();
    } catch (error) {
      toast(error.message, "error", 6500);
      return;
    } finally {
      setLoading(false);
    }
    dom.questionSelect.innerHTML = "";
    const questions = [...state.catalog.questions].sort((a, b) => String(a.missionId).localeCompare(String(b.missionId)) || String(a.route).localeCompare(String(b.route)));
    questions.forEach((question) => {
      const option = document.createElement("option");
      option.value = question.id;
      option.textContent = `[${question.route || "COMUNA"}] ${question.title || question.id}`.slice(0, 150);
      option.dataset.html = question.questionHtml || question.title || "";
      dom.questionSelect.appendChild(option);
    });
    previewSelectedQuestion();
    dom.assignDialog.showModal();
  }

  async function previewSelectedQuestion() {
    const option = dom.questionSelect.selectedOptions[0];
    await window.GameMath.setHtml(dom.questionPreview, option ? option.dataset.html : "No hi ha activitats disponibles.");
  }

  async function confirmAssignment() {
    if (!state.selectedItem || !dom.questionSelect.value) return;
    dom.confirmAssignButton.disabled = true;
    try {
      await window.GameData.call("teacher_assign", {
        scope: "ALUMNE",
        recipientId: state.selectedItem.studentId,
        type: "EXERCICI",
        contentId: dom.questionSelect.value,
        priority: 100
      });
      dom.assignDialog.close();
      toast(`Activitat preparada per a ${state.selectedItem.studentName}.`, "good");
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      dom.confirmAssignButton.disabled = false;
    }
  }

  async function assignToAll() {
    if (!dom.globalMissionSelect.value) {
      toast("Tria primer una missió.", "warning");
      return;
    }
    dom.assignAllButton.disabled = true;
    try {
      await window.GameData.call("teacher_assign", { scope: "TOTS", recipientId: "", type: "MISSIO", contentId: dom.globalMissionSelect.value, priority: 50 });
      toast("Missió assignada a tota la classe.", "good");
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      dom.assignAllButton.disabled = false;
    }
  }

  async function generateProposal(item) {
    setLoading(true, `La IA prepara un reforç per a ${item.studentName}…`);
    try {
      const data = await window.GameData.call("suggest_exercise", {
        studentId: item.studentId,
        studentName: item.studentName,
        exerciseId: item.exerciseId,
        missionId: item.missionId,
        route: item.route,
        questionHtml: item.questionHtml,
        expectedAnswer: item.expectedAnswer,
        studentAnswer: item.answer || ""
      });
      openProposal(data.proposal, item.studentName);
    } catch (error) {
      toast(error.message, "error", 7500);
    } finally {
      setLoading(false);
    }
  }

  async function openProposal(proposal, studentName) {
    state.selectedItem = state.items.find((item) => item.studentId === proposal.studentId) || state.selectedItem;
    dom.proposalDialogTitle.textContent = `Reforç per a ${studentName || (state.selectedItem && state.selectedItem.studentName) || "l'alumne"}`;
    dom.proposalId.value = proposal.proposalId;
    dom.proposalQuestion.value = proposal.questionHtml || "";
    dom.proposalAnswer.value = proposal.expectedAnswer || "";
    dom.proposalRoute.value = proposal.route || "BASE";
    dom.proposalMethod.value = proposal.methodId || "";
    dom.proposalExplanation.value = proposal.explanation || "";
    await updateProposalPreview();
    dom.proposalDialog.showModal();
  }

  async function updateProposalPreview() {
    await window.GameMath.setHtml(dom.proposalMathPreview, dom.proposalQuestion.value);
  }

  async function decideProposal(decision) {
    if (!dom.proposalId.value) return;
    const button = decision === "APPROVE" ? dom.approveProposalButton : dom.rejectProposalButton;
    button.disabled = true;
    try {
      await window.GameData.call("teacher_decision", {
        proposalId: dom.proposalId.value,
        decision,
        questionHtml: dom.proposalQuestion.value,
        expectedAnswer: dom.proposalAnswer.value,
        route: dom.proposalRoute.value,
        methodId: dom.proposalMethod.value
      });
      dom.proposalDialog.close();
      toast(decision === "APPROVE" ? "Exercici aprovat i assignat." : "Proposta rebutjada.", decision === "APPROVE" ? "good" : "warning");
      await loadCatalog();
      await loadPendingProposals();
    } catch (error) {
      toast(error.message, "error", 7000);
    } finally {
      button.disabled = false;
    }
  }

  function openComment(item) {
    state.commentTarget = item || "GLOBAL";
    dom.commentDialogTitle.textContent = item ? `Comentari per a ${item.studentName}` : "Comentari per a tota la classe";
    dom.commentText.value = "";
    dom.commentDialog.showModal();
    dom.commentText.focus();
  }

  async function sendComment() {
    const text = dom.commentText.value.trim();
    if (!text) return;
    dom.sendCommentButton.disabled = true;
    try {
      if (!window.GameData.isDemo()) {
        const db = window.GameLive.getDb();
        const sessionId = state.commentTarget === "GLOBAL" ? "_global" : state.commentTarget.sessionId;
        await db.ref(window.GameLive.pathFor("comments", sessionId)).set({ text, updatedAt: window.firebase.database.ServerValue.TIMESTAMP });
      }
      dom.commentDialog.close();
      toast("Comentari enviat.", "good");
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      dom.sendCommentButton.disabled = false;
    }
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;
    dom.searchInput.addEventListener("input", render);
    dom.statusFilter.addEventListener("change", render);
    dom.questionSelect.addEventListener("change", previewSelectedQuestion);
    dom.confirmAssignButton.addEventListener("click", confirmAssignment);
    dom.assignAllButton.addEventListener("click", assignToAll);
    dom.unlockNextMissionButton.addEventListener("click", unlockNextMission);
    dom.reviewProposalButton.addEventListener("click", reviewNextProposal);
    dom.reviewProcedureButton.addEventListener("click", openNextProcedureReview);
    dom.openDiagnosticButton.addEventListener("click", openDiagnostic);
    dom.diagnosticRange.addEventListener("change", renderDiagnosticDashboard);
    dom.diagnosticStudentSelect.addEventListener("change", () => renderDiagnosticStudent(diagnosticsForDays(dom.diagnosticRange.value || 31)));
    dom.markCorrectButton.addEventListener("click", () => decideProcedureReview("CORRECTE"));
    dom.markPartialButton.addEventListener("click", () => decideProcedureReview("PARCIAL"));
    dom.markIncorrectButton.addEventListener("click", () => decideProcedureReview("INCORRECTE"));
    dom.globalCommentButton.addEventListener("click", () => openComment(null));
    dom.sendCommentButton.addEventListener("click", sendComment);
    dom.proposalQuestion.addEventListener("input", () => {
      window.clearTimeout(dom.proposalQuestion.previewTimer);
      dom.proposalQuestion.previewTimer = window.setTimeout(updateProposalPreview, 350);
    });
    dom.approveProposalButton.addEventListener("click", () => decideProposal("APPROVE"));
    dom.rejectProposalButton.addEventListener("click", () => decideProposal("REJECT"));
  }

  async function init() {
    cacheDom();
    dom.teacherLoginForm.addEventListener("submit", loginTeacher);
    dom.teacherSignOutButton.addEventListener("click", logoutTeacher);
    window.addEventListener("gamificacio:teacher-auth-required", () => showTeacherGate("La sessió ha caducat. Torna a escriure la contrasenya."));

    if (window.GameData.isDemo()) {
      await startMonitor();
      return;
    }

    if (!window.GameData.hasTeacherToken()) {
      showTeacherGate();
      return;
    }

    dom.teacherAuthMessage.textContent = "Comprovant la sessió…";
    try {
      await window.GameData.call("teacher_check");
      await startMonitor();
    } catch (error) {
      showTeacherGate(error.message);
    }
  }

  window.addEventListener("beforeunload", stopMonitor);
  document.addEventListener("DOMContentLoaded", init);
}());

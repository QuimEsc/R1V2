(function () {
  "use strict";

  const config = window.GAMIFICACIO_CONFIG;
  const FOCUS_KEY = "gamificacio-reforc-focus-session-v1";
  const STUDENT_KEY = "gamificacio-reforc-last-student-v1";
  const AVATARS = Array.from({ length: 15 }, (_, index) => `avatar-${String(index + 1).padStart(2, "0")}`);
  const BADGE_CATALOG = [
    { id: "PRIMER_PAS", imageClass: "badge-primer-pas", title: "Primer enlairament" },
    { id: "AJUDA_BONA", imageClass: "badge-ajuda-bona", title: "Demane ajuda bé" },
    { id: "PAS_A_PAS", imageClass: "badge-pas-a-pas", title: "Pas a pas" },
    { id: "NO_RENDIR", imageClass: "badge-no-rendir", title: "No m'he rendit" },
    { id: "RATXA_3", imageClass: "badge-ratxa-3", title: "Motor encés" },
    { id: "MISSIO_COMPLETA", imageClass: "badge-missio-completa", title: "Missió completada" },
    { id: "REPTE_EXTRA", imageClass: "badge-repte-extra", title: "Cometa veloç" },
    { id: "ARENA", imageClass: "badge-arena", title: "Aventurer de l'arena" },
    { id: "SORPRESA_ARENA", imageClass: "badge-sorpresa-arena", title: "Cofre misteriós" }
  ];
  const BADGE_IMAGE_CLASSES = BADGE_CATALOG.map((badge) => badge.imageClass);
  const state = {
    student: null,
    sessionId: "",
    diagnostic: null,
    trimester: config.defaultTrimester,
    missions: [],
    sector: null,
    waitingForUnlock: false,
    waitingForContent: false,
    currentMission: null,
    currentExercise: null,
    nextExercise: null,
    exerciseBuffer: [],
    attemptQueue: null,
    fastTransition: false,
    stats: {},
    badges: [],
    classGoal: null,
    ip: "",
    helpCount: 0,
    submitting: false,
    submittedExerciseId: "",
    autoAdvancePending: false,
    retryFeedback: "",
    submissionId: "",
    lastFocusLossAt: 0,
    pendingFocusWarning: false,
    answerDebounce: null,
    previewDebounce: null,
    sound: false,
    pendingAvatarChoice: false,
    liveWarningShown: false
    ,classActivityVersion: 0
  };

  const dom = {};

  function cacheDom() {
    [
      "setupNotice", "loginScreen", "diagnosticScreen", "missionScreen", "exerciseScreen", "loginForm", "studentSelect", "enterButton", "teacherLink",
      "diagnosticProgress", "diagnosticQuestion", "diagnosticHint", "diagnosticForm", "diagnosticAnswer", "diagnosticSubmit", "diagnosticMessage",
      "connectionText", "playerAvatar", "playerName", "logoutButton", "energyValue", "streakValue", "progressText",
      "progressBar", "badgeCount", "badgeList", "classGoalTitle", "classGoalValue", "classGoalBar", "goalCore",
      "journeyEyebrow", "journeyTitle", "journeyDescription", "missionMap", "currentMissionTitle",
      "currentMissionDescription", "openExerciseButton", "backToMapButton", "exerciseMissionLabel", "exerciseStepLabel",
      "helpCounter", "mechanicalGuide", "mechanicalGuideTitle", "mechanicalRule", "mechanicalExample", "questionContent", "answerForm", "standardAnswerFields", "procedureNotice", "procedureNoticeText", "answerInputLabel", "answerInput", "mathPreviewWrap", "mathPreview", "geometryEditor",
      "geometryCanvas", "geometryUndoButton", "geometryClearButton", "geometryPointCount", "hintButton",
      "submitButton", "hintPanel", "hintTitle", "hintText", "hintQuestion", "resultPanel", "resultIcon", "resultTitle",
      "resultText", "nextExerciseButton", "loadingOverlay", "loadingText", "toastRegion", "rewardDialog", "rewardIcon",
      "rewardTitle", "rewardDescription", "closeRewardButton", "soundButton", "brandSubtitle", "profileDialog", "avatarGrid", "profileBadgeList",
      "saveAvatarButton", "avatarChangeStatus"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function setLoading(visible, text) {
    if (text) dom.loadingText.textContent = text;
    dom.loadingOverlay.classList.toggle("hidden", !visible);
  }

  function toast(message, type = "", duration = 4200) {
    const item = document.createElement("div");
    item.className = `toast ${type}`.trim();
    item.textContent = message;
    dom.toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), duration);
  }

  async function syncLive(action) {
    try {
      await action();
      return true;
    } catch (error) {
      console.warn("No s'ha pogut sincronitzar el seguiment en Firebase.", error);
      if (!state.liveWarningShown) {
        state.liveWarningShown = true;
        toast("El seguiment en directe no està disponible ara, però les respostes continuaran guardant-se.", "warning", 8500);
      }
      return false;
    }
  }

  function showScreen(name) {
    dom.loginScreen.classList.toggle("hidden", name !== "login");
    dom.diagnosticScreen.classList.toggle("hidden", name !== "diagnostic");
    dom.missionScreen.classList.toggle("hidden", name !== "mission");
    dom.exerciseScreen.classList.toggle("hidden", name !== "exercise");
    dom.teacherLink.classList.toggle("hidden", name !== "login");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyTheme(trimester) {
    const theme = config.themeByTrimester[Number(trimester)] || "space";
    document.body.classList.remove("theme-space", "theme-city", "theme-expedition");
    document.body.classList.add(`theme-${theme}`);
    const labels = {
      space: ["Agència espacial", "TRIMESTRE 1 · SECTOR ORBITAL", "Ruta de missions", "Avança punt per punt i recupera l'energia de la base."],
      city: ["Ciutat dels robots", "TRIMESTRE 2 · DISTRICTE ROBÒTIC", "Plànol de reparacions", "Completa missions i torna a posar en marxa la ciutat."],
      expedition: ["Expedició del tresor", "TRIMESTRE 3 · TERRITORI DESCONEGUT", "Mapa de l'expedició", "Supera les proves i obri el camí fins al tresor matemàtic."]
    };
    const copy = labels[theme];
    dom.brandSubtitle.textContent = copy[0];
    dom.journeyEyebrow.textContent = copy[1];
    dom.journeyTitle.textContent = copy[2];
    dom.journeyDescription.textContent = copy[3];
  }

  async function loadStudents() {
    dom.setupNotice.classList.toggle("hidden", window.GameData.isConfigured() || window.GameData.isDemo());
    try {
      const data = await window.GameData.call("list_students");
      dom.studentSelect.innerHTML = '<option value="">Tria el teu nom</option>';
      (data.students || []).forEach((student) => {
        const option = document.createElement("option");
        option.value = student.studentId;
        option.textContent = student.name;
        option.dataset.route = student.route || "BASE";
        dom.studentSelect.appendChild(option);
      });
      const remembered = sessionStorage.getItem(STUDENT_KEY);
      if (remembered && [...dom.studentSelect.options].some((option) => option.value === remembered)) dom.studentSelect.value = remembered;
      dom.studentSelect.disabled = false;
      dom.enterButton.disabled = !dom.studentSelect.value;
      dom.connectionText.textContent = window.GameData.isDemo() ? "Mode demostració preparat" : "Base connectada";
      document.querySelector(".status-dot").classList.add("online");
    } catch (error) {
      dom.studentSelect.innerHTML = '<option value="">No s\'han pogut carregar els noms</option>';
      dom.connectionText.textContent = error.message;
      document.querySelector(".status-dot").classList.add("error");
      toast(error.message, "error", 7000);
    }
  }

  async function resolveIp() {
    try {
      const response = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const data = await response.json();
      state.ip = String(data.ip || "").slice(0, 80);
    } catch (error) {
      state.ip = "";
    }
  }

  async function login(studentId) {
    setLoading(true, "Obrint la teua ruta…");
    try {
      const attemptQueue = window.GameAttemptQueue && window.GameAttemptQueue.create(studentId, confirmQueuedAttempt, queuedAttemptError);
      if (attemptQueue && attemptQueue.count() && !(await attemptQueue.flush())) {
        throw new Error("Hi ha respostes pendents de sincronitzar. Torna a entrar quan hi haja connexió.");
      }
      const data = await window.GameData.call("bootstrap", { studentId, ...(state.student && state.student.studentId === studentId && state.sessionId ? { sessionId: state.sessionId } : {}) });
      state.student = data.student;
      state.sessionId = data.sessionId;
      state.attemptQueue = attemptQueue || null;
      sessionStorage.setItem(STUDENT_KEY, studentId);
      if (data.requireDiagnostic) {
        state.diagnostic = data.diagnostic || { available: false, message: "No s'ha pogut preparar l'activitat. Avisa el professor." };
        renderDiagnostic();
        showScreen("diagnostic");
        return;
      }
      state.diagnostic = null;
      state.trimester = data.trimester || config.defaultTrimester;
      state.missions = data.missions || [];
      state.sector = data.sector || null;
      state.waitingForUnlock = Boolean(data.waitingForUnlock);
      state.waitingForContent = Boolean(data.waitingForContent);
      state.currentMission = data.currentMission || null;
      state.currentExercise = data.currentExercise || null;
      state.nextExercise = null;
      state.exerciseBuffer = Array.isArray(data.exerciseBuffer) ? data.exerciseBuffer : [];
      state.fastTransition = Boolean(attemptQueue && Array.isArray(data.exerciseBuffer));
      state.retryFeedback = "";
      state.stats = data.stats || {};
      state.badges = data.badges || [];
      state.classGoal = data.classGoal || { title: "Energia de la classe", value: 0, target: 100 };
      state.classActivityVersion = Number(data.classControl && data.classControl.activityVersion || 0);
      state.helpCount = Number((state.currentExercise && state.currentExercise.helpCount) || 0);
      state.submittedExerciseId = "";
      state.liveWarningShown = false;
      prepareFocusSession(studentId);
      applyTheme(state.trimester);
      renderMissionScreen();
      const liveSession = await window.GameLive.start({
        sessionId: state.sessionId,
        studentId: state.student.studentId,
        studentName: state.student.name,
        onComment: (comment) => toast(`Professor: ${comment.text}`, "warning", 9000),
        onReplaced: () => {
          const replacedSessionId = state.sessionId;
          toast("Este alumne acaba d'entrar des d'un altre dispositiu. Esta pantalla es tancarà.", "warning", 8000);
          window.setTimeout(() => {
            if (state.student && state.sessionId === replacedSessionId) logout();
          }, 500);
        }
      });
      const previous = liveSession && liveSession.previous;
      if (previous && state.currentExercise && previous.exerciseId === String(state.currentExercise.exerciseId || "") && previous.answer) {
        state.currentExercise.savedAnswer = previous.answer;
        state.currentExercise.savedAnswerPreviewHtml = previous.answerPreviewHtml || "";
        state.helpCount = Math.max(state.helpCount, Number(previous.helpCount || 0));
      }
      if (window.GameBattleStudent) window.GameBattleStudent.setStudent(state.student);
      window.GameLive.subscribeClassControl((control) => {
        if (!control || !state.student) return;
        const version = Number(control.activityVersion || 0);
        if (version > state.classActivityVersion) {
          state.classActivityVersion = version;
          toast("El professor ha començat la missió de la classe.", "good", 5000);
          refreshBootstrap();
        }
      });
      resolveIp();
      showScreen("mission");
    } catch (error) {
      toast(error.message, "error", 7000);
    } finally {
      setLoading(false);
    }
  }

  async function renderDiagnostic() {
    const diagnostic = state.diagnostic || {};
    const question = diagnostic.question || null;
    const available = Boolean(diagnostic.available && question);
    dom.diagnosticProgress.textContent = available ? `Activitat ${Number(diagnostic.answeredCount || 0) + 1}` : "";
    dom.diagnosticQuestion.innerHTML = available ? question.questionHtml || "" : "";
    dom.diagnosticHint.textContent = available && question.stage === "SCAFFOLDED" ? `💡 ${question.hint || "Torna a pensar com resoldre-ho."}` : "";
    dom.diagnosticHint.classList.toggle("hidden", !dom.diagnosticHint.textContent);
    dom.diagnosticForm.classList.toggle("hidden", !available);
    dom.diagnosticMessage.textContent = available ? "" : (diagnostic.message || "No s'ha pogut preparar l'activitat. Avisa el professor.");
    dom.diagnosticMessage.classList.toggle("hidden", available);
    dom.diagnosticAnswer.value = "";
    dom.diagnosticSubmit.disabled = !available;
    if (available) {
      await window.GameMath.typeset(dom.diagnosticQuestion);
      dom.diagnosticAnswer.focus();
    }
  }

  async function submitDiagnostic() {
    if (state.submitting || !state.diagnostic || !state.diagnostic.question || !state.student) return;
    const question = state.diagnostic.question;
    const answer = dom.diagnosticAnswer.value.trim();
    if (!answer) return;
    state.submitting = true;
    dom.diagnosticSubmit.disabled = true;
    try {
      const result = await window.GameData.call("diagnostic_submit", {
        studentId: state.student.studentId,
        diagnosticSessionId: state.diagnostic.diagnosticSessionId,
        questionUid: question.questionUid,
        stage: question.stage,
        answer
      });
      state.diagnostic = result.diagnostic;
      if (state.diagnostic && !state.diagnostic.requireDiagnostic) {
        await login(state.student.studentId);
      } else {
        await renderDiagnostic();
      }
    } catch (error) {
      toast(error.message, "error", 7000);
    } finally {
      state.submitting = false;
      dom.diagnosticSubmit.disabled = false;
    }
  }

  function renderMissionScreen() {
    dom.playerName.textContent = state.student.name;
    setAvatarClass(dom.playerAvatar, currentAvatar());
    updateStats(state.stats, state.badges, state.classGoal);
    if (state.sector) {
      dom.journeyEyebrow.textContent = `TRIMESTRE ${state.trimester} · ${String(state.sector.title || "Sector").toUpperCase()}`;
      dom.journeyTitle.textContent = state.sector.subtitle || "Ruta de missions";
      dom.journeyDescription.textContent = state.sector.description || "Avança missió a missió.";
      document.body.dataset.sectorVisual = state.sector.visualCode || "";
    }
    renderMap();
    const mission = state.currentMission || state.missions.find((item) => item.status === "CURRENT") || null;
    state.currentMission = mission;
    if (mission) {
      dom.currentMissionTitle.textContent = mission.title;
      dom.currentMissionDescription.textContent = state.waitingForUnlock
        ? "Missió preparada. El professor la desbloquejarà quan comence la classe."
        : state.waitingForContent
          ? "Esta missió encara no té exercicis preparats."
          : (mission.description || "Continua avançant per la teua ruta.");
    } else {
      dom.currentMissionTitle.textContent = "Sector completat";
      dom.currentMissionDescription.textContent = "Has completat totes les missions disponibles.";
    }
    dom.openExerciseButton.disabled = !state.currentExercise;
    dom.openExerciseButton.firstChild.textContent = state.currentExercise ? "Començar " : (state.waitingForUnlock ? "Bloquejada " : "Completat ");
  }

  function hashCode(value) {
    return String(value || "").split("").reduce((total, char) => ((total << 5) - total) + char.charCodeAt(0), 0);
  }

  function currentAvatar() {
    if (!state.student || !state.student.avatarUnlocked) return "avatar-locked";
    const saved = String((state.student && state.student.avatar) || "");
    return AVATARS.includes(saved) ? saved : "avatar-locked";
  }

  function setAvatarClass(element, avatar) {
    AVATARS.forEach((name) => element.classList.remove(name));
    element.classList.remove("avatar-locked");
    element.classList.add("avatar-sprite", avatar);
    element.dataset.avatar = avatar;
    element.textContent = avatar === "avatar-locked" ? "?" : "";
    if (element === dom.playerAvatar) {
      element.setAttribute("aria-label", avatar === "avatar-locked"
        ? "Obrir el perfil. Completa la primera missió per triar avatar"
        : "Obrir el perfil i consultar l'avatar");
    }
  }

  function updateStats(stats = {}, badges = [], classGoal = null) {
    state.stats = stats;
    state.badges = badges || state.badges;
    state.classGoal = classGoal || state.classGoal;
    dom.energyValue.textContent = Number(stats.energy || 0);
    dom.streakValue.textContent = Number(stats.streak || 0);
    const progress = Math.max(0, Math.min(100, Number(stats.progress || 0)));
    dom.progressText.textContent = `${progress}%`;
    dom.progressBar.style.width = `${progress}%`;
    dom.badgeCount.textContent = state.badges.reduce((total, badge) => total + Number(badge.count || 1), 0);
    dom.badgeList.innerHTML = "";
    if (!state.badges.length) {
      dom.badgeList.innerHTML = '<span class="empty-mini">Encara no n\'hi ha</span>';
    } else {
      state.badges.slice(-4).forEach((badge) => {
        const chip = document.createElement("span");
        const definition = badgeDefinition(badge.badgeId);
        chip.className = `badge-chip badge-image${definition ? ` ${definition.imageClass}` : ""}`;
        if (!definition) chip.textContent = badge.icon || "🏅";
        if (Number(badge.count || 1) > 1) {
          const count = document.createElement("b");
          count.className = "badge-repeat-count";
          count.textContent = `×${Math.min(5, Number(badge.count || 1))}`;
          chip.appendChild(count);
        }
        chip.title = `${badge.title || badge.name || "Insígnia"}: ${badge.description || ""}`;
        chip.setAttribute("aria-label", chip.title);
        dom.badgeList.appendChild(chip);
      });
    }
    const goal = state.classGoal || { title: "Energia de la classe", value: 0, target: 100 };
    const goalPercent = Math.min(100, Math.round((Number(goal.value || 0) / Math.max(1, Number(goal.target || 100))) * 100));
    dom.classGoalTitle.textContent = goal.title || "Energia de la classe";
    dom.classGoalValue.textContent = `${goal.value || 0}/${goal.target || 100}`;
    dom.classGoalBar.style.width = `${goalPercent}%`;
    dom.goalCore.textContent = `${goalPercent}%`;
  }

  function renderMap() {
    dom.missionMap.innerHTML = "";
    const allMissions = state.missions.length ? state.missions : [{ missionId: "END", title: "Sense missions", status: "LOCKED", icon: "🔒" }];
    const activeSectorId = String((state.sector && state.sector.sectorId)
      || (state.currentMission && state.currentMission.sectorId)
      || "");
    const sectorMissions = activeSectorId
      ? allMissions.filter((mission) => String(mission.sectorId || "") === activeSectorId)
      : [];
    const activeMissionIndex = Math.max(0, allMissions.findIndex((mission) => mission.status === "CURRENT"));
    const sectorStart = Math.floor(activeMissionIndex / 5) * 5;
    const missions = sectorMissions.length ? sectorMissions : allMissions.slice(sectorStart, sectorStart + 5);
    const currentIndex = Math.max(0, missions.findIndex((item) => item.status === "CURRENT"));
    const patterns = [-78, 52, -42, 74, -65, 38, -24];
    const progressVisual = (mission) => {
      const mastery = String(mission.masteryState || "");
      const learning = String(mission.learningState || "");
      const completion = String(mission.completionState || "");
      if (learning === "DOMINI_ASSOLIT" || mastery === "ADQUIRIDA" || mastery === "CONSOLIDADA") {
        return { symbol: "◕", className: "progress-mastered", label: "Bon progrés" };
      }
      if (completion === "COMPLETED" || (!completion && mission.status === "DONE")) {
        return { symbol: "◑", className: "progress-completed", label: "Treball fet" };
      }
      if (completion === "IN_PROGRESS" || (!completion && mission.status === "CURRENT")) {
        return { symbol: "◔", className: "progress-active", label: "En curs" };
      }
      return { symbol: "○", className: "progress-empty", label: "Per començar" };
    };
    missions.forEach((mission, index) => {
      const denominator = Math.max(1, missions.length - 1);
      const x = 8 + (index / denominator) * 84;
      const y = patterns[index % patterns.length];
      const mobileY = 60 + index * 105;
      const mobileX = index % 2 === 0 ? -58 : 58;
      const button = document.createElement("button");
      const status = String(mission.status || "LOCKED").toLowerCase();
      const visual = progressVisual(mission);
      button.type = "button";
      button.className = `mission-node ${status} ${visual.className}`;
      button.style.setProperty("--node-x", `${x}%`);
      button.style.setProperty("--node-y", `${y}px`);
      button.style.setProperty("--node-mobile-y", `${mobileY}px`);
      button.style.setProperty("--node-mobile-x", `${mobileX}px`);
      button.disabled = status === "locked";
      const missionNumber = Number(mission.order || 0) || (sectorStart + index + 1);
      button.innerHTML = `<span class="node-orb" aria-hidden="true">${visual.symbol}</span><strong>${window.GameMath.escapeHtml(mission.title)}</strong><small>Missió ${missionNumber}</small>`;
      button.setAttribute("aria-label", `${mission.title}. ${visual.label}. Missió ${missionNumber}`);
      if (status === "current") button.addEventListener("click", openExercise);
      dom.missionMap.appendChild(button);
    });
    const avatar = document.createElement("span");
    const denominator = Math.max(1, missions.length - 1);
    const x = 8 + (currentIndex / denominator) * 84;
    const y = patterns[currentIndex % patterns.length];
    avatar.className = "map-avatar avatar-sprite";
    setAvatarClass(avatar, currentAvatar());
    avatar.style.setProperty("--avatar-x", `${x}%`);
    avatar.style.setProperty("--avatar-y", `${y}px`);
    avatar.style.setProperty("--avatar-mobile-y", `${60 + currentIndex * 105}px`);
    avatar.style.setProperty("--avatar-mobile-x", `${currentIndex % 2 === 0 ? -58 : 58}px`);
    dom.missionMap.appendChild(avatar);
  }

  function isGeometryExercise() {
    return Boolean(state.currentExercise && state.currentExercise.interactionType);
  }

  function currentAnswer() {
    if (isGeometryExercise() && window.GameGeometry) return window.GameGeometry.serialise();
    return dom.answerInput.value.trim();
  }

  function currentAnswerPreview() {
    if (isGeometryExercise() && window.GameGeometry) return window.GameGeometry.previewSvg();
    const value = dom.answerInput.value.trim();
    return value ? window.GameMath.studentTextToHtml(value) : "";
  }

  function createSubmissionId() {
    const random = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${state.sessionId}-${state.currentExercise ? state.currentExercise.exerciseId : "exercise"}-${random}`;
  }

  function procedureParts(answer) {
    return String(answer || "")
      .replace(/\\(?:Rightarrow|rightarrow)|⇒|→/g, "\n")
      .split(/={1,2}>?|\r?\n/)
      .map((part) => part.replace(/^\s*(?:resposta|resultat|soluci[oó])\s*:\s*/i, "").trim())
      .filter(Boolean);
  }

  function procedureIsSufficient(answer) {
    if (!state.currentExercise || !state.currentExercise.requiresProcedure) return true;
    const parts = procedureParts(answer);
    const minimum = Math.max(2, Number(state.currentExercise.minimumSteps || 2));
    if (parts.length < minimum) return false;
    const unique = new Set(parts.map((part) => part.toLowerCase().replace(/\s+/g, "")));
    return unique.size > 1;
  }

  function focusAnswerEditor() {
    if (isGeometryExercise()) dom.geometryCanvas.focus({ preventScroll: true });
    else dom.answerInput.focus({ preventScroll: true });
  }

  function handleGeometryChange(change) {
    window.clearTimeout(state.answerDebounce);
    state.answerDebounce = window.setTimeout(() => {
      syncLive(() => window.GameLive.updateDynamic({ answer: change.answer, answerPreviewHtml: change.previewHtml, state: "WORKING" }));
    }, config.liveAnswerDebounceMs);
  }

  async function openExercise() {
    if (!state.currentExercise) return;
    state.submissionId = createSubmissionId();
    dom.nextExerciseButton.innerHTML = 'Continuar <span>→</span>';
    state.helpCount = Number(state.currentExercise.helpCount || 0);
    state.submittedExerciseId = "";
    state.autoAdvancePending = false;
    dom.helpCounter.textContent = state.helpCount;
    const curriculumMission = window.ReforcCore && window.ReforcCore.MISSIONS.find((item) => item.missionId === state.currentExercise.missionId);
    const explanation = state.currentExercise.explanation || curriculumMission || {};
    dom.mechanicalGuideTitle.textContent = explanation.title || (state.currentMission && state.currentMission.title) || "Mira el model i repeteix";
    dom.mechanicalRule.textContent = explanation.rule || state.currentExercise.hint1 || "Fes el mateix procés que en l'exemple.";
    const explanationRendering = window.GameMath.setText(dom.mechanicalExample, explanation.example || state.currentExercise.hint2 || "Mira l'exemple resolt i canvia només els nombres.");
    dom.exerciseMissionLabel.textContent = (state.currentMission && state.currentMission.title) || "MISSIÓ";
    dom.exerciseStepLabel.textContent = `Exercici ${state.currentExercise.levelStep || 1} de ${state.currentExercise.levelTotal || 5}`;
    dom.answerInput.value = state.currentExercise.savedAnswer || "";
    dom.answerInput.rows = state.currentExercise.requiresProcedure ? 5 : 2;
    dom.answerInput.classList.toggle("quick-answer", !state.currentExercise.requiresProcedure);
    dom.answerInput.disabled = false;
    dom.answerInputLabel.textContent = state.currentExercise.requiresProcedure ? "Escriu el teu procediment" : "Escriu la resposta";
    dom.procedureNotice.classList.toggle("hidden", !state.currentExercise.requiresProcedure);
    if (state.currentExercise.requiresProcedure) {
      const minimum = Math.max(2, Number(state.currentExercise.minimumSteps || 2));
      const reasoning = state.currentExercise.procedureMode === "RAONAMENT";
      dom.procedureNoticeText.textContent = reasoning
        ? "Escriu una raó o comprovació i acaba amb una última línia «Resposta: ...»."
        : (minimum <= 2
          ? "Escriu l’operació completa i el resultat units amb =."
          : `Escriu almenys ${minimum} expressions separades amb = o →, des de l’operació inicial fins al resultat.`);
    }
    dom.answerInput.placeholder = state.currentExercise.requiresProcedure
      ? (state.currentExercise.procedureMode === "RAONAMENT"
        ? "Explica breument com ho saps…\nResposta: ..."
        : "Escriu cada pas fins al resultat…")
      : "Escriu només el resultat o la resposta final…";
    const geometryExercise = isGeometryExercise();
    dom.standardAnswerFields.classList.toggle("hidden", geometryExercise);
    dom.geometryEditor.classList.toggle("hidden", !geometryExercise);
    if (geometryExercise) {
      window.GameGeometry.start({
        canvas: dom.geometryCanvas,
        undoButton: dom.geometryUndoButton,
        clearButton: dom.geometryClearButton,
        counter: dom.geometryPointCount,
        type: state.currentExercise.interactionType,
        config: state.currentExercise.interactionConfig || {},
        savedAnswer: state.currentExercise.savedAnswer || "",
        onChange: handleGeometryChange
      });
    } else if (window.GameGeometry) {
      window.GameGeometry.stop();
    }
    dom.submitButton.disabled = false;
    dom.hintButton.disabled = false;
    dom.hintPanel.classList.add("hidden");
    dom.resultPanel.classList.add("hidden");
    dom.mathPreviewWrap.classList.add("hidden");
    const questionRendering = window.GameMath.setHtml(dom.questionContent, state.currentExercise.questionHtml || state.currentExercise.question || "");
    showScreen("exercise");
    focusAnswerEditor();
    syncLive(() => window.GameLive.publishExercise(state.currentExercise, state.currentMission, {
      route: state.currentExercise.level || state.student.route,
      levelPlan: state.currentExercise.levelPlan || "SUPORT,BASE,REPTE",
      helpCount: state.helpCount
    }));
    await Promise.all([explanationRendering, questionRendering]);
  }

  async function askForHelp() {
    if (!state.currentExercise || state.submitting) return;
    dom.hintButton.disabled = true;
    setLoading(true, state.helpCount < 2 ? "Buscant una pista…" : "Preparant una ajuda personalitzada…");
    try {
      const data = await window.GameData.call("help", {
        sessionId: state.sessionId,
        studentId: state.student.studentId,
        exerciseId: state.currentExercise.exerciseId,
        answer: currentAnswer()
      });
      state.helpCount = Number(data.level || state.helpCount + 1);
      if (!window.GameData.isDemo()) {
        window.GameData.call("habit_event", {
          studentId: state.student.studentId,
          sessionId: state.sessionId,
          type: "HELP_REQUESTED",
          missionUid: state.currentExercise.missionUid || state.currentExercise.missionId,
          questionUid: state.currentExercise.questionId || state.currentExercise.exerciseId
        }).catch(() => {});
      }
      dom.helpCounter.textContent = state.helpCount;
      dom.hintTitle.textContent = data.source === "AI" || data.source === "AI_DEMO" ? "Ajuda personalitzada" : `Pista ${state.helpCount}`;
      await window.GameMath.setText(dom.hintText, data.message || "Revisa el primer pas.");
      await window.GameMath.setText(dom.hintQuestion, data.nextQuestion || "Quin pas pots fer ara?");
      dom.hintPanel.classList.remove("hidden");
      await syncLive(() => window.GameLive.updateDynamic({ helpCount: state.helpCount, state: data.needsTeacher ? "NEEDS_TEACHER" : "WORKING" }));
      if (data.needsTeacher) toast("He avisat el professor perquè puga ajudar-te.", "warning", 7000);
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      dom.hintButton.disabled = false;
      setLoading(false);
    }
  }

  function bufferedNextExercise() {
    const pendingIds = new Set((state.attemptQueue ? state.attemptQueue.pending() : []).map((item) => item.exerciseId));
    while (state.exerciseBuffer.length) {
      const candidate = state.exerciseBuffer.shift();
      if (candidate && !pendingIds.has(candidate.exerciseId)
        && (!state.currentExercise || candidate.exerciseId !== state.currentExercise.exerciseId)) return candidate;
    }
    return null;
  }

  function queuedAttemptError(error, count) {
    if (!state.student || !count) return;
    toast("La resposta està guardada en este dispositiu. Es tornarà a enviar quan hi haja connexió.", "warning", 7000);
  }

  function confirmQueuedAttempt(data, attempt) {
    if (!state.student || state.student.studentId !== attempt.studentId) return;
    if (data.stats) updateStats(data.stats, state.badges, data.classGoal || state.classGoal);
    if (data.correct) {
      syncLive(() => window.GameLive.contributeClass(attempt.missionId, 2));
      toast("Resposta correcta guardada.", "good", 2800);
    } else toast(data.feedback || "Resposta revisada. Seguim practicant.", "warning", 3500);
    if (data.avatarChoiceGranted) {
      state.pendingAvatarChoice = true;
      toast("Premi desbloquejat: ja pots triar un avatar!", "good", 5000);
    }
    const pendingIds = new Set(state.attemptQueue.pending().map((item) => item.exerciseId));
    const currentId = state.currentExercise && state.currentExercise.exerciseId;
    const candidates = [data.nextExercise].concat(data.exerciseBuffer || []).filter((item) =>
      item && item.exerciseId !== currentId && !pendingIds.has(item.exerciseId));
    state.exerciseBuffer = candidates.filter((item, index) =>
      candidates.findIndex((other) => other.exerciseId === item.exerciseId) === index);
    if (data.waitingForContent && !state.exerciseBuffer.length && !state.currentExercise) {
      dom.resultTitle.textContent = "Activitats acabades per ara";
      dom.resultText.textContent = "El professor pot ajudar-te a continuar.";
    }
    if (!state.currentExercise && state.exerciseBuffer.length) {
      state.currentExercise = bufferedNextExercise();
      if (state.currentExercise) openExercise();
    }
  }

  async function submitBufferedAnswer(payload, answer, reason, forced) {
    state.submitting = true;
    dom.submitButton.disabled = true;
    dom.hintButton.disabled = true;
    try {
      state.attemptQueue.enqueue(payload);
      const preview = currentAnswerPreview();
      syncLive(() => window.GameLive.markSubmitted(reason, answer, preview));
      if (isGeometryExercise()) window.GameGeometry.setDisabled(true);
      const next = bufferedNextExercise();
      state.currentExercise = next;
      state.nextExercise = null;
      state.submittedExerciseId = "";
      if (next) await openExercise();
      else {
        dom.resultPanel.classList.remove("hidden", "incorrect");
        dom.resultIcon.textContent = "…";
        dom.resultTitle.textContent = "Preparant més activitats";
        dom.resultText.textContent = "Les teues respostes continuen guardades.";
        dom.nextExerciseButton.disabled = true;
      }
      if (forced) toast("La resposta està guardada. Pots continuar quan tornes.", "warning", 5000);
    } catch (error) {
      dom.submitButton.disabled = false;
      dom.hintButton.disabled = false;
      toast("No s'ha pogut guardar la resposta en este dispositiu. Torna-ho a intentar.", "error", 7000);
    } finally {
      state.submitting = false;
    }
  }

  async function submitAnswer(reason = "normal", forced = false) {
    if (!state.currentExercise || state.submitting || state.submittedExerciseId === state.currentExercise.exerciseId) return;
    const answer = currentAnswer();
    const hasAnswer = isGeometryExercise() ? window.GameGeometry.hasAnswer() : Boolean(answer);
    if (!hasAnswer && !forced) {
      toast(isGeometryExercise() ? "Marca almenys un punt abans d'enviar." : "Escriu almenys un pas abans d'enviar.", "warning");
      focusAnswerEditor();
      return;
    }
    if (!forced && !procedureIsSufficient(answer)) {
      const minimum = Math.max(2, Number(state.currentExercise.minimumSteps || 2));
      const reasoning = state.currentExercise.procedureMode === "RAONAMENT";
      const message = reasoning
        ? "Este exercici demana una justificació breu i una línia final «Resposta: ...». Posar només el resultat no dona energia."
        : (minimum <= 2
          ? "Este exercici demana el càlcul complet: escriu l’operació i el resultat units amb =. Posar només el resultat no dona energia."
          : `Este exercici demana procediment: escriu almenys ${minimum} expressions o passos separats amb = o →. Posar només el resultat no dona energia.`);
      toast(message, "warning", 8500);
      focusAnswerEditor();
      return;
    }

    const payload = {
      sessionId: state.sessionId, studentId: state.student.studentId, studentName: state.student.name,
      exerciseId: state.currentExercise.exerciseId, missionId: state.currentExercise.missionId,
      assignmentId: state.currentExercise.assignmentId || "", answer, helpCount: state.helpCount,
      reason, ip: state.ip, submissionId: state.submissionId
    };
    if (state.fastTransition && state.attemptQueue) {
      await submitBufferedAnswer(payload, answer, reason, forced);
      return;
    }
    state.submitting = true;
    dom.submitButton.disabled = true;
    dom.hintButton.disabled = true;
    if (!forced) setLoading(true, "Enviant la resposta…");
    try {
      const data = await window.GameData.call("submit", payload);
      await syncLive(() => window.GameLive.markSubmitted(reason, answer, currentAnswerPreview()));
      state.submittedExerciseId = state.currentExercise.exerciseId;
      state.nextExercise = data.nextExercise || null;
      state.retryFeedback = data.mustRetry ? String(data.feedback || "Falta mostrar el procediment abans de continuar.") : "";
      state.missions = data.missions || state.missions;
      state.sector = data.sector || state.sector;
      state.waitingForUnlock = Boolean(data.waitingForUnlock);
      state.waitingForContent = Boolean(data.waitingForContent);
      state.currentMission = data.currentMission || state.currentMission;
      state.student.avatarUnlocked = Boolean(data.avatarUnlocked || state.student.avatarUnlocked);
      state.student.avatarChanges = Number(data.avatarChanges || 0);
      state.student.availableAvatars = data.availableAvatars || state.student.availableAvatars || [];
      if (data.avatarChoiceGranted) {
        state.pendingAvatarChoice = true;
        toast("Premi desbloquejat: ara pots triar o canviar l'avatar!", "good", 7000);
      }
      dom.answerInput.disabled = true;
      if (isGeometryExercise()) window.GameGeometry.setDisabled(true);
      const pendingReview = data.correctionStatus === "REVISAR_DOCENT" || data.needsTeacherReview;
      const partial = data.correctionStatus === "PARCIAL";
      dom.resultPanel.classList.toggle("incorrect", !data.correct);
      dom.resultIcon.textContent = data.correct ? "✓" : (pendingReview ? "?" : (data.mustRetry ? "↻" : (partial ? "½" : "↻")));
      dom.resultTitle.textContent = data.correct ? "Repte superat" : (pendingReview ? "Pendent de revisió" : (data.mustRetry ? "Falten els passos" : (partial ? "Procediment parcial" : "Resposta guardada")));
      dom.nextExerciseButton.innerHTML = data.mustRetry ? 'Tornar-ho a intentar <span>↻</span>' : 'Continuar <span>→</span>';
      await window.GameMath.setText(dom.resultText, data.feedback || "La resposta s'ha guardat.");
      dom.resultPanel.classList.remove("hidden");
      updateStats(data.stats || state.stats, data.badges || state.badges, data.classGoal || state.classGoal);
      if (data.correct) {
        await syncLive(() => window.GameLive.contributeClass(state.currentExercise.missionId, 2));
      }
      if (data.reward) showReward(data.reward);
      else offerPendingAvatarChoice();
      if (forced) {
        state.autoAdvancePending = true;
        toast("La resposta s'ha enviat perquè has eixit de la pàgina.", "warning", 6500);
      }
    } catch (error) {
      dom.submitButton.disabled = false;
      dom.hintButton.disabled = false;
      if (isGeometryExercise()) window.GameGeometry.setDisabled(false);
      toast(error.message, "error", 7000);
    } finally {
      state.submitting = false;
      if (!forced) setLoading(false);
    }
  }

  async function continueAfterResult() {
    if (!state.submittedExerciseId) return;
    if (state.nextExercise) {
      const retryingSameExercise = state.nextExercise.exerciseId === state.currentExercise.exerciseId;
      const retryFeedback = state.retryFeedback;
      state.currentExercise = state.nextExercise;
      state.nextExercise = null;
      state.submittedExerciseId = "";
      state.retryFeedback = "";
      await openExercise();
      if (retryingSameExercise) toast(retryFeedback || "Torna-ho a intentar mostrant el procediment.", "warning", 8500);
      return;
    }
    state.retryFeedback = "";
    refreshBootstrap();
  }

  async function refreshBootstrap() {
    setLoading(true, "Actualitzant el mapa…");
    try {
      if (state.attemptQueue && state.attemptQueue.count() && !(await state.attemptQueue.flush())) {
        throw new Error("Hi ha respostes pendents. El mapa s'actualitzarà quan torne la connexió.");
      }
      const data = await window.GameData.call("bootstrap", { studentId: state.student.studentId, sessionId: state.sessionId });
      state.missions = data.missions || state.missions;
      state.sector = data.sector || state.sector;
      state.waitingForUnlock = Boolean(data.waitingForUnlock);
      state.waitingForContent = Boolean(data.waitingForContent);
      state.currentMission = data.currentMission || null;
      state.currentExercise = data.currentExercise || null;
      state.exerciseBuffer = Array.isArray(data.exerciseBuffer) ? data.exerciseBuffer : [];
      state.fastTransition = Boolean(state.attemptQueue && Array.isArray(data.exerciseBuffer));
      state.stats = data.stats || state.stats;
      state.badges = data.badges || state.badges;
      state.classGoal = data.classGoal || state.classGoal;
      state.student = { ...state.student, ...(data.student || {}) };
      if (window.GameBattleStudent) window.GameBattleStudent.setStudent(state.student);
      renderMissionScreen();
      showScreen("mission");
    } catch (error) {
      toast(error.message, "error", 7000);
    } finally {
      setLoading(false);
    }
  }

  function showReward(reward) {
    const definition = badgeDefinition(reward.badgeId);
    dom.rewardIcon.classList.remove(...BADGE_IMAGE_CLASSES);
    if (definition) {
      dom.rewardIcon.classList.add("badge-image", definition.imageClass);
      dom.rewardIcon.textContent = "";
    } else {
      dom.rewardIcon.classList.remove("badge-image");
      dom.rewardIcon.textContent = reward.icon || "🏅";
    }
    dom.rewardTitle.textContent = reward.title || reward.name || "Nova insígnia";
    dom.rewardDescription.textContent = reward.description || "Has desbloquejat una recompensa.";
    if (typeof dom.rewardDialog.showModal === "function") dom.rewardDialog.showModal();
  }

  function offerPendingAvatarChoice() {
    if (!state.pendingAvatarChoice || !state.student || Number(state.student.avatarChanges || 0) < 1) return;
    if (dom.rewardDialog.open || document.visibilityState === "hidden") return;
    state.pendingAvatarChoice = false;
    state.liveWarningShown = false;
    window.setTimeout(openProfile, 0);
  }

  function openProfile() {
    if (!state.student) return;
    dom.avatarGrid.innerHTML = "";
    const selected = currentAvatar();
    const canChange = Number(state.student.avatarChanges || 0) > 0;
    const hasAvatar = AVATARS.includes(selected);
    if (!state.student.avatarUnlocked) {
      dom.avatarChangeStatus.textContent = "Completa la primera missió per descobrir i triar el teu avatar.";
    } else if (canChange && !hasAvatar) {
      dom.avatarChangeStatus.textContent = "Premi de missió: tria el teu primer avatar.";
    } else if (canChange) {
      dom.avatarChangeStatus.textContent = "Premi de missió: pots canviar l'avatar una vegada. Si no vols, guarda el premi per a després.";
    } else {
      dom.avatarChangeStatus.textContent = "Completa una altra missió per tornar a modificar l'avatar.";
    }
    const availableAvatars = Array.isArray(state.student.availableAvatars)
      ? state.student.availableAvatars.filter((avatar) => AVATARS.includes(avatar))
      : [];
    if (state.student.avatarUnlocked && !availableAvatars.length) {
      dom.avatarGrid.innerHTML = '<p class="empty-mini">Ara mateix no tens cap avatar disponible. El perfil mostrarà ? fins que en recuperes o desbloqueges un altre.</p>';
    }
    availableAvatars.forEach((avatar) => {
      const index = AVATARS.indexOf(avatar);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `avatar-option avatar-sprite ${avatar}${avatar === selected ? " selected" : ""}`;
      button.dataset.avatar = avatar;
      button.disabled = !canChange;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(avatar === selected));
      button.setAttribute("aria-label", `Avatar ${index + 1}`);
      button.addEventListener("click", () => {
        dom.avatarGrid.querySelectorAll(".avatar-option").forEach((option) => {
          const active = option === button;
          option.classList.toggle("selected", active);
          option.setAttribute("aria-selected", String(active));
        });
        updateAvatarSaveButton();
      });
      dom.avatarGrid.appendChild(button);
    });
    renderProfileBadges();
    updateAvatarSaveButton();
    dom.profileDialog.showModal();
  }

  function updateAvatarSaveButton() {
    const selected = dom.avatarGrid.querySelector(".avatar-option.selected");
    const saved = String((state.student && state.student.avatar) || "");
    const canChange = Number((state.student && state.student.avatarChanges) || 0) > 0;
    dom.saveAvatarButton.disabled = !canChange || !selected || selected.dataset.avatar === saved;
    dom.saveAvatarButton.textContent = canChange ? "Guardar avatar" : "Completa una missió per canviar-lo";
  }

  function badgeDefinition(badgeId) {
    return BADGE_CATALOG.find((badge) => badge.id === String(badgeId || "").toUpperCase()) || null;
  }

  function renderProfileBadges() {
    dom.profileBadgeList.innerHTML = "";
    BADGE_CATALOG.forEach((definition) => {
      const earned = state.badges.find((badge) => String(badge.badgeId || "").toUpperCase() === definition.id);
      const item = document.createElement("article");
      item.className = `profile-badge${earned ? " earned" : " locked"}`;
      item.title = earned ? (earned.description || definition.title) : "Encara per descobrir";

      const icon = document.createElement("span");
      icon.className = `profile-badge-image badge-image ${definition.imageClass}`;
      icon.setAttribute("aria-hidden", "true");

      const label = document.createElement("strong");
      label.textContent = earned ? (earned.title || earned.name || definition.title) : "Per descobrir";
      if (earned && Number(earned.count || 1) > 1) {
        const count = document.createElement("b");
        count.className = "profile-badge-count";
        count.textContent = `×${Math.min(5, Number(earned.count || 1))}`;
        icon.appendChild(count);
      }
      item.append(icon, label);
      dom.profileBadgeList.appendChild(item);
    });
  }

  async function saveAvatar() {
    const selected = dom.avatarGrid.querySelector(".avatar-option.selected");
    if (!selected) return;
    const avatar = selected.dataset.avatar;
    dom.saveAvatarButton.disabled = true;
    try {
      const data = await window.GameData.call("save_avatar", { studentId: state.student.studentId, avatar });
      state.student.avatar = data.avatar || avatar;
      state.student.avatarUnlocked = data.avatarUnlocked !== false;
      state.student.avatarChanges = Number(data.avatarChanges || 0);
      state.student.availableAvatars = data.availableAvatars || state.student.availableAvatars || [];
      setAvatarClass(dom.playerAvatar, avatar);
      renderMap();
      dom.profileDialog.close();
      toast("Avatar guardat", "good");
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      dom.saveAvatarButton.disabled = false;
    }
  }

  function readFocusSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(FOCUS_KEY));
      if (!value || !state.student || value.studentId !== state.student.studentId) return null;
      const maxAge = config.focusSessionMinutes * 60 * 1000;
      if (Date.now() - Number(value.startedAt || 0) > maxAge) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  function prepareFocusSession(studentId) {
    const current = readFocusSession();
    if (current && current.studentId === studentId) return current;
    const value = { studentId, startedAt: Date.now(), warned: false };
    sessionStorage.setItem(FOCUS_KEY, JSON.stringify(value));
    return value;
  }

  function registerFocusLoss(reason) {
    if (!state.student || dom.exerciseScreen.classList.contains("hidden") || !state.currentExercise || dom.rewardDialog.open) return;
    const now = Date.now();
    if (now - state.lastFocusLossAt < 1400) return;
    state.lastFocusLossAt = now;
    const focus = readFocusSession() || prepareFocusSession(state.student.studentId);
    syncLive(() => window.GameLive.updateDynamic({ focusState: "HIDDEN", submissionReason: reason }));
    if (!window.GameData.isDemo()) {
      window.GameData.call("habit_event", {
        studentId: state.student.studentId,
        sessionId: state.sessionId,
        type: "FOCUS_LOST",
        missionUid: state.currentExercise.missionUid || state.currentExercise.missionId,
        questionUid: state.currentExercise.questionId || state.currentExercise.exerciseId,
        metadata: { reason }
      }).catch(() => {});
    }
    if (!focus.warned) {
      focus.warned = true;
      sessionStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
      state.pendingFocusWarning = true;
      return;
    }
    submitAnswer(reason, true);
  }

  function registerFocusReturn() {
    if (!state.student) return;
    syncLive(() => window.GameLive.updateDynamic({ focusState: "VISIBLE", submissionReason: "normal" }));
    if (!window.GameData.isDemo()) {
      window.GameData.call("habit_event", {
        studentId: state.student.studentId,
        sessionId: state.sessionId,
        type: "FOCUS_RETURNED",
        missionUid: state.currentExercise && (state.currentExercise.missionUid || state.currentExercise.missionId),
        questionUid: state.currentExercise && (state.currentExercise.questionId || state.currentExercise.exerciseId)
      }).catch(() => {});
    }
    if (state.pendingFocusWarning) {
      state.pendingFocusWarning = false;
      toast("Primer avís: si tornes a eixir d'esta pàgina durant la sessió, s'enviarà el que tingues escrit.", "warning", 8500);
    }
    if (state.autoAdvancePending && state.submittedExerciseId && !state.submitting) {
      state.autoAdvancePending = false;
      continueAfterResult();
    }
  }

  async function logout() {
    if (state.attemptQueue && state.attemptQueue.count()) {
      await Promise.race([state.attemptQueue.flush(), new Promise((resolve) => window.setTimeout(resolve, 1500))]);
    }
    if (state.attemptQueue) state.attemptQueue.dispose();
    try { await window.GameLive.removeCurrent(); } catch (error) { /* Sense bloquejar l'eixida. */ }
    window.GameLive.stopListeners();
    state.student = null;
    state.currentExercise = null;
    state.exerciseBuffer = [];
    state.attemptQueue = null;
    state.fastTransition = false;
    state.retryFeedback = "";
    state.submissionId = "";
    state.sessionId = "";
    state.diagnostic = null;
    state.pendingAvatarChoice = false;
    sessionStorage.removeItem(STUDENT_KEY);
    if (window.GameBattleStudent) window.GameBattleStudent.setStudent(null);
    showScreen("login");
  }

  function handleAnswerInput() {
    window.clearTimeout(state.answerDebounce);
    state.answerDebounce = window.setTimeout(() => {
      syncLive(() => window.GameLive.updateDynamic({ answer: dom.answerInput.value, state: "WORKING" }));
    }, config.liveAnswerDebounceMs);
    window.clearTimeout(state.previewDebounce);
    state.previewDebounce = window.setTimeout(async () => {
      const value = dom.answerInput.value.trim();
      dom.mathPreviewWrap.classList.toggle("hidden", !value);
      if (value) {
        dom.mathPreview.innerHTML = window.GameMath.studentTextToHtml(value);
        await window.GameMath.typeset(dom.mathPreview);
      }
    }, 350);
  }

  function bindEvents() {
    dom.studentSelect.addEventListener("change", () => { dom.enterButton.disabled = !dom.studentSelect.value; });
    dom.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (dom.studentSelect.value) login(dom.studentSelect.value);
    });
    dom.diagnosticForm.addEventListener("submit", (event) => { event.preventDefault(); submitDiagnostic(); });
    dom.openExerciseButton.addEventListener("click", openExercise);
    dom.backToMapButton.addEventListener("click", () => showScreen("mission"));
    dom.logoutButton.addEventListener("click", logout);
    dom.hintButton.addEventListener("click", askForHelp);
    dom.answerForm.addEventListener("submit", (event) => { event.preventDefault(); submitAnswer("normal", false); });
    dom.nextExerciseButton.addEventListener("click", continueAfterResult);
    dom.closeRewardButton.addEventListener("click", () => dom.rewardDialog.close());
    dom.rewardDialog.addEventListener("close", offerPendingAvatarChoice);
    dom.answerInput.addEventListener("input", handleAnswerInput);
    ["copy", "cut", "paste", "drop"].forEach((eventName) => {
      dom.answerInput.addEventListener(eventName, (event) => {
        event.preventDefault();
        toast("En esta activitat has d'escriure la resposta tu mateix.", "warning");
      });
    });
    dom.soundButton.addEventListener("click", () => {
      state.sound = !state.sound;
      dom.soundButton.textContent = state.sound ? "🔊" : "🔈";
      dom.soundButton.setAttribute("aria-pressed", String(state.sound));
      toast(state.sound ? "Sons activats" : "Sons desactivats");
    });
    dom.playerAvatar.addEventListener("click", openProfile);
    dom.saveAvatarButton.addEventListener("click", saveAvatar);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") registerFocusLoss("focus_hidden");
      else registerFocusReturn();
    });
    window.addEventListener("blur", () => registerFocusLoss("window_blur"));
    window.addEventListener("focus", registerFocusReturn);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") offerPendingAvatarChoice();
    });
  }

  async function init() {
    cacheDom();
    bindEvents();
    applyTheme(config.defaultTrimester);
    await loadStudents();
    const query = new URLSearchParams(window.location.search);
    const demoStudent = query.get("student");
    if (window.GameData.isDemo() && demoStudent) {
      await login(demoStudent);
      if (query.get("exercise") === "1" && state.currentExercise) await openExercise();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
}());

(function () {
  "use strict";

  const USERS = [
    { studentId: "DEMO-01", name: "Aina", route: "SUPORT", avatar: "" },
    { studentId: "DEMO-02", name: "Biel", route: "BASE", avatar: "" },
    { studentId: "DEMO-03", name: "Carla", route: "REPTE", avatar: "" }
  ];

  const MISSIONS = [
    { missionId: "M01", title: "Engegar els motors", description: "Domina la suma d'enters per encendre la nau.", icon: "🚀", order: 1, total: 5 },
    { missionId: "M02", title: "Camp d'asteroides", description: "Resta enters per trobar una ruta segura.", icon: "☄️", order: 2, total: 5 },
    { missionId: "M03", title: "Rescat orbital", description: "Combina operacions i recupera el satèl·lit.", icon: "🛰️", order: 3, total: 5 },
    { missionId: "M04", title: "Portal de fraccions", description: "Activa el portal treballant amb fraccions.", icon: "🌀", order: 4, total: 5 },
    { missionId: "M05", title: "Base recuperada", description: "Completa el repte final del sector.", icon: "🏆", order: 5, total: 5 }
  ];

  const EXERCISES = {
    SUPORT: [
      { exerciseId: "S-01", missionId: "M01", questionHtml: "<p>Calcula amb ajuda de la recta numèrica:</p><div class=\"big-math\">\\[ -3+5 \\]</div>", expectedAnswer: "2", hint1: "Comença en \\(-3\\) i avança 5 posicions cap a la dreta.", hint2: "Des de \\(-3\\): \\(-2,-1,0,1,2\\). On has arribat?", methodId: "ENTERS_RECTA", step: 1, totalSteps: 5 },
      { exerciseId: "S-02", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 4+(-2) \\]</div>", expectedAnswer: "2", hint1: "Sumar un nombre negatiu significa moure't cap a l'esquerra.", hint2: "Comença en 4 i retrocedeix 2 posicions.", methodId: "ENTERS_RECTA", step: 2, totalSteps: 5 },
      { exerciseId: "S-03", missionId: "M01", questionHtml: "<p>Calcula i escriu el signe:</p><div class=\"big-math\">\\[ -2+(-3) \\]</div>", expectedAnswer: "-5", hint1: "Els dos nombres són negatius: suma les distàncies i conserva el signe.", hint2: "\\(2+3=5\\). Ara pensa quin signe ha de tindre.", methodId: "ENTERS_SIGNES", step: 3, totalSteps: 5 },
      { exerciseId: "S-04", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -6+9 \\]</div>", expectedAnswer: "3", hint1: "Compara les distàncies de 6 i 9.", hint2: "\\(9-6=3\\) i domina el signe positiu.", methodId: "ENTERS_RECTA", step: 4, totalSteps: 5 },
      { exerciseId: "S-05", missionId: "M01", questionHtml: "<p>Últim impuls:</p><div class=\"big-math\">\\[ 7+(-2) \\]</div>", expectedAnswer: "5", hint1: "Retrocedeix dues posicions des de 7.", hint2: "\\(7-2=5\\).", methodId: "ENTERS_RECTA", step: 5, totalSteps: 5 },
      { exerciseId: "S2-01", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 6-9 \\]</div>", expectedAnswer: "-3", hint1: "Retrocedeix 9 des de 6.", hint2: "Passes pel zero i avances 3 en negatiu.", methodId: "ENTERS_RECTA", step: 1, totalSteps: 5 },
      { exerciseId: "S2-02", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 8-3 \\]</div>", expectedAnswer: "5", hint1: "Retrocedeix tres posicions.", hint2: "\\(8-3=5\\).", methodId: "ENTERS_RECTA", step: 2, totalSteps: 5 },
      { exerciseId: "S2-03", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 2-7 \\]</div>", expectedAnswer: "-5", hint1: "Has de travessar el zero.", hint2: "Des de 2, set passos arrere deixen en -5.", methodId: "ENTERS_RECTA", step: 3, totalSteps: 5 },
      { exerciseId: "S2-04", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 10-13 \\]</div>", expectedAnswer: "-3", hint1: "Compara 10 i 13.", hint2: "Falten 3 per arribar de 10 a 13.", methodId: "ENTERS_RECTA", step: 4, totalSteps: 5 },
      { exerciseId: "S2-05", missionId: "M02", questionHtml: "<p>Esquiva l'últim asteroide:</p><div class=\"big-math\">\\[ 4-11 \\]</div>", expectedAnswer: "-7", hint1: "Retrocedeix 11 des de 4.", hint2: "\\(11-4=7\\) i el resultat és negatiu.", methodId: "ENTERS_RECTA", step: 5, totalSteps: 5 }
    ],
    BASE: [
      { exerciseId: "B-01", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -7+12 \\]</div>", expectedAnswer: "5", hint1: "Tenen signes diferents: resta els valors i posa el signe del més gran.", hint2: "\\(12-7=5\\) i el valor més gran és positiu.", methodId: "ENTERS_SIGNES", step: 1, totalSteps: 5 },
      { exerciseId: "B-02", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 8-13 \\]</div>", expectedAnswer: "-5", hint1: "Pots escriure la resta com una suma: \\(8+(-13)\\).", hint2: "Resta \\(13-8\\) i conserva el signe del nombre amb major valor absolut.", methodId: "ENTERS_SIGNES", step: 2, totalSteps: 5 },
      { exerciseId: "B-03", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -9+(-6) \\]</div>", expectedAnswer: "-15", hint1: "Mateix signe: suma els valors absoluts.", hint2: "\\(9+6=15\\) i els dos nombres eren negatius.", methodId: "ENTERS_SIGNES", step: 3, totalSteps: 5 },
      { exerciseId: "B-04", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 15+(-9) \\]</div>", expectedAnswer: "6", hint1: "Els signes són diferents.", hint2: "\\(15-9=6\\).", methodId: "ENTERS_SIGNES", step: 4, totalSteps: 5 },
      { exerciseId: "B-05", missionId: "M01", questionHtml: "<p>Últim impuls:</p><div class=\"big-math\">\\[ -14+6 \\]</div>", expectedAnswer: "-8", hint1: "Resta els valors absoluts.", hint2: "\\(14-6=8\\), amb signe negatiu.", methodId: "ENTERS_SIGNES", step: 5, totalSteps: 5 },
      { exerciseId: "B2-01", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -4-7 \\]</div>", expectedAnswer: "-11", hint1: "Sumes dos nombres negatius.", hint2: "\\(-4+(-7)=-11\\).", methodId: "ENTERS_SIGNES", step: 1, totalSteps: 5 },
      { exerciseId: "B2-02", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 12-(-5) \\]</div>", expectedAnswer: "17", hint1: "Restar un negatiu és sumar.", hint2: "\\(12+5=17\\).", methodId: "ENTERS_SIGNES", step: 2, totalSteps: 5 },
      { exerciseId: "B2-03", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -3-(-8) \\]</div>", expectedAnswer: "5", hint1: "Canvia el doble signe.", hint2: "\\(-3+8=5\\).", methodId: "ENTERS_SIGNES", step: 3, totalSteps: 5 },
      { exerciseId: "B2-04", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 7-15 \\]</div>", expectedAnswer: "-8", hint1: "El nombre que restes és major.", hint2: "\\(15-7=8\\), resultat negatiu.", methodId: "ENTERS_SIGNES", step: 4, totalSteps: 5 },
      { exerciseId: "B2-05", missionId: "M02", questionHtml: "<p>Esquiva l'últim asteroide:</p><div class=\"big-math\">\\[ -9-(-2) \\]</div>", expectedAnswer: "-7", hint1: "Restar -2 és sumar 2.", hint2: "\\(-9+2=-7\\).", methodId: "ENTERS_SIGNES", step: 5, totalSteps: 5 }
    ],
    REPTE: [
      { exerciseId: "R-01", missionId: "M01", questionHtml: "<p>Calcula d'esquerra a dreta:</p><div class=\"big-math\">\\[ -15+27-8 \\]</div>", expectedAnswer: "4", hint1: "Calcula primer \\(-15+27\\).", hint2: "\\(-15+27=12\\). Ara resta 8.", methodId: "ENTERS_SIGNES", step: 1, totalSteps: 5 },
      { exerciseId: "R-02", missionId: "M01", questionHtml: "<p>Calcula i vigila el doble signe:</p><div class=\"big-math\">\\[ 18-(-7)-12 \\]</div>", expectedAnswer: "13", hint1: "Restar un negatiu es transforma en sumar.", hint2: "\\(18-(-7)=18+7=25\\).", methodId: "ENTERS_SIGNES", step: 2, totalSteps: 5 },
      { exerciseId: "R-03", missionId: "M01", questionHtml: "<p>La nau està a \\(-6\\) metres. Puja 14 metres i després baixa 3. A quina altura queda?</p>", expectedAnswer: "5", hint1: "Escriu l'operació: \\(-6+14-3\\).", hint2: "Primer arriba a 8 metres i després baixa 3.", methodId: "ENTERS_PROBLEMES", step: 3, totalSteps: 5 },
      { exerciseId: "R-04", missionId: "M01", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -30+16+9 \\]</div>", expectedAnswer: "-5", hint1: "Opera d'esquerra a dreta.", hint2: "\\(-30+16=-14\\).", methodId: "ENTERS_SIGNES", step: 4, totalSteps: 5 },
      { exerciseId: "R-05", missionId: "M01", questionHtml: "<p>Últim impuls:</p><div class=\"big-math\">\\[ 22-8-19 \\]</div>", expectedAnswer: "-5", hint1: "Calcula primer 22-8.", hint2: "\\(14-19=-5\\).", methodId: "ENTERS_SIGNES", step: 5, totalSteps: 5 },
      { exerciseId: "R2-01", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 24-(-6)-17 \\]</div>", expectedAnswer: "13", hint1: "El doble signe es converteix en suma.", hint2: "\\(24+6-17=13\\).", methodId: "ENTERS_SIGNES", step: 1, totalSteps: 5 },
      { exerciseId: "R2-02", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -12-8+25 \\]</div>", expectedAnswer: "5", hint1: "Opera d'esquerra a dreta.", hint2: "\\(-20+25=5\\).", methodId: "ENTERS_SIGNES", step: 2, totalSteps: 5 },
      { exerciseId: "R2-03", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ 30-18-19 \\]</div>", expectedAnswer: "-7", hint1: "Calcula primer 30-18.", hint2: "\\(12-19=-7\\).", methodId: "ENTERS_SIGNES", step: 3, totalSteps: 5 },
      { exerciseId: "R2-04", missionId: "M02", questionHtml: "<p>Calcula:</p><div class=\"big-math\">\\[ -20-(-9)+4 \\]</div>", expectedAnswer: "-7", hint1: "Canvia el doble signe.", hint2: "\\(-20+9+4=-7\\).", methodId: "ENTERS_SIGNES", step: 4, totalSteps: 5 },
      { exerciseId: "R2-05", missionId: "M02", questionHtml: "<p>Esquiva l'últim asteroide:</p><div class=\"big-math\">\\[ 40-(-3)-50 \\]</div>", expectedAnswer: "-7", hint1: "Primer converteix la resta del negatiu.", hint2: "\\(40+3-50=-7\\).", methodId: "ENTERS_SIGNES", step: 5, totalSteps: 5 }
    ]
  };

  ["S-05", "B-05", "R-05"].forEach((exerciseId) => {
    const exercise = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].find((item) => item.exerciseId === exerciseId);
    if (exercise) Object.assign(exercise, {
      requiresProcedure: true,
      correctionType: "PROCEDIMENT",
      minimumSteps: 3,
      modelSolution: exercise.hint2 || `Resultat: ${exercise.expectedAnswer}`
    });
  });

  const STORAGE_KEY = "gamificacio-demo-state-v3";

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (error) {
      return {};
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function userState(studentId) {
    const state = readState();
    if (!state[studentId]) {
      state[studentId] = {
        completed: [], attempts: {}, helps: {}, badges: [], energy: 0, streak: 0,
        completedMissions: [], avatar: "", avatarChanges: 0
      };
      writeState(state);
    }
    return { all: state, user: state[studentId] };
  }

  function availableDemoAvatars(user) {
    const missions = Array.isArray(user.completedMissions) ? user.completedMissions.length : 0;
    const count = missions > 0 ? Math.min(15, 3 + Math.floor(missions / 5)) : 0;
    return Array.from({ length: count }, (_, index) => `avatar-${String(index + 1).padStart(2, "0")}`);
  }

  function unlockedMissionIds() {
    const state = readState();
    return state.__global && Array.isArray(state.__global.unlocked) ? state.__global.unlocked : ["M01"];
  }

  function unlockMission(missionId) {
    const state = readState();
    state.__global = state.__global || { unlocked: ["M01"] };
    if (!state.__global.unlocked.includes(missionId)) state.__global.unlocked.push(missionId);
    writeState(state);
  }

  function activeExercise(student) {
    const holder = userState(student.studentId);
    const list = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE];
    const unlocked = unlockedMissionIds();
    const exercise = list.find((item) => unlocked.includes(item.missionId) && !holder.user.completed.includes(item.exerciseId)) || null;
    if (!exercise) return null;
    const route = EXERCISES.SUPORT.includes(exercise) ? "SUPORT" : (EXERCISES.BASE.includes(exercise) ? "BASE" : "REPTE");
    const levelIndex = ["SUPORT", "BASE", "REPTE"].indexOf(route);
    return { ...exercise, level: route, levelLabel: `Fase ${levelIndex + 1} de 3`, levelStep: exercise.step, levelTotal: 5, step: levelIndex * 5 + exercise.step, totalSteps: 15, levelPlan: "SUPORT,BASE,REPTE", requiresProcedure: true };
  }

  function buildBootstrap(studentId) {
    const student = USERS.find((item) => item.studentId === studentId) || USERS[0];
    const holder = userState(student.studentId);
    const exercise = activeExercise(student);
    const completedCount = holder.user.completed.length;
    const unlocked = unlockedMissionIds();
    const missionStates = MISSIONS.map((mission) => {
      const relevant = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].filter((item) => item.missionId === mission.missionId);
      const done = relevant.length > 0 && relevant.every((item) => holder.user.completed.includes(item.exerciseId));
      return { ...mission, total: relevant.length, done, unlocked: unlocked.includes(mission.missionId), status: "LOCKED" };
    });
    const currentMission = missionStates.find((mission) => exercise && mission.missionId === exercise.missionId)
      || missionStates.find((mission) => !mission.done)
      || null;
    missionStates.forEach((mission) => {
      mission.status = mission.done ? "DONE" : (currentMission && mission.missionId === currentMission.missionId && mission.unlocked && exercise ? "CURRENT" : "LOCKED");
    });
    const waitingForUnlock = Boolean(!exercise && currentMission && !currentMission.unlocked);
    const waitingForContent = Boolean(!exercise && currentMission && currentMission.unlocked && currentMission.total < 1);
    return {
      ok: true,
      demo: true,
      sessionId: `demo-${student.studentId}-${Date.now()}`,
      trimester: 1,
      student: {
        ...student,
        avatar: holder.user.avatar || "",
        avatarUnlocked: holder.user.completedMissions.length > 0,
        avatarChanges: Number(holder.user.avatarChanges || 0),
        availableAvatars: availableDemoAvatars(holder.user)
      },
      missions: missionStates,
      sector: { sectorId: "T1-S01", title: "Sector orbital", subtitle: "Operacions amb enters", description: "Recupera l'energia de la base orbital.", visualCode: "orbital", order: 1, trimester: 1 },
      waitingForUnlock,
      waitingForContent,
      currentExercise: exercise,
      currentMission,
      stats: {
        energy: holder.user.energy,
        streak: holder.user.streak,
        progress: Math.round((completedCount / ([...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].length)) * 100),
        completed: completedCount,
        total: [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].length
      },
      badges: holder.user.badges,
      classGoal: { title: "Energia de la classe", value: Math.min(100, 38 + completedCount * 7), target: 100 }
    };
  }

  function normaliseNumber(value) {
    const text = String(value || "").trim().split("=").pop().trim().replace(",", ".");
    const fraction = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
    if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  async function call(action, payload) {
    await new Promise((resolve) => setTimeout(resolve, action === "help" ? 450 : 280));
    if (action === "list_students") return { ok: true, students: USERS };
    if (action === "bootstrap") return buildBootstrap(payload.studentId);

    if (action === "submit") {
      const student = USERS.find((item) => item.studentId === payload.studentId) || USERS[0];
      const exercise = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE]
        .find((item) => item.exerciseId === payload.exerciseId);
      const holder = userState(student.studentId);
      const attempts = (holder.user.attempts[exercise.exerciseId] || 0) + 1;
      holder.user.attempts[exercise.exerciseId] = attempts;
      const routeExercises = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE];
      const missionExercises = routeExercises.filter((item) => item.missionId === exercise.missionId);
      const missionWasCompleted = missionExercises.length > 0
        && missionExercises.every((item) => holder.user.completed.includes(item.exerciseId));
      const received = normaliseNumber(payload.answer);
      const expected = normaliseNumber(exercise.expectedAnswer);
      const correct = received !== null && expected !== null && Math.abs(received - expected) < 1e-9;
      const procedureParts = String(payload.answer || "").split(/=|\r?\n/).map((part) => part.trim()).filter(Boolean);
      const missingProcedure = correct && exercise.requiresProcedure && procedureParts.length < Number(exercise.minimumSteps || 2);
      const mustRetry = missingProcedure && attempts === 1;
      const accepted = correct && !missingProcedure;
      let reward = null;

      if (!mustRetry && !holder.user.completed.includes(exercise.exerciseId)) holder.user.completed.push(exercise.exerciseId);
      if (accepted) {
        holder.user.energy += 10;
        holder.user.streak += 1;
        if (holder.user.completed.length === 1) {
          reward = { badgeId: "PRIMER_PAS", icon: "🚀", title: "Primer enlairament", description: "Has completat el teu primer repte de la missió." };
          holder.user.badges.push(reward);
        } else if (attempts > 1 && !holder.user.badges.some((item) => item.badgeId === "NO_RENDIR")) {
          reward = { badgeId: "NO_RENDIR", icon: "🛡️", title: "No m'he rendit", description: "Has insistit, has millorat i ho has aconseguit." };
          holder.user.badges.push(reward);
        }
      }
      const missionJustCompleted = !missionWasCompleted && missionExercises.length > 0
        && missionExercises.every((item) => holder.user.completed.includes(item.exerciseId));
      if (missionJustCompleted) {
        if (!holder.user.completedMissions.includes(exercise.missionId)) holder.user.completedMissions.push(exercise.missionId);
        holder.user.avatarChanges = 1;
        const missionReward = { badgeId: "MISSIO_COMPLETA", icon: "🏆", title: "Missió completada", description: "Has completat una missió i pots triar o canviar l'avatar." };
        holder.user.badges.push(missionReward);
        reward = reward || missionReward;
      }
      writeState(holder.all);
      const next = activeExercise(student);
      const refreshed = buildBootstrap(student.studentId);
      return {
        ok: true,
        correct: accepted,
        percent: accepted ? 1 : (missingProcedure ? 0.5 : 0),
        correctionStatus: accepted ? "CORRECTE" : (missingProcedure ? "PARCIAL" : "INCORRECTE"),
        mustRetry,
        needsTeacherReview: false,
        feedback: accepted
          ? "Correcte! L'energia del motor ha augmentat."
          : (mustRetry
            ? "El resultat és correcte, però falta el procediment. Escriu almenys 3 passos separats amb =."
            : (missingProcedure
              ? "Pots continuar amb un 50 %, però esta activitat no suma energia, ratxa ni insígnies."
              : "Resposta guardada. Revisa els signes abans de continuar.")),
        reward,
        nextExercise: next,
        missions: refreshed.missions,
        sector: refreshed.sector,
        waitingForUnlock: refreshed.waitingForUnlock,
        waitingForContent: refreshed.waitingForContent,
        currentMission: refreshed.currentMission,
        missionCompleted: missionJustCompleted,
        avatarChoiceGranted: missionJustCompleted,
        avatarUnlocked: holder.user.completedMissions.length > 0,
        avatarChanges: Number(holder.user.avatarChanges || 0),
        availableAvatars: availableDemoAvatars(holder.user),
        stats: refreshed.stats,
        badges: holder.user.badges,
        classGoal: refreshed.classGoal
      };
    }

    if (action === "help") {
      const allExercises = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE];
      const exercise = allExercises.find((item) => item.exerciseId === payload.exerciseId);
      const holder = userState(payload.studentId);
      const level = (holder.user.helps[exercise.exerciseId] || 0) + 1;
      holder.user.helps[exercise.exerciseId] = level;
      writeState(holder.all);
      if (level === 1) return { ok: true, source: "PREPARED", level, message: exercise.hint1, nextQuestion: "Pots escriure ara el primer pas?", needsTeacher: false };
      if (level === 2) return { ok: true, source: "PREPARED", level, message: exercise.hint2, nextQuestion: "Quin resultat obtens?", needsTeacher: false };
      return { ok: true, source: "AI_DEMO", level, message: "Observa quin nombre té el valor absolut més gran. En \\(-7+12\\), és \\(12\\), que és positiu.", nextQuestion: "Quina diferència hi ha entre \\(12\\) i \\(7\\)?", needsTeacher: level > 3 };
    }

    if (action === "catalog") {
      const unlocked = unlockedMissionIds();
      const missions = MISSIONS.map((mission) => ({ ...mission, sectorId: "T1-S01", trimester: 1, unlocked: unlocked.includes(mission.missionId), targetExercises: 5 }));
      return {
        ok: true,
        sectors: [{ sectorId: "T1-S01", title: "Sector orbital", trimester: 1, order: 1, visualCode: "orbital" }],
        missions,
        nextLockedMission: missions.find((mission) => !mission.unlocked) || null,
        questions: [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].map((item) => ({ id: item.exerciseId, missionId: item.missionId, title: item.questionHtml.replace(/<[^>]+>/g, " ").replace(/\\[\[\]()]/g, " ").trim(), route: EXERCISES.SUPORT.includes(item) ? "SUPORT" : (EXERCISES.REPTE.includes(item) ? "REPTE" : "BASE") })),
        solutions: [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE].map((item) => ({ id: item.exerciseId, modelSolution: item.modelSolution || item.hint2 || "", expectedAnswer: item.expectedAnswer })),
        levelPlans: []
      };
    }

    if (action === "unlock_next_mission") {
      const next = MISSIONS.find((mission) => !unlockedMissionIds().includes(mission.missionId));
      if (!next) return { ok: true, allUnlocked: true, message: "No queden missions bloquejades en la demostració." };
      unlockMission(next.missionId);
      return { ok: true, allUnlocked: false, mission: next, message: `${next.title} s'ha desbloquejat per a tot l'alumnat.` };
    }

    if (action === "suggest_exercise") {
      return {
        ok: true,
        proposal: {
          proposalId: `PROP-DEMO-${Date.now()}`,
          studentId: payload.studentId,
          originExerciseId: payload.exerciseId,
          missionId: "M01",
          questionHtml: "<p>Calcula el nou repte:</p><div>\\[ -8+13 \\]</div>",
          expectedAnswer: "5",
          route: payload.route || "BASE",
          methodId: "ENTERS_SIGNES",
          difficulty: 2,
          explanation: "Manté el mateix error de signes amb nombres diferents."
        }
      };
    }

    if (action === "battle_prepare") {
      const source = [...EXERCISES.SUPORT, ...EXERCISES.BASE, ...EXERCISES.REPTE]
        .filter((item) => item.missionId === payload.missionId);
      const needed = payload.battleType === "FINAL_SECTOR" ? 20 : 15;
      const questions = Array.from({ length: needed }, (_, index) => {
        const item = source[index % Math.max(1, source.length)] || EXERCISES.BASE[index % EXERCISES.BASE.length];
        const numeric = Number(item.expectedAnswer);
        const options = [item.expectedAnswer, String(numeric + 1), String(numeric - 1), String(-numeric)].filter((value, pos, list) => list.indexOf(value) === pos).slice(0, 4);
        return {
          id: `DEMO-BAT-${index + 1}`, missionId: item.missionId, level: index < 5 ? "SUPORT" : index < 10 ? "BASE" : "REPTE",
          questionHtml: item.questionHtml, expectedAnswer: item.expectedAnswer, format: index % 2 ? "RESULTAT" : "OPCIO", options,
          errorHint: item.hint1
        };
      });
      return {
        ok: true,
        battle: {
          battleId: `BT-DEMO-${Date.now()}`,
          type: payload.battleType || "DIA",
          missionId: payload.missionId,
          sectorId: "T1-S01",
          title: payload.battleType === "FINAL_SECTOR" ? "Batalla final de demostració" : "Batalla del dia · demostració",
          durationSeconds: payload.battleType === "FINAL_SECTOR" ? 600 : 420,
          blindSeconds: 20,
          errorPenaltySeconds: 10,
          participants: USERS.filter((user) => (payload.participantIds || []).includes(user.studentId)),
          questions,
          chestWeights: []
        },
        questionCount: questions.length
      };
    }

    if (action === "battle_finalize") {
      const results = (payload.results || []).slice().sort((a, b) => Number(b.gold || 0) - Number(a.gold || 0));
      return { ok: true, battleId: payload.battle && payload.battle.battleId, leaderboard: results, capture: { count: 0, winners: [], pool: [] } };
    }

    if (action === "battle_history") {
      return { ok: true, summary: USERS.map((user, index) => ({ studentId: user.studentId, name: user.name, weekBadges: index + 1, monthBadges: index + 2, totalBadges: index + 3, battles: 1 })), battles: [] };
    }

    if (action === "battle_capture") throw new Error("La captura d'avatars necessita una partida real amb almenys quatre participants.");

    if (action === "save_avatar") {
      if (!/^avatar-(0[1-9]|1[0-5])$/.test(String(payload.avatar || ""))) throw new Error("Avatar no vàlid.");
      const holder = userState(payload.studentId);
      if (Number(holder.user.avatarChanges || 0) < 1) throw new Error("Completa una missió per poder canviar l'avatar.");
      if (!availableDemoAvatars(holder.user).includes(payload.avatar)) throw new Error("Este avatar encara no està desbloquejat.");
      holder.user.avatar = payload.avatar;
      holder.user.avatarChanges = 0;
      writeState(holder.all);
      return { ok: true, avatar: payload.avatar, avatarUnlocked: true, avatarChanges: 0, availableAvatars: availableDemoAvatars(holder.user) };
    }

    if (action === "set_mission_levels") return { ok: true, studentId: payload.studentId, missionId: payload.missionId, levels: String(payload.levels || "SUPORT,BASE,REPTE").split(",") };
    if (["teacher_decision", "teacher_assign", "set_route", "decide_review"].includes(action)) {
      return { ok: true, message: "Acció simulada correctament en mode demostració." };
    }

    if (action === "list_proposals") return { ok: true, proposals: [] };
    if (action === "list_reviews") return { ok: true, reviews: [] };
    throw new Error(`Acció de demostració no implementada: ${action}`);
  }

  window.GamificacioDemo = Object.freeze({ USERS, MISSIONS, EXERCISES, call });
}());

(function () {
  "use strict";
  const config = window.GAMIFICACIO_CONFIG;
  const root = String(config.firebaseRoot || "gamificacio-reforc-v2");
  const group = String(config.groupId || "GRUP-1ESO-BASE");
  let db = null;
  let authReady = null;
  let engine = null;
  let studentId = "";
  let catalog = null;
  let classRow = null;
  let classGoal = null;
  let override = null;
  const flushByStudent = new Map();
  const retryTimers = new Map();
  let teacherListeners = [];

  function safeKey(value) { return String(value || "").replace(/[.#$\[\]/]/g, "_"); }
  function localKey(id) { return `r1v2-firebase-pending-${safeKey(id)}`; }
  function nextSequence(id) {
    const key = `r1v2-firebase-sequence-${safeKey(id)}`;
    const sequence = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(sequence));
    return sequence;
  }
  function localRecord(id) {
    try {
      const value = JSON.parse(localStorage.getItem(localKey(id)) || "null");
      if (Array.isArray(value)) return { items: value.map((item) => ({ event: item.event })),
        state: value.length && value[value.length - 1].state,
        readiness: value.length && value[value.length - 1].readiness };
      return value && Array.isArray(value.items) ? value : { items: [] };
    } catch (_) { return { items: [] }; }
  }
  function pending(id) { return localRecord(id).items; }
  function savePending(id, record) {
    if (!record.items.length) localStorage.removeItem(localKey(id));
    else localStorage.setItem(localKey(id), JSON.stringify(record));
  }

  function readinessProjection(state) {
    const missionUid = classRow && classRow.MissioUid;
    const mission = (catalog && catalog.tables.Missions || []).find((row) => row.MissioUid === missionUid);
    const skillId = mission && mission.HabilitatPrincipalId;
    const tables = state.tables || {};
    return { missionUid, tables: {
      Usuaris: (tables.Usuaris || []).slice(0, 1).map((row) => ({ AlumneId: row.AlumneId,
        NivellGeneralRecomanat: row.NivellGeneralRecomanat })),
      DominiHabilitats: (tables.DominiHabilitats || []).filter((row) => row.HabilitatId === skillId),
      Progres: (tables.Progres || []).filter((row) => row.MissioUid === missionUid)
        .map((row) => ({ AlumneId: row.AlumneId, MissioUid: row.MissioUid,
          PreguntaUid: row.PreguntaUid, EstatActivitat: row.EstatActivitat })),
      Recuperacions: (tables.Recuperacions || []).filter((row) => row.MissioOrigenUid === missionUid)
        .map((row) => ({ AlumneId: row.AlumneId, MissioOrigenUid: row.MissioOrigenUid, Estat: row.Estat })),
      Dades: (tables.Dades || []).filter((row) => row.MissioUid === missionUid && row.HabilitatId === skillId)
        .map((row) => ({ AlumneId: row.AlumneId, MissioUid: row.MissioUid,
          HabilitatId: row.HabilitatId, NivellCurricular: row.NivellCurricular,
          PreguntaUid: row.PreguntaUid, Correcta: row.Correcta, GameOnly: row.GameOnly }))
    } };
  }

  async function initialize() {
    if (!window.firebase || !window.firebaseConfig || !window.R1V2AcademicEngine)
      throw new Error("Falta preparar el motor de classe.");
    if (!window.firebase.apps.length) window.firebase.initializeApp(window.firebaseConfig);
    if (!db) db = window.firebase.database().ref(root);
    if (!authReady) authReady = window.firebase.auth().currentUser
      ? Promise.resolve(true) : window.firebase.auth().signInAnonymously().then(() => true, () => {
        authReady = null;
        return false;
      });
    return db;
  }

  async function listStudents() {
    await initialize();
    const snapshot = await db.child(`class/${safeKey(group)}/students`).once("value");
    const roster = snapshot.val() || {};
    return { students: Object.values(roster).filter((entry) => entry && entry.active)
      .map((entry) => ({ studentId: entry.studentId, name: entry.name, groupId: entry.groupId })) };
  }

  async function flush(id = studentId) {
    await initialize();
    if ((await authReady) === false) throw new Error("No s'ha pogut connectar amb la classe. Torna-ho a intentar.");
    if (flushByStudent.has(id)) return flushByStudent.get(id);
    const job = (async () => {
      while (pending(id).length) {
        const record = localRecord(id);
        const item = record.items[0];
        const eventPath = `events/${safeKey(id)}/${safeKey(item.event.eventId)}`;
        const existing = (await db.child(eventPath).once("value")).val();
        if (!existing) {
          const update = {};
          update[`state/${safeKey(id)}`] = record.state;
          update[`class/${safeKey(group)}/readiness/${safeKey(id)}`] = record.readiness;
          update[eventPath] = item.event;
          update[`pendingEvents/${safeKey(item.event.eventId)}`] = item.event;
          await db.update(update);
        }
        const latest = localRecord(id);
        const at = latest.items.findIndex((entry) => entry.event.eventId === item.event.eventId);
        if (at >= 0) latest.items.splice(at, 1);
        savePending(id, latest);
      }
      return true;
    })().finally(() => {
      flushByStudent.delete(id);
      if (pending(id).length) scheduleRetry(id);
    });
    flushByStudent.set(id, job);
    return job;
  }

  function scheduleRetry(id) {
    if (retryTimers.has(id)) return;
    retryTimers.set(id, window.setTimeout(() => {
      retryTimers.delete(id);
      if (pending(id).length) flush(id).catch(() => scheduleRetry(id));
    }, 10000));
  }

  function queueResult(kind, output) {
    const names = Object.keys(output.upserts || {});
    if (!names.length) return;
    const id = crypto.randomUUID();
    const event = { eventId: id, studentId: studentId,
      sessionId: output.result.sessionId || (engine.rows("Sessions").slice(-1)[0] || {}).SessioId || "",
      timestamp: Date.now(), sequence: nextSequence(studentId), type: kind,
      status: "PENDING", payload: { upserts: output.upserts } };
    const record = localRecord(studentId);
    record.items.push({ event: event });
    record.state = output.state;
    record.readiness = readinessProjection(output.state);
    // Persistence must succeed before the UI is allowed to move to the next question.
    savePending(studentId, record);
    flush(studentId).catch((error) => {
      console.warn("Resposta pendent de sincronitzar amb Firebase.", error);
      scheduleRetry(studentId);
    });
  }

  function applyOverride(state, overrides) {
    const tables = state.tables || {};
    const users = tables.Usuaris || [];
    if (overrides && users[0] && overrides.diagnosticExempt === true) users[0].EstatDiagnosi = "EXEMPTA";
    else if (overrides && users[0] && overrides.diagnosticExempt === false
      && users[0].EstatDiagnosi === "EXEMPTA"
      && !(tables.Dades || []).some((row) => row.GameOnly !== "SI" && row.RolDidactic !== "DIAGNOSTIC")
      && !(tables.DominiHabilitats || []).some((row) => row.EstatDomini !== "SENSE_EVIDENCIA"))
      users[0].EstatDiagnosi = "PENDENT";
    if (overrides && Array.isArray(overrides.assignments)) {
      // Teacher assignments are a replaceable override; automatic bridge assignments remain academic state.
      const current = (tables.Assignacions || []).filter((row) => String(row.Origen || "").toUpperCase() !== "DOCENT");
      tables.Assignacions = current;
      overrides.assignments.forEach((row) => {
        if (!current.some((item) => item.AssignacioId === row.AssignacioId)) current.push(row);
      });
    }
    if (overrides && overrides.advanceRecoveries) {
      const current = tables.Recuperacions || (tables.Recuperacions = []);
      Object.values(overrides.advanceRecoveries).forEach((row) => {
        if (!current.some((item) => item.RecuperacioId === row.RecuperacioId)) current.push(row);
      });
    }
  }

  function durableChange(run, kind) {
    const before = engine.snapshot();
    try {
      const output = run();
      if (!output.result.duplicate) queueResult(kind, output);
      return output.result;
    } catch (error) {
      engine = window.R1V2AcademicEngine.create(catalog.tables, before, classRow,
        override.adaptations || [], classGoal);
      throw error;
    }
  }

  async function login(id, sessionId) {
    await initialize();
    if ((await authReady) === false) throw new Error("No s'ha pogut connectar amb la classe. Torna-ho a intentar.");
    const normalized = safeKey(id);
    const roster = (await db.child(`class/${safeKey(group)}/students/${normalized}`).once("value")).val();
    if (!roster || !roster.active || roster.studentId !== id) throw new Error("Este alumne no figura al grup actiu.");
    try { await flush(id); } catch (_) { /* Local state below remains available for reentry. */ }
    const [catalogSnap, classSnap, overrideSnap, stateSnap, goalSnap] = await Promise.all([
      catalog ? Promise.resolve({ val: () => catalog }) : db.child("catalog").once("value"),
      db.child(`class/${safeKey(group)}/control`).once("value"),
      db.child(`class/${safeKey(group)}/overrides/${normalized}`).once("value"),
      db.child(`state/${normalized}`).once("value"),
      db.child(`classGoal/${safeKey(group)}`).once("value")
    ]);
    catalog = catalogSnap.val();
    classRow = classSnap.val();
    override = overrideSnap.val() || {};
    let state = stateSnap.val();
    const unsent = localRecord(id);
    if (unsent.items.length) state = unsent.state;
    if (!catalog || !catalog.tables || !classRow || !state || !state.tables)
      throw new Error("La classe encara no està preparada en Firebase. Avisa el professor.");
    applyOverride(state, override);
    studentId = id;
    const goals = goalSnap.val() || {};
    const mission = (catalog.tables.Missions || []).find((item) => item.MissioUid === classRow.MissioUid);
    const shortId = mission && mission.MissioId;
    classGoal = { title: "Energia de la classe", value: Number((goals[shortId] || {}).value || 0), target: 100 };
    engine = window.R1V2AcademicEngine.create(catalog.tables, state, classRow,
      override.adaptations || [], classGoal);
    const output = engine.bootstrap(id, sessionId);
    if (output.upserts.Sessions && output.upserts.Sessions.length) queueResult("SESSION_STARTED", output);
    else if (output.upserts.Diagnostic && output.upserts.Diagnostic.length) queueResult("DIAGNOSTIC_PROGRESS", output);
    else db.child(`class/${safeKey(group)}/readiness/${normalized}`)
      .set(readinessProjection(output.state)).catch(() => { /* An answer or reentry will retry the projection. */ });
    return output.result;
  }

  function submit(payload) {
    if (!engine || !studentId || payload.studentId !== studentId) throw new Error("Sessió acadèmica no iniciada.");
    return durableChange(() => engine.submit(payload), "ANSWER_SUBMITTED");
  }

  function diagnosticSubmit(payload) {
    if (!engine || !studentId || payload.studentId !== studentId) throw new Error("Diagnòstic no iniciat.");
    const before = engine.snapshot();
    try {
      const output = engine.diagnosticSubmit(payload);
      if (!output.result.duplicate) queueResult(output.result.diagnostic.requireDiagnostic
        ? "DIAGNOSTIC_PROGRESS" : "DIAGNOSTIC_COMPLETED", output);
      return output.result;
    } catch (error) {
      engine = window.R1V2AcademicEngine.create(catalog.tables, before, classRow,
        override.adaptations || [], classGoal);
      throw error;
    }
  }

  function help(payload) {
    if (!engine || payload.studentId !== studentId) throw new Error("Sessió acadèmica no iniciada.");
    return durableChange(() => engine.help(payload), "HELP_USED");
  }

  function saveAvatar(payload) {
    if (!engine || payload.studentId !== studentId) throw new Error("Sessió acadèmica no iniciada.");
    return durableChange(() => engine.saveAvatar(payload), "AVATAR_SAVED");
  }

  function bootstrap() {
    if (!engine) throw new Error("Sessió acadèmica no iniciada.");
    const session = engine.rows("Sessions").slice(-1)[0];
    const output = engine.bootstrap(studentId, session && session.SessioId);
    if (Object.keys(output.upserts).length) queueResult("SESSION_STARTED", output);
    return output.result;
  }

  function stopTeacherChanges() {
    teacherListeners.forEach(({ ref, handler }) => ref.off("value", handler));
    teacherListeners = [];
  }

  function watchTeacherChanges(id, onChange) {
    stopTeacherChanges();
    if (!db || id !== studentId) return;
    [
      { path: `class/${safeKey(group)}/control`, initial: classRow },
      { path: `class/${safeKey(group)}/overrides/${safeKey(id)}`, initial: override },
      { path: "catalog/version", initial: catalog && catalog.version }
    ].forEach(({ path, initial }) => {
      const ref = db.child(path);
      let previous = JSON.stringify(initial || null);
      const handler = (snapshot) => {
        const next = JSON.stringify(snapshot.val() || null);
        if (next !== previous) {
          previous = next;
          if (path === "catalog/version") catalog = null;
          onChange();
        }
      };
      ref.on("value", handler, (error) => console.warn("Canvis docents pendents de carregar.", error));
      teacherListeners.push({ ref, handler });
    });
  }

  window.GameAcademic = Object.freeze({ initialize, listStudents, login, submit, diagnosticSubmit, help, saveAvatar, bootstrap, flush,
    watchTeacherChanges, stopTeacherChanges });
  window.addEventListener("online", () => { if (studentId && pending(studentId).length) flush(studentId).catch(() => scheduleRetry(studentId)); });
})();

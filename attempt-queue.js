(function () {
  "use strict";

  const PREFIX = "r1v2-pending-attempts-v1:";

  function create(studentId, onConfirmed, onError) {
    const key = PREFIX + String(studentId);
    let items;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      items = Array.isArray(saved) ? saved.filter((item) => item && item.submissionId && item.studentId === studentId) : [];
    } catch (error) {
      throw new Error("No s'han pogut recuperar les respostes guardades en este dispositiu.");
    }
    let active = null;
    let retryTimer = null;
    let failures = 0;

    function persist(next) {
      // La escritura local debe concluir antes de cambiar de pregunta o enviar a la red.
      localStorage.setItem(key, JSON.stringify(next));
      items = next;
    }

    function retryLater() {
      if (retryTimer || !items.length) return;
      const delay = Math.min(30000, 2000 * Math.pow(2, Math.min(4, failures++)));
      retryTimer = window.setTimeout(() => { retryTimer = null; flush(); }, delay);
    }

    function flush() {
      if (active) return active;
      if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = null; }
      active = (async () => {
        while (items.length) {
          const pending = items[0];
          let result;
          try {
            result = await window.GameData.call("submit", { ...pending, compact: true });
            persist(items.slice(1));
          } catch (error) {
            onError(error, items.length);
            retryLater();
            return false;
          }
          failures = 0;
          try { onConfirmed(result, pending); }
          catch (error) { onError(error, items.length); }
        }
        return true;
      })().finally(() => { active = null; });
      return active;
    }

    function enqueue(payload) {
      if (!payload || !payload.submissionId || payload.studentId !== studentId) throw new Error("Falta identificar la resposta.");
      if (items.some((item) => item.submissionId === payload.submissionId)) return false;
      persist(items.concat({ ...payload }));
      flush();
      return true;
    }

    function dispose() {
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;
    }

    return Object.freeze({ enqueue, flush, dispose, pending: () => items.slice(), count: () => items.length });
  }

  window.GameAttemptQueue = Object.freeze({ create });
}());

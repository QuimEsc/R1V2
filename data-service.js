(function () {
  "use strict";

  const config = window.GAMIFICACIO_CONFIG;
  const query = new URLSearchParams(window.location.search);
  const demo = query.get("demo") === "1";
  const configured = Boolean(config.appsScriptUrl && !config.appsScriptUrl.startsWith("POSA_ACI"));
  const TEACHER_TOKEN_KEY = "gamificacio-teacher-token-v2";
  let teacherToken = readTeacherToken();

  function readTeacherToken() {
    try {
      return window.sessionStorage.getItem(TEACHER_TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setTeacherToken(token) {
    teacherToken = String(token || "");
    try {
      if (teacherToken) window.sessionStorage.setItem(TEACHER_TOKEN_KEY, teacherToken);
      else window.sessionStorage.removeItem(TEACHER_TOKEN_KEY);
    } catch (error) {
      // La sessió continuarà funcionant encara que el navegador bloquege sessionStorage.
    }
  }

  function clearTeacherToken() {
    setTeacherToken("");
  }

  async function call(action, payload = {}) {
    if (demo) return window.GamificacioDemo.call(action, payload);
    if (!configured) {
      throw new Error("Falta configurar la URL d'Apps Script en config.js.");
    }

    const controller = new AbortController();
    const longAction = action.includes("suggest") || action === "help" || action === "list_proposals" || action === "list_diagnostics" || action === "diagnostic_submit";
    const timeoutMs = action === "submit" ? 90000 : (longAction ? 45000 : 30000);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(config.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, groupId: config.groupId, ...payload, ...(teacherToken ? { teacherToken } : {}) }),
        redirect: "follow",
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        if (action === "submit") throw new Error("La correcció tarda massa, però pot continuar guardant-se. Torna a prémer Enviar: no comptarà com un intent nou.");
        throw new Error("La resposta tarda massa. Torna-ho a intentar.");
      }
      throw new Error("No s'ha pogut contactar amb Apps Script. Revisa la URL i el desplegament.");
    } finally {
      window.clearTimeout(timeout);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("Apps Script no ha retornat JSON. Revisa que el desplegament siga accessible per a tothom.");
    }
    if (data.authRequired) {
      clearTeacherToken();
      window.dispatchEvent(new CustomEvent("gamificacio:teacher-auth-required"));
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || `Error del servidor (${response.status}).`);
    return data;
  }

  window.GameData = Object.freeze({
    call,
    isDemo: () => demo,
    isConfigured: () => configured,
    setTeacherToken,
    clearTeacherToken,
    hasTeacherToken: () => Boolean(teacherToken)
  });
}());

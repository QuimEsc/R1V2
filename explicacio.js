(function () {
  "use strict";

  const DRAFT_KEY = "gamificacio-explanation-draft-v1";
  const SIZE_KEY = "gamificacio-explanation-size-v1";
  const MIN_SIZE = 1.35;
  const MAX_SIZE = 3.6;
  const dom = {};
  let renderTimer = null;
  let fontSize = 2;

  function cacheDom() {
    ["explanationInput", "explanationOutput", "renderStatus", "clearExplanationButton", "fullscreenButton", "decreaseTextButton", "increaseTextButton"]
      .forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function readStored(key, fallback = "") {
    try { return window.localStorage.getItem(key) || fallback; } catch (error) { return fallback; }
  }

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* La pissarra funciona igualment. */ }
  }

  function applyFontSize() {
    fontSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(fontSize) || 2));
    dom.explanationOutput.style.setProperty("--explanation-size", `${fontSize}rem`);
    store(SIZE_KEY, String(fontSize));
  }

  async function renderExplanation() {
    const text = dom.explanationInput.value;
    store(DRAFT_KEY, text);
    dom.renderStatus.textContent = "Renderitzant…";
    if (!text.trim()) {
      dom.explanationOutput.innerHTML = '<p class="explanation-placeholder">Escriu l’explicació en el quadre inferior.</p>';
      dom.renderStatus.textContent = "Preparada";
      return;
    }
    dom.explanationOutput.innerHTML = window.GameMath.plainTextToHtml(text);
    await window.GameMath.typeset(dom.explanationOutput);
    dom.renderStatus.textContent = "Actualitzada";
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    dom.renderStatus.textContent = "Escrivint…";
    renderTimer = window.setTimeout(renderExplanation, 180);
  }

  function clearExplanation() {
    dom.explanationInput.value = "";
    renderExplanation();
    dom.explanationInput.focus();
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      dom.renderStatus.textContent = "El navegador no permet la pantalla completa";
    }
  }

  function updateFullscreenLabel() {
    dom.fullscreenButton.textContent = document.fullscreenElement ? "Eixir de pantalla completa" : "Pantalla completa";
  }

  async function init() {
    cacheDom();
    dom.explanationInput.value = readStored(DRAFT_KEY);
    fontSize = Number(readStored(SIZE_KEY, "2"));
    applyFontSize();
    dom.explanationInput.addEventListener("input", scheduleRender);
    dom.clearExplanationButton.addEventListener("click", clearExplanation);
    dom.fullscreenButton.addEventListener("click", toggleFullscreen);
    dom.decreaseTextButton.addEventListener("click", () => { fontSize -= .2; applyFontSize(); });
    dom.increaseTextButton.addEventListener("click", () => { fontSize += .2; applyFontSize(); });
    document.addEventListener("fullscreenchange", updateFullscreenLabel);
    await renderExplanation();
    dom.explanationInput.focus();
  }

  document.addEventListener("DOMContentLoaded", init);
}());

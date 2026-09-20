(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SIZE = 440;
  const MARGIN = 20;
  const GRID_MAX = 10;
  const STEP = (SIZE - MARGIN * 2) / GRID_MAX;
  const state = {
    canvas: null,
    undoButton: null,
    clearButton: null,
    counter: null,
    type: "POINTS",
    config: {},
    points: [],
    disabled: false,
    onChange: null
  };

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalisePoint(point) {
    const x = Array.isArray(point) ? finiteNumber(point[0], 0) : finiteNumber(point && point.x, 0);
    const y = Array.isArray(point) ? finiteNumber(point[1], 0) : finiteNumber(point && point.y, 0);
    return {
      x: Math.max(0, Math.min(GRID_MAX, Math.round(x))),
      y: Math.max(0, Math.min(GRID_MAX, Math.round(y)))
    };
  }

  function toSvg(point) {
    return { x: MARGIN + point.x * STEP, y: MARGIN + (GRID_MAX - point.y) * STEP };
  }

  function node(name, attributes = {}, text = "") {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) element.textContent = text;
    return element;
  }

  function appendLine(svg, a, b, className) {
    const start = toSvg(a);
    const end = toSvg(b);
    svg.appendChild(node("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: className }));
  }

  function drawGrid(svg) {
    svg.appendChild(node("rect", { x: 0, y: 0, width: SIZE, height: SIZE, rx: 18, class: "geometry-background" }));
    for (let index = 0; index <= GRID_MAX; index += 1) {
      const position = MARGIN + index * STEP;
      const major = index === 0 || index === GRID_MAX;
      svg.appendChild(node("line", { x1: position, y1: MARGIN, x2: position, y2: SIZE - MARGIN, class: major ? "geometry-grid geometry-grid-edge" : "geometry-grid" }));
      svg.appendChild(node("line", { x1: MARGIN, y1: position, x2: SIZE - MARGIN, y2: position, class: major ? "geometry-grid geometry-grid-edge" : "geometry-grid" }));
      svg.appendChild(node("text", { x: position, y: SIZE - 3, class: "geometry-axis-label", "text-anchor": "middle" }, String(index)));
      if (index > 0) svg.appendChild(node("text", { x: 4, y: MARGIN + (GRID_MAX - index) * STEP + 4, class: "geometry-axis-label" }, String(index)));
    }
  }

  function drawGuides(svg) {
    if (Number.isFinite(Number(state.config.axisX))) {
      const x = MARGIN + Number(state.config.axisX) * STEP;
      svg.appendChild(node("line", { x1: x, y1: MARGIN, x2: x, y2: SIZE - MARGIN, class: "geometry-guide-axis" }));
      svg.appendChild(node("text", { x: x + 7, y: MARGIN + 15, class: "geometry-guide-label" }, `x=${Number(state.config.axisX)}`));
    }
    if (Number.isFinite(Number(state.config.axisY))) {
      const y = MARGIN + (GRID_MAX - Number(state.config.axisY)) * STEP;
      svg.appendChild(node("line", { x1: MARGIN, y1: y, x2: SIZE - MARGIN, y2: y, class: "geometry-guide-axis" }));
    }
    (state.config.guidePoints || []).map(normalisePoint).forEach((point, index) => {
      const position = toSvg(point);
      svg.appendChild(node("circle", { cx: position.x, cy: position.y, r: 7, class: "geometry-guide-point" }));
      svg.appendChild(node("text", { x: position.x + 10, y: position.y - 10, class: "geometry-guide-label" }, `${String.fromCharCode(65 + index)}(${point.x},${point.y})`));
    });
    if (Array.isArray(state.config.center)) {
      const center = normalisePoint(state.config.center);
      const position = toSvg(center);
      svg.appendChild(node("path", { d: `M ${position.x - 8} ${position.y} H ${position.x + 8} M ${position.x} ${position.y - 8} V ${position.y + 8}`, class: "geometry-center-mark" }));
      svg.appendChild(node("text", { x: position.x + 10, y: position.y - 10, class: "geometry-guide-label" }, `C(${center.x},${center.y})`));
    }
  }

  function drawAnswer(svg) {
    const points = state.points;
    if (state.type === "CIRCLE" && points.length >= 2) {
      const center = toSvg(points[0]);
      const edge = toSvg(points[1]);
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      svg.appendChild(node("circle", { cx: center.x, cy: center.y, r: radius, class: "geometry-answer-shape geometry-answer-circle" }));
      appendLine(svg, points[0], points[1], "geometry-radius");
    } else if (state.type === "ANGLE" && points.length >= 2) {
      appendLine(svg, points[0], points[1], "geometry-answer-shape");
      if (points.length >= 3) appendLine(svg, points[1], points[2], "geometry-answer-shape");
    } else if ((state.type === "SEGMENT" || state.type === "POLYGON") && points.length >= 2) {
      for (let index = 1; index < points.length; index += 1) appendLine(svg, points[index - 1], points[index], "geometry-answer-shape");
      if (state.type === "POLYGON" && points.length === requiredPoints()) appendLine(svg, points[points.length - 1], points[0], "geometry-answer-shape");
    }
    points.forEach((point, index) => {
      const position = toSvg(point);
      svg.appendChild(node("circle", { cx: position.x, cy: position.y, r: 8, class: "geometry-answer-point" }));
      svg.appendChild(node("text", { x: position.x + 11, y: position.y - 11, class: "geometry-point-label" }, `${index + 1} · (${point.x},${point.y})`));
    });
  }

  function requiredPoints() {
    return Math.max(1, Math.min(12, Math.round(finiteNumber(state.config.requiredPoints, state.type === "CIRCLE" || state.type === "SEGMENT" ? 2 : 1))));
  }

  function updateControls() {
    const required = requiredPoints();
    if (state.counter) state.counter.textContent = `${state.points.length} de ${required} punts`;
    if (state.undoButton) state.undoButton.disabled = state.disabled || !state.points.length;
    if (state.clearButton) state.clearButton.disabled = state.disabled || !state.points.length;
    if (state.canvas) {
      state.canvas.classList.toggle("is-disabled", state.disabled);
      state.canvas.setAttribute("aria-label", `Editor geomètric: ${state.points.length} de ${required} punts marcats`);
    }
  }

  function render() {
    if (!state.canvas) return;
    state.canvas.replaceChildren();
    drawGrid(state.canvas);
    drawGuides(state.canvas);
    drawAnswer(state.canvas);
    updateControls();
  }

  function serialise() {
    return JSON.stringify({ version: 1, type: state.type, points: state.points.map((point) => ({ x: point.x, y: point.y })) });
  }

  function previewSvg() {
    const clone = state.canvas ? state.canvas.cloneNode(true) : null;
    if (!clone) return "";
    clone.removeAttribute("id");
    clone.removeAttribute("aria-label");
    clone.removeAttribute("tabindex");
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    clone.setAttribute("role", "img");
    clone.setAttribute("aria-label", "Construcció geomètrica de l'alumne");
    clone.setAttribute("class", "geometry-monitor-preview");
    return clone.outerHTML.slice(0, 20000);
  }

  function notify() {
    updateControls();
    if (typeof state.onChange === "function") state.onChange({ answer: serialise(), previewHtml: previewSvg(), complete: state.points.length === requiredPoints() });
  }

  function pointFromEvent(event) {
    const rect = state.canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * SIZE / Math.max(1, rect.width);
    const screenY = (event.clientY - rect.top) * SIZE / Math.max(1, rect.height);
    return normalisePoint({ x: (screenX - MARGIN) / STEP, y: GRID_MAX - (screenY - MARGIN) / STEP });
  }

  function handleCanvasClick(event) {
    if (state.disabled || state.points.length >= requiredPoints()) return;
    const point = pointFromEvent(event);
    if (state.points.some((existing) => existing.x === point.x && existing.y === point.y)) return;
    state.points.push(point);
    render();
    notify();
  }

  function undo() {
    if (state.disabled || !state.points.length) return;
    state.points.pop();
    render();
    notify();
  }

  function clear() {
    if (state.disabled || !state.points.length) return;
    state.points = [];
    render();
    notify();
  }

  function parseSaved(savedAnswer) {
    try {
      const parsed = JSON.parse(String(savedAnswer || ""));
      if (!parsed || !Array.isArray(parsed.points)) return [];
      return parsed.points.slice(0, requiredPoints()).map(normalisePoint).filter((point, index, list) => list.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index);
    } catch (error) {
      return [];
    }
  }

  function start(options) {
    state.canvas = options.canvas;
    state.undoButton = options.undoButton;
    state.clearButton = options.clearButton;
    state.counter = options.counter;
    state.type = String(options.type || "POINTS").toUpperCase();
    state.config = options.config && typeof options.config === "object" ? options.config : {};
    state.disabled = false;
    state.onChange = options.onChange;
    state.points = parseSaved(options.savedAnswer);
    state.canvas.onclick = handleCanvasClick;
    state.undoButton.onclick = undo;
    state.clearButton.onclick = clear;
    render();
  }

  function stop() {
    if (state.canvas) state.canvas.onclick = null;
    if (state.undoButton) state.undoButton.onclick = null;
    if (state.clearButton) state.clearButton.onclick = null;
    state.onChange = null;
  }

  function setDisabled(disabled) {
    state.disabled = Boolean(disabled);
    updateControls();
  }

  function hasAnswer() {
    return state.points.length > 0;
  }

  window.GameGeometry = Object.freeze({ start, stop, setDisabled, serialise, previewSvg, hasAnswer });
}());

(function () {
  "use strict";

  const BLOCKED_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "META", "LINK"]);

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitiseHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const nodes = [...template.content.querySelectorAll("*")];
    nodes.forEach((node) => {
      if (BLOCKED_TAGS.has(node.tagName)) {
        node.remove();
        return;
      }
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  async function typeset(elements) {
    const targets = (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
    if (!targets.length || !window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
    try {
      if (typeof window.MathJax.typesetClear === "function") window.MathJax.typesetClear(targets);
      await window.MathJax.typesetPromise(targets);
    } catch (error) {
      console.warn("No s'ha pogut renderitzar una expressió MathJax.", error);
    }
  }

  async function setHtml(element, html) {
    element.innerHTML = sanitiseHtml(html);
    await typeset(element);
  }

  async function setText(element, text) {
    element.textContent = String(text || "");
    await typeset(element);
  }

  function skipSpaces(text, index) {
    while (index < text.length && /\s/.test(text.charAt(index))) index += 1;
    return index;
  }

  function readParenthesized(text, openIndex) {
    let depth = 0;
    for (let index = openIndex; index < text.length; index += 1) {
      if (text.charAt(index) === "(") depth += 1;
      if (text.charAt(index) === ")") {
        depth -= 1;
        if (depth === 0) return { content: text.slice(openIndex + 1, index), end: index + 1 };
      }
    }
    return null;
  }

  function splitTopLevel(text, separator) {
    const parts = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
      const character = text.charAt(index);
      if (character === "(") depth += 1;
      else if (character === ")") depth = Math.max(0, depth - 1);
      else if (character === separator && depth === 0) {
        parts.push(text.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  }

  function hasKeywordBoundary(text, index, length) {
    const before = index === 0 || !/[A-Za-z0-9_]/.test(text.charAt(index - 1));
    const after = index + length >= text.length || !/[A-Za-z0-9_]/.test(text.charAt(index + length));
    return before && after;
  }

  function matrixCells(row) {
    const cells = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < row.length; index += 1) {
      const character = row.charAt(index);
      if (character === "(") depth += 1;
      else if (character === ")") depth = Math.max(0, depth - 1);
      else if ((character === "," || character === "|") && depth === 0) {
        const cell = row.slice(start, index).trim();
        if (cell) cells.push(cell);
        if (character === "|") cells.push("__MID__");
        start = index + 1;
      }
    }
    const last = row.slice(start).trim();
    if (last) cells.push(last);
    return cells;
  }

  function parseMatrixAt(text, index, keyword, environment) {
    if (text.slice(index, index + keyword.length).toLowerCase() !== keyword || !hasKeywordBoundary(text, index, keyword.length)) return null;
    const openIndex = skipSpaces(text, index + keyword.length);
    if (text.charAt(openIndex) !== "(") return null;
    const block = readParenthesized(text, openIndex);
    if (!block) return null;
    const rows = splitTopLevel(block.content, ";").map((row) => matrixCells(row)
      .map((cell) => cell === "__MID__" ? "\\mid" : expressionToLatex(cell))
      .join("&")).filter(Boolean);
    if (!rows.length) return null;
    return { end: block.end, latex: `\\begin{${environment}}${rows.join("\\\\")}\\end{${environment}}` };
  }

  function parseSystemAt(text, index) {
    const keyword = "sis";
    if (text.slice(index, index + keyword.length).toLowerCase() !== keyword || !hasKeywordBoundary(text, index, keyword.length)) return null;
    const openIndex = skipSpaces(text, index + keyword.length);
    if (text.charAt(openIndex) !== "(") return null;
    const block = readParenthesized(text, openIndex);
    if (!block) return null;
    const equations = splitTopLevel(block.content, ";").map(expressionToLatex).filter(Boolean);
    if (!equations.length) return null;
    return { end: block.end, latex: `\\left\\{\\begin{array}{l}${equations.join("\\\\")}\\end{array}\\right.` };
  }

  function limitTargetToLatex(target) {
    let value = String(target || "").trim();
    let side = "";
    if (value.length > 1 && /[+-]$/.test(value)) {
      side = `^${value.slice(-1)}`;
      value = value.slice(0, -1);
    }
    if (/^inf$/i.test(value)) value = "\\infty";
    else if (/^-inf$/i.test(value)) value = "-\\infty";
    else value = expressionToLatex(value);
    return value + side;
  }

  function parseLimitAt(text, index) {
    const keyword = "lim";
    if (text.slice(index, index + keyword.length).toLowerCase() !== keyword || !hasKeywordBoundary(text, index, keyword.length)) return null;
    const openIndex = skipSpaces(text, index + keyword.length);
    if (text.charAt(openIndex) !== "(") return null;
    const block = readParenthesized(text, openIndex);
    if (!block) return null;
    const arrow = block.content.indexOf("->");
    if (arrow < 1) return null;
    const variable = block.content.slice(0, arrow).trim();
    const target = block.content.slice(arrow + 2).trim();
    const expression = text.slice(skipSpaces(text, block.end)).trim();
    if (!variable || !target) return null;
    return { end: text.length, latex: `\\lim_{${variable}\\to ${limitTargetToLatex(target)}}${expression ? ` ${expressionToLatex(expression)}` : ""}` };
  }

  function parseIntegralAt(text, index) {
    const keyword = "int";
    if (text.slice(index, index + keyword.length).toLowerCase() !== keyword || !hasKeywordBoundary(text, index, keyword.length)) return null;
    let cursor = skipSpaces(text, index + keyword.length);
    if (text.charAt(cursor) !== "(") return null;
    const limitsBlock = readParenthesized(text, cursor);
    if (!limitsBlock) return null;
    cursor = skipSpaces(text, limitsBlock.end);
    if (text.charAt(cursor) !== "(") return null;
    const expressionBlock = readParenthesized(text, cursor);
    if (!expressionBlock || !expressionBlock.content.trim()) return null;
    cursor = skipSpaces(text, expressionBlock.end);
    const differential = text.slice(cursor).match(/^d([A-Za-z])\b/);
    if (!differential) return null;
    const limits = limitsBlock.content.trim() ? splitTopLevel(limitsBlock.content, ",") : [];
    if (limits.length !== 0 && limits.length !== 2) return null;
    const bounds = limits.length === 2 ? `_{${expressionToLatex(limits[0])}}^{${expressionToLatex(limits[1])}}` : "";
    return { end: cursor + differential[0].length, latex: `\\int${bounds} ${expressionToLatex(expressionBlock.content)}\\,d${differential[1]}` };
  }

  function parseSpecialAt(text, index) {
    return parseMatrixAt(text, index, "mat", "pmatrix")
      || parseMatrixAt(text, index, "det", "vmatrix")
      || parseSystemAt(text, index)
      || parseLimitAt(text, index)
      || parseIntegralAt(text, index);
  }

  function tokenizeExpression(expression) {
    const tokens = [];
    let index = 0;
    while (index < expression.length) {
      const start = index;
      const character = expression.charAt(index);
      if (/\s/.test(character)) { index += 1; continue; }
      const matrix = parseMatrixAt(expression, index, "mat", "pmatrix") || parseMatrixAt(expression, index, "det", "vmatrix");
      if (matrix) {
        tokens.push({ type: "special", latex: matrix.latex, start, end: matrix.end });
        index = matrix.end;
        continue;
      }
      if (expression.slice(index, index + 4).toLowerCase() === "sqrt" && !/[A-Za-zÀ-ÿ]/.test(expression.charAt(index + 4) || "")) {
        tokens.push({ type: "sqrt", value: "sqrt", start, end: index + 4 });
        index += 4;
        continue;
      }
      if ((character === "<" || character === ">") && expression.charAt(index + 1) === "=") {
        tokens.push({ type: "op", value: expression.slice(index, index + 2), start, end: index + 2 });
        index += 2;
        continue;
      }
      if (/[0-9]/.test(character)) {
        index += 1;
        while (index < expression.length && /[0-9.,]/.test(expression.charAt(index))) index += 1;
        tokens.push({ type: "number", value: expression.slice(start, index).replace(",", "."), start, end: index });
        continue;
      }
      if (/[A-Za-zÀ-ÿ]/.test(character)) {
        index += 1;
        while (index < expression.length && /[A-Za-zÀ-ÿ]/.test(expression.charAt(index))) index += 1;
        tokens.push({ type: "name", value: expression.slice(start, index), start, end: index });
        continue;
      }
      if ("()+-*/^=<>|".includes(character)) {
        tokens.push({ type: "op", value: character, start, end: index + 1 });
        index += 1;
        continue;
      }
      return null;
    }
    return tokens;
  }

  function peek(state, offset = 0) { return state.tokens[state.current + offset] || null; }
  function previous(state) { return state.tokens[state.current - 1] || null; }
  function advance(state) { state.current += 1; return previous(state); }
  function matchType(state, type) { if (peek(state) && peek(state).type === type) { advance(state); return true; } return false; }
  function matchOperator(state, operator) { if (peek(state) && peek(state).type === "op" && peek(state).value === operator) { advance(state); return true; } return false; }
  function canStartPrimary(token) { return token && (["number", "name", "sqrt", "special"].includes(token.type) || (token.type === "op" && token.value === "(")); }
  function canEndPrimary(token) { return token && (["number", "name", "special"].includes(token.type) || (token.type === "op" && token.value === ")")); }
  function canImplicitMultiply(state) {
    const left = previous(state);
    const right = peek(state);
    return Boolean(canEndPrimary(left) && canStartPrimary(right) && left.end === right.start);
  }

  function parsePrimary(state) {
    if (matchOperator(state, "(")) {
      const inner = parseRelation(state);
      return inner && matchOperator(state, ")") ? inner : null;
    }
    if (matchType(state, "sqrt")) {
      let index = null;
      if (peek(state) && peek(state).type === "number" && canStartPrimary(peek(state, 1))) index = advance(state).value;
      const value = parseUnary(state);
      return value ? { type: "sqrt", index, value } : null;
    }
    if (matchType(state, "number")) return { type: "number", value: previous(state).value };
    if (matchType(state, "special")) return { type: "special", latex: previous(state).latex };
    const current = peek(state);
    const following = peek(state, 1);
    if (current && current.type === "name" && current.value === "P" && following && following.value === "(") {
      advance(state);
      advance(state);
      const argument = parseRelation(state);
      return argument && matchOperator(state, ")") ? { type: "probability", argument } : null;
    }
    if (current && current.type === "name" && ["sin", "cos", "tan", "ln", "log", "exp"].includes(current.value.toLowerCase()) && following && following.value === "(") {
      const name = advance(state).value.toLowerCase();
      advance(state);
      const argument = parseRelation(state);
      return argument && matchOperator(state, ")") ? { type: "func", name, argument } : null;
    }
    if (matchType(state, "name")) return { type: "name", value: previous(state).value };
    return null;
  }

  function parsePower(state) {
    let node = parsePrimary(state);
    if (!node) return null;
    if (matchOperator(state, "^")) {
      const exponent = parseUnary(state);
      if (!exponent) return null;
      node = { type: "power", base: node, exponent };
    }
    return node;
  }

  function parseUnary(state) {
    if (matchOperator(state, "+")) return parseUnary(state);
    if (matchOperator(state, "-")) {
      const value = parseUnary(state);
      return value ? { type: "unary", value } : null;
    }
    return parsePower(state);
  }

  function parseMultiplicative(state) {
    let node = parseUnary(state);
    if (!node) return null;
    while (true) {
      if (matchOperator(state, "*") || matchOperator(state, "/")) {
        const operator = previous(state).value;
        const right = parseUnary(state);
        if (!right) return null;
        node = { type: "binary", operator, left: node, right, implicit: false };
      } else if (canImplicitMultiply(state)) {
        const right = parseUnary(state);
        if (!right) return null;
        node = { type: "binary", operator: "*", left: node, right, implicit: true };
      } else break;
    }
    return node;
  }

  function parseAdditive(state) {
    let node = parseMultiplicative(state);
    if (!node) return null;
    while (matchOperator(state, "+") || matchOperator(state, "-")) {
      const operator = previous(state).value;
      const right = parseMultiplicative(state);
      if (!right) return null;
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  function parseRelation(state) {
    let node = parseAdditive(state);
    if (!node) return null;
    while (["=", "<", ">", "<=", ">=", "|"].some((operator) => matchOperator(state, operator))) {
      const operator = previous(state).value;
      const right = parseAdditive(state);
      if (!right) return null;
      node = { type: "relation", operator, left: node, right };
    }
    return node;
  }

  function parseExpression(expression) {
    const tokens = tokenizeExpression(String(expression || "").trim());
    if (!tokens || !tokens.length) return null;
    const state = { tokens, current: 0 };
    const ast = parseRelation(state);
    return ast && state.current === tokens.length ? { ast, tokens, latex: astToLatex(ast) } : null;
  }

  function needsParentheses(node) { return node && (["binary", "relation", "unary"].includes(node.type)); }
  function wrapParentheses(value) { return `\\left(${value}\\right)`; }
  function astToLatex(node) {
    if (!node) return "";
    if (node.type === "number") return node.value;
    if (node.type === "name") return node.value.toLowerCase() === "pi" ? "\\pi" : node.value;
    if (node.type === "special") return node.latex;
    if (node.type === "sqrt") return node.index && node.index !== "2" ? `\\sqrt[${node.index}]{${astToLatex(node.value)}}` : `\\sqrt{${astToLatex(node.value)}}`;
    if (node.type === "func") return `\\${node.name}\\left(${astToLatex(node.argument)}\\right)`;
    if (node.type === "probability") return `P\\left(${astToLatex(node.argument)}\\right)`;
    if (node.type === "unary") return `-${needsParentheses(node.value) ? wrapParentheses(astToLatex(node.value)) : astToLatex(node.value)}`;
    if (node.type === "power") return `${needsParentheses(node.base) ? wrapParentheses(astToLatex(node.base)) : astToLatex(node.base)}^{${astToLatex(node.exponent)}}`;
    if (node.type === "relation") {
      const operator = node.operator === "<=" ? "\\le " : node.operator === ">=" ? "\\ge " : node.operator === "|" ? "\\mid " : node.operator;
      return `${astToLatex(node.left)}${operator}${astToLatex(node.right)}`;
    }
    if (node.type === "binary") {
      if (node.operator === "/") return `\\frac{${astToLatex(node.left)}}{${astToLatex(node.right)}}`;
      if (node.operator === "*") {
        const left = needsParentheses(node.left) ? wrapParentheses(astToLatex(node.left)) : astToLatex(node.left);
        const right = needsParentheses(node.right) ? wrapParentheses(astToLatex(node.right)) : astToLatex(node.right);
        return `${left}${node.implicit ? "" : "\\cdot "}${right}`;
      }
      const right = node.operator === "-" && needsParentheses(node.right) ? wrapParentheses(astToLatex(node.right)) : astToLatex(node.right);
      return `${astToLatex(node.left)}${node.operator}${right}`;
    }
    return "";
  }

  function expressionToLatex(expression) {
    const parsed = parseExpression(expression);
    return parsed ? parsed.latex : String(expression || "").trim().replace(/\binf\b/gi, "\\infty");
  }

  function tokenizeMixed(text) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
      const start = index;
      const character = text.charAt(index);
      if (/\s/.test(character)) {
        while (index < text.length && /\s/.test(text.charAt(index))) index += 1;
        tokens.push({ type: "space", value: text.slice(start, index), start, end: index });
        continue;
      }
      const matrix = parseMatrixAt(text, index, "mat", "pmatrix") || parseMatrixAt(text, index, "det", "vmatrix");
      if (matrix) {
        tokens.push({ type: "special", value: text.slice(index, matrix.end), latex: matrix.latex, start, end: matrix.end });
        index = matrix.end;
        continue;
      }
      if ((character === "<" || character === ">") && text.charAt(index + 1) === "=") {
        tokens.push({ type: "math", value: text.slice(index, index + 2), start, end: index + 2 });
        index += 2;
        continue;
      }
      if (/[0-9]/.test(character)) {
        index += 1;
        while (index < text.length && /[0-9.,]/.test(text.charAt(index))) index += 1;
        tokens.push({ type: "number", value: text.slice(start, index), start, end: index });
        continue;
      }
      if (/[A-Za-zÀ-ÿ]/.test(character)) {
        index += 1;
        while (index < text.length && /[A-Za-zÀ-ÿ]/.test(text.charAt(index))) index += 1;
        tokens.push({ type: "word", value: text.slice(start, index), start, end: index });
        continue;
      }
      if ("()+-*/^=<>|".includes(character)) {
        tokens.push({ type: "math", value: character, start, end: index + 1 });
        index += 1;
        continue;
      }
      tokens.push({ type: "other", value: character, start, end: index + 1 });
      index += 1;
    }
    return tokens;
  }

  function containsStructuredMath(node) {
    return node && !["number", "name"].includes(node.type);
  }

  function renderPlainMixedSegment(text) {
    const tokens = tokenizeMixed(text);
    const trimmed = text.trim();
    const trimmedStart = text.search(/\S/);
    const trimmedEnd = trimmed ? trimmedStart + trimmed.length : -1;
    let result = "";
    let index = 0;
    while (index < tokens.length) {
      if (["space", "other"].includes(tokens[index].type)) {
        result += escapeHtml(tokens[index].value);
        index += 1;
        continue;
      }
      let bestEnd = -1;
      let bestLatex = "";
      for (let end = index; end < tokens.length && tokens[end].type !== "other"; end += 1) {
        if (tokens[end].type === "space") continue;
        const candidate = text.slice(tokens[index].start, tokens[end].end).trim();
        const parsed = parseExpression(candidate);
        if (!parsed) continue;
        const wholeLine = tokens[index].start === trimmedStart && tokens[end].end === trimmedEnd;
        const standaloneAtom = parsed.tokens.length === 1 && (parsed.tokens[0].type === "number" || (parsed.tokens[0].type === "name" && parsed.tokens[0].value.length <= 2));
        if (containsStructuredMath(parsed.ast) || (wholeLine && standaloneAtom)) {
          bestEnd = end;
          bestLatex = `\\(${escapeHtml(parsed.latex)}\\)`;
        }
      }
      if (bestEnd >= 0) {
        result += bestLatex;
        index = bestEnd + 1;
      } else {
        result += escapeHtml(tokens[index].value);
        index += 1;
      }
    }
    return result;
  }

  function specialIsPartOfExpression(text, start, end) {
    let previousIndex = start - 1;
    while (previousIndex >= 0 && /\s/.test(text.charAt(previousIndex))) previousIndex -= 1;
    const nextIndex = skipSpaces(text, end);
    const before = previousIndex >= 0 ? text.charAt(previousIndex) : "";
    const after = nextIndex < text.length ? text.charAt(nextIndex) : "";
    return /[=<>+\-*/^(|]/.test(before) || /[=<>+\-*/^)|]/.test(after);
  }

  function findNextSpecial(text, startIndex) {
    for (let index = startIndex; index < text.length; index += 1) {
      const special = parseSpecialAt(text, index);
      if (special && !specialIsPartOfExpression(text, index, special.end)) return { ...special, start: index };
    }
    return null;
  }

  function plainLineToHtml(line) {
    const value = String(line || "");
    if (!value.trim()) return "";
    if (/\\\(|\\\[|\$/.test(value)) return escapeHtml(value);
    let result = "";
    let index = 0;
    while (index < value.length) {
      const special = findNextSpecial(value, index);
      if (!special) {
        result += renderPlainMixedSegment(value.slice(index));
        break;
      }
      if (special.start > index) result += renderPlainMixedSegment(value.slice(index, special.start));
      result += `\\(${escapeHtml(special.latex)}\\)`;
      index = special.end;
    }
    return result;
  }

  function studentTextToHtml(text) {
    return String(text || "").split(/\r?\n/).map((line) => {
      const converted = plainLineToHtml(line);
      return converted ? `<div>${converted}</div>` : "<br>";
    }).join("");
  }

  window.GameMath = Object.freeze({
    escapeHtml, sanitiseHtml, typeset, setHtml, setText, studentTextToHtml,
    plainTextToHtml: studentTextToHtml, expressionToLatex
  });
}());

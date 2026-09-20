(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReforcCore = Object.freeze(api);
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PHASES = ["SUPORT", "BASE", "REPTE"];
  const COMPETENCIES = [
    { id: "C1", label: "Nombres i operacions", weight: 35 },
    { id: "C2", label: "Tria de procediments", weight: 20 },
    { id: "C3", label: "Problemes breus", weight: 20 },
    { id: "C4", label: "Representació i interpretació", weight: 15 },
    { id: "C5", label: "Raonament i comprovació", weight: 10 }
  ];

  const raw = [
    ["M01",1,"Compara nombres","Quin és major?","Mira primer les desenes. Si són iguals, mira les unitats.","34 > 29 perquè 3 desenes > 2 desenes.","C4","compare"],
    ["M02",1,"Sumes que arriben a 20","Ajunta sense perdre't","Completa primer una desena i suma el que queda.","8 + 5 → 8 + 2 + 3 = 13.","C1","add20"],
    ["M03",1,"Restes curtes","Lleva una quantitat","Resta primer fins a la desena i després la resta.","17 − 6 → 17 − 7 + 1 = 11.","C1","sub20"],
    ["M04",1,"Dobles i meitats","Parelles iguals","Doble és sumar dues vegades. Meitat és repartir en 2 grups iguals.","Doble de 6 = 12; meitat de 12 = 6.","C1","double"],
    ["M05",1,"El nombre que falta","Desfés l'operació","En una suma, resta el que coneixes al total.","□ + 5 = 12 → 12 − 5 = 7.","C2","missingAdd"],
    ["M06",2,"Multiplicar és fer grups","Grups iguals","Multiplica nombre de grups × elements de cada grup.","3 grups de 4 → 3 × 4 = 12.","C4","groups"],
    ["M07",2,"Taules del 2, 5 i 10","Productes ràpids","×2 és doble; ×5 acaba en 0 o 5; ×10 afegeix un zero.","7 × 5 = 35.","C1","tablesA"],
    ["M08",2,"Taules del 3 i del 4","Construeix el producte","Per ×4 pots fer el doble i tornar a doblar.","6 × 4 → 12 → 24.","C1","tablesB"],
    ["M09",2,"Dividir és repartir","Repartiments exactes","Busca quin nombre multiplicat pel divisor dona el total.","20 ÷ 5: 5 × 4 = 20, per tant 4.","C1","division"],
    ["M10",2,"Quina operació toca?","Tria abans de calcular","Ajuntar: +. Llevar: −. Grups iguals: ×. Repartir: ÷.","12 caramels entre 3 → 12 ÷ 3.","C3","chooseOp"],
    ["M11",3,"Enters: damunt i davall de zero","Compara amb zero","Un positiu és major que 0. Un negatiu és menor que 0.","−3 < 0 < 4.","C4","integerCompare"],
    ["M12",3,"Oposats","Mateixa distància, altre signe","L'oposat conserva el nombre i canvia el signe.","Oposat de −5 → +5.","C1","opposite"],
    ["M13",3,"Sumar un negatiu","Canvia i calcula","Transformació fixa: +(−b) es converteix en −b.","7 + (−3) → 7 − 3 = 4.","C2","addNegative"],
    ["M14",3,"Restar un negatiu","Dos signes es fan més","Transformació fixa: −(−b) es converteix en +b.","6 − (−2) → 6 + 2 = 8.","C2","subNegative"],
    ["M15",3,"Enters mesclats","Transforma abans d'operar","Primer canvia +(−) o −(−); després calcula una sola operació.","−4 − (−7) → −4 + 7 = 3.","C5","integerMixed"],
    ["M16",4,"Fracció d'un dibuix","Parts iguals","Denominador: parts totals. Numerador: parts marcades.","3 de 5 parts → 3/5.","C4","fractionPart"],
    ["M17",4,"Fraccions equivalents","Multiplica dalt i baix","Per fer una equivalent, multiplica numerador i denominador pel mateix nombre.","1/2 × 2/2 = 2/4.","C2","equivalent"],
    ["M18",4,"Compara fraccions senzilles","Mateix denominador","Si el denominador és igual, és major la que té més parts marcades.","5/8 > 3/8.","C4","fractionCompare"],
    ["M19",4,"Decimals i diners","Cèntims i euros","Dues xifres després de la coma són cèntims.","2,50 € + 1 € = 3,50 €.","C3","money"],
    ["M20",4,"Percentatges útils","10%, 25% i 50%","50% és la meitat; 25% és la quarta part; 10% és dividir entre 10.","50% de 18 = 9.","C1","percent"],
    ["M21",5,"Unitats quotidianes","Tria una unitat amb sentit","Objecte curt: cm. Distància: m o km. Líquid: L. Massa: kg.","Una porta fa aproximadament 2 m.","C4","units"],
    ["M22",5,"Perímetre","Suma els costats","Perímetre és tota la vora. En un rectangle: 2 × llarg + 2 × ample.","Rectangle 5 i 3 → 5+3+5+3=16.","C2","perimeter"],
    ["M23",5,"Àrea de rectangles","Files per columnes","Àrea del rectangle = base × altura.","Base 4 i altura 3 → 12 quadrats.","C2","area"],
    ["M24",5,"Llig una taula","Busca, no endevines","Localitza la fila correcta i llig només el valor que demana.","Dilluns 4, dimarts 7 → el major és dimarts.","C4","data"],
    ["M25",5,"Patrons i errors","Comprova el pas","Busca què canvia cada vegada i aplica sempre la mateixa regla.","2, 5, 8, … suma 3; segueix 11.","C5","patterns"]
  ];

  const icons = ["🔢","➕","➖","🟰","🧩","📦","⚡","✖️","➗","🧠","🌡️","↔️","🛬","🛫","🛰️","🍕","🔁","⚖️","🪙","💯","📏","🔲","▦","📊","🔎"];
  const MISSIONS = raw.map((m, index) => ({
    missionId: m[0], sector: m[1], sectorId: `S${m[1]}`, title: m[2], subtitle: m[3],
    rule: m[4], example: m[5], competencyId: m[6], skill: m[7], icon: icons[index],
    order: index + 1, orderInSector: index % 5 + 1, macroLevel: m[1] <= 5 ? 1 : 1,
    prerequisiteIds: index === 0 ? [] : [raw[index - 1][0]]
  }));

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function seeded(seed) {
    let value = 0;
    String(seed).split("").forEach((c) => { value = (value * 31 + c.charCodeAt(0)) >>> 0; });
    return function (min, max) {
      value = (value * 1664525 + 1013904223) >>> 0;
      return min + (value % (max - min + 1));
    };
  }
  function phaseIndex(phase) { return Math.max(0, PHASES.indexOf(String(phase || "BASE").toUpperCase())); }
  function exerciseId(missionId, phase, index) { return `${missionId}-${String(phase).slice(0, 1)}-${String(index + 1).padStart(2, "0")}`; }
  function make(mission, phase, index, q, a, hint, errorCode, format) {
    return {
      exerciseId: exerciseId(mission.missionId, phase, index), missionId: mission.missionId,
      route: phase, level: phase, step: index + 1, levelStep: index + 1, levelTotal: 5,
      questionHtml: `<p>${q}</p>`, expectedAnswer: String(a), hint1: hint || mission.rule,
      hint2: `${mission.example} Ara fes el teu exercici.`, methodId: mission.skill.toUpperCase(),
      errorCode: errorCode || mission.skill.toUpperCase(), competencyId: mission.competencyId,
      interactionType: "", answerMode: format || "NUMERICA", explanation: { title: mission.title, rule: mission.rule, example: mission.example }
    };
  }
  function problem(mission, phase, index) {
    const p = phaseIndex(phase);
    const r = seeded(`${mission.missionId}-${phase}-${index}`);
    let a, b, total, q, answer, format = "NUMERICA";
    switch (mission.skill) {
      case "compare":
        a = r(3 + p * 8, 25 + p * 20); b = clamp(a + r(-8, 8), 0, 90); if (a === b) b += 1;
        q = `Completa amb &gt; o &lt;: <strong>${a} □ ${b}</strong>`; answer = a > b ? ">" : "<"; format = "TEXT"; break;
      case "add20": a = r(2, 9 + p * 3); b = r(2, 9); q = `Calcula: <strong>${a} + ${b}</strong>`; answer = a + b; break;
      case "sub20": a = r(8, 20 + p * 5); b = r(2, Math.min(a, 9 + p * 3)); q = `Calcula: <strong>${a} − ${b}</strong>`; answer = a - b; break;
      case "double": a = r(2, 8 + p * 2); if (index % 2) { q = `Quina és la meitat de <strong>${a * 2}</strong>?`; answer = a; } else { q = `Quin és el doble de <strong>${a}</strong>?`; answer = a * 2; } break;
      case "missingAdd": a = r(2, 9 + p * 3); b = r(2, 8); total = a + b; q = `Completa: <strong>□ + ${b} = ${total}</strong>`; answer = a; break;
      case "groups": a = r(2, 4 + p); b = r(2, 5 + p); q = `${a} grups de ${b}. Quants n'hi ha? <strong>${a} × ${b} = □</strong>`; answer = a * b; break;
      case "tablesA": a = [2,5,10][r(0,2)]; b = r(2, 8 + p); q = `Calcula: <strong>${a} × ${b}</strong>`; answer = a * b; break;
      case "tablesB": a = r(3,4); b = r(2, 7 + p); q = `Calcula: <strong>${a} × ${b}</strong>`; answer = a * b; break;
      case "division": b = [2,3,4,5][r(0,3)]; a = r(2, 7 + p); total = a * b; q = `Reparteix: <strong>${total} ÷ ${b}</strong>`; answer = a; break;
      case "chooseOp": {
        const cases = [
          [`Tens ${r(4,9)} cromos i te'n donen ${r(2,5)}. Quina operació uses?`, "+"],
          [`Tens ${r(8,15)} cromos i en perds ${r(2,6)}. Quina operació uses?`, "−"],
          [`Hi ha ${r(2,5)} bosses amb ${r(2,5)} boles en cada una. Quina operació uses?`, "×"],
          [`Reparteixes ${[12,16,20][r(0,2)]} boles en grups iguals. Quina operació uses?`, "÷"]
        ]; [q, answer] = cases[index % cases.length]; format = "TEXT"; break;
      }
      case "integerCompare": a = r(1, 8 + p); q = `Completa amb &gt; o &lt;: <strong>−${a} □ 0</strong>`; answer = "<"; format = "TEXT"; break;
      case "opposite": a = r(1, 8 + p * 2); if (index % 2) { q = `Escriu l'oposat de <strong>${a}</strong>`; answer = -a; } else { q = `Escriu l'oposat de <strong>−${a}</strong>`; answer = a; } break;
      case "addNegative": a = r(5, 12 + p * 2); b = r(1, Math.min(a, 7 + p)); q = `Transforma i calcula: <strong>${a} + (−${b})</strong>`; answer = a - b; break;
      case "subNegative": a = r(1, 10 + p); b = r(1, 7 + p); q = `Transforma i calcula: <strong>${a} − (−${b})</strong>`; answer = a + b; break;
      case "integerMixed": a = r(1, 9); b = r(1, 9); if (index % 2) { q = `Calcula: <strong>−${a} − (−${b})</strong>`; answer = -a + b; } else { q = `Calcula: <strong>${a} + (−${b})</strong>`; answer = a - b; } break;
      case "fractionPart": b = r(3, 8); a = r(1, b - 1); q = `Hi ha ${b} parts iguals i ${a} estan marcades. Escriu la fracció.`; answer = `${a}/${b}`; format = "TEXT"; break;
      case "equivalent": b = r(2, 6); a = r(1, b - 1); total = p === 0 ? 2 : r(2, 3); q = `Completa: <strong>${a}/${b} = □/${b * total}</strong>`; answer = a * total; break;
      case "fractionCompare": b = r(4, 9); a = r(1, b - 2); total = r(a + 1, b - 1); q = `Completa amb &gt; o &lt;: <strong>${a}/${b} □ ${total}/${b}</strong>`; answer = "<"; format = "TEXT"; break;
      case "money": a = r(1, 8); b = [25,50,75][r(0,2)]; total = r(1, 4); q = `Calcula: <strong>${a},${b} € + ${total} €</strong>`; answer = String((a + b / 100 + total).toFixed(2)).replace(".", ","); format = "TEXT"; break;
      case "percent": { const percents = [50,25,10]; const pct = percents[index % 3]; const base = pct === 25 ? 4 * r(2,6) : pct === 10 ? 10 * r(1,5) : 2 * r(3,10); q = `Calcula el <strong>${pct}% de ${base}</strong>`; answer = base * pct / 100; break; }
      case "units": { const cases = [["altura d'una porta","m"],["llarg d'un llapis","cm"],["aigua d'una botella","L"],["massa d'una motxilla","kg"]]; [q, answer] = cases[index % 4]; q = `Tria la unitat adequada per al ${q}: <strong>cm, m, L o kg</strong>`; format = "TEXT"; break; }
      case "perimeter": a = r(2, 7 + p); b = r(2, 6 + p); q = `Rectangle de ${a} cm de llarg i ${b} cm d'ample. Quin és el perímetre?`; answer = 2 * a + 2 * b; break;
      case "area": a = r(2, 7 + p); b = r(2, 6 + p); q = `Rectangle de base ${a} i altura ${b}. Quina és l'àrea?`; answer = a * b; break;
      case "data": a = r(2, 9); b = r(2, 9); if (a === b) b += 1; q = `Punts: dilluns ${a}, dimarts ${b}. Quin dia té més punts?`; answer = a > b ? "dilluns" : "dimarts"; format = "TEXT"; break;
      case "patterns": a = r(1, 5); b = r(2, 4 + p); q = `Completa el patró: <strong>${a}, ${a+b}, ${a+2*b}, □</strong>`; answer = a + 3 * b; break;
      default: q = "Calcula: 2 + 2"; answer = 4;
    }
    return make(mission, phase, index, q, answer, mission.rule, mission.skill.toUpperCase(), format);
  }

  function exercisesForMission(missionId) {
    const mission = MISSIONS.find((m) => m.missionId === missionId) || MISSIONS[0];
    return PHASES.flatMap((phase) => Array.from({ length: 5 }, (_, index) => problem(mission, phase, index)));
  }
  function allExercises() { return MISSIONS.flatMap((mission) => exercisesForMission(mission.missionId)); }
  function normalize(value) { return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, " ").replace(".", ",").replace("-", "−"); }
  function isCorrect(received, expected) {
    const left = normalize(received); const right = normalize(expected);
    if (left === right) return true;
    const ln = Number(left.replace(",", ".").replace("−", "-"));
    const rn = Number(right.replace(",", ".").replace("−", "-"));
    return Number.isFinite(ln) && Number.isFinite(rn) && Math.abs(ln - rn) < 1e-9;
  }
  function distractors(answer) {
    const n = Number(String(answer).replace(",", "."));
    if (Number.isFinite(n)) return [n, n + 1, n - 1, n + (Math.abs(n) < 10 ? 2 : 10)].map(String);
    const text = normalize(answer);
    if ([">","<","="].includes(text)) return [text, text === ">" ? "<" : ">", "=", "no es pot saber"];
    if (["+","−","×","÷"].includes(text)) return [text, "+", "−", "×", "÷"].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    const pools = {
      dilluns: ["dilluns","dimarts","iguals","no es pot saber"], dimarts: ["dimarts","dilluns","iguals","no es pot saber"],
      cm: ["cm","m","L","kg"], m: ["m","cm","L","kg"], l: ["L","kg","m","cm"], kg: ["kg","L","m","cm"]
    };
    return pools[text] || [String(answer), "0", "1", "cap"];
  }
  function battleQuestions(missionId, count, phase) {
    const list = exercisesForMission(missionId).filter((x) => !phase || x.route === phase);
    return Array.from({ length: count || 15 }, (_, i) => {
      const source = list[i % list.length];
      const opts = distractors(source.expectedAnswer).filter((v, pos, a) => a.indexOf(v) === pos);
      while (opts.length < 4) opts.push(String(opts.length + 7));
      const rotate = i % 4; const options = opts.slice(0, 4); options.push(...options.splice(0, rotate));
      return { questionId: `B-${source.exerciseId}-${i}`, missionId, level: source.route, questionHtml: source.questionHtml,
        answer: source.expectedAnswer, format: "OPCIO", options, errorHint: source.hint2, errorCode: source.errorCode };
    });
  }
  function stateLabel(score, evidence) {
    if (!evidence) return "Sense evidència";
    if (score >= 8.5 && evidence >= 8) return "Consolidada";
    if (score >= 6) return "Assolida";
    return "En procés";
  }
  function calculateAssessment(attempts) {
    const rows = Array.isArray(attempts) ? attempts : [];
    const byComp = COMPETENCIES.map((comp) => {
      const evidence = rows.filter((r) => r.competencyId === comp.id && !r.gameOnly);
      const weighted = evidence.reduce((sum, r) => sum + clamp(Number(r.percent || 0), 0, 1), 0);
      const score = evidence.length ? Math.round(weighted / evidence.length * 100) / 10 : 0;
      return { ...comp, score, evidence: evidence.length, state: stateLabel(score, evidence.length) };
    });
    const present = byComp.filter((c) => c.evidence);
    const denominator = present.reduce((sum, c) => sum + c.weight, 0);
    const grade = denominator ? Math.round(present.reduce((sum, c) => sum + c.score * c.weight, 0) / denominator * 10) / 10 : null;
    return { grade, competencies: byComp, evidenceCount: rows.filter((r) => !r.gameOnly).length, needsTeacherValidation: true };
  }
  function shouldRecommendReport(summary) {
    const s = summary || {};
    const reasons = [];
    if (Number(s.sessionsWithoutProgress || 0) >= 3) reasons.push("3 sessions sense avanç");
    if (Number(s.lowMissionCount || 0) >= 2) reasons.push("2 missions per davall del 50%");
    if (Number(s.repeatedErrorCount || 0) >= 5) reasons.push("un error es repeteix 5 vegades");
    if (Number(s.supportSessionsWithoutImprovement || 0) >= 3) reasons.push("el suport no mostra millora encara");
    return { recommended: reasons.length > 0, reasons };
  }
  function arrivalMission(classMissionId, answers) {
    const current = MISSIONS.find((m) => m.missionId === classMissionId) || MISSIONS[0];
    const score = Array.isArray(answers) && answers.length ? answers.filter((x) => x.correct).length / answers.length : 0;
    const bridgeIndex = score >= .75 ? current.order - 1 : score >= .45 ? Math.max(0, current.order - 2) : Math.max(0, current.order - 5);
    return { missionId: MISSIONS[bridgeIndex].missionId, phase: "SUPORT", joinMissionId: current.missionId, score };
  }
  return { PHASES, COMPETENCIES, MISSIONS, exercisesForMission, allExercises, battleQuestions, isCorrect, calculateAssessment, shouldRecommendReport, arrivalMission };
}));

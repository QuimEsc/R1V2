(function () {
  "use strict";
  const core = window.ReforcCore;
  const dom = {};
  let ready = false;
  let currentControl = null;
  let students = [];
  let catalogData = { guides: [] };
  function $(id) { return document.getElementById(id); }
  function message(text, type) {
    const region = $("toastRegion"); if (!region) return;
    const node = document.createElement("div"); node.className = `toast ${type || ""}`; node.textContent = text; region.appendChild(node); setTimeout(() => node.remove(), 5000);
  }
  function mission(id) { return core.MISSIONS.find((m) => m.missionId === id) || core.MISSIONS[0]; }
  function renderControl() {
    if (!currentControl) return;
    dom.classMissionSelect.value = currentControl.missionId;
    dom.classMacroLevel.value = String(currentControl.macroLevel || 1);
    const item = mission(currentControl.missionId);
    dom.classCommandStatus.textContent = `${item.missionId} · ${item.title}. Mateixa explicació; dificultat automàtica per alumne.`;
    renderGuide();
  }
  function renderGuide() {
    const missionId = dom.classMissionSelect.value || (currentControl && currentControl.missionId) || "M01";
    const level = Number(dom.classMacroLevel.value || (currentControl && currentControl.macroLevel) || 1);
    const guide = (catalogData.guides || []).find((item) => item.missionId === missionId && Number(item.curriculumLevel) === level);
    const fallback = mission(missionId);
    dom.teacherGuideObjective.textContent = guide ? guide.objective : fallback.subtitle;
    dom.teacherGuideScript.textContent = guide ? `${guide.prerequisites} ${guide.script}` : fallback.rule;
    dom.teacherGuideExample.textContent = guide && guide.examples.length ? guide.examples.join(" · ") : fallback.example;
    dom.teacherGuideErrors.textContent = guide && guide.commonErrors.length ? guide.commonErrors.join(" · ") : "Canviar l’operació o no seguir el model.";
    dom.teacherGuideCorrections.textContent = guide && guide.corrections.length ? guide.corrections.join(" · ") : "Torna al mateix procés amb nombres menuts.";
    dom.teacherGuideAdvance.textContent = guide ? guide.advanceCriterion : "4 de 5 variants recents correctes i comprovació autònoma.";
    dom.teacherGuideCurriculum.textContent = guide && guide.curriculum ? `${guide.curriculum.competenciaInterna || "Competència interna"} · ${guide.curriculum.criteriIntern || "criteri pendent"}` : "Agrupació interna pendent de validació normativa.";
  }
  async function load() {
    try {
      const [catalog, list] = await Promise.all([window.GameData.call("catalog"), window.GameData.call("list_students")]);
      catalogData = catalog;
      students = list.students || [];
      const available = (catalog.missions || core.MISSIONS).filter((m) => m.unlocked !== false || core.MISSIONS.some((c) => c.missionId === m.missionId));
      dom.classMissionSelect.innerHTML = available.map((m) => `<option value="${m.missionId}">${m.missionId} · ${m.title}</option>`).join("");
      dom.assessmentStudent.innerHTML = '<option value="">Tria un alumne</option>' + students.map((s) => `<option value="${s.studentId}">${s.name}</option>`).join("");
      const data = await window.GameData.call("class_control_get"); currentControl = data.control || catalog.classControl || { missionId: "M01", macroLevel: 1 }; renderControl(); ready = true;
      if (window.GameBattleTeacher) window.GameBattleTeacher.refreshCatalog();
      const previewStudent = new URLSearchParams(window.location.search).get("assessment");
      if (window.GameData.isDemo() && previewStudent && students.some((s) => s.studentId === previewStudent)) {
        dom.assessmentStudent.value = previewStudent;
        if (!dom.assessmentDialog.open) dom.assessmentDialog.showModal();
        await loadAssessment();
      }
    } catch (error) { message(error.message, "error"); }
  }
  async function setControl(command) {
    const missionId = dom.classMissionSelect.value; const macroLevel = Number(dom.classMacroLevel.value || 1);
    try {
      const data = await window.GameData.call("class_control_set", { missionId, macroLevel, command }); currentControl = data.control; renderControl();
      if (window.GameLive && command === "START") await window.GameLive.publishClassControl(currentControl);
      if (command === "EXPLAIN") window.open(`presentacio.html?mission=${encodeURIComponent(missionId)}`, "_blank", "noopener");
      message(data.message || "Control de classe actualitzat.", "good");
    } catch (error) { message(error.message, "error"); }
  }
  async function forceAdvance() {
    const target = mission(dom.classMissionSelect.value); const previous = currentControl && currentControl.missionId;
    if (previous === target.missionId) { message("Tria una missió diferent abans d'avançar.", "warning"); return; }
    if (!window.confirm(`Avançar tota la classe de ${previous} a ${target.missionId}? Els buits quedaran pendents de recuperació.`)) return;
    try {
      const data = await window.GameData.call("force_advance", { missionId: target.missionId, macroLevel: Number(dom.classMacroLevel.value || 1), reason: "Decisió docent des del panell" });
      currentControl = data.control; renderControl(); message("Avanç guardat sense falsejar el domini.", "good");
      if (window.GameLive) await window.GameLive.publishClassControl(currentControl);
    } catch (error) { message(error.message, "error"); }
  }
  function competencyCard(item) {
    const percent = Math.max(0, Math.min(100, Number(item.score || 0) * 10));
    return `<article class="competency-card"><header><strong>${item.id} · ${item.label}</strong><span>${item.evidence} evid.</span></header><div class="competency-bar"><i style="width:${percent}%"></i></div><footer><b>${item.state}</b><strong>${item.evidence ? Number(item.score).toFixed(1) : "—"}</strong></footer></article>`;
  }
  async function loadHistory(studentId) {
    try {
      const data = await window.GameData.call("report_history", { studentId });
      dom.reportHistory.innerHTML = (data.reports || []).length ? data.reports.map((r) => `<article><strong>${new Date(r.createdAt).toLocaleDateString("ca-ES")} · ${r.period}</strong><p>${r.text}</p></article>`).join("") : "<p>Sense informes encara.</p>";
    } catch (error) { dom.reportHistory.innerHTML = `<p>${error.message}</p>`; }
  }
  async function loadAssessment() {
    const studentId = dom.assessmentStudent.value;
    dom.assessmentEmpty.classList.toggle("hidden", Boolean(studentId)); dom.assessmentContent.classList.toggle("hidden", !studentId); if (!studentId) return;
    try {
      const data = await window.GameData.call("assessment", { studentId, period: dom.assessmentPeriod.value }); const a = data.assessment;
      dom.suggestedGrade.textContent = a.grade == null ? "—" : Number(a.grade).toFixed(1);
      dom.assessmentEvidence.textContent = `${a.evidenceCount || 0} evidències matemàtiques · la batalla no puntua`;
      dom.competencyGrid.innerHTML = (a.competencies || []).map(competencyCard).join("");
      const recommendation = a.recommendation || { recommended: false, reasons: [] };
      dom.reportRecommendation.classList.toggle("hidden", !recommendation.recommended);
      dom.reportRecommendationText.textContent = recommendation.reasons.join(" · ");
      await loadHistory(studentId);
    } catch (error) { message(error.message, "error"); }
  }
  async function generateReport() {
    const studentId = dom.assessmentStudent.value; if (!studentId) return;
    dom.generateReportButton.disabled = true; dom.generateRecommendedReport.disabled = true; dom.generatedReport.classList.remove("hidden"); dom.generatedReport.textContent = "Generant l'informe sota demanda…";
    try {
      const data = await window.GameData.call("generate_report", { studentId, period: dom.assessmentPeriod.value });
      dom.generatedReport.textContent = data.report.text; dom.reportRecommendation.classList.add("hidden"); await loadHistory(studentId);
    } catch (error) { dom.generatedReport.textContent = error.message; }
    finally { dom.generateReportButton.disabled = false; dom.generateRecommendedReport.disabled = false; }
  }
  function openAssessment() { dom.assessmentDialog.showModal(); }
  function bind() {
    ["classMissionSelect","classMacroLevel","classCommandStatus","projectExplanationButton","startClassActivityButton","forceAdvanceButton","teacherGuideObjective","teacherGuideScript","teacherGuideExample","teacherGuideErrors","teacherGuideCorrections","teacherGuideAdvance","teacherGuideCurriculum","openAssessmentButton","assessmentDialog","assessmentStudent","assessmentPeriod","assessmentEmpty","assessmentContent","suggestedGrade","assessmentEvidence","competencyGrid","reportRecommendation","reportRecommendationText","dismissReportRecommendation","generateRecommendedReport","generateReportButton","generatedReport","reportHistory"].forEach((id) => { dom[id] = $(id); });
    dom.classMissionSelect.addEventListener("change", renderGuide);
    dom.classMacroLevel.addEventListener("change", renderGuide);
    dom.projectExplanationButton.addEventListener("click", () => setControl("EXPLAIN"));
    dom.startClassActivityButton.addEventListener("click", () => setControl("START"));
    dom.forceAdvanceButton.addEventListener("click", forceAdvance);
    dom.openAssessmentButton.addEventListener("click", openAssessment);
    dom.assessmentStudent.addEventListener("change", loadAssessment); dom.assessmentPeriod.addEventListener("change", loadAssessment);
    dom.generateReportButton.addEventListener("click", generateReport); dom.generateRecommendedReport.addEventListener("click", generateReport);
    dom.dismissReportRecommendation.addEventListener("click", () => dom.reportRecommendation.classList.add("hidden"));
    window.setTimeout(() => { if (!ready && !document.getElementById("monitorApp").classList.contains("hidden")) load(); }, 800);
  }
  document.addEventListener("DOMContentLoaded", bind);
  window.addEventListener("reforc:teacher-ready", load);
}());

(function (root) {
  "use strict";
  var GRV2_SCHEMA_VERSION_ = 2;
  var GRV2_DEFAULT_GROUP_ID_ = "GRUP-1ESO-BASE";
  var GRV2_DEFAULT_TEACHER_ID_ = "DOCENT-001";
  var active = null;

// Ported verbatim from CoreV2.gs.
/**
 * API i repositori base de GamificacioReforc V2.
 * Requereix ConfiguracioV2.gs en el mateix projecte d'Apps Script.
 */

var GRV2_API_VERSION_ = "2.1.0";
var GRV2_TEACHER_SESSION_SECONDS_ = 21600;
var GRV2_TEACHER_SECRET_PROPERTY_ = "GRV2_TEACHER_TOKEN_SECRET";
var GRV2_TEACHER_SESSION_VERSION_PROPERTY_ = "GRV2_TEACHER_SESSION_VERSION";
var GRV2_REQUEST_BOOK_CACHE_ = null;
var GRV2_REQUEST_SHEET_CACHE_ = null;
var GRV2_REQUEST_ROWS_CACHE_ = null;
var GRV2_REQUEST_CONFIG_CACHE_ = null;
var GRV2_TEACHER_ACTIONS_ = [
  "teacher_check", "teacher_logout", "add_students", "catalog", "question_catalog", "set_route", "set_mission_levels",
  "teacher_assign", "unlock_next_mission", "suggest_exercise", "teacher_decision",
  "list_proposals", "list_reviews", "decide_review", "list_diagnostics",
  "battle_prepare", "battle_finalize", "battle_history", "class_control_get",
  "class_control_set", "force_advance", "assessment", "report_recommendations",
  "generate_report", "report_history", "arrival_diagnostic", "habit_summary", "teacher_dashboard",
  "diagnostic_exempt"
];

function doGet() {
  return grv2Json_({
    ok: true,
    project: "GamificacioReforc V2",
    version: GRV2_API_VERSION_,
    schemaVersion: GRV2_SCHEMA_VERSION_,
    message: "Backend V2 actiu"
  });
}

function doPost(e) {
  GRV2_REQUEST_BOOK_CACHE_ = null;
  GRV2_REQUEST_QUESTIONS_CACHE_ = null;
  GRV2_REQUEST_SHEET_CACHE_ = {};
  GRV2_REQUEST_ROWS_CACHE_ = {};
  GRV2_REQUEST_CONFIG_CACHE_ = null;
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(body);
    var action = grv2Text_(data.action).toLowerCase();
    if (!action) throw new Error("Falta indicar l'acció.");
    if (GRV2_TEACHER_ACTIONS_.indexOf(action) >= 0) grv2ExigirDocent_(data.teacherToken);
    var result = grv2Dispatch_(action, data) || {};
    result.ok = true;
    result.apiVersion = GRV2_API_VERSION_;
    return grv2Json_(result);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return grv2Json_({
      ok: false,
      error: error && error.message ? error.message : String(error),
      authRequired: Boolean(error && error.authRequired),
      apiVersion: GRV2_API_VERSION_
    });
  } finally {
    GRV2_REQUEST_BOOK_CACHE_ = null;
    GRV2_REQUEST_QUESTIONS_CACHE_ = null;
    GRV2_REQUEST_SHEET_CACHE_ = null;
    GRV2_REQUEST_ROWS_CACHE_ = null;
    GRV2_REQUEST_CONFIG_CACHE_ = null;
  }
}

function grv2Dispatch_(action, data) {
  switch (action) {
    case "teacher_login": return grv2IniciarSessioDocent_(data);
    case "teacher_check": return { authorized: true };
    case "teacher_logout": return grv2TancarSessioDocent_(data);
    case "add_students": return AFEGIR_ALUMNES_V2(data.names);
    case "list_students": return grv2LlistarAlumnes_();
    case "catalog": return grv2ApiCatalog_();
    case "question_catalog": return grv2QuestionCatalog_();
    case "bootstrap": return grv2Bootstrap_(data);
    case "diagnostic_submit": return grv2DiagnosticSubmit_(data);
    case "diagnostic_exempt": return grv2MaybeTeacherMutationFirebase_(grv2DiagnosticExempt_(data), "overrides");
    case "submit": return grv2EnviarResposta_(data);
    case "help": return grv2DemanarAjuda_(data);
    case "save_avatar": return grv2GuardarAvatar_(data);
    case "set_route": return grv2MaybeTeacherMutationFirebase_(grv2ForcarFase_(data), "overrides");
    case "set_mission_levels": return grv2MaybeTeacherMutationFirebase_(grv2ForcarNivellsMissio_(data), "overrides");
    case "teacher_assign": return grv2MaybeTeacherMutationFirebase_(grv2CrearAssignacioDocent_(data), "overrides");
    case "unlock_next_mission": return grv2MaybeTeacherMutationFirebase_(grv2DesbloquejarSeguentMissio_(), "catalog");
    case "suggest_exercise": return grv2PropostaNoAutomatica_(data);
    case "teacher_decision": return { status: "ignored_v2", message: "No hi ha cap proposta automàtica pendent." };
    case "list_proposals": return { proposals: [] };
    case "list_reviews": return grv2LlistarRevisions_();
    case "decide_review": return grv2DecidirRevisio_(data);
    case "list_diagnostics": return grv2LlistarDiagnostics_();
    case "class_control_get": return grv2ControlClasseGet_(data);
    case "teacher_dashboard": return typeof grv2TeacherDashboardFirebase_ === "function"
      ? grv2TeacherDashboardFirebase_(data) : grv2TeacherDashboard_(data);
    case "class_control_set": return grv2ControlClasseSet_(data, false);
    case "force_advance": return grv2ControlClasseSet_(data, true);
    case "assessment": return grv2AvaluacioApi_(data);
    case "report_recommendations": return grv2RecomanacionsInforme_(data);
    case "generate_report": return grv2GenerarInforme_(data);
    case "report_history": return grv2HistorialInformes_(data);
    case "arrival_diagnostic": return grv2DiagnosiArribada_(data);
    case "habit_event": return grv2RegistrarHabitEvent_(data);
    case "habit_heartbeat": return grv2ActualitzarHabitsSessio_(data);
    case "habit_summary": return grv2ResumHabits_(data);
    case "battle_prepare": return grv2PrepararBatalla_(data);
    case "battle_finalize": return grv2FinalitzarBatalla_(data);
    case "battle_history": return grv2HistorialBatalles_();
    case "battle_capture": return grv2CapturarAvatar_(data);
    default: throw new Error("Acció desconeguda: " + action);
  }
}

function grv2MaybeTeacherMutationFirebase_(result, kind) {
  return typeof grv2TeacherMutationFirebase_ === "function" ? grv2TeacherMutationFirebase_(result, kind) : result;
}

function grv2Json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function grv2Llibre_() {
  if (GRV2_REQUEST_BOOK_CACHE_) return GRV2_REQUEST_BOOK_CACHE_;
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = grv2Text_(properties.getProperty("GRV2_SPREADSHEET_ID"));
  var llibre = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!llibre) throw new Error("No s'ha configurat GRV2_SPREADSHEET_ID. Executa CONFIGURAR_GAMIFICACIO_REFORC_V2().");
  if (GRV2_REQUEST_SHEET_CACHE_) GRV2_REQUEST_BOOK_CACHE_ = llibre;
  return llibre;
}

function grv2Text_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function grv2Upper_(value) {
  return grv2Text_(value).toUpperCase();
}

function grv2Number_(value, fallback) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : fallback;
}

function grv2Boolean_(value) {
  return ["SI", "SÍ", "YES", "TRUE", "1", "ON"].indexOf(grv2Upper_(value)) >= 0;
}

function grv2ParseJson_(value, fallback) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(grv2Text_(value)); } catch (error) { return fallback; }
}

function grv2Uuid_(prefix) {
  return grv2Text_(prefix) + Utilities.getUuid();
}

function grv2SafeKey_(value) {
  return grv2Text_(value).replace(/[.#$\[\]\/]/g, "_");
}

function grv2Config_() {
  if (GRV2_REQUEST_CONFIG_CACHE_) return GRV2_REQUEST_CONFIG_CACHE_;
  var result = {};
  grv2Rows_("Configuracio").forEach(function (row) {
    var key = grv2Text_(row.Clau);
    if (key) result[key] = row.Valor;
  });
  if (GRV2_REQUEST_ROWS_CACHE_) GRV2_REQUEST_CONFIG_CACHE_ = result;
  return result;
}

function grv2FlagOn_(flag) {
  return grv2Upper_(grv2Config_()[flag]) === "ON";
}

function grv2Full_(name) {
  if (GRV2_REQUEST_SHEET_CACHE_ && GRV2_REQUEST_SHEET_CACHE_[name]) return GRV2_REQUEST_SHEET_CACHE_[name];
  var sheet = grv2Llibre_().getSheetByName(name);
  if (!sheet) throw new Error("Falta la pestanya V2 '" + name + "'.");
  if (GRV2_REQUEST_SHEET_CACHE_) GRV2_REQUEST_SHEET_CACHE_[name] = sheet;
  return sheet;
}

function grv2Rows_(name) {
  if (GRV2_REQUEST_ROWS_CACHE_ && Object.prototype.hasOwnProperty.call(GRV2_REQUEST_ROWS_CACHE_, name)) {
    return GRV2_REQUEST_ROWS_CACHE_[name];
  }
  var rows = grv2Objectes_(grv2Full_(name));
  if (GRV2_REQUEST_ROWS_CACHE_) GRV2_REQUEST_ROWS_CACHE_[name] = rows;
  return rows;
}

function grv2InvalidateRows_(name) {
  if (GRV2_REQUEST_ROWS_CACHE_) delete GRV2_REQUEST_ROWS_CACHE_[name];
  if (name === "Configuracio") GRV2_REQUEST_CONFIG_CACHE_ = null;
}

function grv2Find_(name, field, value) {
  var expected = grv2Text_(value);
  return grv2Rows_(name).find(function (row) { return grv2Text_(row[field]) === expected; }) || null;
}

function grv2Append_(name, object) {
  var sheet = grv2Full_(name);
  grv2AppendObject_(sheet, object);
  grv2InvalidateRows_(name);
  return object;
}

function grv2UpdateRow_(name, rowNumber, changes) {
  var sheet = grv2Full_(name);
  var headers = grv2Capcaleres_(sheet);
  if (!rowNumber || rowNumber < 2) throw new Error("Fila no vàlida en " + name + ".");
  var fields = Object.keys(changes || {});
  if (!fields.length) return;
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var values = range.getValues()[0];
  fields.forEach(function (field) {
    var column = headers.indexOf(field);
    if (column < 0) throw new Error("Falta la columna " + name + "." + field + ".");
    values[column] = changes[field];
  });
  range.setValues([values]);
  grv2InvalidateRows_(name);
}

function grv2RowsWithIndex_(name) {
  return grv2Rows_(name).map(function (row, index) {
    row._row = index + 2;
    return row;
  });
}

function grv2WithScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function grv2IniciarSessioDocent_(data) {
  var teacher = grv2Rows_("Professorat").find(function (row) {
    return grv2Boolean_(row.Actiu) && grv2Text_(row.ProfessorId) === GRV2_DEFAULT_TEACHER_ID_;
  });
  if (!teacher) throw new Error("No hi ha cap compte docent actiu.");
  var passwordHash = grv2HashText_(grv2Text_(teacher.Salt) + ":" + grv2Text_(data.password));
  if (passwordHash !== grv2Text_(teacher.ContrasenyaHash)) throw new Error("Contrasenya incorrecta.");
  var issuedAt = Date.now();
  var version = grv2TeacherSessionVersion_();
  var nonce = Utilities.getUuid().replace(/-/g, "");
  var payload = [issuedAt, version, nonce].join(".");
  var token = payload + "." + grv2TeacherSignature_(payload);
  return {
    teacherToken: token,
    expiresIn: GRV2_TEACHER_SESSION_SECONDS_,
    passwordChangeRequired: grv2Boolean_(teacher.CanviContrasenyaObligatori)
  };
}

function grv2ExigirDocent_(token) {
  var value = grv2Text_(token);
  var parts = value.split(".");
  var issuedAt = parts.length === 4 ? Number(parts[0]) : NaN;
  var version = parts.length === 4 ? Number(parts[1]) : NaN;
  var payload = parts.length === 4 ? parts.slice(0, 3).join(".") : "";
  var expected = payload ? grv2TeacherSignature_(payload) : "";
  var age = Date.now() - issuedAt;
  var valid = parts.length === 4 && isFinite(issuedAt) && isFinite(version)
    && age >= -300000 && age <= GRV2_TEACHER_SESSION_SECONDS_ * 1000
    && version === grv2TeacherSessionVersion_()
    && grv2ConstantTimeEqual_(parts[3], expected);
  if (!valid) {
    var error = new Error("La sessió docent ha caducat. Torna a identificar-te.");
    error.authRequired = true;
    throw error;
  }
}

function grv2TancarSessioDocent_() {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty(GRV2_TEACHER_SESSION_VERSION_PROPERTY_, String(grv2TeacherSessionVersion_() + 1));
  return { closed: true };
}

function grv2TeacherSessionVersion_() {
  var value = Number(PropertiesService.getScriptProperties().getProperty(GRV2_TEACHER_SESSION_VERSION_PROPERTY_) || "1");
  return isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function grv2TeacherSecret_() {
  var properties = PropertiesService.getScriptProperties();
  var secret = grv2Text_(properties.getProperty(GRV2_TEACHER_SECRET_PROPERTY_));
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    properties.setProperty(GRV2_TEACHER_SECRET_PROPERTY_, secret);
    secret = grv2Text_(properties.getProperty(GRV2_TEACHER_SECRET_PROPERTY_));
  }
  return secret;
}

function grv2TeacherSignature_(payload) {
  var bytes = Utilities.computeHmacSha256Signature(grv2Text_(payload), grv2TeacherSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function grv2ConstantTimeEqual_(left, right) {
  var a = grv2Text_(left);
  var b = grv2Text_(right);
  var difference = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var index = 0; index < length; index++) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function grv2Usuari_(studentId) {
  var user = grv2Find_("Usuaris", "AlumneId", studentId);
  if (!user || !grv2Boolean_(user.Actiu)) throw new Error("L'alumne no existeix o no està actiu.");
  return user;
}

function grv2LlistarAlumnes_() {
  return {
    students: grv2Rows_("Usuaris").filter(function (row) { return grv2Boolean_(row.Actiu); })
      .sort(function (a, b) { return grv2Text_(a.Nom).localeCompare(grv2Text_(b.Nom)); })
      .map(function (row) {
        return {
          studentId: grv2Text_(row.AlumneId),
          name: grv2Text_(row.Nom),
          route: "BASE",
          avatar: grv2Text_(row.Avatar),
          level: grv2Number_(row.NivellGeneralRecomanat, 1)
        };
      })
  };
}

/**
 * Afig alumnat per selecció de nom. No crea contrasenyes d'alumne.
 * Executar manualment des de l'editor: AFEGIR_ALUMNES_V2(["Nom 1", "Nom 2"]).
 */
function AFEGIR_ALUMNES_V2(noms) {
  if (!Array.isArray(noms) || !noms.length) throw new Error("Indica un array de noms.");
  return grv2WithScriptLock_(function () {
    var existing = grv2Rows_("Usuaris").map(function (row) { return grv2Upper_(row.Nom); });
    var added = [];
    noms.forEach(function (nom) {
      var clean = grv2Text_(nom);
      if (!clean || existing.indexOf(grv2Upper_(clean)) >= 0) return;
      var id = "ALU-" + Utilities.getUuid();
      grv2Append_("Usuaris", {
        AlumneId: id, Nom: clean, GrupId: GRV2_DEFAULT_GROUP_ID_, Avatar: "", Actiu: "SI",
        DataAlta: new Date(), EstatDiagnosi: "PENDENT", NivellGeneralRecomanat: 1,
        Ratxa: 0, MillorRatxa: 0, TotalMissions: 0, Energia: 0,
        CanvisAvatarDisponibles: 0, UltimaSessio: "", SchemaVersion: 2
      });
      existing.push(grv2Upper_(clean));
      added.push({ studentId: id, name: clean });
    });
    return { added: added, count: added.length };
  });
}

function grv2ActivarBanderes_(flags) {
  var requested = Array.isArray(flags) ? flags : [];
  var invalid = requested.filter(function (flag) { return GRV2_FLAGS_.indexOf(flag) < 0; });
  if (invalid.length) throw new Error("Banderes desconegudes: " + invalid.join(", "));
  var verification = grv2Verificar_(grv2Llibre_(), { requireInitialFlagsOff: false });
  if (!verification.ok) throw new Error("No es poden activar banderes: " + verification.errors.join(" | "));
  var sheet = grv2Full_("Configuracio");
  var rows = grv2RowsWithIndex_("Configuracio");
  requested.forEach(function (flag) {
    var row = rows.find(function (item) { return grv2Text_(item.Clau) === flag; });
    if (!row) throw new Error("Falta Configuracio." + flag + ".");
    grv2UpdateRow_("Configuracio", row._row, { Valor: "ON", ActualitzatEn: new Date() });
  });
  return { activated: requested, verification: verification.status };
}

/** Activació manual i explícita després de verificar el full real. */
function ACTIVAR_GAMIFICACIO_REFORC_V2() {
  return grv2ActivarBanderes_(GRV2_FLAGS_.slice());
}

/**
 * Orquestrador no destructiu per a un full nou. Configura l'esquema, el valida
 * i instal·la el catàleg, però manté totes les banderes en OFF.
 */
function PREPARAR_ENTORN_FUNCIONAL_V2() {
  var setup = CONFIGURAR_GAMIFICACIO_REFORC_V2();
  var verification = VERIFICAR_GAMIFICACIO_REFORC_V2();
  if (!verification.ok) throw new Error("La base real no ha superat la verificació.");
  var content = INSTAL_LAR_CONTINGUT_INICIAL_V2();
  return { setup: setup, verification: verification, content: content, flagsActivated: false };
}

function VERIFICAR_PROJECTE_FUNCIONAL_V2() {
  var schema = grv2Verificar_(grv2Llibre_(), { requireInitialFlagsOff: false });
  var checks = {
    missions: grv2Rows_("Missions").length,
    questions: grv2Rows_("Preguntes").length,
    levels: {},
    publishedGuides: grv2Rows_("GuiesDocents").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; }).length,
    activeCatalogs: grv2Rows_("Catalegs").filter(function (row) { return grv2Upper_(row.Estat) === "ACTIU"; }).length
  };
  [1,2,3].forEach(function (level) { checks.levels[level] = grv2Rows_("Preguntes").filter(function (row) { return grv2Number_(row.NivellCurricular, 0) === level; }).length; });
  var errors = schema.errors.slice();
  if (checks.missions !== 25) errors.push("S'esperaven 25 missions i n'hi ha " + checks.missions + ".");
  if (checks.questions !== 1125) errors.push("S'esperaven 1125 preguntes i n'hi ha " + checks.questions + ".");
  [1,2,3].forEach(function (level) { if (checks.levels[level] !== 375) errors.push("El nivell " + level + " no conté 375 preguntes."); });
  if (checks.publishedGuides !== 75) errors.push("S'esperaven 75 guies docents publicades.");
  if (checks.activeCatalogs !== 1) errors.push("Ha d'haver-hi un únic catàleg actiu.");
  var result = { ok: errors.length === 0, status: errors.length ? "ERROR" : "OK", errors: errors, warnings: schema.warnings, checks: checks };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


// Ported verbatim from CurriculumV2.gs.
/** Catàleg essencial V2: 25 missions, 3 nivells, 3 fases i 5 variants. */

function grv2DefinicionsCurriculum_() {
  return [
    ["M01",1,"Compara nombres","Quin és major?","COMPARAR","Mira desenes i després unitats.","34 > 29 perquè 3 desenes > 2 desenes.","C4","compare","🔢"],
    ["M02",1,"Sumes que arriben a 20","Ajunta sense perdre't","SUMA_20","Completa una desena i suma el que queda.","8 + 5 = 8 + 2 + 3 = 13.","C1","add20","➕"],
    ["M03",1,"Restes curtes","Lleva una quantitat","RESTA_20","Resta fins a la desena i acaba.","17 − 6 = 11.","C1","sub20","➖"],
    ["M04",1,"Dobles i meitats","Parelles iguals","DOBLES","Doble és sumar dues vegades; meitat és repartir entre 2.","Doble de 6 = 12; meitat de 12 = 6.","C1","double","🟰"],
    ["M05",1,"El nombre que falta","Desfés l'operació","FALTA_SUMAR","Resta el nombre conegut al total.","□ + 5 = 12; 12 − 5 = 7.","C2","missingAdd","🧩"],
    ["M06",2,"Multiplicar és fer grups","Grups iguals","GRUPS","Nombre de grups per elements de cada grup.","3 grups de 4: 3 × 4 = 12.","C4","groups","📦"],
    ["M07",2,"Taules del 2, 5 i 10","Productes ràpids","TAULES_2_5_10","×2 és doble; ×5 acaba en 0 o 5; ×10 afegeix 0.","7 × 5 = 35.","C1","tablesA","⚡"],
    ["M08",2,"Taules del 3 i del 4","Construeix el producte","TAULES_3_4","Per ×4, fes el doble i torna a doblar.","6 × 4: 12 i 24.","C1","tablesB","✖️"],
    ["M09",2,"Dividir és repartir","Repartiments exactes","DIVISIO","Busca quin producte dona el total.","20 ÷ 5 = 4 perquè 5 × 4 = 20.","C1","division","➗"],
    ["M10",2,"Quina operació toca?","Tria abans de calcular","TRIAR_OPERACIO","Ajuntar +; llevar −; grups ×; repartir ÷.","12 caramels entre 3: 12 ÷ 3.","C3","chooseOp","🧠"],
    ["M11",3,"Enters i zero","Damunt i davall de zero","ENTERS_COMPARAR","Positiu > 0; negatiu < 0.","−3 < 0 < 4.","C4","integerCompare","🌡️"],
    ["M12",3,"Oposats","Mateixa distància, altre signe","OPOSATS","Conserva el nombre i canvia el signe.","L'oposat de −5 és 5.","C1","opposite","↔️"],
    ["M13",3,"Sumar un negatiu","Canvia i calcula","SUMAR_NEGATIU","+(−b) es converteix en −b.","7 + (−3) = 7 − 3 = 4.","C2","addNegative","🛬"],
    ["M14",3,"Restar un negatiu","Dos signes es fan més","RESTAR_NEGATIU","−(−b) es converteix en +b.","6 − (−2) = 6 + 2 = 8.","C2","subNegative","🛫"],
    ["M15",3,"Enters mesclats","Transforma abans d'operar","ENTERS_MIXT","Canvia el doble signe i calcula una operació.","−4 − (−7) = −4 + 7 = 3.","C5","integerMixed","🛰️"],
    ["M16",4,"Fracció d'un dibuix","Parts iguals","FRACCIO_PART","Denominador: totals; numerador: marcades.","3 de 5 parts és 3/5.","C4","fractionPart","🍕"],
    ["M17",4,"Fraccions equivalents","Multiplica dalt i baix","FRACCIO_EQUIV","Multiplica numerador i denominador igual.","1/2 = 2/4.","C2","equivalent","🔁"],
    ["M18",4,"Compara fraccions","Mateix denominador","FRACCIO_COMPARAR","Amb igual denominador, mira el numerador.","5/8 > 3/8.","C4","fractionCompare","⚖️"],
    ["M19",4,"Decimals i diners","Cèntims i euros","DINERS","Dues xifres decimals són cèntims.","2,50 € + 1 € = 3,50 €.","C3","money","🪙"],
    ["M20",4,"Percentatges útils","10%, 25% i 50%","PERCENTATGES","50% meitat; 25% quarta part; 10% dividir entre 10.","50% de 18 = 9.","C1","percent","💯"],
    ["M21",5,"Unitats quotidianes","Tria una unitat amb sentit","UNITATS","Curt cm; distància m o km; líquid L; massa kg.","Una porta fa aproximadament 2 m.","C4","units","📏"],
    ["M22",5,"Perímetre","Suma els costats","PERIMETRE","Perímetre és tota la vora.","Rectangle 5 i 3: 5+3+5+3=16.","C2","perimeter","🔲"],
    ["M23",5,"Àrea de rectangles","Files per columnes","AREA","Àrea = base × altura.","Base 4 i altura 3: 12 quadrats.","C2","area","▦"],
    ["M24",5,"Llig una taula","Busca, no endevines","DADES","Localitza la fila i llig el valor demanat.","Dilluns 4, dimarts 7: el major és dimarts.","C4","data","📊"],
    ["M25",5,"Patrons i errors","Comprova el pas","PATRONS","Busca el canvi que sempre es repeteix.","2, 5, 8: suma 3; segueix 11.","C5","patterns","🔎"]
  ];
}

function grv2PreguntaCurricular_(skill, phase, variant, level) {
  var p = ["SUPORT", "BASE", "REPTE"].indexOf(phase);
  var d = p + (Math.max(1, Math.min(3, Number(level))) - 1) * 2;
  var i = variant + 1;
  var a, b, total, cases;
  if (skill === "COMPARAR") { a = 8 + i * (2 + level) + d * 7; b = a + (i % 2 ? 2 + d : -3 - d); return [a + " □ " + b, a > b ? ">" : "<", "TEXT"]; }
  if (skill === "SUMA_20") { a = 4 + i + d * 3; b = 2 + (i % 5) + d; return [a + " + " + b, a + b, "NUMERICA"]; }
  if (skill === "RESTA_20") { a = 12 + i + d * 5; b = 2 + (i % 6) + d; return [a + " − " + b, a - b, "NUMERICA"]; }
  if (skill === "DOBLES") { a = 2 + i + d * 2; return variant % 2 ? ["Meitat de " + (a * 2), a, "NUMERICA"] : ["Doble de " + a, a * 2, "NUMERICA"]; }
  if (skill === "FALTA_SUMAR") { a = 2 + i + d * 2; b = 3 + (i % 4) + d; return ["□ + " + b + " = " + (a + b), a, "NUMERICA"]; }
  if (skill === "GRUPS") { a = 2 + (i % Math.max(2, 3 + d)); b = 2 + (i % Math.max(3, 4 + d)); return [a + " grups de " + b + ": " + a + " × " + b, a * b, "NUMERICA"]; }
  if (skill === "TAULES_2_5_10") { a = [2, 5, 10][(i + d) % 3]; b = 2 + i + d * 2; return [a + " × " + b, a * b, "NUMERICA"]; }
  if (skill === "TAULES_3_4") { a = i % 2 ? 3 : 4; b = 2 + i + d * 2; return [a + " × " + b, a * b, "NUMERICA"]; }
  if (skill === "DIVISIO") { b = [2, 3, 4, 5][(i + d) % 4]; a = 2 + i + d; return [(a * b) + " ÷ " + b, a, "NUMERICA"]; }
  if (skill === "TRIAR_OPERACIO") { cases = [["Ajuntar dues quantitats", "+"], ["Llevar una quantitat", "−"], ["Grups iguals", "×"], ["Repartir en parts iguals", "÷"]]; return cases[(i + d) % 4].concat(["TEXT"]); }
  if (skill === "ENTERS_COMPARAR") { a = 1 + i + d * 2; return ["−" + a + " □ 0", "<", "TEXT"]; }
  if (skill === "OPOSATS") { a = 1 + i + d * 2; return variant % 2 ? ["Oposat de " + a, -a, "NUMERICA"] : ["Oposat de −" + a, a, "NUMERICA"]; }
  if (skill === "SUMAR_NEGATIU") { a = 7 + i + d * 3; b = 1 + (i % 5) + d; return [a + " + (−" + b + ")", a - b, "NUMERICA"]; }
  if (skill === "RESTAR_NEGATIU") { a = 3 + i + d * 3; b = 1 + (i % 5) + d; return [a + " − (−" + b + ")", a + b, "NUMERICA"]; }
  if (skill === "ENTERS_MIXT") { a = 2 + i + d * 2; b = 1 + (i % 6) + d; return variant % 2 ? ["−" + a + " − (−" + b + ")", -a + b, "NUMERICA"] : [a + " + (−" + b + ")", a - b, "NUMERICA"]; }
  if (skill === "FRACCIO_PART") { b = 4 + (i % 4) + d; a = 1 + (i % (b - 1)); return [a + " parts marcades de " + b + " parts iguals", a + "/" + b, "TEXT"]; }
  if (skill === "FRACCIO_EQUIV") { b = 2 + (i % 4) + Math.floor(d / 2); a = 1 + (level > 2 ? i % 2 : 0); total = 2 + (d > 3 ? 1 : 0); return [a + "/" + b + " = □/" + (b * total), a * total, "NUMERICA"]; }
  if (skill === "FRACCIO_COMPARAR") { b = 5 + (i % 4) + d; a = 1 + (i % 2); total = a + 2 + (d > 3 ? 1 : 0); return [a + "/" + b + " □ " + total + "/" + b, "<", "TEXT"]; }
  if (skill === "DINERS") { a = 1 + i + d; b = [25, 50, 75][(i + d) % 3]; total = 1 + d; return [a + "," + b + " € + " + total + " €", (a + total) + "," + b, "TEXT"]; }
  if (skill === "PERCENTATGES") { var pct = [50, 25, 10][(i + d) % 3]; total = pct === 25 ? 4 * (2 + i + d) : (pct === 10 ? 10 * (1 + i + d) : 2 * (3 + i + d)); return [pct + "% de " + total, total * pct / 100, "NUMERICA"]; }
  if (skill === "UNITATS") { cases = [["Llarg d'un llapis: cm, m, L o kg", "cm"], ["Altura d'una porta: cm, m, L o kg", "m"], ["Aigua d'una botella: cm, m, L o kg", "L"], ["Massa d'una motxilla: cm, m, L o kg", "kg"]]; return cases[(i + d) % 4].concat(["TEXT"]); }
  if (skill === "PERIMETRE") { a = 2 + i + d * 2; b = 2 + (i % 4) + d; return ["Perímetre d'un rectangle de " + a + " cm i " + b + " cm", 2 * a + 2 * b, "NUMERICA"]; }
  if (skill === "AREA") { a = 2 + i + d * 2; b = 2 + (i % 4) + d; return ["Àrea d'un rectangle de base " + a + " i altura " + b, a * b, "NUMERICA"]; }
  if (skill === "DADES") { a = 2 + i + d; b = 5 + ((i + d) % 4) + d; return ["Punts: dilluns " + a + ", dimarts " + b + ". Quin dia té més?", a > b ? "dilluns" : "dimarts", "TEXT"]; }
  a = 1 + i + d; b = 2 + d; return ["Completa: " + a + ", " + (a + b) + ", " + (a + 2 * b) + ", □", a + 3 * b, "NUMERICA"];
}

function grv2OpcionsPregunta_(answer) {
  var correct = grv2Text_(answer);
  var number = Number(correct.replace(",", ".").replace("−", "-"));
  var values;
  if (isFinite(number)) values = [correct, String(number + 1), String(number - 1), String(number + (Math.abs(number) < 10 ? 2 : 10))];
  else if ([">", "<", "="].indexOf(correct) >= 0) values = [correct, correct === ">" ? "<" : ">", "=", "no es pot saber"];
  else if (["+", "−", "×", "÷"].indexOf(correct) >= 0) values = [correct, "+", "−", "×", "÷"];
  else if (grv2Upper_(correct) === "DILLUNS") values = [correct, "dimarts", "iguals", "no es pot saber"];
  else if (grv2Upper_(correct) === "DIMARTS") values = [correct, "dilluns", "iguals", "no es pot saber"];
  else values = [correct, "cm", "m", "kg", "L", "0", "1"];
  var unique = [];
  values.forEach(function (value) { if (unique.indexOf(grv2Text_(value)) < 0) unique.push(grv2Text_(value)); });
  while (unique.length < 4) unique.push(String(unique.length + 2));
  return unique.slice(0, 4);
}

function grv2AppendManyAbsent_(sheetName, keyField, objects) {
  var sheet = grv2Full_(sheetName);
  var headers = grv2Capcaleres_(sheet);
  var existing = {};
  grv2Rows_(sheetName).forEach(function (row) { existing[grv2Text_(row[keyField])] = true; });
  var pending = objects.filter(function (object) { return !existing[grv2Text_(object[keyField])]; });
  if (!pending.length) return 0;
  var values = pending.map(function (object) {
    return headers.map(function (header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ""; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  return values.length;
}

function INSTAL_LAR_CONTINGUT_INICIAL_V2() {
  var verification = grv2Verificar_(grv2Llibre_(), { requireInitialFlagsOff: false });
  if (!verification.ok) throw new Error("L'esquema no és vàlid: " + verification.errors.join(" | "));
  return grv2WithScriptLock_(function () {
    var now = new Date();
    var catalogId = GRV2_DEFAULT_CATALOG_ID_;
    var defs = grv2DefinicionsCurriculum_();
    var counts = {};
    var sectorNames = ["Nombres bàsics", "Multiplicar i repartir", "Enters", "Fraccions i percentatges", "Mesura, geometria i dades"];
    var sectors = sectorNames.map(function (name, index) {
      return { SectorUid: catalogId + ":S" + (index + 1), CatalogId: catalogId, SectorId: "S" + (index + 1), Trimestre: 1,
        Ordre: index + 1, Titol: "Bloc " + (index + 1), Subtitol: name, Descripcio: "Cinc missions curtes i pautades.",
        CodiVisual: "reforc", Icona: "🧭", EstatPublicacio: "PUBLICADA", SchemaVersion: 2 };
    });
    counts.sectors = grv2AppendManyAbsent_("Sectors", "SectorUid", sectors);

    var competencies = [
      ["C1", "Nombres i operacions", 35], ["C2", "Tria de procediments", 20], ["C3", "Problemes breus", 20],
      ["C4", "Representació i interpretació", 15], ["C5", "Raonament i comprovació", 10]
    ].map(function (item) { return { CompetenciaId: item[0], CodiOficial: "INTERNA-" + item[0], Nom: item[1],
      Descripcio: "Agrupació interna per al reforç; la correspondència normativa es validarà abans d'emetre informes oficials.",
      Etapa: "1r ESO reforç", Activa: "SI", Versio: 1, SchemaVersion: 2 }; });
    counts.competencies = grv2AppendManyAbsent_("Competencies", "CompetenciaId", competencies);

    var criteria = competencies.map(function (competency) { return { CriteriId: "CR-" + competency.CompetenciaId,
      CodiOficial: "INTERN-" + competency.CompetenciaId, Descripcio: "Evidències essencials de " + competency.Nom.toLowerCase() + ".",
      CompetenciaEspecificaId: competency.CompetenciaId, SabersJSON: JSON.stringify(["Reforç essencial"]),
      Pes: [35,20,20,15,10][competencies.indexOf(competency)], EsEssencial: "SI", Periode: "CURS", Actiu: "SI", Versio: 1, SchemaVersion: 2 }; });
    counts.criteria = grv2AppendManyAbsent_("Criteris", "CriteriId", criteria);

    var skills = defs.map(function (d, index) { return { HabilitatId: d[4], Nom: d[2], Descripcio: d[5], Bloc: "S" + d[1],
      EsEssencial: "SI", PrerequisitsJSON: JSON.stringify(index ? [defs[index - 1][4]] : []), NivellsDisponiblesJSON: "[1,2,3]",
      Activa: "SI", Versio: 1, SchemaVersion: 2 }; });
    counts.skills = grv2AppendManyAbsent_("Habilitats", "HabilitatId", skills);
    var mappings = defs.map(function (d) { return { MapaId: "MAP-" + d[4], HabilitatId: d[4], CriteriId: "CR-" + d[7],
      PesRelatiu: 100, NivellMinim: 1, Actiu: "SI", SchemaVersion: 2 }; });
    counts.mappings = grv2AppendManyAbsent_("MapaHabilitatCriteri", "MapaId", mappings);

    var missions = defs.map(function (d, index) { return { MissioUid: catalogId + ":" + d[0], CatalogId: catalogId, MissioId: d[0],
      SectorUid: catalogId + ":S" + d[1], Titol: d[2], Descripcio: d[3], HabilitatPrincipalId: d[4], Trimestre: 1,
      OrdreComu: index + 1, Icona: d[9], NivellsDisponiblesJSON: "[1,2,3]",
      PrerequisitsJSON: JSON.stringify(index ? [defs[index - 1][4]] : []), EsEssencial: "SI", EstatPublicacio: "PUBLICADA",
      GuiaDocentId: "GUIA-" + d[0], ObjectiuActivitats: 15, RecompensaId: "", SchemaVersion: 2 }; });
    counts.missions = grv2AppendManyAbsent_("Missions", "MissioUid", missions);

    var guides = [];
    defs.forEach(function (d) { [1,2,3].forEach(function (level) { guides.push({ GuiaDocentId: "GUIA-" + d[0] + "-L" + level,
      MissioUid: catalogId + ":" + d[0], NivellCurricular: level, Objectiu: d[3],
      Prerequisits: level === 1 ? "Comprendre el model directe." : "Dominar el nivell anterior.", GuioBreu: d[5],
      ExemplesPissarraJSON: JSON.stringify([d[6]]), ErrorsHabitualsJSON: JSON.stringify(["Canviar l'operació", "No seguir el model"]),
      CorreccionsJSON: JSON.stringify(["Tornar al mateix procés amb nombres menuts", "Fer una variant equivalent"]),
      CriteriAvanc: "4 de les 5 variants recents correctes, les dues últimes correctes i una comprovació autònoma.",
      RelacioCurricularJSON: JSON.stringify({ competenciaInterna: d[7], criteriIntern: "CR-" + d[7], validacioNormativaPendent: true }),
      Versio: 1, EstatPublicacio: "PUBLICADA", SchemaVersion: 2 }); }); });
    counts.guides = grv2AppendManyAbsent_("GuiesDocents", "GuiaDocentId", guides);

    var questions = [];
    defs.forEach(function (d) {
      [1,2,3].forEach(function (level) {
        ["SUPORT", "BASE", "REPTE"].forEach(function (phase) {
          for (var variant = 0; variant < 5; variant++) {
            var problem = grv2PreguntaCurricular_(d[4], phase, variant, level);
            var phaseCode = phase === "SUPORT" ? "S" : (phase === "BASE" ? "B" : "R");
            var id = d[0] + "-L" + level + "-" + phaseCode + "-" + String(variant + 1).padStart(2, "0");
            var role = variant < 2 ? "GUIADA" : (variant < 4 ? "PRACTICA" : "COMPROVACIO");
            var strength = role === "COMPROVACIO" ? "FORTA" : (role === "PRACTICA" ? "MITJANA" : "FEBLE");
            var rapidTypes = ["OPERACIO_RAPIDA", "OPCIO_4", "VERTADER_FALS", "COMPLETAR", "SEGUENT_PAS"];
            var questionText = "<p><strong>" + problem[0] + "</strong></p>";
            questions.push({ PreguntaUid: catalogId + ":" + id + ":v1", CatalogId: catalogId, ID: id, VersioPregunta: 1,
              MissioUid: catalogId + ":" + d[0], HabilitatId: d[4], NivellCurricular: level, FaseDUA: phase,
              PasDificultat: variant + 1, FamiliaVariantId: d[0] + "-L" + level, TipusRapid: rapidTypes[variant], RolDidactic: role,
              QuestioHtml: questionText, RespostaEsperada: grv2Text_(problem[1]), TipusCorreccio: problem[2],
              OpcionsJSON: JSON.stringify(grv2OpcionsPregunta_(problem[1])), Pista1: d[5], Pista2: d[6] + " Ara fes el mateix.",
              SolucioModel: d[6], ErrorsDetectablesJSON: JSON.stringify([d[4] + "_ERROR"]), EsEssencial: "SI",
              PrerequisitsJSON: JSON.stringify([]), CriterisJSON: JSON.stringify(["CR-" + d[7]]), ForcaEvidencia: strength,
              AjudaMax: 3, TipusInteraccio: "", ConfiguracioInteraccioJSON: "{}", EstatPublicacio: "PUBLICADA",
              HashContingut: grv2HashText_(questionText + "|" + problem[1]), CreatEn: now, ActualitzatEn: now, SchemaVersion: 2 });
          }
        });
      });
    });
    counts.questions = grv2AppendManyAbsent_("Preguntes", "PreguntaUid", questions);
    counts.totalQuestions = grv2Rows_("Preguntes").length;
    counts.expectedQuestions = 1125;
    var control = grv2RowsWithIndex_("ControlClasse").find(function (row) { return grv2Text_(row.GrupId) === GRV2_DEFAULT_GROUP_ID_; });
    if (control && !grv2Text_(control.MissioUid)) grv2UpdateRow_("ControlClasse", control._row, { MissioUid: missions[0].MissioUid, ActualitzatEn: now });
    SpreadsheetApp.flush();
    return counts;
  });
}

function grv2ApiCatalog_() {
  var sectors = grv2Rows_("Sectors").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; });
  var missions = grv2Rows_("Missions").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; });
  var control = grv2ControlActual_(GRV2_DEFAULT_GROUP_ID_);
  return {
    sectors: sectors.map(grv2SectorClient_),
    missions: missions.map(function (row) { return grv2MissionClient_(row, control); }),
    questions: [],
    solutions: [],
    guides: grv2Rows_("GuiesDocents").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; }).map(function (row) {
      return { guideId: row.GuiaDocentId, missionId: grv2MissioIdCurt_(row.MissioUid), curriculumLevel: grv2Number_(row.NivellCurricular, 1),
        objective: row.Objectiu, prerequisites: row.Prerequisits, script: row.GuioBreu,
        examples: grv2ParseJson_(row.ExemplesPissarraJSON, []), commonErrors: grv2ParseJson_(row.ErrorsHabitualsJSON, []),
        corrections: grv2ParseJson_(row.CorreccionsJSON, []), advanceCriterion: row.CriteriAvanc,
        curriculum: grv2ParseJson_(row.RelacioCurricularJSON, {}) };
    }),
    levelPlans: [],
    nextLockedMission: null,
    classControl: grv2ControlClient_(control)
  };
}

function grv2QuestionCatalog_() {
  var questions = grv2Questions_();
  return {
    questions: questions.map(function (row) {
      return {
        id: grv2Text_(row.ID),
        missionId: grv2MissioIdCurt_(row.MissioUid),
        route: grv2Upper_(row.FaseDUA),
        level: grv2Number_(row.NivellCurricular, 1),
        title: grv2Text_(row.ID),
        questionHtml: grv2Text_(row.QuestioHtml)
      };
    }),
    solutions: questions.map(function (row) {
      return {
        id: grv2Text_(row.ID),
        expectedAnswer: grv2Text_(row.RespostaEsperada),
        modelSolution: grv2Text_(row.SolucioModel)
      };
    })
  };
}

function grv2MissioIdCurt_(uid) {
  var parts = grv2Text_(uid).split(":");
  return parts.length > 1 ? parts[parts.length - 1] : grv2Text_(uid);
}

function grv2SectorClient_(row) {
  return { sectorId: grv2Text_(row.SectorId), title: grv2Text_(row.Titol), subtitle: grv2Text_(row.Subtitol),
    description: grv2Text_(row.Descripcio), visualCode: grv2Text_(row.CodiVisual), icon: grv2Text_(row.Icona), trimester: grv2Number_(row.Trimestre, 1) };
}

function grv2MissionClient_(row, control) {
  return { missionId: grv2Text_(row.MissioId), missionUid: grv2Text_(row.MissioUid), title: grv2Text_(row.Titol),
    description: grv2Text_(row.Descripcio), icon: grv2Text_(row.Icona), order: grv2Number_(row.OrdreComu, 0),
    sectorId: grv2MissioIdCurt_(row.SectorUid), targetExercises: grv2Number_(row.ObjectiuActivitats, 15),
    unlocked: true, current: control && grv2Text_(control.MissioUid) === grv2Text_(row.MissioUid) };
}

function grv2DesbloquejarSeguentMissio_() {
  return { allUnlocked: true, message: "En V2 la missió comuna es controla des de Seguiment; no hi ha desbloqueig global lineal." };
}

function grv2PropostaNoAutomatica_(data) {
  return { status: "not_created", message: "V2 no crea contingut IA automàtic. Usa recuperacions equivalents del catàleg validat.", studentId: grv2Text_(data.studentId) };
}


// Ported verbatim from ClasseHabitsV2.gs.
/** Control de classe comú i registre d'hàbits separat de l'avaluació. */

function grv2ControlActual_(groupId) {
  var group = grv2Text_(groupId || GRV2_DEFAULT_GROUP_ID_);
  var row = grv2Rows_("ControlClasse").find(function (item) { return grv2Text_(item.GrupId) === group; });
  if (row) return row;
  var mission = grv2Rows_("Missions").sort(function (a, b) { return grv2Number_(a.OrdreComu, 0) - grv2Number_(b.OrdreComu, 0); })[0];
  var initial = { ControlId: grv2Uuid_("CTRL-"), GrupId: group, SessioClasseId: "", MissioUid: mission ? mission.MissioUid : "",
    NivellReferencia: 1, ForcarNivell: "NO", EstatClasse: "READY", VersioEstat: 1, VersioExplicacio: 0,
    VersioActivitat: 0, IniciatEn: "", ActualitzatEn: new Date(), ProfessorId: GRV2_DEFAULT_TEACHER_ID_, SchemaVersion: 2 };
  grv2Append_("ControlClasse", initial);
  return initial;
}

function grv2ControlClient_(row) {
  var state = grv2Upper_(row && row.EstatClasse || "READY");
  return { missionId: grv2MissioIdCurt_(row && row.MissioUid), missionUid: grv2Text_(row && row.MissioUid),
    macroLevel: grv2Number_(row && row.NivellReferencia, 1), command: state === "ACTIVITY" ? "START" : state,
    state: state, explanationVersion: grv2Number_(row && row.VersioExplicacio, 0),
    activityVersion: grv2Number_(row && row.VersioActivitat, 0), updatedAt: row && row.ActualitzatEn || new Date(),
    sessionClassId: grv2Text_(row && row.SessioClasseId), forcedLevel: grv2Boolean_(row && row.ForcarNivell) };
}

function grv2ControlClasseGet_(data) {
  return { control: grv2ControlClient_(grv2ControlActual_(data.groupId || GRV2_DEFAULT_GROUP_ID_)) };
}

/** Resum acadèmic de lectura; la participació en viu només determina el denominador. */
function grv2TeacherDashboard_(data) {
  var groupId = grv2Text_(data.groupId || GRV2_DEFAULT_GROUP_ID_);
  var users = grv2Rows_("Usuaris");
  var controls = grv2Rows_("ControlClasse");
  var missions = grv2Rows_("Missions");
  var control = controls.find(function (row) { return grv2Text_(row.GrupId) === groupId; });
  if (!control) throw new Error("No hi ha control de classe per a aquest grup.");
  var mission = missions.find(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(control.MissioUid); });
  if (!mission || !grv2Text_(mission.HabilitatPrincipalId)) throw new Error("La missió activa no té una habilitat principal vàlida.");
  var missionUid = grv2Text_(mission.MissioUid);
  var skillId = grv2Text_(mission.HabilitatPrincipalId);
  var roster = users.filter(function (row) { return grv2Text_(row.GrupId) === groupId && grv2Boolean_(row.Actiu); });
  var rosterById = Object.create(null);
  roster.forEach(function (row) { rosterById[grv2Text_(row.AlumneId)] = row; });
  var presenceAvailable = Array.isArray(data.activeStudentIds) && data.activeStudentIds.every(function (id) {
    return typeof id === "string" && Boolean(grv2Text_(id));
  });
  var activeIds = Object.create(null);
  if (presenceAvailable) data.activeStudentIds.forEach(function (id) {
    var key = grv2Text_(id);
    if (rosterById[key]) activeIds[key] = true;
  });
  var participating = roster.filter(function (row) { return Boolean(activeIds[grv2Text_(row.AlumneId)]); });
  var result = { missionUid: missionUid, missionLabel: grv2Text_(mission.Titol || mission.MissioId),
    rosterStudents: roster.length, participatingStudents: participating.length, studentsWithEvidence: 0,
    coveragePercent: 0, preparedPercent: 0, needsSupportPercent: 0, preparedCount: 0, inProcessCount: 0,
    needsSupportCount: 0, notStartedCount: 0, completedCount: 0,
    inactiveNowCount: presenceAvailable ? roster.length - participating.length : null,
    presenceAvailable: presenceAvailable, participationSufficient: presenceAvailable && participating.length > 0,
    recommendation: "INSUFFICIENT_EVIDENCE", supportStudents: [], generatedAt: new Date().toISOString() };
  if (!participating.length) return result;

  var domains = grv2Rows_("DominiHabilitats");
  var progress = grv2Rows_("Progres");
  var recoveries = grv2Rows_("Recuperacions");
  var attempts = grv2Rows_("Dades");
  var adaptations = grv2Rows_("AdaptacionsDocents");
  var questions = grv2Questions_();
  var domainsByStudent = Object.create(null);
  domains.forEach(function (row) {
    var id = grv2Text_(row.AlumneId);
    if (!activeIds[id] || grv2Text_(row.HabilitatId) !== skillId) return;
    if (!domainsByStudent[id]) domainsByStudent[id] = [];
    domainsByStudent[id].push(row);
  });
  var progressByStudent = Object.create(null);
  var questionIds = Object.create(null);
  var nextLevelAvailable = Object.create(null);
  questions.forEach(function (row) {
    questionIds[grv2Text_(row.PreguntaUid)] = true;
    if (grv2Text_(row.MissioUid) === missionUid) nextLevelAvailable[grv2Number_(row.NivellCurricular, 0)] = true;
  });
  progress.forEach(function (row) {
    var id = grv2Text_(row.AlumneId);
    if (!activeIds[id] || grv2Text_(row.MissioUid) !== missionUid || !questionIds[grv2Text_(row.PreguntaUid)]) return;
    if (!progressByStudent[id]) progressByStudent[id] = { started: false, completed: Object.create(null) };
    progressByStudent[id].started = true;
    if (grv2Upper_(row.EstatActivitat) === "FINALITZADA") progressByStudent[id].completed[grv2Text_(row.PreguntaUid)] = true;
  });
  var pendingByStudent = Object.create(null);
  recoveries.forEach(function (row) {
    var id = grv2Text_(row.AlumneId);
    if (activeIds[id] && grv2Text_(row.MissioOrigenUid) === missionUid
      && ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) >= 0) pendingByStudent[id] = true;
  });
  var attemptsByStudent = Object.create(null);
  attempts.forEach(function (row) {
    var id = grv2Text_(row.AlumneId);
    if (!activeIds[id] || grv2Text_(row.MissioUid) !== missionUid || grv2Text_(row.HabilitatId) !== skillId) return;
    if (!attemptsByStudent[id]) attemptsByStudent[id] = [];
    attemptsByStudent[id].push(row);
  });
  var adaptationByStudent = Object.create(null);
  adaptations.forEach(function (row) {
    var id = grv2Text_(row.AlumneId);
    if (activeIds[id] && grv2Boolean_(row.Activa) && (!row.MissioUid || grv2Text_(row.MissioUid) === missionUid)) {
      adaptationByStudent[id] = row;
    }
  });
  var adaptive = grv2FlagOn_("MotorAdaptatiuV2");
  participating.forEach(function (user) {
    var id = grv2Text_(user.AlumneId);
    var studentDomains = domainsByStudent[id] || [];
    var byLevel = Object.create(null);
    studentDomains.forEach(function (row) { byLevel[grv2Number_(row.NivellCurricular, 0)] = row; });
    var highestLevel = studentDomains.reduce(function (highest, row) {
      return Math.max(highest, grv2Number_(row.NivellCurricular, 0));
    }, 0);
    var adaptation = adaptationByStudent[id];
    var teacherLevel = adaptation && grv2Text_(adaptation.NivellForcat);
    var classLevelForced = grv2Boolean_(control.ForcarNivell);
    var level = teacherLevel ? grv2Number_(adaptation.NivellForcat, 1)
      : (classLevelForced ? grv2Number_(control.NivellReferencia, 1)
        : (adaptive && highestLevel ? highestLevel : grv2Number_(user.NivellGeneralRecomanat, 1)));
    level = Math.max(1, Math.min(3, level));
    var promotedLevel = level;
    var temporaryRegression = false;
    if (adaptive && !teacherLevel && !classLevelForced) {
      while (promotedLevel < 3 && byLevel[promotedLevel]
        && grv2Upper_(byLevel[promotedLevel].EstatDomini) === "CONSOLIDADA"
        && nextLevelAvailable[promotedLevel + 1]) promotedLevel++;
      var lowerDomain = byLevel[promotedLevel - 1];
      var upperDomain = byLevel[promotedLevel];
      if (promotedLevel > 1 && lowerDomain && (grv2Upper_(lowerDomain.EstatDomini) === "CONSOLIDADA" || upperDomain)) {
        temporaryRegression = grv2TemporaryRegression_(id, mission, promotedLevel, attemptsByStudent[id] || []);
      }
      level = temporaryRegression ? promotedLevel - 1 : promotedLevel;
    }
    var prepared = studentDomains.some(function (row) {
      var academicLevel = grv2Number_(row.NivellCurricular, 0);
      return academicLevel >= 1 && academicLevel <= 3
        && ["ADQUIRIDA", "CONSOLIDADA"].indexOf(grv2Upper_(row.EstatDomini)) >= 0;
    });
    var studentProgress = progressByStudent[id] || { started: false, completed: {} };
    var doneCount = Object.keys(studentProgress.completed).length;
    var state = grv2MissionProgressState_(doneCount, studentProgress.started,
      byLevel[level] && byLevel[level].EstatDomini, Boolean(pendingByStudent[id]));
    var needsSupport = state.learningState === "NECESSITA_REFORÇ" || temporaryRegression;
    if (prepared) result.preparedCount++;
    if (needsSupport) {
      result.needsSupportCount++;
      result.supportStudents.push({ studentId: id, name: grv2Text_(user.Nom), level: level,
        learningState: state.learningState, temporaryRegression: temporaryRegression });
    }
    if (state.completionState === "COMPLETED") result.completedCount++;
    if (state.completionState === "NOT_STARTED") result.notStartedCount++;
    if (state.completionState === "IN_PROGRESS" && !prepared && !needsSupport) result.inProcessCount++;
    if (prepared || needsSupport || state.completionState === "COMPLETED") result.studentsWithEvidence++;
  });
  result.supportStudents.sort(function (a, b) {
    return Number(b.temporaryRegression) - Number(a.temporaryRegression) || a.name.localeCompare(b.name);
  });
  result.coveragePercent = Math.round(result.studentsWithEvidence / participating.length * 100);
  result.preparedPercent = result.studentsWithEvidence ? Math.round(result.preparedCount / result.studentsWithEvidence * 100) : 0;
  result.needsSupportPercent = Math.round(result.needsSupportCount / participating.length * 100);
  if (result.coveragePercent < 50) result.recommendation = "INSUFFICIENT_EVIDENCE";
  else if (result.needsSupportPercent >= 30) result.recommendation = "NEEDS_INTERVENTION";
  else if (result.preparedPercent >= 70) result.recommendation = "CONSIDER_ADVANCE";
  else result.recommendation = "CONTINUE";
  return result;
}

function grv2ClassState_(command) {
  var value = grv2Upper_(command || "READY");
  if (value === "START") value = "ACTIVITY";
  if (["READY", "EXPLAIN", "ACTIVITY", "CHECKPOINT", "BATTLE", "FINISH"].indexOf(value) < 0) throw new Error("Estat de classe no vàlid.");
  return value;
}

function grv2OpenClassSession_(groupId, mission, level) {
  var current = grv2Rows_("SessionsClasse").filter(function (row) { return grv2Text_(row.GrupId) === grv2Text_(groupId) && !row.Fi; }).pop();
  if (current && grv2Text_(current.MissioUid) === grv2Text_(mission.MissioUid)) return current;
  if (current) {
    var indexed = grv2RowsWithIndex_("SessionsClasse").find(function (row) { return grv2Text_(row.SessioClasseId) === grv2Text_(current.SessioClasseId); });
    if (indexed) grv2UpdateRow_("SessionsClasse", indexed._row, { Fi: new Date(), EstatFinal: "FINISH" });
  }
  var session = { SessioClasseId: grv2Uuid_("CLASS-"), GrupId: groupId, MissioUid: mission.MissioUid, NivellReferencia: level,
    Inici: new Date(), Fi: "", EstatFinal: "READY", AvancForcat: "NO", ProfessorId: GRV2_DEFAULT_TEACHER_ID_, SchemaVersion: 2 };
  grv2Append_("SessionsClasse", session);
  return session;
}

function grv2ControlClasseSet_(data, forced) {
  return grv2WithScriptLock_(function () {
    var groupId = grv2Text_(data.groupId || GRV2_DEFAULT_GROUP_ID_);
    var mission = grv2MissionByAnyId_(data.missionId || data.missionUid);
    if (!mission) throw new Error("La missió seleccionada no existeix.");
    var level = Math.max(1, Math.min(3, grv2Number_(data.macroLevel || data.curriculumLevel, 1)));
    var state = grv2ClassState_(data.command || (forced ? "ACTIVITY" : "READY"));
    var current = grv2ControlActual_(groupId);
    var session = grv2OpenClassSession_(groupId, mission, level);
    var indexed = grv2RowsWithIndex_("ControlClasse").find(function (row) { return grv2Text_(row.ControlId) === grv2Text_(current.ControlId); });
    var changes = { SessioClasseId: session.SessioClasseId, MissioUid: mission.MissioUid, NivellReferencia: level,
      ForcarNivell: forced ? "SI" : grv2Text_(data.forceLevel || "NO"), EstatClasse: state,
      VersioEstat: grv2Number_(current.VersioEstat, 0) + 1,
      VersioExplicacio: grv2Number_(current.VersioExplicacio, 0) + (state === "EXPLAIN" ? 1 : 0),
      VersioActivitat: grv2Number_(current.VersioActivitat, 0) + (state === "ACTIVITY" ? 1 : 0),
      IniciatEn: current.IniciatEn || new Date(), ActualitzatEn: new Date(), ProfessorId: GRV2_DEFAULT_TEACHER_ID_ };
    if (indexed) grv2UpdateRow_("ControlClasse", indexed._row, changes);
    else grv2Append_("ControlClasse", Object.assign({}, current, changes));
    var advance = null;
    if (forced && grv2Text_(current.MissioUid) && grv2Text_(current.MissioUid) !== grv2Text_(mission.MissioUid)) {
      advance = typeof grv2RegistrarAvancForcatFirebase_ === "function"
        ? grv2RegistrarAvancForcatFirebase_(groupId, session.SessioClasseId, current, mission, level, data.reason)
        : { advanceId: grv2RegistrarAvancForcat_(groupId, session.SessioClasseId, current, mission, level, data.reason), recoveries: [] };
    }
    var sessionRow = grv2RowsWithIndex_("SessionsClasse").find(function (row) { return grv2Text_(row.SessioClasseId) === grv2Text_(session.SessioClasseId); });
    if (sessionRow) grv2UpdateRow_("SessionsClasse", sessionRow._row, { EstatFinal: state, AvancForcat: forced ? "SI" : sessionRow.AvancForcat });
    var updated = Object.assign({}, current, changes);
    if (typeof grv2FirebaseRequest_ === "function") {
      var base = "class/" + grv2SafeKey_(groupId);
      var firebaseUpdates = {};
      firebaseUpdates[base + "/control"] = updated;
      var groupStudents = {};
      grv2Rows_("Usuaris").forEach(function (user) {
        if (grv2Text_(user.GrupId) === groupId) groupStudents[grv2Text_(user.AlumneId)] = true;
      });
      grv2Rows_("Recuperacions").filter(function (row) {
        return groupStudents[grv2Text_(row.AlumneId)] && grv2Text_(row.AvancDocentId);
      }).forEach(function (recovery) {
        firebaseUpdates[base + "/overrides/" + grv2SafeKey_(recovery.AlumneId)
          + "/advanceRecoveries/" + grv2SafeKey_(recovery.RecuperacioId)] = recovery;
      });
      grv2FirebaseRequest_("patch", "", firebaseUpdates);
    }
    return { control: grv2ControlClient_(updated), status: forced ? "advanced_by_teacher" : "updated",
      message: forced ? "La classe avança; les mancances queden programades com a recuperacions." : "Control de classe actualitzat." };
  });
}

function grv2RegistrarAvancForcat_(groupId, sessionClassId, previousControl, nextMission, level, reason) {
  var advanceId = grv2Uuid_("ADV-");
  var previousMission = grv2MissionByAnyId_(previousControl.MissioUid);
  var recoveries = 0;
  if (previousMission) {
    grv2Rows_("Usuaris").filter(function (user) { return grv2Boolean_(user.Actiu) && grv2Text_(user.GrupId) === grv2Text_(groupId); }).forEach(function (user) {
      var domain = grv2Rows_("DominiHabilitats").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Text_(row.HabilitatId) === grv2Text_(previousMission.HabilitatPrincipalId) && grv2Number_(row.NivellCurricular, 0) === Number(level); });
      if (domain && ["ADQUIRIDA", "CONSOLIDADA"].indexOf(grv2Upper_(domain.EstatDomini)) >= 0) return;
      var exists = grv2Rows_("Recuperacions").some(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Text_(row.HabilitatId) === grv2Text_(previousMission.HabilitatPrincipalId) && ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) >= 0; });
      if (exists) return;
      grv2Append_("Recuperacions", { RecuperacioId: grv2Uuid_("REC-ADV-"), AlumneId: user.AlumneId,
        HabilitatId: previousMission.HabilitatPrincipalId, NivellCurricular: level, MissioOrigenUid: previousMission.MissioUid,
        MissioIncorporacioUid: nextMission.MissioUid, FaseRecomanada: "SUPORT", ErrorCode: "AVANC_DOCENT",
        Prioritat: 80, Estat: "PENDENT", Intents: 0, CreadaEn: new Date(), ProgramadaEn: "", ResoltaEn: "",
        AvancDocentId: advanceId, Motiu: "La classe ha avançat abans de consolidar esta habilitat.", SchemaVersion: 2 });
      recoveries++;
    });
  }
  grv2Append_("AvancosDocents", { AvancDocentId: advanceId, GrupId: groupId, SessioClasseId: sessionClassId,
    MissioOrigenUid: previousControl.MissioUid, MissioDestiUid: nextMission.MissioUid, NivellReferencia: level,
    Estat: "advanced_by_teacher", Motiu: grv2Text_(reason || "Decisió docent"), RecuperacionsCreades: recoveries,
    ProfessorId: GRV2_DEFAULT_TEACHER_ID_, Data: new Date(), SchemaVersion: 2 });
  return advanceId;
}

function grv2RegistrarHabitEvent_(data) {
  if (!grv2FlagOn_("HabitsV2")) return { recorded: false, reason: "HabitsV2_OFF" };
  var user = grv2Usuari_(data.studentId);
  var type = grv2Upper_(data.type);
  var allowed = ["FOCUS_LOST", "FOCUS_RETURNED", "INACTIVE", "BLOCKED", "HELP_REQUESTED", "SESSION_REPLACED", "SESSION_ENDED"];
  if (allowed.indexOf(type) < 0) throw new Error("Tipus d'esdeveniment d'hàbit no vàlid.");
  var event = { HabitEventId: grv2Uuid_("HAB-EVT-"), SessioId: grv2Text_(data.sessionId), SessioClasseId: grv2Text_(data.sessionClassId),
    AlumneId: user.AlumneId, GrupId: user.GrupId, Tipus: type, Inici: data.start ? new Date(data.start) : new Date(),
    Fi: data.end ? new Date(data.end) : "", DuracioSegons: Math.max(0, grv2Number_(data.durationSeconds, 0)),
    MissioUid: grv2Text_(data.missionUid), PreguntaUid: grv2Text_(data.questionUid), MetadadesJSON: JSON.stringify(data.metadata || {}), SchemaVersion: 2 };
  grv2Append_("HabitsEvents", event);
  return { recorded: true, eventId: event.HabitEventId };
}

function grv2ActualitzarHabitsSessio_(data) {
  if (!grv2FlagOn_("HabitsV2")) return { recorded: false, reason: "HabitsV2_OFF" };
  var user = grv2Usuari_(data.studentId);
  var rows = grv2RowsWithIndex_("HabitsSessions");
  var current = rows.find(function (row) { return grv2Text_(row.SessioId) === grv2Text_(data.sessionId); });
  var values = { SessioClasseId: grv2Text_(data.sessionClassId), AlumneId: user.AlumneId, GrupId: user.GrupId,
    Inici: data.start ? new Date(data.start) : (current && current.Inici || new Date()), Fi: data.end ? new Date(data.end) : "",
    TempsActiuSegons: Math.max(0, grv2Number_(data.activeSeconds, 0)), TempsInactiuSegons: Math.max(0, grv2Number_(data.inactiveSeconds, 0)),
    PerduesFocus: Math.max(0, grv2Number_(data.focusLosses, 0)), Retorns: Math.max(0, grv2Number_(data.returns, 0)),
    Bloquejos: Math.max(0, grv2Number_(data.blocks, 0)), PeticionsAjuda: Math.max(0, grv2Number_(data.helpRequests, 0)),
    ActivitatsIniciades: Math.max(0, grv2Number_(data.activitiesStarted, 0)), ActivitatsFinalitzades: Math.max(0, grv2Number_(data.activitiesFinished, 0)),
    ActualitzatEn: new Date(), SchemaVersion: 2 };
  if (current) grv2UpdateRow_("HabitsSessions", current._row, values);
  else grv2Append_("HabitsSessions", Object.assign({ HabitSessioId: grv2Uuid_("HAB-SES-"), SessioId: grv2Text_(data.sessionId) }, values));
  return { recorded: true };
}

function grv2ResumHabits_(data) {
  var studentId = grv2Text_(data.studentId);
  var sessions = grv2Rows_("HabitsSessions").filter(function (row) { return !studentId || grv2Text_(row.AlumneId) === studentId; });
  var events = grv2Rows_("HabitsEvents").filter(function (row) { return !studentId || grv2Text_(row.AlumneId) === studentId; });
  return { summary: { sessions: sessions.length, activeSeconds: sessions.reduce(function (sum, row) { return sum + grv2Number_(row.TempsActiuSegons, 0); }, 0),
    inactiveSeconds: sessions.reduce(function (sum, row) { return sum + grv2Number_(row.TempsInactiuSegons, 0); }, 0),
    focusLosses: events.filter(function (row) { return grv2Upper_(row.Tipus) === "FOCUS_LOST"; }).length,
    blocks: events.filter(function (row) { return grv2Upper_(row.Tipus) === "BLOCKED"; }).length,
    helpRequests: events.filter(function (row) { return grv2Upper_(row.Tipus) === "HELP_REQUESTED"; }).length }, sessions: sessions };
}


// Ported verbatim from AprenentatgeV2.gs.
/** Motor d'aprenentatge, intents, domini, recuperacions i avaluació V2. */

var GRV2_REQUEST_QUESTIONS_CACHE_ = null;

function grv2Questions_() {
  if (GRV2_REQUEST_QUESTIONS_CACHE_) return GRV2_REQUEST_QUESTIONS_CACHE_;
  var cache = typeof CacheService === "undefined" ? null : CacheService.getScriptCache();
  if (cache) try {
    var count = Number(cache.get("grv2-published-questions-v1-count"));
    if (count > 0 && count <= 100) {
      var keys = Array.from({ length: count }, function (_, index) { return "grv2-published-questions-v1-" + index; });
      var chunks = cache.getAll(keys);
      if (keys.every(function (key) { return chunks[key]; })) {
        GRV2_REQUEST_QUESTIONS_CACHE_ = keys.reduce(function (all, key) { return all.concat(JSON.parse(chunks[key])); }, []);
        return GRV2_REQUEST_QUESTIONS_CACHE_;
      }
    }
  } catch (error) { /* La cache és opcional; Sheets és la font de veritat del catàleg. */ }
  var questions = grv2Rows_("Preguntes").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; });
  GRV2_REQUEST_QUESTIONS_CACHE_ = questions;
  if (cache && questions.length) try {
    var values = {};
    for (var index = 0; index < questions.length; index += 20)
      values["grv2-published-questions-v1-" + Math.floor(index / 20)] = JSON.stringify(questions.slice(index, index + 20));
    cache.putAll(values, 600);
    cache.put("grv2-published-questions-v1-count", String(Math.ceil(questions.length / 20)), 600);
  } catch (error) { /* La lectura següent tornarà a Sheets si la cache no cap. */ }
  return questions;
}

function grv2Question_(questionId) {
  var value = grv2Text_(questionId);
  return grv2Questions_().find(function (row) {
    return grv2Text_(row.PreguntaUid) === value || grv2Text_(row.ID) === value;
  }) || null;
}

function grv2MissionByAnyId_(missionId) {
  var value = grv2Text_(missionId);
  return grv2Rows_("Missions").find(function (row) {
    return grv2Text_(row.MissioUid) === value || grv2Text_(row.MissioId) === value;
  }) || null;
}

function grv2Session_(user, data) {
  var requested = grv2Text_(data && data.sessionId);
  var rows = grv2RowsWithIndex_("Sessions");
  var current = requested ? rows.find(function (row) {
    return grv2Text_(row.SessioId) === requested && grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId) && grv2Upper_(row.Estat) === "ACTIVA";
  }) : null;
  if (current) return current;
  var now = new Date();
  var session = { SessioId: grv2Uuid_("SES-"), AlumneId: user.AlumneId, GrupId: user.GrupId || GRV2_DEFAULT_GROUP_ID_,
    SessioClasseId: "", Dispositiu: grv2Text_(data && data.device), FirebaseUid: "", Inici: now, Fi: "", Estat: "ACTIVA", SchemaVersion: 2 };
  grv2Append_("Sessions", session);
  var userRow = grv2RowsWithIndex_("Usuaris").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId); });
  if (userRow) grv2UpdateRow_("Usuaris", userRow._row, { UltimaSessio: now });
  return session;
}

function grv2AssignacioActiva_(studentId, groupId) {
  var now = new Date();
  return grv2Rows_("Assignacions").filter(function (row) {
    if (grv2Upper_(row.Estat) !== "ACTIVA" || grv2Boolean_(row.Consumida)
      || grv2Upper_(row.Tipus) === "PONT") return false;
    var start = row.Inici ? new Date(row.Inici) : null;
    var end = row.Fi ? new Date(row.Fi) : null;
    if (start && start > now || end && end < now) return false;
    return grv2Upper_(row.Abast) === "ALUMNE" && grv2Text_(row.DestinatariId) === grv2Text_(studentId);
  }).sort(function (a, b) { return grv2Number_(b.Prioritat, 0) - grv2Number_(a.Prioritat, 0); })[0] || null;
}

function grv2EnsureBridge_(user, control) {
  var hasAttempts = grv2Rows_("Dades").some(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId); });
  if (hasAttempts || grv2Upper_(user.EstatDiagnosi) === "COMPLETADA") return null;
  var missions = grv2Rows_("Missions").sort(function (a, b) { return grv2Number_(a.OrdreComu, 0) - grv2Number_(b.OrdreComu, 0); });
  var currentIndex = missions.findIndex(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(control.MissioUid); });
  if (currentIndex <= 0) return null;
  var bridge = missions[Math.max(0, currentIndex - 5)];
  var existing = grv2Rows_("Assignacions").find(function (row) {
    return grv2Text_(row.DestinatariId) === grv2Text_(user.AlumneId) && grv2Upper_(row.Tipus) === "PONT" && grv2Upper_(row.Estat) === "ACTIVA";
  });
  if (!existing) {
    grv2Append_("Assignacions", { AssignacioId: grv2Uuid_("ASS-PONT-"), Abast: "ALUMNE", GrupId: user.GrupId,
      DestinatariId: user.AlumneId, Tipus: "PONT", ContingutUid: bridge.MissioUid, Prioritat: 2000, Origen: "PONT",
      Motiu: "Incorporació progressiva a la missió comuna", SessioClasseId: control.SessioClasseId || "", Inici: new Date(), Fi: "",
      Estat: "ACTIVA", Consumida: "NO", CreadaEn: new Date(), SchemaVersion: 2 });
  }
  return { missionId: bridge.MissioId, phase: "SUPORT", joinMissionId: grv2MissioIdCurt_(control.MissioUid), automatic: true };
}

function grv2TemporaryRegression_(studentId, mission, promotedLevel, attempts) {
  var lowerLevel = promotedLevel - 1;
  var fallback = false;
  var upperErrors = 0;
  var lowerCorrect = 0;
  var lastUpperQuestion = "";
  var lastLowerQuestion = "";
  (attempts || grv2Rows_("Dades")).forEach(function (row) {
    if (grv2Text_(row.AlumneId) !== grv2Text_(studentId)
      || grv2Text_(row.MissioUid) !== grv2Text_(mission.MissioUid)
      || grv2Text_(row.HabilitatId) !== grv2Text_(mission.HabilitatPrincipalId)
      || grv2Boolean_(row.GameOnly)) return;
    var level = grv2Number_(row.NivellCurricular, 0);
    var questionId = grv2Text_(row.PreguntaUid) || grv2Text_(row.IntentId);
    if (!fallback && level === promotedLevel) {
      if (grv2Boolean_(row.Correcta)) upperErrors = 0;
      else if (questionId !== lastUpperQuestion) upperErrors++;
      lastUpperQuestion = questionId;
      if (upperErrors >= 3) { fallback = true; lowerCorrect = 0; lastLowerQuestion = ""; }
    } else if (fallback && level === lowerLevel) {
      if (grv2Boolean_(row.Correcta) && questionId !== lastLowerQuestion) lowerCorrect++;
      else if (!grv2Boolean_(row.Correcta)) lowerCorrect = 0;
      lastLowerQuestion = questionId;
      if (lowerCorrect >= 2) { fallback = false; upperErrors = 0; lastUpperQuestion = ""; }
    }
  });
  return fallback;
}

function grv2ContextAlumne_(user, control) {
  var assignment = grv2AssignacioActiva_(user.AlumneId, user.GrupId);
  var mission = assignment ? grv2MissionByAnyId_(assignment.ContingutUid) : grv2MissionByAnyId_(control.MissioUid);
  if (!mission) mission = grv2Rows_("Missions").sort(function (a, b) { return grv2Number_(a.OrdreComu, 0) - grv2Number_(b.OrdreComu, 0); })[0];
  if (!mission) throw new Error("El catàleg V2 encara no té missions. Executa INSTAL_LAR_CONTINGUT_INICIAL_V2().");
  var adaptation = grv2Rows_("AdaptacionsDocents").filter(function (row) {
    return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId) && grv2Boolean_(row.Activa)
      && (!row.MissioUid || grv2Text_(row.MissioUid) === grv2Text_(mission.MissioUid));
  }).pop();
  var domains = grv2Rows_("DominiHabilitats").filter(function (row) {
    return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId) && grv2Text_(row.HabilitatId) === grv2Text_(mission.HabilitatPrincipalId);
  }).sort(function (a, b) { return grv2Number_(b.NivellCurricular, 0) - grv2Number_(a.NivellCurricular, 0); });
  var highestDomain = domains.find(function (row) { return grv2Upper_(row.EstatDomini) !== "SENSE_EVIDENCIA"; }) || null;
  var initialDiagnostic = grv2Rows_("Diagnostic").filter(function (row) {
    return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
      && grv2Upper_(row.TipusDiagnosi) === "INICIAL" && grv2Upper_(row.Estat) === "COMPLETADA";
  }).pop();
  var teacherLevel = adaptation && grv2Text_(adaptation.NivellForcat);
  var classLevelForced = grv2Boolean_(control.ForcarNivell);
  var adaptive = grv2FlagOn_("MotorAdaptatiuV2");
  var level = teacherLevel ? grv2Number_(adaptation.NivellForcat, 1)
    : (classLevelForced ? grv2Number_(control.NivellReferencia, 1)
      : (adaptive && highestDomain ? grv2Number_(highestDomain.NivellCurricular, 1)
        : grv2Number_(user.NivellGeneralRecomanat, 1)));
  level = Math.max(1, Math.min(3, level));
  var promotedLevel = level;
  var temporaryRegression = false;
  if (adaptive && !teacherLevel && !classLevelForced) {
    var questions = grv2Questions_();
    while (promotedLevel < 3 && domains.some(function (row) {
      return grv2Number_(row.NivellCurricular, 0) === promotedLevel && grv2Upper_(row.EstatDomini) === "CONSOLIDADA";
    }) && questions.some(function (row) {
      return grv2Text_(row.MissioUid) === grv2Text_(mission.MissioUid)
        && grv2Number_(row.NivellCurricular, 0) === promotedLevel + 1;
    })) promotedLevel++;
    var lowerDomain = domains.find(function (row) { return grv2Number_(row.NivellCurricular, 0) === promotedLevel - 1; });
    var upperDomain = domains.find(function (row) { return grv2Number_(row.NivellCurricular, 0) === promotedLevel; });
    if (promotedLevel > 1 && lowerDomain && (grv2Upper_(lowerDomain.EstatDomini) === "CONSOLIDADA" || upperDomain)) {
      temporaryRegression = grv2TemporaryRegression_(user.AlumneId, mission, promotedLevel);
    }
    level = temporaryRegression ? promotedLevel - 1 : promotedLevel;
  }
  var domain = domains.find(function (row) { return grv2Number_(row.NivellCurricular, 0) === level; }) || null;
  var phase = adaptation && adaptation.FaseForcada ? grv2Upper_(adaptation.FaseForcada)
      : (temporaryRegression ? "SUPORT" : (adaptive && domain && grv2Upper_(domain.EstatDomini) !== "SENSE_EVIDENCIA" ? grv2Upper_(domain.FaseRecomanada)
        : (initialDiagnostic ? grv2Upper_(initialDiagnostic.FaseRecomanada) : "BASE")));
  if (!temporaryRegression && level === promotedLevel && promotedLevel > 1 && !teacherLevel && !classLevelForced
    && !(adaptation && adaptation.FaseForcada) && !(initialDiagnostic && !highestDomain)
    && !grv2Rows_("Dades").some(function (row) {
      return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Text_(row.MissioUid) === grv2Text_(mission.MissioUid)
        && grv2Number_(row.NivellCurricular, 0) === promotedLevel;
    })) phase = "BASE";
  if (["SUPORT", "BASE", "REPTE"].indexOf(phase) < 0) phase = "BASE";
  return { mission: mission, assignment: assignment, adaptation: adaptation, domain: domain, level: level,
    phase: phase, promotedLevel: promotedLevel, temporaryRegression: temporaryRegression };
}

function grv2CompletedQuestionIds_(studentId, missionUid, level) {
  var result = {};
  grv2Rows_("Progres").forEach(function (row) {
    if (grv2Text_(row.AlumneId) !== grv2Text_(studentId) || grv2Text_(row.MissioUid) !== grv2Text_(missionUid)) return;
    var question = grv2Question_(row.PreguntaUid);
    if (question && grv2Number_(question.NivellCurricular, 0) === Number(level) && grv2Upper_(row.EstatActivitat) === "FINALITZADA") {
      result[grv2Text_(row.PreguntaUid)] = true;
    }
  });
  return result;
}

function grv2CompletedMissionQuestionIds_(studentId, missionUid) {
  var result = {};
  grv2Rows_("Progres").forEach(function (row) {
    if (grv2Text_(row.AlumneId) !== grv2Text_(studentId) || grv2Text_(row.MissioUid) !== grv2Text_(missionUid)
      || grv2Upper_(row.EstatActivitat) !== "FINALITZADA") return;
    if (grv2Question_(row.PreguntaUid)) result[grv2Text_(row.PreguntaUid)] = true;
  });
  return result;
}

function grv2PendingRecoveryQuestion_(studentId, missionUid, level, older, sessionId) {
  var missions = grv2Rows_("Missions");
  var current = missions.find(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(missionUid); });
  var currentOrder = grv2Number_(current && current.OrdreComu, 0);
  var attemptedHere = {};
  if (older && sessionId) grv2Rows_("Dades").forEach(function (row) {
    if (grv2Text_(row.AlumneId) === grv2Text_(studentId) && grv2Text_(row.SessioId) === grv2Text_(sessionId)
      && grv2Upper_(row.MotiuEnviament) === "RECUPERACIO_ANTIGA") {
      attemptedHere[grv2Text_(row.MissioUid) + "|" + grv2Text_(row.HabilitatId) + "|" + grv2Number_(row.NivellCurricular, 0)] = true;
    }
  });
  var recoveries = grv2Rows_("Recuperacions").filter(function (row) {
    if (grv2Text_(row.AlumneId) !== grv2Text_(studentId)
      || ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) < 0) return false;
    var sourceUid = grv2Text_(row.MissioOrigenUid);
    if (!older) return sourceUid === grv2Text_(missionUid) && grv2Number_(row.NivellCurricular, 0) === Number(level);
    var source = missions.find(function (mission) { return grv2Text_(mission.MissioUid) === sourceUid; });
    var incorporation = missions.find(function (mission) { return grv2Text_(mission.MissioUid) === grv2Text_(row.MissioIncorporacioUid); });
    return source && current && grv2Number_(source.OrdreComu, 0) < currentOrder
      && (!incorporation || grv2Number_(incorporation.OrdreComu, 0) <= currentOrder)
      && !attemptedHere[sourceUid + "|" + grv2Text_(row.HabilitatId) + "|" + grv2Number_(row.NivellCurricular, 0)];
  }).sort(function (a, b) {
    if (older) {
      var aMission = missions.find(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(a.MissioOrigenUid); });
      var bMission = missions.find(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(b.MissioOrigenUid); });
      var proximity = grv2Number_(bMission && bMission.OrdreComu, 0) - grv2Number_(aMission && aMission.OrdreComu, 0);
      if (proximity) return proximity;
    }
    return grv2Number_(b.Prioritat, 0) - grv2Number_(a.Prioritat, 0);
  });
  var questions = grv2Questions_();
  for (var index = 0; index < recoveries.length; index++) {
    var recovery = recoveries[index];
    var sourceMissionUid = grv2Text_(recovery.MissioOrigenUid);
    var sourceLevel = grv2Number_(recovery.NivellCurricular, 0);
    var completed = grv2CompletedQuestionIds_(studentId, sourceMissionUid, sourceLevel);
    var candidates = questions.filter(function (row) {
      return grv2Text_(row.MissioUid) === sourceMissionUid && grv2Text_(row.HabilitatId) === grv2Text_(recovery.HabilitatId)
        && grv2Number_(row.NivellCurricular, 0) === sourceLevel;
    });
    var question = candidates.find(function (row) { return !completed[grv2Text_(row.PreguntaUid)]; }) || candidates[0];
    if (question) return question;
  }
  return null;
}

function grv2OldRecoverySessionState_(studentId, sessionId, missionUid) {
  var attempts = grv2Rows_("Dades").filter(function (row) {
    return grv2Text_(row.AlumneId) === grv2Text_(studentId) && grv2Text_(row.SessioId) === grv2Text_(sessionId);
  });
  var oldCount = 0;
  var normalSinceOld = 0;
  attempts.forEach(function (row) {
    var reason = grv2Upper_(row.MotiuEnviament);
    if (reason === "RECUPERACIO_ANTIGA") { oldCount++; normalSinceOld = 0; }
    else if (grv2Text_(row.MissioUid) === grv2Text_(missionUid) && reason !== "RECUPERACIO_IMMEDIATA") normalSinceOld++;
  });
  return { oldCount: oldCount, normalSinceOld: normalSinceOld };
}

function grv2ConsumeIndividualAssignment_(assignment) {
  if (!assignment || grv2Upper_(assignment.Abast) !== "ALUMNE") return;
  var row = grv2RowsWithIndex_("Assignacions").find(function (item) { return grv2Text_(item.AssignacioId) === grv2Text_(assignment.AssignacioId); });
  if (row) grv2UpdateRow_("Assignacions", row._row, { Estat: "CONSUMIDA", Consumida: "SI", Fi: new Date() });
}

function grv2NextQuestion_(user, context) {
  var completed = grv2CompletedQuestionIds_(user.AlumneId, context.mission.MissioUid, context.level);
  var recoveryQuestion = grv2PendingRecoveryQuestion_(user.AlumneId, context.mission.MissioUid, context.level, false, context.sessionId);
  if (recoveryQuestion) return recoveryQuestion;
  var phaseOrder = [context.phase, "BASE", "SUPORT", "REPTE"].filter(function (phase, index, array) { return array.indexOf(phase) === index; });
  var questions = grv2Questions_().filter(function (row) {
    return grv2Text_(row.MissioUid) === grv2Text_(context.mission.MissioUid)
      && grv2Number_(row.NivellCurricular, 0) === Number(context.level)
      && !completed[grv2Text_(row.PreguntaUid)];
  });
  var lastAttempt = {};
  var reusing = context.temporaryRegression && !questions.length;
  if (reusing) {
    grv2Rows_("Dades").forEach(function (row, index) {
      if (grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Text_(row.MissioUid) === grv2Text_(context.mission.MissioUid)
        && grv2Number_(row.NivellCurricular, 0) === Number(context.level)) lastAttempt[grv2Text_(row.PreguntaUid)] = index + 1;
    });
    questions = grv2Questions_().filter(function (row) {
      return grv2Text_(row.MissioUid) === grv2Text_(context.mission.MissioUid)
        && grv2Number_(row.NivellCurricular, 0) === Number(context.level);
    });
  }
  questions.sort(function (a, b) {
    return phaseOrder.indexOf(grv2Upper_(a.FaseDUA)) - phaseOrder.indexOf(grv2Upper_(b.FaseDUA))
      || (reusing ? grv2Number_(lastAttempt[grv2Text_(a.PreguntaUid)], 0) - grv2Number_(lastAttempt[grv2Text_(b.PreguntaUid)], 0) : 0)
      || grv2Number_(a.PasDificultat, 0) - grv2Number_(b.PasDificultat, 0);
  });
  var sessionState = grv2OldRecoverySessionState_(user.AlumneId, context.sessionId, context.mission.MissioUid);
  if (context.sessionId && grv2Text_(context.classMissionUid) === grv2Text_(context.mission.MissioUid)
    && sessionState.oldCount < 3 && sessionState.normalSinceOld >= 4) {
    var oldRecovery = grv2PendingRecoveryQuestion_(user.AlumneId, context.mission.MissioUid, context.level, true, context.sessionId);
    if (oldRecovery) return oldRecovery;
  }
  return questions[0] || null;
}

function grv2ExerciseClient_(question, user, context) {
  if (!question) return null;
  var completed = grv2CompletedMissionQuestionIds_(user.AlumneId, context.mission.MissioUid);
  return { exerciseId: grv2Text_(question.PreguntaUid), questionId: grv2Text_(question.PreguntaUid), missionId: context.mission.MissioId,
    missionUid: context.mission.MissioUid, sourceMissionUid: grv2Text_(question.MissioUid), sourceSkillId: grv2Text_(question.HabilitatId),
    level: grv2Upper_(question.FaseDUA), levelLabel: "Nivell " + grv2Number_(question.NivellCurricular, context.level) + " · " + grv2Upper_(question.FaseDUA),
    curriculumLevel: grv2Number_(question.NivellCurricular, context.level), levelStep: Math.min(15, Object.keys(completed).length + 1), levelTotal: 15,
    questionHtml: grv2Text_(question.QuestioHtml),
    hint1: grv2Text_(question.Pista1), hint2: grv2Text_(question.Pista2), helpCount: 0,
    requiresProcedure: false, minimumSteps: 1, procedureMode: "DIRECTE", interactionType: grv2Text_(question.TipusInteraccio),
    interactionConfig: grv2ParseJson_(question.ConfiguracioInteraccioJSON, {}),
    explanation: { title: context.mission.Titol, rule: question.Pista1, example: grv2Text_(question.Pista2) },
    errorCode: (grv2ParseJson_(question.ErrorsDetectablesJSON, [""])[0] || "") };
}

/** Candidats descartables del context actual; la correcció i la tria final continuen al servidor. */
function grv2ExerciseBuffer_(user, context, firstQuestion) {
  if (!firstQuestion) return [];
  var completed = grv2CompletedQuestionIds_(user.AlumneId, context.mission.MissioUid, context.level);
  var phaseOrder = [context.phase, "BASE", "SUPORT", "REPTE"].filter(function (phase, index, all) { return all.indexOf(phase) === index; });
  var firstUid = grv2Text_(firstQuestion.PreguntaUid);
  return grv2Questions_().filter(function (row) {
    return grv2Text_(row.MissioUid) === grv2Text_(context.mission.MissioUid)
      && grv2Number_(row.NivellCurricular, 0) === Number(context.level)
      && grv2Text_(row.PreguntaUid) !== firstUid && !completed[grv2Text_(row.PreguntaUid)];
  }).sort(function (a, b) {
    return phaseOrder.indexOf(grv2Upper_(a.FaseDUA)) - phaseOrder.indexOf(grv2Upper_(b.FaseDUA))
      || grv2Number_(a.PasDificultat, 0) - grv2Number_(b.PasDificultat, 0);
  }).slice(0, 14).map(function (row, index) {
    var client = grv2ExerciseClient_(row, user, context);
    client.levelStep = Math.min(15, client.levelStep + index + 1);
    return client;
  });
}

function grv2MissionProgressState_(doneCount, started, masteryState, pendingRecovery) {
  var mastery = grv2Upper_(masteryState || "SENSE_EVIDENCIA");
  var completion = doneCount >= 15 ? "COMPLETED" : (started ? "IN_PROGRESS" : "NOT_STARTED");
  var learning = "EN_PROCES";
  if (mastery === "ADQUIRIDA" || mastery === "CONSOLIDADA") learning = "DOMINI_ASSOLIT";
  else if (completion === "COMPLETED") learning = pendingRecovery || mastery !== "EN_PROCES" ? "NECESSITA_REFORÇ" : "COMPLETADA";
  return { completionState: completion, masteryState: mastery, learningState: learning };
}

function grv2Bootstrap_(data) {
  var user = grv2Usuari_(data.studentId);
  var session = grv2Session_(user, data);
  var control = grv2ControlActual_(user.GrupId || GRV2_DEFAULT_GROUP_ID_);
  var diagnostic = grv2InitialDiagnosticFor_(user);
  if (diagnostic.requireDiagnostic) return { student: grv2StudentClient_(user), sessionId: session.SessioId,
    requireDiagnostic: true, diagnostic: diagnostic, classControl: grv2ControlClient_(control) };
  var context = grv2ContextAlumne_(user, control);
  context.sessionId = session.SessioId;
  context.classMissionUid = control.MissioUid;
  var question = grv2NextQuestion_(user, context);
  if (!question && context.assignment) {
    grv2ConsumeIndividualAssignment_(context.assignment);
    context = grv2ContextAlumne_(user, control);
    question = grv2NextQuestion_(user, context);
  }
  var allMissions = grv2Rows_("Missions").filter(function (row) { return grv2Upper_(row.EstatPublicacio) === "PUBLICADA"; })
    .sort(function (a, b) { return grv2Number_(a.OrdreComu, 0) - grv2Number_(b.OrdreComu, 0); });
  var publishedQuestions = {};
  grv2Questions_().forEach(function (row) { publishedQuestions[grv2Text_(row.PreguntaUid)] = true; });
  var progressByMission = {};
  grv2Rows_("Progres").forEach(function (row) {
    if (grv2Text_(row.AlumneId) !== grv2Text_(user.AlumneId)
      || !publishedQuestions[grv2Text_(row.PreguntaUid)]) return;
    var uid = grv2Text_(row.MissioUid);
    if (!progressByMission[uid]) progressByMission[uid] = { started: false, completed: {} };
    progressByMission[uid].started = true;
    if (grv2Upper_(row.EstatActivitat) === "FINALITZADA") progressByMission[uid].completed[grv2Text_(row.PreguntaUid)] = true;
  });
  var domainsBySkill = {};
  grv2Rows_("DominiHabilitats").forEach(function (row) {
    if (grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
      && grv2Number_(row.NivellCurricular, 0) === Number(context.level)) domainsBySkill[grv2Text_(row.HabilitatId)] = row;
  });
  var pendingByMission = {};
  grv2Rows_("Recuperacions").forEach(function (row) {
    if (grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
      && ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) >= 0) {
      pendingByMission[grv2Text_(row.MissioOrigenUid)] = true;
    }
  });
  var missions = allMissions.map(function (mission) {
    var isCurrent = grv2Text_(mission.MissioUid) === grv2Text_(context.mission.MissioUid);
    var progress = progressByMission[grv2Text_(mission.MissioUid)] || { started: false, completed: {} };
    var doneCount = Object.keys(progress.completed).length;
    var domain = domainsBySkill[grv2Text_(mission.HabilitatPrincipalId)];
    var client = grv2MissionClient_(mission, control);
    client.status = isCurrent ? "CURRENT" : (doneCount >= 15 ? "DONE" : "LOCKED");
    Object.assign(client, grv2MissionProgressState_(doneCount, progress.started, domain && domain.EstatDomini,
      Boolean(pendingByMission[grv2Text_(mission.MissioUid)])));
    return client;
  });
  var sector = grv2Find_("Sectors", "SectorUid", context.mission.SectorUid);
  return {
    student: grv2StudentClient_(user), sessionId: session.SessioId, trimester: grv2Number_(context.mission.Trimestre, 1),
    missions: missions, sector: sector ? grv2SectorClient_(sector) : null,
    currentMission: missions.find(function (mission) { return grv2Text_(mission.missionUid) === grv2Text_(context.mission.MissioUid); })
      || Object.assign(grv2MissionClient_(context.mission, control), grv2MissionProgressState_(0, false, "SENSE_EVIDENCIA", false)),
    currentExercise: grv2ExerciseClient_(question, user, context), exerciseBuffer: grv2ExerciseBuffer_(user, context, question),
    waitingForUnlock: false, waitingForContent: !question,
    stats: grv2Stats_(user, context), badges: grv2BadgesAlumne_(user.AlumneId), classGoal: grv2ClassGoal_(context.mission.MissioUid, user.GrupId),
    classControl: grv2ControlClient_(control), requireDiagnostic: false,
    adaptation: { curriculumLevel: context.level, phase: context.phase, engineActive: grv2FlagOn_("MotorAdaptatiuV2") }
  };
}

function grv2StudentClient_(user) {
  var unlocked = grv2Number_(user.CanvisAvatarDisponibles, 0) > 0 || Boolean(grv2Text_(user.Avatar));
  return { studentId: grv2Text_(user.AlumneId), name: grv2Text_(user.Nom), route: "BASE", avatar: grv2Text_(user.Avatar),
    avatarUnlocked: unlocked, avatarChanges: grv2Number_(user.CanvisAvatarDisponibles, 0),
    availableAvatars: unlocked ? Array.from({ length: 15 }, function (_, index) { return "avatar-" + String(index + 1).padStart(2, "0"); }) : [],
    curriculumLevel: grv2Number_(user.NivellGeneralRecomanat, 1) };
}

function grv2Stats_(user, context) {
  var completed = Object.keys(grv2CompletedMissionQuestionIds_(user.AlumneId, context.mission.MissioUid)).length;
  return { energy: grv2Number_(user.Energia, 0), streak: grv2Number_(user.Ratxa, 0), bestStreak: grv2Number_(user.MillorRatxa, 0),
    progress: Math.round(Math.min(15, completed) / 15 * 100), completed: completed, target: 15 };
}

function grv2BadgesAlumne_(studentId) {
  var definitions = {};
  grv2Rows_("Insignies").forEach(function (row) { definitions[grv2Text_(row.InsigniaId)] = row; });
  return grv2Rows_("InsigniesAlumnes").filter(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(studentId); })
    .map(function (row) { var definition = definitions[grv2Text_(row.InsigniaId)] || {}; return { badgeId: row.InsigniaId, title: definition.Nom || row.InsigniaId,
      description: definition.Descripcio || "", icon: definition.Icona || "🏅", count: 1 }; });
}

function grv2ClassGoal_(missionUid, groupId) {
  var correct = grv2Rows_("Dades").filter(function (row) { return grv2Text_(row.GrupId) === grv2Text_(groupId)
    && grv2Text_(row.MissioUid) === grv2Text_(missionUid) && grv2Boolean_(row.Correcta); }).length;
  return { title: "Energia de la classe", value: Math.min(100, correct * 2), target: 100 };
}

function grv2NormalizeAnswer_(value) {
  return grv2Text_(value).toLowerCase().replace(/\s+/g, " ").replace(/\./g, ",").replace(/-/g, "−");
}

function grv2Correct_(received, expected) {
  var left = grv2NormalizeAnswer_(received);
  var right = grv2NormalizeAnswer_(expected);
  if (left === right) return true;
  var leftNumber = Number(left.replace(",", ".").replace("−", "-"));
  var rightNumber = Number(right.replace(",", ".").replace("−", "-"));
  return isFinite(leftNumber) && isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) < 1e-9;
}

function grv2EnviarResposta_(data) {
  return grv2WithScriptLock_(function () {
    var user = grv2Usuari_(data.studentId);
    var submissionId = grv2Text_(data.submissionId || data.clientSubmissionId);
    if (!submissionId) throw new Error("Falta l'identificador idempotent de l'enviament.");
    var duplicate = grv2Find_("Dades", "ClientSubmissionId", submissionId);
    if (duplicate) return grv2SubmitResponse_(user, duplicate, data, true);
    var question = grv2Question_(data.exerciseId || data.questionId);
    if (!question) throw new Error("La pregunta ja no existeix en el catàleg actiu.");
    var mission = grv2MissionByAnyId_(question.MissioUid);
    var control = grv2ControlActual_(user.GrupId || GRV2_DEFAULT_GROUP_ID_);
    var activeContext = grv2ContextAlumne_(user, control);
    var recovery = grv2Rows_("Recuperacions").find(function (row) {
      return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Text_(row.MissioOrigenUid) === grv2Text_(question.MissioUid)
        && grv2Text_(row.HabilitatId) === grv2Text_(question.HabilitatId)
        && grv2Number_(row.NivellCurricular, 0) === grv2Number_(question.NivellCurricular, 0)
        && ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) >= 0;
    });
    var isOldRecovery = recovery && grv2Text_(activeContext.mission.MissioUid) === grv2Text_(control.MissioUid)
      && grv2Text_(question.MissioUid) !== grv2Text_(control.MissioUid);
    var isImmediateRecovery = recovery && grv2Text_(question.MissioUid) === grv2Text_(activeContext.mission.MissioUid);
    var correct = grv2Correct_(data.answer, question.RespostaEsperada);
    var helpCount = Math.max(0, grv2Number_(data.helpCount, 0));
    var autonomy = helpCount === 0 ? "AUTONOMA" : (helpCount === 1 ? "AMB_PISTA" : (helpCount === 2 ? "AMB_SOLUCIO" : "AMB_DOCENT"));
    var isEvidence = ["PRACTICA", "COMPROVACIO", "CONSOLIDACIO"].indexOf(grv2Upper_(question.RolDidactic)) >= 0;
    var attempt = { IntentId: grv2Uuid_("INT-"), ClientSubmissionId: submissionId, AlumneId: user.AlumneId, GrupId: user.GrupId,
      SessioId: grv2Text_(data.sessionId), SessioClasseId: "", CatalogId: question.CatalogId, PreguntaUid: question.PreguntaUid,
      PreguntaId: question.ID, VersioPregunta: question.VersioPregunta, MissioUid: question.MissioUid, HabilitatId: question.HabilitatId,
      NivellCurricular: question.NivellCurricular, FaseDUA: question.FaseDUA, FamiliaVariantId: question.FamiliaVariantId,
      RolDidactic: question.RolDidactic, QuestioHtmlSnapshot: question.QuestioHtml, RespostaEsperadaSnapshot: question.RespostaEsperada,
      RespostaAlumne: grv2Text_(data.answer), Correcta: correct ? "SI" : "NO", Percentatge: correct ? 1 : 0, Nota10: correct ? 10 : 0,
      EstatCorreccio: correct ? "CORRECTA" : "INCORRECTA", RevisioDocent: "NO", TipusError: correct ? "" : grv2ErrorCode_(question),
      PrimerPasErroni: "", Retroalimentacio: correct ? "Correcte. Continua amb el mateix procés." : "Revisa el model i resol una variant equivalent.",
      MotiuEnviament: isOldRecovery ? "RECUPERACIO_ANTIGA" : (isImmediateRecovery ? "RECUPERACIO_IMMEDIATA" : grv2Text_(data.reason || "normal")),
      NombreAjudes: helpCount, Autonomia: autonomy,
      EsEvidencia: isEvidence ? "SI" : "NO", ForcaEvidencia: question.ForcaEvidencia, GameOnly: "NO",
      TempsRespostaMs: Math.max(0, grv2Number_(data.responseTimeMs, 0)), CriterisJSON: question.CriterisJSON,
      DataServidor: new Date(), SchemaVersion: 2 };
    grv2Append_("Dades", attempt);
    grv2FinalitzarProgres_(user, question, attempt, correct, helpCount, data.answer);
    var domain = grv2RebuildDomain_(user.AlumneId, question.HabilitatId, question.NivellCurricular);
    grv2UpdateRecovery_(user, mission, question, correct, domain, attempt);
    grv2UpdateUserAfterAttempt_(user, correct);
    return grv2SubmitResponse_(grv2Usuari_(user.AlumneId), attempt, data, false);
  });
}

function grv2ErrorCode_(question) {
  return grv2ParseJson_(question.ErrorsDetectablesJSON, [grv2Text_(question.HabilitatId) + "_ERROR"])[0] || "ERROR_NO_CLASSIFICAT";
}

function grv2FinalitzarProgres_(user, question, attempt, correct, helpCount, answer) {
  var rows = grv2RowsWithIndex_("Progres");
  var progress = rows.find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
    && grv2Text_(row.PreguntaUid) === grv2Text_(question.PreguntaUid); });
  var changes = { EstatActivitat: "FINALITZADA", NombreIntents: grv2Number_(progress && progress.NombreIntents, 0) + 1,
    NombreAjudes: helpCount, RespostaActual: grv2Text_(answer), UltimIntentId: attempt.IntentId,
    VariantPendentUid: correct ? "" : grv2EquivalentVariant_(user.AlumneId, question), FinalitzadaEn: new Date(), UltimaActualitzacio: new Date() };
  if (progress) grv2UpdateRow_("Progres", progress._row, changes);
  else grv2Append_("Progres", Object.assign({ ProgresId: grv2Uuid_("PRO-"), AlumneId: user.AlumneId, GrupId: user.GrupId,
    MissioUid: question.MissioUid, PreguntaUid: question.PreguntaUid, IniciadaEn: new Date(), SchemaVersion: 2 }, changes));
}

function grv2EquivalentVariant_(studentId, question) {
  var completed = grv2CompletedQuestionIds_(studentId, question.MissioUid, question.NivellCurricular);
  var equivalent = grv2Questions_().find(function (row) { return grv2Text_(row.FamiliaVariantId) === grv2Text_(question.FamiliaVariantId)
    && grv2Text_(row.PreguntaUid) !== grv2Text_(question.PreguntaUid) && !completed[grv2Text_(row.PreguntaUid)]; });
  return equivalent ? equivalent.PreguntaUid : "";
}

function grv2RebuildDomain_(studentId, skillId, level) {
  var attempts = grv2Rows_("Dades").filter(function (row) {
    return grv2Text_(row.AlumneId) === grv2Text_(studentId) && grv2Text_(row.HabilitatId) === grv2Text_(skillId)
      && grv2Number_(row.NivellCurricular, 0) === Number(level) && grv2Boolean_(row.EsEvidencia) && !grv2Boolean_(row.GameOnly);
  }).sort(function (a, b) { return new Date(a.DataServidor) - new Date(b.DataServidor); });
  var distinct = [];
  for (var index = attempts.length - 1; index >= 0 && distinct.length < 5; index--) {
    if (!distinct.some(function (row) { return grv2Text_(row.PreguntaUid) === grv2Text_(attempts[index].PreguntaUid); })) distinct.unshift(attempts[index]);
  }
  var correctCount = distinct.filter(function (row) { return grv2Boolean_(row.Correcta); }).length;
  var lastTwo = distinct.slice(-2);
  var lastTwoCorrect = lastTwo.length === 2 && lastTwo.every(function (row) { return grv2Boolean_(row.Correcta); });
  var autonomousCorrect = attempts.filter(function (row) { return grv2Boolean_(row.Correcta) && grv2Upper_(row.Autonomia) === "AUTONOMA"; }).length;
  var guidedCorrect = attempts.filter(function (row) { return grv2Boolean_(row.Correcta); }).length;
  var strong = attempts.filter(function (row) { return grv2Boolean_(row.Correcta) && grv2Upper_(row.ForcaEvidencia) === "FORTA"
    && ["AUTONOMA", "AMB_PISTA"].indexOf(grv2Upper_(row.Autonomia)) >= 0; });
  var strongSessions = {};
  strong.forEach(function (row) { strongSessions[grv2Text_(row.SessioId) || grv2Text_(row.IntentId)] = true; });
  var state = attempts.length ? "PRACTICANT" : "SENSE_EVIDENCIA";
  if (autonomousCorrect >= 1 || guidedCorrect >= 2) state = "INICIADA";
  if (distinct.length >= 5 && correctCount >= 3) state = "EN_PROCES";
  if (distinct.length >= 5 && correctCount >= 4 && lastTwoCorrect && strong.length >= 1) state = "ADQUIRIDA";
  if (state === "ADQUIRIDA" && Object.keys(strongSessions).length >= 2) state = "CONSOLIDADA";
  var recentErrors = distinct.length - correctCount;
  var phase = recentErrors >= 2 ? "SUPORT" : (["ADQUIRIDA", "CONSOLIDADA"].indexOf(state) >= 0 ? "REPTE" : "BASE");
  var existing = grv2RowsWithIndex_("DominiHabilitats").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(studentId)
    && grv2Text_(row.HabilitatId) === grv2Text_(skillId) && grv2Number_(row.NivellCurricular, 0) === Number(level); });
  var values = { EstatDomini: state, FaseRecomanada: phase, EvidenciesFortes: strong.length, AciertsRecents: correctCount,
    ErrorsRecents: recentErrors, UltimErrorCode: attempts.length && !grv2Boolean_(attempts[attempts.length - 1].Correcta) ? attempts[attempts.length - 1].TipusError : "",
    UltimaEvidenciaEn: attempts.length ? attempts[attempts.length - 1].DataServidor : "", ProximaRevisioEn: "",
    MotiuCalcul: "Reconstruït des de Dades; " + correctCount + "/" + distinct.length + " variants recents.", VersioCalcul: "2.1.0",
    ActualitzatEn: new Date(), SchemaVersion: 2 };
  if (existing) grv2UpdateRow_("DominiHabilitats", existing._row, values);
  else grv2Append_("DominiHabilitats", Object.assign({ DominiId: grv2Uuid_("DOM-"), AlumneId: studentId, HabilitatId: skillId,
    NivellCurricular: level }, values));
  return Object.assign({}, existing || {}, values);
}

function grv2UpdateRecovery_(user, mission, question, correct, domain, attempt) {
  var rows = grv2RowsWithIndex_("Recuperacions");
  var recoveryAttempt = ["RECUPERACIO_ANTIGA", "RECUPERACIO_IMMEDIATA"].indexOf(grv2Upper_(attempt && attempt.MotiuEnviament)) >= 0;
  var pending = rows.find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
    && grv2Text_(row.HabilitatId) === grv2Text_(question.HabilitatId) && grv2Number_(row.NivellCurricular, 0) === grv2Number_(question.NivellCurricular, 0)
    && (!recoveryAttempt || grv2Text_(row.MissioOrigenUid) === grv2Text_(question.MissioUid))
    && ["PENDENT", "PROGRAMADA", "INJECTADA"].indexOf(grv2Upper_(row.Estat)) >= 0; });
  if (!correct && !pending) {
    grv2Append_("Recuperacions", { RecuperacioId: grv2Uuid_("REC-"), AlumneId: user.AlumneId, HabilitatId: question.HabilitatId,
      NivellCurricular: question.NivellCurricular, MissioOrigenUid: question.MissioUid, MissioIncorporacioUid: mission.MissioUid,
      FaseRecomanada: "SUPORT", ErrorCode: grv2ErrorCode_(question), Prioritat: 100, Estat: "PENDENT", Intents: 1,
      CreadaEn: new Date(), ProgramadaEn: "", ResoltaEn: "", AvancDocentId: "", Motiu: "Error en habilitat essencial", SchemaVersion: 2 });
  } else if (pending) {
    if (grv2Upper_(attempt && attempt.MotiuEnviament) === "RECUPERACIO_ANTIGA") {
      var resolved = correct && grv2Upper_(attempt.Autonomia) === "AUTONOMA";
      grv2UpdateRow_("Recuperacions", pending._row, { Estat: resolved ? "RESOLTA" : "PROGRAMADA",
        Intents: grv2Number_(pending.Intents, 0) + 1, ProgramadaEn: resolved ? "" : new Date(), ResoltaEn: resolved ? new Date() : "" });
      return;
    }
    var mastered = ["ADQUIRIDA", "CONSOLIDADA"].indexOf(grv2Upper_(domain.EstatDomini)) >= 0;
    grv2UpdateRow_("Recuperacions", pending._row, { Estat: mastered ? "RESOLTA" : "INJECTADA",
      Intents: grv2Number_(pending.Intents, 0) + 1, ResoltaEn: mastered ? new Date() : "" });
  }
}

function grv2UpdateUserAfterAttempt_(user, correct) {
  var row = grv2RowsWithIndex_("Usuaris").find(function (item) { return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId); });
  if (!row) return;
  var streak = correct ? grv2Number_(row.Ratxa, 0) + 1 : 0;
  var changes = { Ratxa: streak, MillorRatxa: Math.max(streak, grv2Number_(row.MillorRatxa, 0)),
    Energia: grv2Number_(row.Energia, 0) + (correct ? 2 : 0), UltimaSessio: new Date() };
  if (correct && grv2Number_(row.CanvisAvatarDisponibles, 0) < 1 && !grv2Text_(row.Avatar)) changes.CanvisAvatarDisponibles = 1;
  grv2UpdateRow_("Usuaris", row._row, changes);
}

function grv2SubmitResponse_(user, attempt, data, duplicate) {
  var control = grv2ControlActual_(user.GrupId || GRV2_DEFAULT_GROUP_ID_);
  var context = grv2ContextAlumne_(user, control);
  context.sessionId = grv2Text_(data.sessionId || attempt.SessioId);
  context.classMissionUid = control.MissioUid;
  var next = grv2NextQuestion_(user, context);
  if (!next && context.assignment) {
    grv2ConsumeIndividualAssignment_(context.assignment);
    context = grv2ContextAlumne_(user, control);
    next = grv2NextQuestion_(user, context);
  }
  var correct = grv2Boolean_(attempt.Correcta);
  if (grv2Boolean_(data.compact)) return {
    correct: correct, correctionStatus: attempt.EstatCorreccio, feedback: attempt.Retroalimentacio,
    mustRetry: false, needsTeacherReview: false, duplicate: duplicate,
    nextExercise: grv2ExerciseClient_(next, user, context), exerciseBuffer: grv2ExerciseBuffer_(user, context, next),
    missionUid: grv2Text_(context.mission.MissioUid), curriculumLevel: context.level, phase: context.phase,
    waitingForContent: !next, stats: grv2Stats_(user, context), classGoal: grv2ClassGoal_(context.mission.MissioUid, user.GrupId),
    avatarUnlocked: grv2StudentClient_(user).avatarUnlocked, avatarChanges: grv2StudentClient_(user).avatarChanges,
    avatarChoiceGranted: correct && grv2Number_(user.CanvisAvatarDisponibles, 0) > 0
  };
  var missionPayload = grv2Bootstrap_({ studentId: user.AlumneId, sessionId: data.sessionId });
  return { correct: correct, correctionStatus: attempt.EstatCorreccio, feedback: attempt.Retroalimentacio,
    mustRetry: false, needsTeacherReview: false, duplicate: duplicate, nextExercise: grv2ExerciseClient_(next, user, context),
    missions: missionPayload.missions, currentMission: missionPayload.currentMission,
    sector: grv2SectorClient_(grv2Find_("Sectors", "SectorUid", context.mission.SectorUid) || {}),
    waitingForUnlock: false, waitingForContent: !next, stats: grv2Stats_(user, context), badges: grv2BadgesAlumne_(user.AlumneId),
    classGoal: grv2ClassGoal_(context.mission.MissioUid, user.GrupId), avatarUnlocked: grv2StudentClient_(user).avatarUnlocked,
    avatarChanges: grv2StudentClient_(user).avatarChanges, availableAvatars: grv2StudentClient_(user).availableAvatars,
    avatarChoiceGranted: correct && grv2Number_(user.CanvisAvatarDisponibles, 0) > 0 };
}

function grv2DemanarAjuda_(data) {
  var user = grv2Usuari_(data.studentId);
  var question = grv2Question_(data.exerciseId);
  if (!question) throw new Error("No s'ha trobat l'exercici.");
  var progress = grv2RowsWithIndex_("Progres").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
    && grv2Text_(row.PreguntaUid) === grv2Text_(question.PreguntaUid); });
  var level = grv2Number_(progress && progress.NombreAjudes, 0) + 1;
  if (progress) grv2UpdateRow_("Progres", progress._row, { NombreAjudes: level, UltimaActualitzacio: new Date() });
  else grv2Append_("Progres", { ProgresId: grv2Uuid_("PRO-"), AlumneId: user.AlumneId, GrupId: user.GrupId, MissioUid: question.MissioUid,
    PreguntaUid: question.PreguntaUid, EstatActivitat: "EN_CURS", NombreIntents: 0, NombreAjudes: level, RespostaActual: grv2Text_(data.answer),
    UltimIntentId: "", VariantPendentUid: "", IniciadaEn: new Date(), FinalitzadaEn: "", UltimaActualitzacio: new Date(), SchemaVersion: 2 });
  var message = level === 1 ? question.Pista1 : (level === 2 ? question.Pista2 : question.SolucioModel);
  return { level: level, source: "CATALOG", message: grv2Text_(message), nextQuestion: "Ara repeteix exactament el procés amb els nombres de la pregunta.", needsTeacher: level >= 3 };
}

function grv2GuardarAvatar_(data) {
  var user = grv2Usuari_(data.studentId);
  var avatar = grv2Text_(data.avatar);
  if (!/^avatar-(0[1-9]|1[0-5])$/.test(avatar)) throw new Error("Avatar no vàlid.");
  var row = grv2RowsWithIndex_("Usuaris").find(function (item) { return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId); });
  var changes = grv2Number_(row.CanvisAvatarDisponibles, 0);
  if (!grv2Text_(row.Avatar) && changes < 1) throw new Error("Encara no has desbloquejat la tria d'avatar.");
  if (grv2Text_(row.Avatar) !== avatar && changes < 1) throw new Error("No tens canvis d'avatar disponibles.");
  grv2UpdateRow_("Usuaris", row._row, { Avatar: avatar, CanvisAvatarDisponibles: Math.max(0, changes - (grv2Text_(row.Avatar) === avatar ? 0 : 1)) });
  return { avatar: avatar, avatarChanges: Math.max(0, changes - 1) };
}

function grv2ForcarFase_(data) {
  return grv2CrearAdaptacio_(data.studentId, "", "", "", grv2Upper_(data.route), "Canvi docent de fase DUA");
}

function grv2ForcarNivellsMissio_(data) {
  var levels = Array.isArray(data.levels) ? data.levels : [];
  var phase = levels.length ? grv2Upper_(levels[0]) : "BASE";
  var mission = grv2MissionByAnyId_(data.missionId);
  if (!mission) throw new Error("Missió no trobada.");
  return grv2CrearAdaptacio_(data.studentId, mission.MissioUid, mission.HabilitatPrincipalId, data.curriculumLevel || "", phase, "Pla docent de missió");
}

function grv2CrearAdaptacio_(studentId, missionUid, skillId, level, phase, reason) {
  grv2Usuari_(studentId);
  if (phase && ["SUPORT", "BASE", "REPTE"].indexOf(phase) < 0) throw new Error("Fase DUA no vàlida.");
  grv2Append_("AdaptacionsDocents", { AdaptacioId: grv2Uuid_("ADA-"), AlumneId: studentId, MissioUid: missionUid,
    HabilitatId: skillId, NivellForcat: level, FaseForcada: phase, Inici: new Date(), Fi: "", Motiu: reason,
    Activa: "SI", ProfessorId: GRV2_DEFAULT_TEACHER_ID_, CreadaEn: new Date(), SchemaVersion: 2 });
  return { status: "saved", route: phase, levels: phase ? [phase] : [], message: "Adaptació docent guardada." };
}

function grv2CrearAssignacioDocent_(data) {
  var scope = grv2Upper_(data.scope || data.abast);
  if (scope === "TOTS") scope = "GRUP";
  if (["GRUP", "ALUMNE"].indexOf(scope) < 0) throw new Error("Abast no vàlid.");
  var type = grv2Upper_(data.type || "MISSIO");
  var content = grv2Text_(data.contentId || data.contentUid);
  var mission = grv2MissionByAnyId_(content);
  if (mission) content = mission.MissioUid;
  if (scope === "GRUP" && type === "MISSIO" && mission) {
    return grv2ControlClasseSet_({ groupId: data.groupId || GRV2_DEFAULT_GROUP_ID_, missionUid: mission.MissioUid,
      macroLevel: data.curriculumLevel || 1, command: "ACTIVITY" }, false);
  }
  var assignment = { AssignacioId: grv2Uuid_("ASS-"), Abast: scope, GrupId: grv2Text_(data.groupId || GRV2_DEFAULT_GROUP_ID_),
    DestinatariId: scope === "ALUMNE" ? grv2Text_(data.recipientId) : "", Tipus: type, ContingutUid: content,
    Prioritat: grv2Number_(data.priority, 100), Origen: "DOCENT", Motiu: grv2Text_(data.reason || "Assignació docent"),
    SessioClasseId: "", Inici: new Date(), Fi: "", Estat: "ACTIVA", Consumida: "NO", CreadaEn: new Date(), SchemaVersion: 2 };
  grv2Append_("Assignacions", assignment);
  return { assignment: assignment };
}

function grv2DomainValue_(state) {
  var config = grv2Config_();
  var map = { PRACTICANT: grv2Number_(config.ValorDominiPracticant, 2.5), INICIADA: grv2Number_(config.ValorDominiIniciada, 4),
    EN_PROCES: grv2Number_(config.ValorDominiEnProces, 5.5), ADQUIRIDA: grv2Number_(config.ValorDominiAdquirida, 7.5),
    CONSOLIDADA: grv2Number_(config.ValorDominiConsolidada, 9.5) };
  return map[grv2Upper_(state)] || 0;
}

function grv2Assessment_(studentId) {
  var domains = grv2Rows_("DominiHabilitats").filter(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(studentId); });
  var mappings = grv2Rows_("MapaHabilitatCriteri").filter(function (row) { return grv2Boolean_(row.Actiu); });
  var criteria = grv2Rows_("Criteris").filter(function (row) { return grv2Boolean_(row.Actiu); });
  var competencies = grv2Rows_("Competencies").filter(function (row) { return grv2Boolean_(row.Activa); });
  var criterionResults = criteria.map(function (criterion) {
    var skillIds = mappings.filter(function (map) { return grv2Text_(map.CriteriId) === grv2Text_(criterion.CriteriId); }).map(function (map) { return grv2Text_(map.HabilitatId); });
    var covered = domains.filter(function (domain) { return skillIds.indexOf(grv2Text_(domain.HabilitatId)) >= 0 && grv2Upper_(domain.EstatDomini) !== "SENSE_EVIDENCIA"; });
    var score = covered.length ? covered.reduce(function (sum, domain) { return sum + grv2DomainValue_(domain.EstatDomini); }, 0) / covered.length : null;
    return { criterionId: criterion.CriteriId, competencyId: criterion.CompetenciaEspecificaId, score: score,
      coverage: skillIds.length ? covered.length / skillIds.length : 0, state: score === null ? "Sense evidència" : (score >= 9 ? "Consolidada" : score >= 7 ? "Adquirida" : score >= 5 ? "En procés" : "Iniciada") };
  });
  var compResults = competencies.map(function (competency) {
    var rows = criterionResults.filter(function (row) { return grv2Text_(row.competencyId) === grv2Text_(competency.CompetenciaId) && row.score !== null; });
    var score = rows.length ? rows.reduce(function (sum, row) { return sum + row.score; }, 0) / rows.length : 0;
    return { id: competency.CompetenciaId, label: competency.Nom, weight: grv2Number_(criteria.find(function (criterion) { return grv2Text_(criterion.CompetenciaEspecificaId) === grv2Text_(competency.CompetenciaId); }) && criteria.find(function (criterion) { return grv2Text_(criterion.CompetenciaEspecificaId) === grv2Text_(competency.CompetenciaId); }).Pes, 0),
      score: Math.round(score * 10) / 10, evidence: rows.length, state: rows.length ? (score >= 9 ? "Consolidada" : score >= 7 ? "Adquirida" : score >= 5 ? "En procés" : "Iniciada") : "Sense evidència" };
  });
  var present = compResults.filter(function (row) { return row.evidence > 0; });
  var denominator = present.reduce(function (sum, row) { return sum + row.weight; }, 0);
  var grade = denominator ? present.reduce(function (sum, row) { return sum + row.score * row.weight; }, 0) / denominator : null;
  var totalCriteria = criteria.length;
  var coveredCriteria = criterionResults.filter(function (row) { return row.score !== null; }).length;
  var recommendation = grv2ReportRecommendation_(studentId);
  return { grade: grade === null ? null : Math.round(grade * 10) / 10, competencies: compResults, criteria: criterionResults,
    evidenceCount: domains.reduce(function (sum, row) { return sum + grv2Number_(row.EvidenciesFortes, 0); }, 0),
    coverage: totalCriteria ? Math.round(coveredCriteria / totalCriteria * 100) : 0, needsTeacherValidation: true,
    recommendation: recommendation };
}

function grv2AvaluacioApi_(data) {
  grv2Usuari_(data.studentId);
  return { assessment: grv2Assessment_(data.studentId) };
}

function grv2LlistarRevisions_() {
  return { reviews: grv2Rows_("RevisionsDocents").filter(function (row) { return grv2Upper_(row.Estat) === "PENDENT"; }).map(function (row) {
    return { reviewId: row.RevisioId, studentId: row.AlumneId, missionId: grv2MissioIdCurt_(row.MissioUid), exerciseId: row.PreguntaUid,
      question: row.QuestioHtmlSnapshot, answer: row.RespostaAlumne, solutionModel: row.SolucioModel, reason: row.Motiu };
  }) };
}

function grv2DecidirRevisio_(data) {
  var row = grv2RowsWithIndex_("RevisionsDocents").find(function (item) { return grv2Text_(item.RevisioId) === grv2Text_(data.reviewId); });
  if (!row) throw new Error("Revisió no trobada.");
  grv2UpdateRow_("RevisionsDocents", row._row, { Estat: "RESOLTA", DecisioDocent: grv2Upper_(data.decision),
    ComentariDocent: grv2Text_(data.comment), DataDecisio: new Date(), ProfessorId: GRV2_DEFAULT_TEACHER_ID_ });
  return { status: "resolved" };
}

function grv2LlistarDiagnostics_() {
  var users = {};
  grv2Rows_("Usuaris").forEach(function (row) { users[grv2Text_(row.AlumneId)] = row; });
  return { diagnostics: grv2Rows_("Diagnostic").map(function (row) { return { diagnosisId: row.DiagnosiId, studentId: row.AlumneId,
    studentName: users[grv2Text_(row.AlumneId)] ? users[grv2Text_(row.AlumneId)].Nom : row.AlumneId,
    missionId: grv2MissioIdCurt_(row.MissioIncorporacioUid), route: row.FaseRecomanada, blockScore10: row.NotaBloc10,
    exerciseScore10: row.NotaExercici10, mastery: row.Domini, confidence: row.Confianca, date: row.Data,
    strengths: grv2ParseJson_(row.FortalesesJSON, []), difficulties: grv2ParseJson_(row.DificultatsJSON, []), recommendation: row.Recomanacio }; }) };
}

function grv2DiagnosiArribada_(data) {
  var user = grv2Usuari_(data.studentId);
  var answers = Array.isArray(data.answers) ? data.answers : [];
  var correct = answers.filter(function (answer) { return Boolean(answer.correct); }).length;
  var score = answers.length ? correct / answers.length : 0;
  var control = grv2ControlActual_(user.GrupId);
  var missions = grv2Rows_("Missions").sort(function (a, b) { return grv2Number_(a.OrdreComu, 0) - grv2Number_(b.OrdreComu, 0); });
  var currentIndex = Math.max(0, missions.findIndex(function (row) { return grv2Text_(row.MissioUid) === grv2Text_(control.MissioUid); }));
  var bridgeIndex = score >= 0.75 ? currentIndex : (score >= 0.45 ? Math.max(0, currentIndex - 2) : Math.max(0, currentIndex - 5));
  var bridge = missions[bridgeIndex] || missions[0];
  var level = score >= 0.85 ? 2 : 1;
  var phase = score >= 0.75 ? "BASE" : "SUPORT";
  var diagnosis = { DiagnosiId: grv2Uuid_("DIA-"), AlumneId: user.AlumneId, GrupId: user.GrupId, TipusDiagnosi: "ARRIBADA",
    HabilitatId: bridge.HabilitatPrincipalId, Bloc: grv2MissioIdCurt_(bridge.SectorUid), PreguntaUid: "", NotaExercici10: Math.round(score * 100) / 10,
    NotaBloc10: Math.round(score * 100) / 10, Domini: score >= 0.75 ? "EN_PROCES" : "NECESSITA_REFORC",
    FortalesesJSON: JSON.stringify(score >= 0.75 ? ["Prerrequisits bàsics disponibles"] : []),
    DificultatsJSON: JSON.stringify(score < 0.75 ? [{ code: "PREREQUISITS", label: "Prerrequisits de la missió comuna", confidence: 1 - score }] : []),
    Recomanacio: "Començar en " + bridge.MissioId + " amb fase " + phase, Confianca: answers.length ? Math.min(1, answers.length / 10) : 0,
    NivellRecomanat: level, FaseRecomanada: phase, MissioIncorporacioUid: bridge.MissioUid, Estat: "COMPLETADA", Data: new Date(), ValidaFins: "", SchemaVersion: 2 };
  grv2Append_("Diagnostic", diagnosis);
  grv2CrearAssignacioDocent_({ scope: "ALUMNE", recipientId: user.AlumneId, type: "PONT", contentUid: bridge.MissioUid, priority: 2000, reason: "Diagnosi d'arribada" });
  var userRow = grv2RowsWithIndex_("Usuaris").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId); });
  if (userRow) grv2UpdateRow_("Usuaris", userRow._row, { EstatDiagnosi: "COMPLETADA", NivellGeneralRecomanat: level });
  return { result: { missionId: bridge.MissioId, phase: phase, level: level, joinMissionId: grv2MissioIdCurt_(control.MissioUid), score: score }, questionCount: answers.length };
}


// Ported verbatim from DiagnosticV2.gs.
/** Diagnòstic inicial curt: una sessió a Diagnostic, separada d'intents i domini. */

function grv2HasAcademicHistory_(studentId) {
  var id = grv2Text_(studentId);
  return grv2Rows_("Dades").some(function (row) {
    return grv2Text_(row.AlumneId) === id && !grv2Boolean_(row.GameOnly)
      && grv2Upper_(row.RolDidactic) !== "DIAGNOSTIC";
  }) || grv2Rows_("DominiHabilitats").some(function (row) {
    return grv2Text_(row.AlumneId) === id && grv2Upper_(row.EstatDomini) !== "SENSE_EVIDENCIA";
  });
}

function grv2MigrateDiagnosticSchema_() {
  var sheet = grv2Full_("Diagnostic"), headers = grv2Capcaleres_(sheet);
  if (headers.indexOf("DetallJSON") >= 0) return;
  if (headers[headers.length - 1] !== "SchemaVersion") throw new Error("Capçaleres de Diagnostic inesperades; cal revisió docent.");
  sheet.getRange(1, headers.length + 1).setValue("DetallJSON");
  grv2InvalidateRows_("Diagnostic");
  var stateColumn = grv2Capcaleres_(sheet).indexOf("Estat") + 1;
  sheet.getRange(2, stateColumn, Math.max(1, sheet.getMaxRows() - 1), 1)
    .setDataValidation(grv2ConstruirValidacio_(GRV2_VALIDACIONS_.Diagnostic.Estat));
  var config = grv2RowsWithIndex_("Configuracio").find(function (row) { return grv2Text_(row.Clau) === "SchemaHash"; });
  if (config && grv2Text_(config.Valor) !== grv2HashEsquema_())
    grv2UpdateRow_("Configuracio", config._row, { Valor: grv2HashEsquema_() });
}

function grv2DiagnosticBank_() {
  var cache = typeof CacheService === "undefined" ? null : CacheService.getScriptCache();
  var keys = ["grv2-diag-bank-v1-n1", "grv2-diag-bank-v1-n2", "grv2-diag-bank-v1-n3"];
  if (cache) try {
    var cached = cache.getAll(keys);
    if (keys.every(function (key) { return cached[key]; })) {
      try { return keys.reduce(function (all, key) { return all.concat(JSON.parse(cached[key])); }, []); }
      catch (error) { /* Si s'expulsa o corromp una entrada, es rellegeix el catàleg. */ }
    }
  } catch (error) { /* Si la cache falla, el banc es llig de Sheets. */ }
  var order = {};
  grv2Rows_("Missions").forEach(function (mission) { order[grv2Text_(mission.MissioUid)] = grv2Number_(mission.OrdreComu, 999); });
  var bank = grv2Questions_().filter(function (row) {
    return [1,2,3].indexOf(grv2Number_(row.NivellCurricular, 0)) >= 0
      && grv2Upper_(row.FaseDUA) === "BASE"
      && ["PRACTICA", "COMPROVACIO"].indexOf(grv2Upper_(row.RolDidactic)) >= 0
      && grv2Boolean_(row.EsEssencial) && grv2Text_(row.RespostaEsperada);
  }).sort(function (a, b) {
    return (order[grv2Text_(a.MissioUid)] || 999) - (order[grv2Text_(b.MissioUid)] || 999)
      || Math.abs(grv2Number_(a.PasDificultat, 3) - 3) - Math.abs(grv2Number_(b.PasDificultat, 3) - 3);
  }).map(function (row) {
    return { PreguntaUid: row.PreguntaUid, MissioUid: row.MissioUid, HabilitatId: row.HabilitatId,
      NivellCurricular: row.NivellCurricular, QuestioHtml: row.QuestioHtml,
      RespostaEsperada: row.RespostaEsperada, Pista1: row.Pista1 };
  });
  if (cache) {
    var chunks = {};
    [1,2,3].forEach(function (level, index) {
      chunks[keys[index]] = JSON.stringify(bank.filter(function (row) { return grv2Number_(row.NivellCurricular, 0) === level; }));
    });
    try { cache.putAll(chunks, 600); } catch (error) { /* La lectura de Sheets continua sent la reserva. */ }
  }
  return bank;
}

function grv2DiagnosticBankReady_(bank) {
  return [1,2,3].every(function (level) {
    var skills = {};
    bank.filter(function (row) { return grv2Number_(row.NivellCurricular, 0) === level; })
      .forEach(function (row) { skills[grv2Text_(row.HabilitatId)] = true; });
    return Object.keys(skills).length >= (level === 1 ? 2 : 3);
  });
}

function grv2DiagnosticPhase_(steps, level) {
  // Els errors en una exploració del nivell superior decideixen el nivell, no la bastida necessària al nivell triat.
  var relevant = steps.filter(function (step) { return step.level <= level; });
  var atLevel = relevant.filter(function (step) { return step.level === level; });
  var autonomous = relevant.filter(function (step) { return step.outcome === "AUTONOMOUS_CORRECT"; }).length;
  var needHelp = relevant.length - autonomous;
  var atLevelAutonomous = atLevel.filter(function (step) { return step.outcome === "AUTONOMOUS_CORRECT"; }).length;
  var persistentAtLevel = atLevel.some(function (step) { return step.outcome === "PERSISTENT_DIFFICULTY"; });
  if (persistentAtLevel || (needHelp >= 2 && needHelp >= Math.ceil(relevant.length / 2))) return "SUPORT";
  if (atLevelAutonomous >= 2 && atLevelAutonomous === atLevel.length && autonomous / relevant.length >= 0.75) return "REPTE";
  return "BASE";
}

function grv2DiagnosticPlan_(steps) {
  var byLevel = { 1: [], 2: [], 3: [] };
  steps.forEach(function (step) { if (byLevel[step.level]) byLevel[step.level].push(step); });
  var passed = function (items) { return items.filter(function (step) { return step.outcome !== "PERSISTENT_DIFFICULTY"; }).length; };
  var n2 = byLevel[2], n3 = byLevel[3], n1 = byLevel[1];
  if (steps.length >= 8) {
    var capped = passed(n2) >= 2 ? (passed(n3) >= 2 ? 3 : 2) : 1;
    return { done: true, level: capped, phase: grv2DiagnosticPhase_(steps, capped) };
  }
  if (n2.length < 2) return { done: false, nextLevel: 2 };
  if (passed(n2) === 1 && n2.length < 3) return { done: false, nextLevel: 2 };
  if (passed(n2) >= 2) {
    if (n3.length < 2) return { done: false, nextLevel: 3 };
    if (passed(n3) === 1 && n3.length < 3) return { done: false, nextLevel: 3 };
    if (steps.length < 4) return { done: false, nextLevel: 3 };
    var upperLevel = passed(n3) >= 2 ? 3 : 2;
    return { done: true, level: upperLevel, phase: grv2DiagnosticPhase_(steps, upperLevel) };
  }
  if (n1.length < 2) return { done: false, nextLevel: 1 };
  return { done: true, level: 1, phase: grv2DiagnosticPhase_(steps, 1) };
}

function grv2DiagnosticSelectQuestion_(level, steps, bank) {
  var usedIds = {}, usedSkills = {};
  steps.forEach(function (step) { usedIds[step.questionUid] = true; usedSkills[step.skillId] = true; });
  var candidates = bank.filter(function (row) {
    return grv2Number_(row.NivellCurricular, 0) === level && !usedIds[grv2Text_(row.PreguntaUid)];
  });
  return candidates.find(function (row) { return !usedSkills[grv2Text_(row.HabilitatId)]; }) || candidates[0] || null;
}

function grv2DiagnosticDetails_(row) {
  var value = grv2ParseJson_(row.DetallJSON, {});
  return { steps: Array.isArray(value.steps) ? value.steps : [], pending: value.pending || null };
}

function grv2DiagnosticView_(row, bank) {
  var details = grv2DiagnosticDetails_(row);
  var question = details.pending && bank.find(function (item) { return grv2Text_(item.PreguntaUid) === details.pending.questionUid; });
  if (!question) return { requireDiagnostic: true, available: false, status: "EN_CURS",
    message: "Falten preguntes diagnòstiques publicades. Avisa el professor." };
  return { requireDiagnostic: true, available: true, status: grv2Upper_(row.Estat),
    diagnosticSessionId: grv2Text_(row.DiagnosiId), answeredCount: details.steps.length, minQuestions: 4, maxQuestions: 8,
    question: { questionUid: grv2Text_(question.PreguntaUid), questionHtml: grv2Text_(question.QuestioHtml),
      stage: details.pending.stage, hint: details.pending.stage === "SCAFFOLDED" ? grv2Text_(question.Pista1) : "" } };
}

function grv2InitialDiagnosticFor_(user) {
  if (grv2Upper_(user.EstatDiagnosi) === "EXEMPTA") return { requireDiagnostic: false, status: "EXEMPTA" };
  if (grv2Upper_(user.EstatDiagnosi) === "COMPLETADA" && grv2Rows_("Diagnostic").some(function (item) {
    return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId)
      && grv2Upper_(item.TipusDiagnosi) === "INICIAL" && grv2Upper_(item.Estat) === "COMPLETADA";
  })) return { requireDiagnostic: false, status: "COMPLETADA" };
  return grv2WithScriptLock_(function () {
    grv2MigrateDiagnosticSchema_();
    var row = grv2RowsWithIndex_("Usuaris").find(function (item) { return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId); });
    if (grv2HasAcademicHistory_(user.AlumneId)) {
      if (row && ["PENDENT", "EN_CURS"].indexOf(grv2Upper_(row.EstatDiagnosi)) >= 0)
        grv2UpdateRow_("Usuaris", row._row, { EstatDiagnosi: "EXEMPTA" });
      return { requireDiagnostic: false, status: "EXEMPTA", reason: "HISTORIAL_PREVI" };
    }
    if (grv2Upper_(user.EstatDiagnosi) === "EXEMPTA") return { requireDiagnostic: false, status: "EXEMPTA" };
    var sessions = grv2RowsWithIndex_("Diagnostic").filter(function (item) {
      return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId) && grv2Upper_(item.TipusDiagnosi) === "INICIAL";
    });
    var session = sessions[sessions.length - 1];
    if (session && grv2Upper_(session.Estat) === "COMPLETADA") {
      if (row && (grv2Upper_(row.EstatDiagnosi) !== "COMPLETADA"
          || grv2Number_(row.NivellGeneralRecomanat, 0) !== grv2Number_(session.NivellRecomanat, 0)))
        grv2UpdateRow_("Usuaris", row._row, { EstatDiagnosi: "COMPLETADA", NivellGeneralRecomanat: session.NivellRecomanat });
      return { requireDiagnostic: false, status: "COMPLETADA" };
    }
    var bank = grv2DiagnosticBank_();
    if (!grv2DiagnosticBankReady_(bank)) return { requireDiagnostic: true, available: false, status: "PENDENT",
      message: "Falten preguntes diagnòstiques publicades. Avisa el professor." };
    if (!session) {
      var first = grv2DiagnosticSelectQuestion_(2, [], bank);
      var details = { steps: [], pending: { questionUid: grv2Text_(first.PreguntaUid), stage: "AUTONOMOUS" } };
      grv2Append_("Diagnostic", { DiagnosiId: grv2Uuid_("DIAG-"), AlumneId: user.AlumneId, GrupId: user.GrupId,
        TipusDiagnosi: "INICIAL", HabilitatId: "", Bloc: "", PreguntaUid: "", NotaExercici10: "", NotaBloc10: "",
        Domini: "", FortalesesJSON: "[]", DificultatsJSON: "[]", Recomanacio: "", Confianca: "",
        NivellRecomanat: "", FaseRecomanada: "", MissioIncorporacioUid: "", Estat: "EN_CURS",
        Data: new Date(), ValidaFins: "", SchemaVersion: 2, DetallJSON: JSON.stringify(details) });
      if (row) grv2UpdateRow_("Usuaris", row._row, { EstatDiagnosi: "EN_CURS" });
      session = grv2RowsWithIndex_("Diagnostic").filter(function (item) {
        return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId) && grv2Upper_(item.TipusDiagnosi) === "INICIAL";
      }).pop();
    }
    return grv2DiagnosticView_(session, bank);
  });
}

function grv2DiagnosticSubmit_(data) {
  return grv2WithScriptLock_(function () {
    var user = grv2Usuari_(data.studentId);
    if (grv2Upper_(user.EstatDiagnosi) !== "EN_CURS" && grv2HasAcademicHistory_(user.AlumneId))
      throw new Error("L'alumne ja té historial acadèmic.");
    var session = grv2RowsWithIndex_("Diagnostic").find(function (row) {
      return grv2Text_(row.DiagnosiId) === grv2Text_(data.diagnosticSessionId)
        && grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId)
        && grv2Upper_(row.TipusDiagnosi) === "INICIAL";
    });
    if (!session) throw new Error("Sessió diagnòstica no trobada.");
    if (grv2Upper_(session.Estat) === "COMPLETADA") return { diagnostic: { requireDiagnostic: false, status: "COMPLETADA" } };
    if (grv2Upper_(session.Estat) !== "EN_CURS") throw new Error("La sessió diagnòstica no està activa.");
    var details = grv2DiagnosticDetails_(session), bank = grv2DiagnosticBank_();
    var uid = grv2Text_(data.questionUid), stage = grv2Upper_(data.stage);
    if (details.steps.some(function (step) { return step.questionUid === uid; }))
      return { diagnostic: grv2DiagnosticView_(session, bank), duplicate: true };
    if (!details.pending || details.pending.questionUid !== uid) throw new Error("La pregunta no pertany a la sessió.");
    if (details.pending.stage !== stage) return { diagnostic: grv2DiagnosticView_(session, bank), duplicate: true };
    var answer = grv2Text_(data.answer);
    if (!answer || answer.length > 1000) throw new Error("Escriu una resposta breu.");
    var question = bank.find(function (item) { return grv2Text_(item.PreguntaUid) === uid; });
    if (!question) throw new Error("La pregunta diagnòstica ja no està publicada.");
    var correct = grv2Correct_(answer, question.RespostaEsperada);
    if (stage === "AUTONOMOUS" && !correct) {
      details.pending = { questionUid: uid, stage: "SCAFFOLDED", firstAnswer: answer };
      grv2UpdateRow_("Diagnostic", session._row, { DetallJSON: JSON.stringify(details), Data: new Date() });
      return { diagnostic: grv2DiagnosticView_(Object.assign({}, session, { DetallJSON: JSON.stringify(details) }), bank) };
    }
    var outcome = stage === "AUTONOMOUS" ? "AUTONOMOUS_CORRECT"
      : (correct ? "SCAFFOLDED_CORRECT" : "PERSISTENT_DIFFICULTY");
    details.steps.push({ questionUid: uid, skillId: grv2Text_(question.HabilitatId),
      level: grv2Number_(question.NivellCurricular, 1), outcome: outcome,
      firstAnswer: stage === "SCAFFOLDED" ? grv2Text_(details.pending.firstAnswer) : answer,
      secondAnswer: stage === "SCAFFOLDED" ? answer : "", answeredAt: new Date().toISOString() });
    var plan = grv2DiagnosticPlan_(details.steps);
    if (plan.done) {
      details.pending = null;
      grv2UpdateRow_("Diagnostic", session._row, { DetallJSON: JSON.stringify(details), Estat: "COMPLETADA",
        NivellRecomanat: plan.level, FaseRecomanada: plan.phase,
        Recomanacio: "Baseline inicial; la missió continua sent la del grup.", Data: new Date() });
      var userRow = grv2RowsWithIndex_("Usuaris").find(function (row) { return grv2Text_(row.AlumneId) === grv2Text_(user.AlumneId); });
      if (userRow) grv2UpdateRow_("Usuaris", userRow._row, { EstatDiagnosi: "COMPLETADA", NivellGeneralRecomanat: plan.level });
      return { diagnostic: { requireDiagnostic: false, status: "COMPLETADA" } };
    }
    var next = grv2DiagnosticSelectQuestion_(plan.nextLevel, details.steps, bank);
    if (!next) {
      grv2UpdateRow_("Diagnostic", session._row, { DetallJSON: JSON.stringify(details), Data: new Date() });
      return { diagnostic: { requireDiagnostic: true, available: false, status: "EN_CURS",
        message: "Falten preguntes diagnòstiques publicades. Avisa el professor." } };
    }
    details.pending = { questionUid: grv2Text_(next.PreguntaUid), stage: "AUTONOMOUS" };
    grv2UpdateRow_("Diagnostic", session._row, { DetallJSON: JSON.stringify(details), Data: new Date() });
    return { diagnostic: grv2DiagnosticView_(Object.assign({}, session, { DetallJSON: JSON.stringify(details) }), bank) };
  });
}

function grv2DiagnosticExempt_(data) {
  return grv2WithScriptLock_(function () {
    var user = grv2Usuari_(data.studentId);
    var row = grv2RowsWithIndex_("Usuaris").find(function (item) { return grv2Text_(item.AlumneId) === grv2Text_(user.AlumneId); });
    if (row) grv2UpdateRow_("Usuaris", row._row, { EstatDiagnosi: "EXEMPTA" });
    return { status: "EXEMPTA", reason: "DECISIO_DOCENT" };
  });
}


  // The academic functions above are the same functions used by Apps Script v17.
  // This adapter replaces only their Sheets and Apps Script I/O.
  grv2Rows_ = function (name) {
    if (!active) throw new Error("No academic context");
    if (!active.tables[name]) active.tables[name] = [];
    return active.tables[name];
  };
  grv2Append_ = function (name, object) {
    var rows = grv2Rows_(name);
    rows.push(object);
    if (!active.touched[name]) active.touched[name] = [];
    if (active.touched[name].indexOf(object) < 0) active.touched[name].push(object);
    return object;
  };
  grv2UpdateRow_ = function (name, rowNumber, changes) {
    var row = grv2Rows_(name)[rowNumber - 2];
    if (!row) throw new Error("Missing row " + name + ":" + rowNumber);
    Object.assign(row, changes);
    if (!active.touched[name]) active.touched[name] = [];
    if (active.touched[name].indexOf(row) < 0) active.touched[name].push(row);
  };
  grv2WithScriptLock_ = function (callback) { return callback(); };
  grv2MigrateDiagnosticSchema_ = function () {};
  grv2Uuid_ = function (prefix) { return String(prefix || "") + root.crypto.randomUUID(); };
  grv2Config_ = function () {
    var result = {};
    grv2Rows_("Configuracio").forEach(function (row) { result[String(row.Clau)] = row.Valor; });
    return result;
  };
  grv2ClassGoal_ = function () { return active.classGoal || { title: "Energia de la classe", value: 0, target: 100 }; };

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function create(catalog, studentState, classRow, overrideRows, classGoal) {
    var tables = Object.assign({}, copy(catalog || {}), copy(studentState && studentState.tables || {}));
    tables.ControlClasse = [copy(classRow)];
    tables.AdaptacionsDocents = copy(overrideRows || []);
    var instance = { tables: tables, touched: {}, classGoal: classGoal || null };
    function call(fn) {
      active = instance;
      instance.touched = {};
      GRV2_REQUEST_QUESTIONS_CACHE_ = instance.tables.Preguntes || null;
      GRV2_REQUEST_CONFIG_CACHE_ = null;
      try {
        var result = fn();
        var upserts = {};
        Object.keys(instance.touched).forEach(function (name) {
          upserts[name] = copy(instance.touched[name]).map(function (row) { delete row._row; return row; });
        });
        return { result: copy(result), upserts: upserts, state: snapshot() };
      } finally { active = null; }
    }
    function snapshot() {
      var academic = {};
      Object.keys(instance.tables).forEach(function (name) {
        if (["Usuaris", "Dades", "Progres", "DominiHabilitats", "Recuperacions", "Diagnostic", "Sessions", "Assignacions", "InsigniesAlumnes"].indexOf(name) >= 0) {
          academic[name] = copy(instance.tables[name]).map(function (row) {
            delete row._row;
            return row;
          });
        }
      });
      return { tables: academic };
    }
    return {
      bootstrap: function (studentId, sessionId) { return call(function () { return grv2Bootstrap_({ studentId: studentId, sessionId: sessionId }); }); },
      submit: function (payload) { return call(function () {
        var result = grv2EnviarResposta_(Object.assign({}, payload, { compact: true }));
        if (!result.duplicate) {
          var view = grv2Bootstrap_({ studentId: payload.studentId, sessionId: payload.sessionId });
          result.nextExercise = view.currentExercise;
          result.exerciseBuffer = view.exerciseBuffer;
          result.missions = view.missions;
          result.currentMission = view.currentMission;
          result.sector = view.sector;
          result.waitingForUnlock = view.waitingForUnlock;
          result.badges = view.badges;
          result.student = view.student;
          result.availableAvatars = view.student && view.student.availableAvatars;
        }
        return result;
      }); },
      diagnosticSubmit: function (payload) { return call(function () { return grv2DiagnosticSubmit_(payload); }); },
      help: function (payload) { return call(function () { return grv2DemanarAjuda_(payload); }); },
      saveAvatar: function (payload) { return call(function () { return grv2GuardarAvatar_(payload); }); },
      snapshot: snapshot,
      rows: function (name) { return copy(instance.tables[name] || []); }
    };
  }
  root.R1V2AcademicEngine = Object.freeze({ create: create });
})(typeof window !== "undefined" ? window : globalThis);

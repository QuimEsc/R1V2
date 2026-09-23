window.GAMIFICACIO_CONFIG = Object.freeze({
  // Desplegament V2 independent de la web antiga.
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbxNVOoOC6SRLfQlYvSX3GkIGVtEiu7zbf9GU5kTn0MB4CCHyfd8MkWw0axxXhQ25GNsbg/exec",
  // Arrel pròpia: no mescla alumnes, batalles ni control amb Gamificacio.
  firebaseRoot: "gamificacio-reforc-v2",
  // Firebase V2 validat i actiu des del 20/09/2026.
  firebaseEnabled: true,
  firebaseFirstEnabled: true,
  groupId: "GRUP-1ESO-BASE",
  schemaMode: "V2",
  defaultTrimester: 1,
  themeByTrimester: Object.freeze({
    1: "space",
    2: "city",
    3: "expedition"
  }),
  focusSessionMinutes: 55,
  liveHeartbeatMs: 15000,
  liveAnswerDebounceMs: 900,
  liveTtlHours: 72,
  maxAnswerChars: 12000,
  reportRecommendationDays: 21,
  reportRecommendationMinErrors: 5,
  classControlPollMs: 12000,
  version: "2.1.1-v2"
});

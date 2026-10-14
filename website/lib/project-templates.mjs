// The five teacher-owned templates are independent student project starting points.
// Website links appear only after their exact publication metadata is recorded.
export const templateDefinitions = Object.freeze([
  {id: "zero-starter", repository: "codepetca/zero-starter", description: "Minimal Zero Java starter for your own course project."},
  {id: "hello-app", repository: "codepetca/zero-hello-java", description: "A complete editable Java greeting app for learning GitHub project flow."},
  {id: "study", repository: "codepetca/zero-study-session", description: "A complete editable Java study app with questions, scoring and restart."},
  {id: "coin-game-component", repository: "codepetca/zero-coin-game", description: "A complete editable Java coin game with shared score display and restart."},
  {id: "drawing", repository: "codepetca/zero-drawing-pad", description: "A complete editable Java drawing pad with mouse input."},
]);

export function templateDefinition(id) {
  const definition = templateDefinitions.find(item => item.id === id);
  if (!definition) throw new Error(`Unknown project template: ${id}`);
  return {...definition, repositoryUrl: `https://github.com/${definition.repository}`,
    templateHref: `https://github.com/${definition.repository}/generate`};
}

export function validatePublishedTemplates(snapshot) {
  if (snapshot?.schema !== 1 || !Array.isArray(snapshot.templates)
    || ![0, templateDefinitions.length].includes(snapshot.templates.length)) throw new Error("Invalid template publication snapshot");
  const seen = new Set();
  for (const entry of snapshot.templates) {
    const definition = templateDefinition(entry.id);
    if (seen.has(entry.id) || entry.repository !== definition.repository
      || !Number.isSafeInteger(entry.repositoryId) || entry.repositoryId <= 0
      || entry.visibility !== "public" || entry.isTemplate !== true || entry.defaultBranch !== "main"
      || typeof entry.commit !== "string" || typeof entry.tree !== "string"
      || !/^[0-9a-f]{40}$/.test(entry.commit) || !/^[0-9a-f]{40}$/.test(entry.tree)) {
      throw new Error("Invalid published project template");
    }
    seen.add(entry.id);
  }
  return snapshot;
}

export function publishedTemplate(snapshot, id) {
  const entry = validatePublishedTemplates(snapshot).templates.find(item => item.id === id);
  return entry ? {...entry, ...templateDefinition(id)} : null;
}

// Discovery is intentionally smaller than the canonical lesson/source inventory.
// Existing checkpoint URLs and complete downloads remain available.
export const courseStarterId = "zero-starter";
export const featuredProjectIds = Object.freeze(["hello-app", "study", "coin-game-component", "drawing"]);
export const advancedProjectIds = Object.freeze(["composed-study", "composed-game", "full-game"]);

/** @type {Readonly<Record<string, {title: string, challenge: string}>>} */
export const projectGuides = Object.freeze({
  "zero-starter": {
    title: "Your course project",
    challenge: "Describe your own project idea in the README, then change the greeting into the first part of your interface.",
  },
  "hello-app": {
    title: "Hello, Java",
    challenge: "Personalize the greeting and change the button styling. Check both an empty name and a name you enter.",
  },
  study: {
    title: "Study session",
    challenge: "Add questions about a subject you choose. Check a wrong answer, a correct answer, the final question and Restart.",
  },
  "coin-game-component": {
    title: "Collect the coins",
    challenge: "Change the coin layout or add a coin. Check scoring, the winning goal and Restart after winning.",
  },
  drawing: {
    title: "Drawing pad",
    challenge: "Change the brush colour and size. Check a click, a continuous stroke and clearing the drawing.",
  },
});

export function projectGuide(id) {
  return projectGuides[id] ?? null;
}

export function projectTitle(project) {
  return projectGuide(project.id)?.title ?? project.title;
}

export function projectHref(id) {
  return `/hub?kind=example&example=${encodeURIComponent(id)}`;
}

export function selectHubProject(snapshot, id) {
  if (id === undefined || id === courseStarterId) return snapshot.starter;
  return snapshot.projects.find(project => project.id === id);
}

export function projectNavigation(snapshot, current) {
  const item = project => ({id: project.id, title: projectTitle(project), href: projectHref(project.id)});
  const byId = new Map(snapshot.projects.map(project => [project.id, project]));
  const group = ids => ids.map(id => {
    const project = byId.get(id);
    if (!project) throw new Error(`Missing course project: ${id}`);
    return item(project);
  });
  const featured = group(featuredProjectIds);
  const advanced = group(advancedProjectIds);
  const checkpoint = current.id !== courseStarterId
    && ![...featuredProjectIds, ...advancedProjectIds].includes(current.id) ? item(current) : null;
  return {starter: item(snapshot.starter), featured, advanced, checkpoint};
}

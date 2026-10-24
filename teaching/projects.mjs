import tutorialTemplateMetadata from './tutorial-templates.json' with {type:'json'};

// The learning path uses three continuing student-owned repositories. Lessons introduce
// changes to student-owned code; they do not distribute completed programs.
export const practiceProjects = [
  {id:'greeting',title:'Greeting app',firstLesson:'0',lessons:['0','1','2'],kind:'app'},
  {id:'study',title:'Study quiz',firstLesson:'3',lessons:['3','4','5','6','7'],kind:'app'},
  {id:'game',title:'Coin game',firstLesson:'8',lessons:['8','9','10','11','12'],kind:'game'},
];
export function projectForLesson(id) {
  return practiceProjects.find(project => project.lessons.includes(String(id))) ?? null;
}
export const sampleGameAssets = {
  filename:'game-assets.zip',
  href:'/generated/learning-assets/game-assets.zip',
  files:['media-demo/player.png','media-demo/chime.wav'],
};

// Publication records are authored only after a separately authorized public
// template verification. A planned repository name is never an available link.
// scaffoldSha256 binds the verified commit's pristine file inventory to these
// lessons. It is recorded evidence, not a live check of the mutable remote main.
export function validateTutorialTemplates(value) {
  if (!value || value.schema !== 1 || !Array.isArray(value.templates) || value.templates.length !== practiceProjects.length) throw new Error('Invalid tutorial template metadata.');
  const ids = new Set();
  return value.templates.map(item => {
    if (!item || !practiceProjects.some(project => project.id === item.id) || ids.has(item.id) || item.repository !== `codepetca/zero-tutorial-${item.id}`) throw new Error('Invalid tutorial template repository.');
    ids.add(item.id);
    const publication = item.publication;
    if (publication !== null && (!publication || !Number.isSafeInteger(publication.repositoryId) || publication.repositoryId < 1 || publication.visibility !== 'public' || publication.isTemplate !== true || publication.defaultBranch !== 'main' || !/^[0-9a-f]{40}$/.test(publication.commit) || !/^[0-9a-f]{40}$/.test(publication.tree))) throw new Error('Invalid tutorial template publication record.');
    if(publication?.scaffoldSha256!==undefined&&!/^[0-9a-f]{64}$/.test(publication.scaffoldSha256))throw new Error('Invalid tutorial template publication source evidence.');
    return {...item};
  });
}
export const tutorialTemplateDefinitions = validateTutorialTemplates(tutorialTemplateMetadata);
export function publishedTutorialTemplate(id) {
  const item = tutorialTemplateDefinitions.find(template => template.id === id);
  if (!item?.publication) return null;
  const repositoryUrl = `https://github.com/${item.repository}`;
  return {repository:item.repository, repositoryUrl, templateHref:`${repositoryUrl}/generate`,...(item.publication.scaffoldSha256?{scaffoldSha256:item.publication.scaffoldSha256}:{})};
}

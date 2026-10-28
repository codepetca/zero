'use strict';

// Stable lesson identifiers are also public addresses and saved reader keys.
// Reading order is deliberate; it must never be inferred from those numbers.
const lessonFiles = Object.freeze({
  '0':'00-hello-world.md', '1':'01-hello-button.md', '2':'02-hello-name.md',
  '3':'03-quiz.md', '4':'04-counter.md', '5':'05-methods.md', '6':'06-objects.md',
  '7':'07-study-app.md', '8':'08-movement.md', '9':'09-coin-game.md',
  '10':'10-components.md', '11':'11-zerohub.md', '12':'12-media.md',
  '13':'13-pet.md', '14':'14-own-project.md',
});
const LESSON_IDS = Object.freeze(Object.keys(lessonFiles));
const MAIN_LESSONS = Object.freeze(['0','1','2','8','9','13','14']);
const tutorialGroups = Object.freeze([
  {id:'greeting',title:'Greeting app',lessons:['0','1','2']},
  {id:'game',title:'Coin game',lessons:['8','9']},
  {id:'pet',title:'Animated pet',lessons:['13']},
  {id:'own-project',title:'Your own project',lessons:['14']},
  {id:'study',title:'Study quiz (optional)',lessons:['3','4','5','6','7']},
  {id:'practice',title:'Components and sharing (optional)',lessons:['10','11']},
  {id:'media',title:'Coin artwork and sound (optional)',lessons:['12']},
].map(group => Object.freeze({...group,lessons:Object.freeze(group.lessons)})));
const PROJECT_LESSONS = Object.freeze({greeting:'0',study:'3',game:'8',pet:'13'});
const EXTERNAL_LINKS = Object.freeze([
  'https://zero.codepet.ca/hub',
  'https://zero.codepet.ca/hub?kind=practice',
  'https://zero.codepet.ca/generated/learning-assets/game-assets.zip',
  'https://zero.codepet.ca/generated/learning-assets/pet-assets.zip',
]);
function navigationIds(id) {
  const sequence = MAIN_LESSONS.includes(id) ? MAIN_LESSONS
    : tutorialGroups.find(group => group.lessons.includes(id))?.lessons;
  if (!sequence) return {};
  const index = sequence.indexOf(id);
  return {previous:sequence[index - 1],next:sequence[index + 1]};
}
function referencePath(value) {
  return /^teaching\/checkpoints\/(?:[0-9]|1[0-2])\/(?:[a-z]+\/)?[A-Za-z]+\.java$/.test(value)
    || /^teaching\/checkpoints\/13\/[1-3]\/[A-Za-z]+\.java$/.test(value)
    || /^teaching\/checkpoints\/14\/Main\.java$/.test(value)
    || /^student-template\/examples\/[a-z-]+\/(?:README\.md|[A-Za-z]+\.java)$/.test(value);
}
module.exports = {lessonFiles,LESSON_IDS,MAIN_LESSONS,tutorialGroups,PROJECT_LESSONS,EXTERNAL_LINKS,navigationIds,referencePath};

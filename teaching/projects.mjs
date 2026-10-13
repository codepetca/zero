// The learning path uses three continuing local projects. Lessons introduce
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

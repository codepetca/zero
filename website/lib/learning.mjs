import {practiceProjects, projectForLesson, publishedTutorialTemplate, sampleGameAssets} from "../../teaching/projects.mjs";
export {projectForLesson, publishedTutorialTemplate, sampleGameAssets};
export const lessonGroups = practiceProjects.map(({id, title, lessons}) => ({id, title, lessons}));
export const lessons = [
  {
    "id": "0",
    encouragement: "You wrote your first Zero program!",
    "title": "Hello, world!",
    "description": "Run a tiny program and change its greeting.",
    "topic": "Run, edit, rerun",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "1",
    encouragement: "You made your greeting respond to a button!",
    "title": "Say hello with a button",
    "description": "Click a button to change the greeting.",
    "topic": "Button, click handler, label text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "2",
    encouragement: "You made a greeting that knows your name!",
    "title": "Greet by name",
    "description": "Type your name and show a greeting.",
    "topic": "TextField, getText, joining text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "3",
    encouragement: "You built your first quiz question!",
    "title": "A tiny quiz",
    "description": "Check one answer and show feedback.",
    "topic": "if/else, comparing text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "4",
    encouragement: "Your quiz can count attempts. Keep going!",
    "title": "Count your attempts",
    "description": "Track attempts in your study quiz.",
    "topic": "int, attempts, updating feedback",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "5",
    encouragement: "You added a fresh start to your quiz!",
    "title": "Reset your quiz",
    "description": "Reset quiz state with a named method.",
    "topic": "Fields, methods, reset quiz state",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "6",
    encouragement: "You wrote a reusable Counter class!",
    "title": "Counter object",
    "description": "Move the attempt count into an ordinary Counter object.",
    "topic": "Classes, constructors, object methods",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "7",
    encouragement: "You built a study quiz. Try it with your own questions!",
    "title": "Study quiz",
    "description": "Add more questions, Next and Restart to your study quiz.",
    "topic": "Question objects, arrays, scoring, session state",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "8",
    encouragement: "You got your player moving!",
    "title": "Movement and keys",
    "description": "Move a player inside the canvas.",
    "topic": "GameApp, elapsed time, explicit updates",
    "doc": "api",
    "anchor": "input-methods"
  },
  {
    "id": "9",
    encouragement: "You built a coin game. Make it your own!",
    "title": "Collect the coins",
    "description": "Build a game with coins, score, winning and restart.",
    "topic": "Collision checks, game state, object reuse",
    "doc": "api",
    "anchor": "gameapp-frames-and-canvas"
  },
  {
    "id": "10",
    encouragement: "You made Main easier to read and reused a component!",
    "title": "Refactor a busy Main",
    "description": "Extract input controls and reuse a score display in your existing projects.",
    "topic": "Refactoring, responsibilities, input helper, reusable view",
    "doc": "components",
    "anchor": "student-api-and-responsibility"
  },
  {
    "id": "11",
    encouragement: "You checked a component and prepared a practice contribution!",
    "title": "Practise sharing a component",
    "description": "Check a compatible improvement and write a contribution proposal.",
    "topic": "Compatibility, tests, reuse, credit, optional ZeroHub sharing",
    "doc": "components",
    "anchor": ""
  },
  {
    id: "12",
    encouragement: "Keep experimenting with your game!",
    title: "Add artwork and sound",
    description: "Add optional artwork and sound to your existing Coin game.",
    topic: "Zero images and sound, drawing fallback, optional scrolling",
    doc: "api",
    anchor: "images-and-resources",
  },
];
// Fixed teaching assets copied from canonical source at build time.
export const lessonAssets = {
  ...Object.fromEntries(Array.from({ length: 13 }, (_, id) => {
    const name = String(id).padStart(2, "0");
    return [`student-template/lessons/visuals/${name}.svg`, `/generated/learning-assets/lessons/${name}.svg`];
  })),
  "student-template/examples/media-demo/resources/media-demo/player.png": "/generated/learning-assets/media-demo/player.png",
  "student-template/examples/media-demo/resources/media-demo/chime.wav": "/generated/learning-assets/media-demo/chime.wav",
};
export function isLessonDocumentId(id) {
  return lessons.some((lesson) => id === `lesson-${lesson.id}`);
}
export function lessonNavigation(id) {
  const index = lessons.findIndex((lesson) => lesson.id === id);
  if (index < 0) return {};
  return { related: lessons[index], previous: lessons[index - 1], next: lessons[index + 1] };
}
const gameResources = [
  { file: "media-demo/resources/media-demo/player.png", destination: "src/main/resources/media-demo/player.png" },
  { file: "media-demo/resources/media-demo/chime.wav", destination: "src/main/resources/media-demo/chime.wav" },
];
const gameStages = [
  { id: "scrolling-game", title: "Scrolling world", description: "Follow your sprite with a camera and keep the scoreboard fixed.", helpers: ["Camera", "Player", "Coin"] },
  { id: "platform-game", title: "Jump onto platforms", description: "Add gravity, jumping and solid platform collisions.", helpers: ["Camera", "Player", "Coin", "Platform"] },
  { id: "level-game", title: "Enemies and levels", description: "Patrolling enemies and two levels built from ordinary objects.", helpers: ["Camera", "Player", "Coin", "Platform", "Enemy", "Level"] },
  { id: "full-game", title: "Robot platformer", description: "Collect every coin across two levels, avoid enemies and restart after winning or losing.", helpers: ["Camera", "Player", "Coin", "Platform", "Enemy", "Level"] },
];
export const examples = [
  {
    id: "composed-study",
    title: "Study app with shared screens",
    description: "A study quiz with a welcome screen, answer feedback, a score and restart.",
    files: ["composed-study/Main.java", "study/Question.java", "composition-shared/StartScreen.java", "composition-shared/Hud.java", "shared/ScoreDisplay.java"],
    guide: "ui",
  },
  {
    id: "composed-game",
    title: "Coin game with shared screens",
    description: "A coin-collecting game with a welcome screen, score, winning and restart.",
    files: ["composed-game/Main.java", "coin-game/Player.java", "coin-game/Coin.java", "composition-shared/StartScreen.java", "composition-shared/Hud.java", "shared/ScoreDisplay.java"],
    guide: "ui",
  },
  ...gameStages.map(({ id, title, description, helpers }) => ({
    id, title, description,
    files: [`${id}/Main.java`, ...helpers.map((name) => `${id}/${name}.java`), "shared/ScoreDisplay.java"],
    resources: gameResources,
    lesson: "12",
  })),
  {
    id: "media-demo",
    title: "My sprite and sound",
    description: "Draw a local PNG and play a short WAV effect.",
    files: ["media-demo/Main.java"],
    resources: [
      { file: "media-demo/resources/media-demo/player.png", destination: "src/main/resources/media-demo/player.png" },
      { file: "media-demo/resources/media-demo/chime.wav", destination: "src/main/resources/media-demo/chime.wav" },
    ],
    lesson: "12",
  },
  {
    id: "hello-app",
    title: "Hello, Java",
    description: "A small interface with a name field, greeting and reset.",
    files: ["hello-app/Main.java"],
    guide: "api",
  },
  {
    id: "reach-the-coin",
    title: "Reach the coin",
    description: "Arrow keys move a square; touch the gold square to win and press R to restart.",
    files: ["reach-the-coin/Main.java", "reach-the-coin/Player.java"],
    guide: "api",
  },
  {
    id: "hello-button",
    title: "Say hello",
    description: "A single button changes a label's greeting.",
    files: ["hello-button/Main.java"],
    lesson: "1",
  },
  {
    id: "hello-name",
    title: "Greet by name",
    description: "A text field supplies the greeting name.",
    files: ["hello-name/Main.java"],
    lesson: "2",
  },
  {
    id: "tiny-quiz",
    title: "Tiny quiz",
    description: "One question and Correct! or Try again. feedback.",
    files: ["tiny-quiz/Main.java"],
    lesson: "3",
  },
  {
    id: "click-counter",
    title: "Click counter",
    description: "One button increases a number.",
    files: ["click-counter/Main.java"],
    lesson: "4",
  },
  {
    id: "reset-counter",
    title: "Reset and methods",
    description: "A click counter with increment and Reset buttons.",
    files: ["reset-counter/Main.java"],
    lesson: "5",
  },
  {
    id: "object-counter",
    title: "Counter object",
    description: "A resettable click counter backed by its own Counter class.",
    files: ["object-counter/Main.java", "object-counter/Counter.java"],
    lesson: "6",
  },
  {
    id: "movement",
    title: "Movement and keys",
    description: "Arrow keys move a player inside the canvas.",
    files: ["movement/Main.java", "movement/Player.java"],
    lesson: "8",
  },
  {
    id: "coin-game-controls",
    title: "One coin with controls",
    description: "Ordinary JavaFX score, message and Restart beneath a game canvas.",
    files: ["coin-game-controls/Main.java", "coin-game/Player.java", "coin-game/Coin.java"],
    lesson: "9",
  },
  {
    id: "coin-game-component",
    title: "Shared score in an app and game",
    description: "A coin-collecting game with a shared score display and restart controls.",
    files: ["coin-game-component/Main.java", "coin-game/Player.java", "coin-game/Coin.java", "shared/ScoreDisplay.java"],
    lesson: "10",
  },
  {
    id: "coin-game",
    title: "Collect the coins",
    description: "Collect three coins, win and restart.",
    files: ["coin-game/Main.java", "coin-game/Player.java", "coin-game/Coin.java"],
    lesson: "9",
  },
  {
    id: "quiz",
    title: "Scored quiz",
    description: "Buttons, answer feedback and once-only scoring.",
    files: ["quiz/Main.java", "shared/ScoreDisplay.java"],
    lesson: "10",
  },
  {
    id: "practice",
    title: "Practice tracker",
    description: "Reuse a score display with your own counting rules.",
    files: ["practice/Main.java", "shared/ScoreDisplay.java"],
    lesson: "10",
  },
  {
    id: "study",
    title: "Study session",
    description: "Question objects, retries, Next and Restart.",
    files: [
      "study/Main.java",
      "study/Question.java",
      "shared/ScoreDisplay.java",
    ],
    lesson: "7",
  },
  {
    id: "animation",
    title: "Follow the mouse",
    description: "A player follows the mouse around the canvas.",
    files: ["animation/Main.java", "animation/Player.java"],
    lesson: "8",
  },
  {
    id: "keyboard",
    title: "Keyboard movement",
    description: "Arrow keys move a circle and keep it inside the canvas.",
    files: ["keyboard/Main.java", "keyboard/Mover.java"],
    lesson: "8",
  },
  {
    id: "counter",
    title: "Canvas counter",
    description: "Native buttons and a canvas in the same app.",
    files: ["counter/Main.java"],
  },
  {
    id: "drawing",
    title: "Drawing pad",
    description: "Paint with the mouse; clear with the secondary button.",
    files: ["drawing/Main.java"],
    lesson: "8",
  },
];
export const quickLinks = [
  { title: "Tutorials", description: "Build your app one step at a time.", href: "/learn" },
  { title: "API reference", description: "Look up Zero classes and methods.", href: "/docs" },
  { title: "Setup help", description: "Install Zero and troubleshoot running.", href: "/help/setup" },
  { title: "For teachers", description: "Teaching notes and classroom checks.", href: "/teachers" },
];

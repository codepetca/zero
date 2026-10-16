import {practiceProjects, projectForLesson, publishedTutorialTemplate, sampleGameAssets} from "../../teaching/projects.mjs";
export {projectForLesson, publishedTutorialTemplate, sampleGameAssets};
export const lessonGroups = practiceProjects.map(({id, title, lessons}) => ({id, title, lessons}));
export const lessons = [
  {
    "id": "0",
    "title": "Hello, world!",
    "description": "Run a tiny program and change its greeting.",
    "topic": "Run, edit, rerun",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "1",
    "title": "Say hello with a button",
    "description": "Click a button to change the greeting.",
    "topic": "Button, click handler, label text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "2",
    "title": "Greet by name",
    "description": "Type your name and show a greeting.",
    "topic": "TextField, getText, joining text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "3",
    "title": "A tiny quiz",
    "description": "Check one answer and show feedback.",
    "topic": "if/else, comparing text",
    "doc": "api",
    "anchor": "app-startup-and-interfaces"
  },
  {
    "id": "4",
    "title": "Count your attempts",
    "description": "Track attempts in your study quiz.",
    "topic": "int, attempts, updating feedback",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "5",
    "title": "Reset your quiz",
    "description": "Reset quiz state with a named method.",
    "topic": "Fields, methods, reset quiz state",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "6",
    "title": "Counter object",
    "description": "Move the attempt count into an ordinary Counter object.",
    "topic": "Classes, constructors, object methods",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "7",
    "title": "Study quiz",
    "description": "Add more questions, Next and Restart to your study quiz.",
    "topic": "Question objects, arrays, scoring, session state",
    "doc": "api",
    "anchor": "ordinary-javafx-and-reusable-objects"
  },
  {
    "id": "8",
    "title": "Movement and keys",
    "description": "Move a player inside the canvas.",
    "topic": "GameApp, elapsed time, explicit updates",
    "doc": "api",
    "anchor": "input-methods"
  },
  {
    "id": "9",
    "title": "Collect the coins",
    "description": "Build a game with coins, score, winning and restart.",
    "topic": "Collision checks, game state, object reuse",
    "doc": "api",
    "anchor": "gameapp-frames-and-canvas"
  },
  {
    "id": "10",
    "title": "Reuse a component",
    "description": "Use the same display class in two apps.",
    "topic": "Extraction, view, compatible changes",
    "doc": "components",
    "anchor": "student-api-and-responsibility"
  },
  {
    "id": "11",
    "title": "Share with ZeroHub",
    "description": "Prepare a library and upload it for automatic checks.",
    "topic": "Prepare, edit, upload, checks, exact releases",
    "doc": "components",
    "anchor": ""
  },
  {
    id: "12",
    title: "Build a platformer",
    description: "Grow your sprites and sounds into a two-level game.",
    topic: "Camera, scoreboard, gravity, levels, game state",
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
    description: "A small styled interface with a name field, greeting and reset.",
    files: ["hello-app/Main.java"],
    resources: [
      { file: "hello-app/theme.css", destination: "src/main/resources/hello-app/theme.css" },
    ],
    guide: "beginner",
  },
  {
    id: "reach-the-coin",
    title: "Reach the coin",
    description: "Arrow keys move a square; touch the gold square to win and press R to restart.",
    files: ["reach-the-coin/Main.java", "reach-the-coin/Player.java"],
    guide: "beginner",
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
  { title: "ZeroHub", description: "Use and share small Java libraries.", href: "/hub" },
  {
    title: "Beginner toolkit",
    description: "Start with a small set for apps or games.",
    href: "/docs/beginner",
  },
  {
    title: "Make it look good",
    description: "Fonts, colours, spacing and editable styles.",
    href: "/docs/style",
  },
  {
    title: "Setup guide",
    description: "Install the JDK, VS Code and the Zero extension.",
    href: "/docs/setup",
  },
  {
    title: "Java API reference",
    description: "Look up the classes and methods you will use.",
    href: "/docs/api",
  },
  {
    title: "Example projects",
    description: "Get complete apps and games from ZeroHub.",
    href: "/hub?kind=example",
  },
  {
    title: "For teachers",
    description: "Lesson notes, expected results and assessment guidance.",
    href: "/docs/teachers",
  },
];

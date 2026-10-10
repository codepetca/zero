export const lessons = [
  {
    id: "0",
    title: "Hello, world!",
    description: "Run a tiny program, change its greeting and run again.",
    topic: "Run, edit one line, rerun",
    doc: "api",
    anchor: "simpleapp-startup-and-interfaces",
  },
  {
    id: "1",
    title: "Say hello with a button",
    description: "Click one button to change the greeting.",
    topic: "Button, click handler, changing label text",
    doc: "api",
    anchor: "simpleapp-startup-and-interfaces",
  },
  {
    id: "2",
    title: "Greet by name",
    description: "Type your name and show a greeting.",
    topic: "TextField, getText, joining text",
    doc: "api",
    anchor: "simpleapp-startup-and-interfaces",
  },
  {
    id: "3",
    title: "Change the quiz",
    description: "Edit a simple quiz and make it your own.",
    topic: "Fields, conditions, answer feedback and scoring",
    doc: "api",
    anchor: "simpleapp-startup-and-interfaces",
  },
  {
    id: "4",
    title: "Reuse an object",
    description: "Use a class to reuse code in your program.",
    topic: "Objects, methods, parameters",
    doc: "api",
    anchor: "ordinary-javafx-and-reusable-objects",
  },
  {
    id: "5",
    title: "Grow a study session",
    description: "Add more features to your quiz.",
    topic: "Arrays, question objects, session state",
    doc: "api",
    anchor: "ordinary-javafx-and-reusable-objects",
  },
  {
    id: "6",
    title: "Animate an object",
    description: "Make something move on screen.",
    topic: "SketchApp, animation, explicit object updates",
    doc: "api",
    anchor: "sketchapp-frames-and-canvas",
  },
  {
    id: "7",
    title: "Control movement",
    description: "Respond to keyboard input.",
    topic: "Held keys, elapsed time, canvas bounds",
    doc: "api",
    anchor: "input-methods",
  },
  {
    id: "8",
    title: "Make a small improvement",
    description: "Choose an idea and make your app better.",
    topic: "Plan, build, check and explain",
    doc: "exercises",
    anchor: "contribute-for-another-student",
  },
];
export function lessonNavigation(id) {
  const index = lessons.findIndex((lesson) => lesson.id === id);
  if (index < 0) return {};
  return { related: lessons[index], previous: lessons[index - 1], next: lessons[index + 1] };
}
export const examples = [
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
    id: "quiz",
    title: "Mini quiz",
    description: "Buttons, answer feedback and once-only scoring.",
    files: ["quiz/Main.java", "shared/ScoreDisplay.java"],
    lesson: "3",
  },
  {
    id: "practice",
    title: "Practice tracker",
    description: "Reuse a score display with your own counting rules.",
    files: ["practice/Main.java", "shared/ScoreDisplay.java"],
    lesson: "4",
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
    lesson: "5",
  },
  {
    id: "animation",
    title: "Follow the mouse",
    description: "An ordinary Player object follows a target.",
    files: ["animation/Main.java", "animation/Player.java"],
    lesson: "6",
  },
  {
    id: "keyboard",
    title: "Keyboard movement",
    description: "Arrow keys move a circle and keep it inside the canvas.",
    files: ["keyboard/Main.java", "keyboard/Mover.java"],
    lesson: "7",
  },
  {
    id: "counter",
    title: "Canvas counter",
    description: "Native buttons and a canvas in the same app.",
    files: ["counter/Main.java"],
    lesson: "8",
  },
  {
    id: "drawing",
    title: "Drawing pad",
    description: "Paint with the mouse; clear with the secondary button.",
    files: ["drawing/Main.java"],
    lesson: "6",
  },
];
export const quickLinks = [
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
    title: "Example apps",
    description: "Browse the source and run an example locally.",
    href: "/examples",
  },
  {
    title: "For teachers",
    description: "Lesson notes, expected results and assessment guidance.",
    href: "/docs/teachers",
  },
];

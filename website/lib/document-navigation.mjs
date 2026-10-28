import tutorialCatalog from '../../extension/src/tutorial-catalog.js';
// Tutorials teach; /docs is the API. Old guide URLs remain bookmarkable aliases.
export const helpItems = [
  { id: 'setup', title: 'Setup and troubleshooting', href: '/help/setup' },
  { id: 'course-project', title: 'Start your own project', href: '/help/course-project' },
];
export const teacherItems = [
  { id: 'teachers', title: 'Teaching notes', href: '/teachers' },
  { id: 'pilot', title: 'Classroom pilot', href: '/teachers/pilot' },
];
const lesson = (number, anchor = '') => `/tutorials/${number}${anchor ? `#${anchor}` : ''}`;
const repositoryDoc = (name) => `https://github.com/codepetca/zero/blob/main/docs/${name}.md`;
const defaults = {
  api: '/docs', 'lesson-guide': '/learn', beginner: '/learn',
  'app-guide': lesson(0, 'app-startup'), style: lesson(2, 'layout-and-appearance'),
  ui: lesson(10, 'screens-and-app-flow'), exercises: '/learn',
  components: lesson(11), setup: '/help/setup', starter: '/help/setup',
  'course-project': '/help/course-project', teachers: '/teachers', pilot: '/teachers/pilot',
  development: repositoryDoc('DEVELOPMENT'), verification: repositoryDoc('VERIFICATION'), product: repositoryDoc('PRODUCT'),
};
const appSections = {
  'choose-an-app': lesson(0, 'app-startup'),
  'app-startup-and-interfaces': lesson(0, 'app-startup'),
  'ordinary-javafx-and-reusable-objects': lesson(10, 'reusable-views'),
  'gameapp-frames-and-canvas': lesson(8, 'frames-input-and-canvas'),
  'input-methods': lesson(8, 'frames-input-and-canvas'),
  'drawing-methods': '/docs#drawing',
  'images-and-resources': lesson(12),
  'sprite-frames-and-small-game-helpers': '/docs#animation',
  'short-sound-effects': '/docs#audio',
  'threading-errors-and-advanced-java': '/docs#advanced',
};
const sections = {
  'app-guide': appSections,
  beginner: {
    'apps-controls-that-respond-to-events': lesson(0, 'app-startup'),
    'games-update-the-state-then-draw-it': lesson(8, 'frames-input-and-canvas'),
    'when-you-want-more': '/docs',
  },
  style: {
    'a-small-visual-recipe': lesson(2, 'layout-and-appearance'),
    'space-around-the-window': lesson(2, 'layout-and-appearance'),
    'game-appearance-drawing-values': lesson(8, 'frames-input-and-canvas'),
    'optional-native-javafx-stylesheets': 'https://github.com/codepetca/zero/blob/main/student-template/STYLE.md#optional-native-javafx-stylesheets',
    'later-bundle-a-font-or-image': lesson(12),
  },
  ui: {
    'one-app-two-starting-points': lesson(0, 'app-startup'),
    'create-ui-once-update-its-values': lesson(10, 'reusable-views'),
    'a-component-is-an-ordinary-reusable-class': lesson(10, 'reusable-views'),
    'name-your-programs-flow': lesson(10, 'screens-and-app-flow'),
    'try-the-pair': lesson(10),
  },
};

export function documentDestination(id, fragment = '') {
  if (typeof id === 'string' && id.startsWith('lesson-') && tutorialCatalog.LESSON_IDS.includes(id.slice(7))) return lesson(id.slice(7), fragment);
  if (!Object.hasOwn(defaults, id)) return null;
  const destination = defaults[id];
  if (Object.hasOwn(sections, id)) {
    return Object.hasOwn(sections[id], fragment) ? sections[id][fragment] : destination;
  }
  if (['lesson-guide', 'exercises', 'components'].includes(id)) return destination;
  return destination + (fragment ? `#${fragment}` : '');
}

export function legacyDocumentDestination(id, hash = '') {
  let fragment = hash.replace(/^#/, '');
  try { fragment = decodeURIComponent(fragment); } catch { fragment = ''; }
  return documentDestination(id, fragment);
}

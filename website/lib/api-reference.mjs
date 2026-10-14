/** Structured presentation of the canonical student API, without copying its declarations. */
const categoryDefinitions = [
  ['startup', 'App startup', 'Choose an app and define its callbacks.'],
  ['interface', 'Window and interface', 'Configure the window and show JavaFX controls.'],
  ['canvas', 'Canvas', 'Read canvas dimensions and use native JavaFX objects.'],
  ['drawing', 'Drawing', 'Draw shapes, lines and text in canvas pixels.'],
  ['images', 'Images', 'Load bundled images and draw them on the canvas.'],
  ['input', 'Keyboard and mouse', 'Read held keys, mouse buttons and canvas coordinates.'],
  ['advanced', 'Advanced', 'JavaFX lifecycle and protected framework extension hooks.'],
];

const examples = {
  settings: '@Override\npublic void settings() {\n    size(800, 500);\n    title("My app");\n}',
  setup: '@Override\npublic void setup() {\n    show(new Label("Hello"));\n}',
  size: 'size(800, 500);', title: 'title("My app");', padding: 'padding(20);', show: 'show(new Label("Hello"));',
  update: '@Override\npublic void update(double seconds) {\n    x += 100 * seconds;\n}',
  draw: '@Override\npublic void draw() {\n    background(Color.WHITE);\n    circle(100, 80, 40);\n}',
  width: 'double middleX = width() / 2;', height: 'double middleY = height() / 2;',
  canvas: 'canvas().requestFocus();', graphics: 'graphics().strokeOval(20, 20, 80, 40);',
  layout: 'layout().setBottom(new Label("Score: 0"));',
  background: 'background(Color.WHITE);', fill: 'fill(Color.BLUE);', stroke: 'stroke(Color.BLACK);',
  strokeWidth: 'strokeWidth(3);', textSize: 'textSize(24);', rect: 'rect(20, 30, 100, 60);',
  outlineRect: 'outlineRect(20, 30, 100, 60);', circle: 'fill(Color.BLUE);\ncircle(100, 80, 40);',
  line: 'line(20, 30, 120, 90);', text: 'text("Hello", 20, 40);',
  loadImage: 'Image player = loadImage("/player.png");',
  image: 'image(player, 20, 30);', 'image-scaled': 'image(player, 20, 30, 80, 80);',
  mouseX: 'double x = mouseX();', mouseY: 'double y = mouseY();',
  keyDown: 'if (keyDown(KeyCode.LEFT)) {\n    x -= 100 * seconds;\n}',
  mouseDown: 'if (mouseDown(MouseButton.PRIMARY)) {\n    circle(mouseX(), mouseY(), 20);\n}',
};
const methodNotes = {
  settings: 'Override this callback. Call size, title and optional padding here.',
  setup: 'Override this callback. On SketchApp the canvas already exists.',
  size: 'Call inside settings() only. Dimensions must be positive and finite.',
  title: 'Call inside settings() only. The title must not be null.',
  padding: 'Call inside settings() only. Padding must be non-negative and finite; the default is 0.',
  show: 'Call in setup() or later. Content must not be null.',
  update: 'The example assumes a double field named x. First-frame seconds is 0; later values are capped at 0.1.',
  draw: 'The canvas is not cleared automatically. Drawing styles persist between frames.',
  circle: 'The third argument is the diameter, not the radius.',
  text: 'By default, y is the text baseline.',
  loadImage: 'Put player.png in src/main/resources for this example. Each call loads again; no cache is kept.',
  image: 'The example assumes player is an Image loaded in setup().',
  keyDown: 'Click the canvas to focus it. This example belongs in update(seconds) and assumes a double field named x.',
  mouseDown: 'Click the canvas to focus it. Losing canvas or window focus clears held input.',
};
const related = {
  settings: ['size', 'title', 'padding', 'setup'], setup: ['show', 'draw'], size: ['width', 'height'],
  title: ['settings'], padding: ['settings', 'size', 'show'], show: ['setup', 'layout'], update: ['draw', 'keyDown'], draw: ['background', 'update'],
  width: ['height', 'size'], height: ['width', 'size'], 'canvas-access': ['graphics', 'layout'],
  graphics: ['canvas-access', 'fill', 'stroke'], layout: ['show', 'canvas-access'],
  background: ['fill', 'draw'], fill: ['circle', 'rect', 'text'], stroke: ['line', 'outlineRect', 'strokeWidth'],
  strokeWidth: ['stroke', 'line'], textSize: ['text'], rect: ['outlineRect', 'fill'],
  outlineRect: ['rect', 'stroke'], circle: ['fill', 'rect'], line: ['stroke', 'strokeWidth'], text: ['textSize', 'fill'],
  loadImage: ['image', 'image-scaled'], image: ['loadImage', 'image-scaled'], 'image-scaled': ['loadImage', 'image'],
  mouseX: ['mouseY', 'mouseDown'], mouseY: ['mouseX', 'mouseDown'], keyDown: ['update', 'mouseDown'],
  mouseDown: ['mouseX', 'mouseY', 'keyDown'],
};

function parameterDescription(name, method) {
  const descriptions = {
    width: method === 'size' ? 'Initial content width in pixels; positive and finite.' : 'Width in pixels.',
    height: method === 'size' ? 'Initial content height in pixels; positive and finite.' : 'Height in pixels.',
    title: 'Initial window title; must not be null.',
    content: method === 'show' ? 'JavaFX node to display; must not be null.' : 'Root layout containing the app content.',
    seconds: 'Elapsed seconds since the previous frame; first 0, then at most 0.1.',
    color: 'JavaFX Color to use.', pixels: method === 'padding' ? 'Space around each content edge in pixels; non-negative and finite.'
      : method === 'textSize' ? 'Font size in pixels.' : 'Stroke width in pixels.',
    x: 'Horizontal position in canvas pixels.', y: method === 'text' ? 'Text baseline in canvas pixels.' : 'Vertical position in canvas pixels.',
    centreX: 'Horizontal centre of the circle in pixels.', centreY: 'Vertical centre of the circle in pixels.',
    diameter: 'Circle diameter in pixels.', x1: 'Start x coordinate in pixels.', y1: 'Start y coordinate in pixels.',
    x2: 'End x coordinate in pixels.', y2: 'End y coordinate in pixels.', value: 'Text to draw.',
    resourcePath: 'Classpath resource path; leading / starts at the resource root.', image: 'JavaFX Image to draw.',
    key: 'JavaFX KeyCode to check.', button: 'JavaFX MouseButton to check.', stage: 'JavaFX application window.',
  };
  if (!descriptions[name]) throw new Error(`No API parameter guidance for ${method}.${name}`);
  return descriptions[name];
}

/** Parse API Markdown tables. Unexpected structure fails visibly instead of hiding API entries. */
export function buildApiReference(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('API reference source must be Markdown text.');
  const categories = categoryDefinitions.map(([id, title, description]) => ({ id, title, description, notes: '', entries: [] }));
  const byId = Object.fromEntries(categories.map(category => [category.id, category]));
  let section = '';
  let subsection = '';
  const seenSections = new Set();
  const noteLines = Object.fromEntries(categories.map(category => [category.id, []]));
  const route = () => {
    if (section === 'SimpleApp') return subsection === 'Window and content' ? 'interface' : 'startup';
    return { SketchApp: 'startup', Canvas: 'canvas', Drawing: 'drawing', Images: 'images', Input: 'input', 'Lifecycle and extension hooks': 'advanced' }[section];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = heading[1]; subsection = ''; seenSections.add(section);
      if (!route()) throw new Error(`Unknown API section: ${section}`);
      continue;
    }
    const subheading = line.match(/^### (.+)$/);
    if (subheading) { subsection = subheading[1]; continue; }
    const categoryId = route();
    if (!categoryId) continue;
    if (!line.trim().startsWith('|')) { noteLines[categoryId].push(line); continue; }
    if (/^\|\s*(Signature|Public callback)\s*\|/.test(line) || /^\|[\s:|-]+\|$/.test(line)) continue;
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (!row) throw new Error(`Malformed API table row: ${line}`);
    const [, signature, description] = row;
    const declaration = signature.match(/^(?:(?:public|protected|final)\s+)*(\w+(?:\.\w+)*)\s+(\w+)\(([^()]*)\)$/);
    if (!declaration) throw new Error(`Malformed API signature: ${signature}`);
    const [, , name, argumentsText] = declaration;
    const owner = section === 'SimpleApp' || (categoryId === 'advanced' && subsection !== 'Protected SketchApp overrides') ? 'SimpleApp' : 'SketchApp';
    const parameters = argumentsText ? argumentsText.split(',').map(argument => {
      const parameter = argument.trim().match(/^(\w+(?:\.\w+)*)\s+(\w+)$/);
      if (!parameter) throw new Error(`Malformed API parameter: ${argument}`);
      return { name: parameter[2], description: parameterDescription(parameter[2], name) };
    }) : [];
    const id = signature.startsWith('protected ') ? `${owner.toLowerCase()}-${name}`
      : name === 'image' && parameters.length === 5 ? 'image-scaled' : name === 'canvas' ? 'canvas-access' : name;
    const metadataKey = id === 'image-scaled' ? id : name;
    const entry = { id, name, owner, signature, description, parameters, related: related[id] ?? [] };
    if (examples[metadataKey]) entry.example = examples[metadataKey];
    if (methodNotes[metadataKey]) entry.note = methodNotes[metadataKey];
    if (id === 'image-scaled') entry.note = methodNotes.image;
    byId[categoryId].entries.push(entry);
  }
  for (const category of categories) category.notes = noteLines[category.id].join('\n').trim();
  const entries = categories.flatMap(category => category.entries);
  if (seenSections.size !== 7 || entries.length !== 42 || categories.some(category => !category.entries.length)) {
    throw new Error(`Incomplete API reference: expected seven sections and 42 declarations, found ${seenSections.size} sections and ${entries.length} declarations.`);
  }
  const ids = new Set(categories.map(category => category.id));
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate API reference id: ${entry.id}`);
    ids.add(entry.id);
  }
  for (const entry of entries) for (const target of entry.related) {
    if (!entries.some(candidate => candidate.id === target)) throw new Error(`Unknown related API entry: ${target}`);
  }
  return categories;
}

const aliases = {
  keyDown: 'keyboard keys held pressed input', rect: 'rectangle', outlineRect: 'rectangle outline',
  fill: 'color colour style', stroke: 'color colour style', background: 'color colour clear',
  strokeWidth: 'style thickness', textSize: 'font style',
};

/** Token AND search ranked by method name. Empty queries and ranking ties keep source order. */
export function searchApiReference(categories, query) {
  const normalizedQuery = query.toLowerCase().replace(/(\w)\s*\(\s*\)/g, '$1').trim();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const rank = entry => {
    const name = entry.name.toLowerCase();
    if (name === normalizedQuery) return 0;
    if (tokens.some(token => name.startsWith(token))) return 1;
    if (tokens.some(token => name.includes(token))) return 2;
    return 3;
  };
  return categories.flatMap(category => category.entries.map(entry => ({ ...entry, categoryId: category.id, categoryTitle: category.title })))
    .filter(entry => {
      const searchable = [entry.name, entry.signature, entry.description, entry.categoryTitle, aliases[entry.name] ?? ''].join(' ').toLowerCase();
      return tokens.every(token => searchable.includes(token));
    })
    .sort((left, right) => rank(left) - rank(right));
}

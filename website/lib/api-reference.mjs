/** Structured presentation of the canonical student API, without copying its declarations. */
const categoryDefinitions = [
  ['startup', 'App startup', 'Choose an app and define its callbacks.'],
  ['interface', 'Window and interface', 'Configure the window and show JavaFX controls.'],
  ['canvas', 'Canvas', 'Read canvas dimensions and use native JavaFX objects.'],
  ['drawing', 'Drawing', 'Draw shapes, lines and text in canvas pixels.'],
  ['images', 'Images', 'Load bundled images and draw them on the canvas.'],
  ['regions', 'Image regions', 'Select source rectangles without copying image pixels.'],
  ['animation', 'Sprite animation', 'Advance independent looping frame sequences explicitly.'],
  ['audio', 'Audio', 'Load effects and independent music players in either app type.'],
  ['collisions', 'Collisions', 'Test ordinary geometry without moving objects.'],
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
  loadSound: 'Sound chime = loadSound("/chime.wav");',
  loadMusic: 'Music music = loadMusic("/music.wav");\nmusic.loop();',
  loadImage: 'Image player = loadImage("/player.png");',
  image: 'image(player, 20, 30);', 'image-scaled': 'image(player, 20, 30, 80, 80);',
  textCentered: 'textCentered("Ready", width() / 2, 40);',
  loadAnimation: 'SpriteAnimation walk = loadAnimation("/walk.png", 4, 2, 8);',
  imageRegion: 'ImageRegion portrait = imageRegion(sheet, 0, 0, 32, 32);',
  imageCentered: 'imageCentered(player, 100, 80, 64, 64, 30);',
  imageFlippedY: 'imageFlippedY(player, 20, 30, 64, 64);',
  keyPressed: 'if (keyPressed(KeyCode.SPACE)) {\n    jump();\n}',
  mousePressed: 'if (mousePressed(MouseButton.PRIMARY)) {\n    shots++;\n}',
  windowFocused: 'if (!windowFocused()) {\n    return;\n}',
  circleHitsRect: 'boolean hit = Collisions.circleHitsRect(100, 80, 20, 90, 70, 40, 50);',
  rectHitsRect: 'boolean hit = Collisions.rectHitsRect(0, 0, 20, 20, 20, 10, 30, 30);',
  circleHitsCircle: 'boolean hit = Collisions.circleHitsCircle(0, 0, 10, 20, 0, 10);',
  mouseX: 'double x = mouseX();', mouseY: 'double y = mouseY();',
  keyDown: 'if (keyDown(KeyCode.LEFT)) {\n    x -= 100 * seconds;\n}',
  mouseDown: 'if (mouseDown(MouseButton.PRIMARY)) {\n    circle(mouseX(), mouseY(), 20);\n}',
};
const methodNotes = {
  settings: 'Override this callback. Call size, title and optional padding here.',
  setup: 'Override this callback. On GameApp the canvas already exists.',
  size: 'Call inside settings() only. Dimensions must be positive and finite.',
  title: 'Call inside settings() only. The title must not be null.',
  padding: 'Call in settings(), setup() or a JavaFX handler. Padding must be non-negative and finite; default: 0. GameApp keeps its canvas dimensions.',
  show: 'Call in setup() or later. Content must not be null.',
  update: 'The example assumes a double field named x. First-frame seconds is 0; later values are capped at 0.1.',
  draw: 'The canvas is not cleared automatically. Drawing styles persist between frames.',
  circle: 'The third argument is the diameter, not the radius.',
  text: 'By default, y is the text baseline.',
  loadImage: 'Put player.png in src/main/resources for this example. Successful loads share an app-scoped canonical-resource cache until shutdown.',
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
  loadSound: ['sound-play', 'sound-stop', 'sound-setMuted'],
  loadMusic: ['music-play', 'music-loop', 'music-pause', 'music-stop'],
  loadImage: ['image', 'image-scaled'], image: ['loadImage', 'image-scaled'], 'image-scaled': ['loadImage', 'image'],
  mouseX: ['mouseY', 'mouseDown'], mouseY: ['mouseX', 'mouseDown'], keyDown: ['update', 'mouseDown'],
  mouseDown: ['mouseX', 'mouseY', 'keyDown'],
  keyPressed: ['keyDown', 'update', 'windowFocused'], mousePressed: ['mouseDown', 'update'],
  windowFocused: ['keyDown', 'keyPressed'], textCentered: ['text', 'textSize', 'fill'],
  loadAnimation: ['loadImage', 'spriteanimation-constructor', 'spriteanimation-update'],
  imageRegion: ['imageregion-constructor', 'image-region'],
  imageCentered: ['image', 'imageFlippedY'], imageFlippedY: ['image', 'imageCentered'],
};

function parameterDescription(name, method) {
  const descriptions = {
    width: method === 'size' ? 'Initial content width in pixels; positive and finite.' : 'Width in pixels.',
    height: method === 'size' ? 'Initial content height in pixels; positive and finite.' : 'Height in pixels.',
    title: 'Initial window title; must not be null.',
    content: method === 'show' ? 'JavaFX node to display; must not be null.' : 'Root layout containing the app content.',
    seconds: 'Elapsed seconds; non-negative and finite. GameApp supplies first 0, then at most 0.1.',
    color: 'JavaFX Color to use.', pixels: method === 'padding' ? 'Space around each content edge in pixels; non-negative and finite.'
      : method === 'textSize' ? 'Font size in pixels.' : 'Stroke width in pixels.',
    x: method === 'imageCentered' ? 'Destination centre x in canvas pixels.' : 'Horizontal position in pixels (source pixels for a region).',
    y: method === 'imageCentered' ? 'Destination centre y in canvas pixels.' : ['text', 'textCentered'].includes(method) ? 'Text y in pixels using the current baseline convention.' : 'Vertical position in pixels (source pixels for a region).',
    centreX: 'Horizontal centre of the circle in pixels.', centreY: 'Vertical centre of the circle in pixels.',
    diameter: 'Circle diameter in pixels.', x1: 'First shape x coordinate, or line start x, in pixels.', y1: 'First shape y coordinate, or line start y, in pixels.',
    x2: 'Second shape x coordinate, or line end x, in pixels.', y2: 'Second shape y coordinate, or line end y, in pixels.', value: 'Text to draw.',
    volume: 'Volume from 0 to 1 inclusive; finite.', muted: 'True to mute; false to restore the chosen volume.',
    resourcePath: 'Classpath resource path; leading / starts at the resource root.', image: 'Successfully loaded backing JavaFX Image.',
    region: 'Immutable source rectangle to draw.', animation: 'Animation whose current frame is drawn without advancing.',
    angleDegrees: 'Rotation about the destination centre, in degrees; positive is clockwise.',
    columns: 'Positive number of equal-width columns dividing the image exactly.',
    rows: 'Positive number of equal-height rows dividing the image exactly.',
    fps: 'Frames per second; positive and finite.', frames: 'Non-empty sequence of equal-size regions from the same Image.',
    cx: 'Circle centre x; finite.', cy: 'Circle centre y; finite.', radius: 'Circle radius; non-negative and finite.',
    radius1: 'First circle radius; non-negative and finite.', radius2: 'Second circle radius; non-negative and finite.',
    width1: 'First rectangle width; non-negative and finite.', height1: 'First rectangle height; non-negative and finite.',
    width2: 'Second rectangle width; non-negative and finite.', height2: 'Second rectangle height; non-negative and finite.',
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
    if (section === 'App') return subsection === 'Window and content' ? 'interface' : 'startup';
    return { Audio: 'audio', Sound: 'audio', Music: 'audio', GameApp: 'startup', Canvas: 'canvas', Drawing: 'drawing', Images: 'images', Input: 'input', ImageRegion: 'regions', SpriteAnimation: 'animation', Collisions: 'collisions', 'Lifecycle and extension hooks': 'advanced' }[section];
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
    const declaration = signature.match(/^(?:(?:public|protected|final|static)\s+)*(?:(\w+(?:\.\w+)*)\s+)?(\w+)\(([^()]*)\)$/);
    if (!declaration) throw new Error(`Malformed API signature: ${signature}`);
    const [, , name, argumentsText] = declaration;
    const helper = ['ImageRegion', 'SpriteAnimation', 'Collisions', 'Sound', 'Music'].includes(section);
    if (!declaration[1] && (!helper || name !== section)) throw new Error(`Malformed API constructor: ${signature}`);
    const owner = helper ? section : ['App', 'Audio'].includes(section) || (categoryId === 'advanced' && subsection !== 'Protected GameApp overrides') ? 'App' : 'GameApp';
    const parameters = argumentsText ? argumentsText.split(',').map(argument => {
      const parameter = argument.trim().match(/^(\w+(?:\.\w+)*(?:\.\.\.)?)\s+(\w+)$/);
      if (!parameter) throw new Error(`Malformed API parameter: ${argument}`);
      return { type: parameter[1], name: parameter[2], description: parameterDescription(parameter[2], name) };
    }) : [];
    const sourceType = parameters[0]?.type;
    const variant = sourceType === 'ImageRegion' ? '-region' : sourceType === 'SpriteAnimation' ? '-animation' : '';
    const id = signature.startsWith('protected ') ? `${owner.toLowerCase()}-${name}`
      : helper ? `${owner.toLowerCase()}-${name === owner ? `constructor${sourceType === 'double' ? '-frames' : ''}` : name}`
      : name === 'image' ? `image${variant}${parameters.length === 5 ? '-scaled' : ''}`
      : ['imageCentered', 'imageFlippedY'].includes(name) ? `${name}${variant}`
      : name === 'canvas' ? 'canvas-access' : name;
    const metadataKey = name === 'image' && parameters.length === 5 ? 'image-scaled' : name;
    const entry = { id, name, owner, signature, description, parameters, related: related[id] ?? related[name] ?? [] };
    if (variant && examples[metadataKey]) entry.example = examples[metadataKey].replaceAll('player,', `${parameters[0].name},`);
    if (!helper && examples[metadataKey] && !entry.example) entry.example = examples[metadataKey];
    if (!helper && methodNotes[metadataKey]) entry.note = methodNotes[metadataKey];
    if (helper && name === owner) entry.related = owner === 'ImageRegion' ? ['imageRegion', 'image-region'] : ['loadAnimation', 'spriteanimation-update', 'spriteanimation-reset'];
    if (name === 'image' && variant) entry.related = sourceType === 'ImageRegion' ? ['imageRegion', 'imageregion-constructor'] : ['loadAnimation', 'spriteanimation-frame'];
    if (helper && name === owner) {
      entry.example = owner === 'ImageRegion' ? 'ImageRegion frame = new ImageRegion(sheet, 0, 0, 32, 32);'
        : sourceType === 'double' ? 'SpriteAnimation walk = new SpriteAnimation(8, first, second);'
        : 'SpriteAnimation walk = new SpriteAnimation(sheet, 4, 2, 8);';
    }
    if (owner === 'Collisions') entry.example = examples[name];
    if (owner === 'SpriteAnimation' && name === 'update') entry.example = 'walk.update(seconds);';
    if (helper && name !== owner) entry.related = owner === 'Collisions' ? ['circle', 'rect']
      : ['Sound', 'Music'].includes(owner) ? [owner === 'Sound' ? 'loadSound' : 'loadMusic'] : [owner.toLowerCase() + '-constructor'];
    if (['Sound', 'Music'].includes(owner)) {
      const variable = owner === 'Sound' ? 'chime' : 'music';
      const argument = name === 'setVolume' ? '0.5' : name === 'setMuted' ? 'true' : '';
      entry.example = `${variable}.${name}(${argument});`;
    }
    if (id === 'image-scaled') entry.note = methodNotes.image;
    byId[categoryId].entries.push(entry);
  }
  for (const category of categories) category.notes = noteLines[category.id].join('\n').trim();
  const entries = categories.flatMap(category => category.entries);
  if (seenSections.size !== 13 || entries.length !== 98 || categories.some(category => !category.entries.length)) {
    throw new Error(`Incomplete API reference: expected thirteen sections and 98 declarations, found ${seenSections.size} sections and ${entries.length} declarations.`);
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
  loadSound: 'audio effect clip wav', loadMusic: 'audio music track loop', Sound: 'audio effect', Music: 'audio track',
  keyDown: 'keyboard keys held pressed input', keyPressed: 'keyboard edge once input', mousePressed: 'mouse edge click once input',
  SpriteAnimation: 'sprite sheet animation frames grid', ImageRegion: 'atlas crop source image rectangle', textCentered: 'text centre center baseline', rect: 'rectangle', outlineRect: 'rectangle outline',
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
      const searchable = [entry.name, entry.owner, entry.signature, entry.description, entry.categoryTitle, aliases[entry.name] ?? ''].join(' ').toLowerCase();
      return tokens.every(token => searchable.includes(token));
    })
    .sort((left, right) => rank(left) - rank(right));
}

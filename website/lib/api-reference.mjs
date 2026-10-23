/** Structured presentation of the canonical student API, without copying its declarations. */
const categoryDefinitions = [
  ['startup', 'App startup', 'Choose an app and define its callbacks.'],
  ['interface', 'Window and interface', 'Configure the window and show JavaFX controls.'],
  ['game-flow', 'Game flow', 'Navigate between game views and explicitly pause gameplay updates.'],
  ['components', 'Zero UI', 'Compose labels, buttons and vertical columns using Zero imports.'],
  ['colors', 'Zero colours', 'Choose canvas colours without a JavaFX import.'],
  ['canvas', 'Canvas', 'Read canvas dimensions and use native JavaFX objects.'],
  ['drawing', 'Drawing', 'Draw shapes, lines and text in canvas pixels.'],
  ['images', 'Images', 'Load bundled images and draw them on the canvas.'],
  ['regions', 'Image regions', 'Select source rectangles without copying image pixels.'],
  ['animation', 'Sprite animation', 'Advance independent looping frame sequences explicitly.'],
  ['actors', 'Actors', 'Keep sprites, centre positions and explicit movement in ordinary Java objects.'],
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
  padding: 'Inherited by GameApp from App. Call in settings(), setup() or a JavaFX event handler. The default is 0; padding(0) removes it and repeated calls replace the amount. GameApp keeps its canvas dimensions. Later calls rearrange content without resizing the window.',
  show: 'Call in setup() or later. Content must not be null.',
  update: 'While gameplay is visible and not explicitly paused. The example assumes a double field named x. First-frame seconds is 0; later values are capped at 0.1.',
  draw: 'Runs only while gameplay is visible, including during explicit pause. The canvas is not cleared automatically. Drawing styles persist between frames.',
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
    text: 'Non-null text to display.', action: 'Non-null Runnable action; replaces the previous click callback.',
    node: 'Non-null backing JavaFX node for advanced interoperability.',
    children: 'Elements in order; non-null, distinct and not already attached to a parent or scene.',
    spacing: 'Vertical spacing in pixels; non-negative and finite.',
    red: 'Red channel, an integer from 0 through 255.', green: 'Green channel, an integer from 0 through 255.', blue: 'Blue channel, an integer from 0 through 255.',
    content: method === 'show' ? 'JavaFX node to display; must not be null.' : 'Root layout containing the app content.',
    actor: 'Non-null Actor to draw explicitly; no update or registration.',
    app: 'GameApp canvas to draw on; must not be null.',
    dx: 'Finite horizontal movement in pixels.', dy: 'Finite vertical movement in pixels.',
    targetX: 'Finite target horizontal centre in canvas pixels.', targetY: 'Finite target vertical centre in canvas pixels.',
    degrees: 'Finite clockwise degrees; rotation is normalized to [0, 360).',
    speed: method === 'moveToward' ? 'Pixels per second; non-negative and finite.' : 'Signed pixels per second; finite. Negative moves backward.',
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
    return { 'zero.ui.Element': 'components', 'zero.ui.Label': 'components', 'zero.ui.Button': 'components', 'zero.ui.Column': 'components', Color: 'colors', 'Game flow': 'game-flow', Audio: 'audio', Sound: 'audio', Music: 'audio', GameApp: 'startup', Canvas: 'canvas', Drawing: 'drawing', Images: 'images', Input: 'input', ImageRegion: 'regions', SpriteAnimation: 'animation', Actor: 'actors', Collisions: 'collisions', 'Lifecycle and extension hooks': 'advanced' }[section];
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
    const field = signature.match(/^static final (\w+) (\w+)$/);
    const declaration = signature.match(/^(?:(?:public|protected|final|static)\s+)*(?:(\w+(?:\.\w+)*)\s+)?(\w+)\(([^()]*)\)$/);
    if (!declaration && !field) throw new Error(`Malformed API signature: ${signature}`);
    const [, , name, argumentsText = ''] = declaration ?? field;
    const className = section.split('.').at(-1);
    const uiHelper = section.startsWith('zero.ui.');
    const helper = uiHelper || ['Color', 'ImageRegion', 'SpriteAnimation', 'Actor', 'Collisions', 'Sound', 'Music'].includes(section);
    if (!field && !declaration[1] && (!helper || name !== className)) throw new Error(`Malformed API constructor: ${signature}`);
    const owner = helper ? section : ['App', 'Audio'].includes(section) || (categoryId === 'advanced' && subsection !== 'Protected GameApp overrides') ? 'App' : 'GameApp';
    const parameters = argumentsText ? argumentsText.split(',').map(argument => {
      const parameter = argument.trim().match(/^(\w+(?:\.\w+)*(?:\.\.\.)?)\s+(\w+)$/);
      if (!parameter) throw new Error(`Malformed API parameter: ${argument}`);
      return { type: parameter[1], name: parameter[2], description: section === 'Actor' && ['Actor', 'setPosition'].includes(name) && ['x', 'y'].includes(parameter[2]) ? `Finite ${parameter[2] === 'x' ? 'horizontal' : 'vertical'} centre in canvas pixels.` : section === 'Actor' && ['width', 'height'].includes(parameter[2]) ? 'Drawing dimension in pixels; strictly positive and finite.' : section === 'Actor' && parameter[2] === 'seconds' ? 'Elapsed seconds; non-negative and finite. Main passes this explicitly.' : parameterDescription(parameter[2], name) };
    }) : [];
    const sourceType = parameters[0]?.type;
    const variant = sourceType === 'ImageRegion' ? '-region' : sourceType === 'SpriteAnimation' ? '-animation' : '';
    const id = owner === 'GameApp' && name === 'draw' && sourceType === 'Actor' ? 'gameapp-draw-actor'
      : owner === 'Actor' && name === 'Actor' && sourceType === 'double' ? 'actor-constructor-position'
      : owner === 'Actor' && name === 'draw' && parameters.length === 0 ? 'actor-draw-callback'
      : categoryId === 'game-flow' ? `gameapp-${name}`
      : uiHelper ? `ui-${className.toLowerCase()}-${name === className ? `constructor${sourceType === 'double' ? '-spacing' : ''}` : name}`
      : owner === 'Color' ? `color-${name}`
      : name === 'show' && sourceType === 'zero.ui.Element' ? 'show-element'
      : owner === 'GameApp' && ['background', 'fill', 'stroke'].includes(name) && sourceType === 'zero.Color' ? `${name}-zero-color`
      : signature.startsWith('protected ') ? `${owner.toLowerCase()}-${name}`
      : owner === 'Actor' ? `actor-${name === owner ? 'constructor' : name}${['Actor', 'setImage'].includes(name) ? variant : ''}`
      : helper ? `${owner.toLowerCase()}-${name === owner ? `constructor${sourceType === 'double' ? '-frames' : ''}` : name}`
      : name === 'image' ? `image${variant}${parameters.length === 5 ? '-scaled' : ''}`
      : ['imageCentered', 'imageFlippedY'].includes(name) ? `${name}${variant}`
      : name === 'canvas' ? 'canvas-access' : name;
    const metadataKey = name === 'image' && parameters.length === 5 ? 'image-scaled' : name;
    const entry = { id, name, owner, ...(field ? { kind: 'field' } : {}), signature, description, parameters, related: related[id] ?? related[name] ?? [] };
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
    if (owner === 'Actor') {
      const argument = sourceType === 'ImageRegion' ? 'region' : sourceType === 'SpriteAnimation' ? 'walk' : 'image';
      const actorExamples = {
        Actor: sourceType === 'double' ? 'Actor actor = new Actor(100, 80);' : `Actor actor = new Actor(${argument}, 100, 80);`,
        x: 'double centreX = actor.x();', y: 'double centreY = actor.y();',
        width: 'double left = actor.x() - actor.width() / 2;', height: 'double top = actor.y() - actor.height() / 2;',
        rotation: 'double facing = actor.rotation();', setPosition: 'actor.setPosition(100, 80);',
        setSize: 'actor.setSize(48, 48);', setRotation: 'actor.setRotation(90);',
        move: 'actor.move(100 * seconds, 0);', moveForward: 'actor.moveForward(100, seconds);',
        rotate: 'actor.rotate(90 * seconds);', face: 'actor.face(mouseX(), mouseY());',
        moveToward: 'enemy.moveToward(player.x(), player.y(), 70, seconds);',
        setImage: `actor.setImage(${argument});`, update: 'actor.update(seconds);', draw: 'actor.draw(this);',
      };
      entry.example = actorExamples[name];
      entry.related = name === 'Actor' ? ['actor-update', 'actor-draw', 'actor-setSize']
        : name === 'draw' ? ['actor-update', 'imageCentered']
        : name === 'update' ? ['actor-draw', 'spriteanimation-update']
        : name === 'moveToward' ? ['actor-face', 'actor-moveForward', 'collisions-rectHitsRect']
        : ['actor-constructor', 'actor-update', 'actor-draw'];
      entry.note = 'Actor is an unreleased local source addition. Main calls actor.update(seconds) and draw(actor) explicitly. Position is the centre; creating an actor does not register it with the app.';
    }
    if (owner === 'Actor' && signature.startsWith('protected ')) {
      entry.example = examples[name]?.replaceAll('Color.', 'zero.Color.');
      if (name === 'circle') entry.example = 'fill(zero.Color.BLUE);\ncircle(0, 0, 24);';
      entry.related = ['actor-draw-callback', 'gameapp-draw-actor', 'actor-constructor-position'];
      entry.note = 'Protected final Actor helper. Call only in this actor’s active base draw(GameApp) scope, normally from draw(); otherwise IllegalStateException. Coordinates are actor-local; setSize does not automatically scale custom drawing.';
      for (const parameter of entry.parameters) {
        if (parameter.name === 'color') parameter.description = 'Non-null zero.Color, not javafx.scene.paint.Color.';
        else if (['x', 'y', 'x1', 'y1', 'x2', 'y2', 'centreX', 'centreY'].includes(parameter.name)) parameter.description = 'Actor-local canvas coordinate before its rotation.';
        else if (['width', 'height'].includes(parameter.name)) parameter.description = 'Local drawing dimension in canvas pixels.';
      }
    }
    if (id === 'actor-draw-callback') {
      entry.example = '@Override\npublic void draw() {\n    fill(zero.Color.BLUE);\n    circle(0, 0, 24);\n}';
      entry.related = ['gameapp-draw-actor', 'actor-draw', 'actor-circle', 'actor-fill'];
      entry.note = 'Override in an Actor subclass. The base draw(GameApp) establishes local translation/rotation and restores styles/transform/context in finally. Main calls draw(actor); drawing never updates the actor.';
    }
    if (id === 'gameapp-draw-actor') {
      entry.example = 'draw(player);';
      entry.related = ['actor-draw-callback', 'actor-draw', 'draw', 'actor-update'];
      entry.note = 'Calls the existing actor.draw(this) entry point to preserve legacy overrides. The base Actor entry point scopes the local draw() callback. Main owns update calls; no registration.';
    }
    if (uiHelper) {
      const variable = className.toLowerCase();
      const uiExamples = {
        Element: 'public class ScoreDisplay extends Element {\n    public ScoreDisplay() {\n        super(new Label("Score: 0").fxNode());\n    }\n}',
        Label: 'Label label = new Label("Score: 0");', Button: 'Button button = new Button("Add point");',
        Column: sourceType === 'double' ? 'Column column = new Column(12, label, button);' : 'Column column = new Column(label, button);',
        fxNode: 'Node node = score.fxNode(); // Advanced JavaFX bridge',
        getText: `String text = ${variable}.getText();`, setText: `${variable}.setText("Ready");`,
        onClick: 'button.onClick(() -> score.setScore(1));', getSpacing: 'double gap = column.getSpacing();', setSpacing: 'column.setSpacing(12);',
      };
      entry.example = uiExamples[name];
      entry.related = name === 'fxNode' || className === 'Element' ? ['ui-label-constructor', 'show-element', 'controls']
        : ['ui-element-fxNode', 'show-element', 'controls'];
      entry.note = 'Unreleased Zero UI addition. Use zero.ui imports; Label, Button and Column inherit fxNode() from Element. JavaFX remains available through the advanced bridge.';
    }
    if (owner === 'Color') {
      entry.example = field ? `fill(zero.Color.${name});` : 'fill(zero.Color.rgb(80, 120, 200));';
      entry.related = ['background-zero-color', 'fill-zero-color', 'stroke-zero-color'];
      entry.note = 'Import zero.Color for this wrapper. Existing javafx.scene.paint.Color overloads remain available.';
    }
    if (id === 'show-element' || id === 'controls') {
      entry.example = `${name}(new zero.ui.Column(new zero.ui.Label("Ready")));`;
      entry.related = ['ui-column-constructor', id === 'controls' ? 'show-element' : 'controls'];
      entry.note = id === 'controls' ? 'Use for a live game HUD. Retains canvas and gameplay state; does not navigate or clear explicit pause. A different parent or scene is rejected; the current bottom panel can be mounted again.' : 'Inherited by GameApp. Navigating away suspends gameplay update, draw and canvas input. showGame returns to the retained canvas/HUD. Frame requests commit after the current draw; idle UI callbacks commit immediately.';
      entry.parameters[0].description = 'Non-null Zero element; uses ordinary JavaFX node ownership.';
    }
    if (owner === 'GameApp' && sourceType === 'zero.Color') {
      entry.example = `${name}(zero.Color.${name === 'fill' ? 'BLUE' : name === 'stroke' ? 'BLACK' : 'WHITE'});`;
      entry.related = ['color-rgb', 'color-WHITE', name];
      entry.parameters[0].description = 'Non-null zero.Color wrapper; distinct from javafx.scene.paint.Color.';
      entry.note = 'Unreleased Zero colour overload. Use import zero.Color, or the qualified name shown here.';
    }
    if (id === 'show') {
      entry.related = ['show-element', 'gameapp-showGame', 'controls', 'layout'];
      entry.note = 'On GameApp, suspends gameplay update, draw and canvas input while another view is shown. showGame restores the retained canvas/HUD. Requests during a frame commit after its successful draw.';
    }
    if (categoryId === 'game-flow') {
      entry.example = {showGame: 'showGame();', pause: 'pause();', resume: 'resume();\nshowGame();', isPaused: 'boolean paused = isPaused();'}[name];
      entry.related = ['gameapp-showGame', 'gameapp-pause', 'gameapp-resume', 'gameapp-isPaused', 'show-element', 'controls'].filter(target => target !== id);
      entry.note = 'Unreleased GameApp navigation/pause addition. Main owns game state and view choices; no zero.Screen class or automatic screen lifecycle exists. Call in setup or later on the JavaFX application thread.';
    }
    if (id === 'image-scaled') entry.note = methodNotes.image;
    byId[categoryId].entries.push(entry);
  }
  for (const category of categories) category.notes = noteLines[category.id].join('\n').trim();
  const entries = categories.flatMap(category => category.entries);
  if (seenSections.size !== 20 || entries.length !== 159 || categories.some(category => !category.entries.length)) {
    throw new Error(`Incomplete API reference: expected twenty sections and 159 declarations, found ${seenSections.size} sections and ${entries.length} declarations.`);
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
  showGame: 'navigation screen title help results replay retained canvas hud', pause: 'game gameplay freeze updates explicit pause', resume: 'game gameplay continue unpause clock input', isPaused: 'game gameplay explicit pause state',
  Element: 'zero ui component reusable view JavaFX bridge', Label: 'zero ui component text', Button: 'zero ui component click callback action', Column: 'zero ui component vertical layout spacing',
  onClick: 'click callback action Runnable lambda', controls: 'game hud panel live canvas', fxNode: 'advanced JavaFX interoperability node bridge', rgb: 'color colour red green blue channels',
  draw: 'render actor callback local shape sprite',
  Actor: 'player enemy sprite centre center position facing movement subclass',
  moveForward: 'actor heading facing forward backward speed', moveToward: 'actor enemy chase follow target stop overshoot',
  face: 'actor heading facing turn target', rotate: 'actor clockwise turn heading', setPosition: 'actor centre center coordinates',
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { tokens, webThemeCss, vscodeThemeCss } from '../adapters.mjs';

const colorKeys = ['page', 'surface', 'text', 'muted', 'accent', 'accent-hover', 'on-accent', 'border', 'focus', 'error', 'link'];
const sharedKeys = ['font', 'font-size', 'radius', ...Array.from({ length: 6 }, (_, i) => `space-${i + 1}`)];

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

// Resolve the adapter's explicit fallback chains to verify host precedence and
// standalone previews. This is not a browser CSS/cascade or conformance test.
function resolve(value, host = {}) {
  while (value.includes('var(')) {
    const next = value.replace(/var\((--[\w-]+), ([^()]*)\)/g, (_, key, fallback) => host[key] ?? fallback);
    assert.notEqual(next, value, `Unresolved expression: ${value}`);
    value = next;
  }
  return value;
}

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Missing selector ${selector}`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--zero-([\w-]+): ([^;]+);/g)].map(match => [match[1], match[2]]));
}

test('schema, exact semantic contract and light/dark key parity', () => {
  assert.equal(tokens.schemaVersion, 1);
  assert.equal(tokens.status, 'approved-learn-sidebar');
  assert.deepEqual(Object.keys(tokens.themes).sort(), ['dark', 'light']);
  assert.deepEqual(Object.keys(tokens.shared).sort(), sharedKeys.sort());
  for (const theme of Object.values(tokens.themes)) {
    assert.deepEqual(Object.keys(theme).sort(), [...colorKeys].sort());
    for (const value of Object.values(theme)) assert.match(value, /^#[0-9a-f]{6}$/);
  }
  assert.deepEqual(Object.fromEntries(['page', 'text', 'muted', 'accent'].map(key => [key, tokens.themes.light[key]])),
    { page: '#ffffff', text: '#080e25', muted: '#535c76', accent: '#683bef' });
  assert.equal(tokens.shared.radius, '6px');
  assert.deepEqual(sharedKeys.filter(key => key.startsWith('space-')).map(key => tokens.shared[key]), ['4px', '8px', '12px', '16px', '24px', '32px']);
});

for (const [name, theme] of Object.entries(tokens.themes)) {
  test(`${name}: readable text and action labels; visible border and focus`, () => {
    for (const background of ['page', 'surface']) {
      for (const foreground of ['text', 'muted', 'link', 'error']) {
        const ratio = contrast(theme[foreground], theme[background]);
        assert.ok(ratio >= 4.5, `${name} ${foreground}/${background}: ${ratio.toFixed(2)}`);
      }
      for (const indicator of ['border', 'focus']) {
        const ratio = contrast(theme[indicator], theme[background]);
        assert.ok(ratio >= 3, `${name} ${indicator}/${background}: ${ratio.toFixed(2)}`);
      }
    }
    for (const background of ['accent', 'accent-hover']) {
      const ratio = contrast(theme['on-accent'], theme[background]);
      assert.ok(ratio >= 4.5, `${name} on-accent/${background}: ${ratio.toFixed(2)}`);
    }
  });
  test(`${name}: web CSS exports the complete contract`, () => {
    assert.deepEqual(cssBlock(webThemeCss(name), ':root'), { ...tokens.shared, ...theme });
    assert.match(webThemeCss(name), new RegExp(`color-scheme: ${name};`));
  });
}

test('web theme input rejects unsupported values', () => {
  assert.equal(webThemeCss(), webThemeCss('light'));
  for (const theme of ['system', 'constructor', '__proto__', 'light; color: red', null]) {
    assert.throws(() => webThemeCss(theme), RangeError);
  }
});

test('VS Code adapter maps host semantics and fonts without shell styling', () => {
  const css = vscodeThemeCss();
  const root = cssBlock(css, ':root');
  assert.deepEqual(Object.keys(root).sort(), [...sharedKeys, ...colorKeys].sort());
  const expected = { page: 'sideBar-background', surface: 'editorWidget-background', text: 'sideBar-foreground', muted: 'descriptionForeground', accent: 'button-background', 'accent-hover': 'button-hoverBackground', 'on-accent': 'button-foreground', border: 'widget-border', focus: 'focusBorder', error: 'errorForeground', link: 'textLink-foreground', font: 'font-family', 'font-size': 'font-size' };
  for (const [key, hostKey] of Object.entries(expected)) {
    assert.match(root[key], new RegExp(`var\\(--vscode-${hostKey},`));
    assert.equal(resolve(root[key], { [`--vscode-${hostKey}`]: 'host-value' }), 'host-value');
  }
  assert.equal(resolve(root.text, { '--vscode-foreground': '#123456' }), '#123456');
  assert.equal(resolve(root.border, { '--vscode-input-border': '#123456' }), '#123456');
  assert.equal(resolve(root['font-size']), '13px');
  assert.equal(resolve(root.accent), '#007acc');
  assert.equal(resolve(cssBlock(css, 'body.vscode-dark').accent), '#0e639c');
  assert.doesNotMatch(css, /(^|\n)\s*(background|color|font-family|font-size):/);
});

test('VS Code high contrast respects supplied host colors and supplies distinct fallbacks', () => {
  const css = vscodeThemeCss();
  for (const [selector, page, text] of [['body.vscode-high-contrast', '#000000', '#ffffff'], ['body.vscode-high-contrast-light', '#ffffff', '#000000']]) {
    const block = cssBlock(css, selector);
    assert.equal(resolve(block.page), page);
    assert.equal(resolve(block.text), text);
    assert.equal(resolve(block.muted), text);
    assert.equal(resolve(block.border), text);
    assert.equal(resolve(block.border, { '--vscode-contrastBorder': '#abcdef' }), '#abcdef');
    assert.equal(resolve(block.focus, { '--vscode-focusBorder': '#fedcba' }), '#fedcba');
    assert.ok(contrast(resolve(block.text), resolve(block.page)) >= 7);
  }
});

test('forced colors use paired system colors and preserve native adjustment', () => {
  for (const [css, selector] of [
    [webThemeCss('light'), ':root'], [webThemeCss('dark'), ':root'],
    [vscodeThemeCss(), ':root, body, body.vscode-light, body.vscode-dark, body.vscode-high-contrast, body.vscode-high-contrast-light']
  ]) {
    assert.match(css, /@media \(forced-colors: active\)/);
    // Equal specificity to host-theme blocks, later in the stylesheet: forced
    // colors must win even when VS Code applies a body theme class.
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    const block = cssBlock(forced, selector);
    assert.ok(css.indexOf('@media (forced-colors: active)') > css.indexOf('\nbody.vscode-high-contrast-light {'));
    assert.equal(block.page, 'Canvas');
    assert.equal(block.text, 'CanvasText');
    assert.equal(block.link, 'LinkText');
    assert.equal(block.accent, 'Highlight');
    assert.equal(block['accent-hover'], 'Highlight');
    assert.equal(block['on-accent'], 'HighlightText');
    assert.equal(block.focus, 'Highlight');
    assert.doesNotMatch(css, /forced-color-adjust:\s*none/);
  }
});

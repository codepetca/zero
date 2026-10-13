import { readFileSync } from 'node:fs';

// Shared source for approved Learn and sidebar themes and the review playground.
export const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));

function declarations(values) {
  return Object.entries(values).map(([key, value]) => `  --zero-${key}: ${value};`).join('\n');
}

const forcedColors = (selectors = ':root, body, body.vscode-light, body.vscode-dark, body.vscode-high-contrast, body.vscode-high-contrast-light') => `@media (forced-colors: active) {
  ${selectors} {
${declarations({ page: 'Canvas', surface: 'Canvas', text: 'CanvasText', muted: 'CanvasText', accent: 'Highlight', 'accent-hover': 'Highlight', 'on-accent': 'HighlightText', border: 'CanvasText', focus: 'Highlight', error: 'CanvasText', link: 'LinkText' })}
  }
}`;

export function webThemeCss(theme = 'light', selector = ':root') {
  if (!Object.hasOwn(tokens.themes, theme)) throw new RangeError(`Unknown Zero review theme: ${theme}`);
  return `${selector} {
  color-scheme: ${theme};
${declarations({ ...tokens.shared, ...tokens.themes[theme] })}
}
${forcedColors(selector)}\n`;
}

// Host variables take precedence. Fallbacks let the standalone fixture preview
// missing host values; they do not impose a VS Code shell theme. Editor controls
// use native button colors, while the existing brand mark keeps its own purple.
function hostColors(theme) {
  const dark = theme === 'dark';
  const fallback = dark
    ? { page: '#252526', surface: '#1e1e1e', text: '#cccccc', muted: '#b3b3b3', accent: '#0e639c', hover: '#1177bb', border: '#858585', focus: '#007fd4', error: '#f48771', link: '#4daafc' }
    : { page: '#ffffff', surface: '#f3f3f3', text: '#333333', muted: '#616161', accent: '#007acc', hover: '#0062a3', border: '#767676', focus: '#007acc', error: '#a1260d', link: '#006ab1' };
  return {
    page: `var(--vscode-sideBar-background, ${fallback.page})`,
    surface: `var(--vscode-editorWidget-background, ${fallback.surface})`,
    text: `var(--vscode-sideBar-foreground, var(--vscode-foreground, ${fallback.text}))`,
    muted: `var(--vscode-descriptionForeground, ${fallback.muted})`,
    accent: `var(--vscode-button-background, ${fallback.accent})`,
    'accent-hover': `var(--vscode-button-hoverBackground, ${fallback.hover})`,
    'on-accent': 'var(--vscode-button-foreground, #ffffff)',
    border: `var(--vscode-widget-border, var(--vscode-input-border, ${fallback.border}))`,
    focus: `var(--vscode-focusBorder, ${fallback.focus})`,
    error: `var(--vscode-errorForeground, ${fallback.error})`,
    link: `var(--vscode-textLink-foreground, ${fallback.link})`
  };
}

export function vscodeThemeCss() {
  return `:root {
${declarations({ ...tokens.shared, ...hostColors('light'), font: `var(--vscode-font-family, ${tokens.shared.font})`, 'font-size': 'var(--vscode-font-size, 13px)' })}
}
body.vscode-dark {
  color-scheme: dark;
${declarations(hostColors('dark'))}
}
body.vscode-light {
  color-scheme: light;
}
body.vscode-high-contrast {
  color-scheme: dark;
${declarations({ ...hostColors('dark'), page: 'var(--vscode-sideBar-background, #000000)', surface: 'var(--vscode-editorWidget-background, #000000)', text: 'var(--vscode-sideBar-foreground, var(--vscode-foreground, #ffffff))', muted: 'var(--vscode-descriptionForeground, #ffffff)', border: 'var(--vscode-contrastBorder, #ffffff)', focus: 'var(--vscode-focusBorder, #f38518)' })}
}
body.vscode-high-contrast-light {
  color-scheme: light;
${declarations({ ...hostColors('light'), page: 'var(--vscode-sideBar-background, #ffffff)', surface: 'var(--vscode-editorWidget-background, #ffffff)', text: 'var(--vscode-sideBar-foreground, var(--vscode-foreground, #000000))', muted: 'var(--vscode-descriptionForeground, #000000)', border: 'var(--vscode-contrastBorder, #000000)', focus: 'var(--vscode-focusBorder, #000000)' })}
}
${forcedColors()}\n`;
}

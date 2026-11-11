'use strict';

const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');

const zeroMark = readFileSync(path.join(__dirname, '../media/zero.svg'), 'utf8')
  .trim()
  .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
const zeroName = `<span class="name">${zeroMark}Zero</span>`;
const returnToZero = `Return to ${zeroName}`;

const styles = `
  :root {
    color-scheme: light dark;
    --page: #ffffff;
    --text: #080e25;
    --muted: #535c76;
    --accent: #683bef;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #101321;
      --text: #f5f6ff;
      --muted: #b6bed6;
      --accent: #b19aff;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--page);
    color: var(--text);
    font: 1rem/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 30rem; min-width: 0; text-align: center; }
  h1 { margin: 0; font-size: 2rem; font-weight: 650; letter-spacing: -0.032em; line-height: 1.17; }
  .name { white-space: nowrap; }
  .name svg { width: 0.9em; height: 0.9em; margin-inline-end: 0.08em; vertical-align: -0.1em; color: var(--accent); }
  p { margin: 10px 0 0; color: var(--muted); }
`;

// All page text is authored here. Callback data never enters the HTML.
function render(title, message, heading = title) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <h1>${heading}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

const pages = {
  returned: render('Return to Zero', 'You can close this tab and continue in the app.', returnToZero),
  cancelled: render('GitHub sign-in was cancelled', `${returnToZero} to try again.`),
  invalid: render('This sign-in attempt is invalid or expired', `${returnToZero} to start again.`),
  failed: render('GitHub sign-in didn’t complete', `${returnToZero} to try again.`),
  unavailable: render('GitHub sign-in is unavailable', `${returnToZero} and try again later.`),
};

const styleHash = createHash('sha256').update(styles).digest('base64');
const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; style-src 'sha256-${styleHash}'`,
};

module.exports = {pages, pageHeaders};

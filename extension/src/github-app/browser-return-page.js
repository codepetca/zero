'use strict';

const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');

const zeroMark = readFileSync(path.join(__dirname, '../../media/zero.svg'), 'utf8')
  .trim()
  .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

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

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Return to Zero</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <h1>Return to <span class="name">${zeroMark}Zero</span></h1>
    <p>You can close this tab and continue in the app.</p>
  </main>
</body>
</html>`;

const styleHash = createHash('sha256').update(styles).digest('base64');

module.exports = {html, styleHash};

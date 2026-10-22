'use strict';
const {readFileSync} = require('node:fs');
const path = require('node:path');
let styles;
// Inline within each webview's nonce-protected style; never inject host styles.
function controlsStyles() {
  if (styles === undefined) styles = readFileSync(path.join(__dirname, '../media/controls.css'), 'utf8');
  return styles;
}
module.exports = {controlsStyles};

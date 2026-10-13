'use strict';
const { readFileSync } = require('node:fs');
const path = require('node:path');
let styles;
function sidebarStyles() {
  if (styles === undefined) {
    try { styles = readFileSync(path.join(__dirname, '../media/generated-theme.css'), 'utf8'); }
    catch (error) { throw new Error(`Zero's shared theme is missing. Developers: run node design/prepare.mjs before launching the extension. ${error.message}`); }
  }
  return styles;
}
module.exports = { sidebarStyles };

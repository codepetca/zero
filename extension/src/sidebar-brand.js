'use strict';
const {readFileSync}=require('node:fs');
const path=require('node:path');
// Reuse the trusted packaged mark so sidebar branding follows the shared asset.
const mark=readFileSync(path.join(__dirname,'../media/zero.svg'),'utf8')
  .replace('<svg ','<svg aria-hidden="true" focusable="false" ');
function sidebarBrand() {return `<header class="sidebar-brand">${mark}<h1>Zero</h1></header>`;}
module.exports={sidebarBrand};

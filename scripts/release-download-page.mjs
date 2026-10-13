import assert from 'node:assert/strict';
import {parse} from 'parse5';

const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const excluded = new Set(['head','script','style','template','noscript']);
function attributes(node) {return Object.fromEntries((node.attrs || []).map(attr => [attr.name,attr.value]));}
function hidden(node) {
  const attrs = attributes(node);
  return excluded.has(node.tagName) || Object.hasOwn(attrs,'hidden') || Object.hasOwn(attrs,'inert') ||
    attrs['aria-hidden']?.toLowerCase() === 'true' ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/i.test(attrs.style || '');
}
function text(node) {
  const pending = [node], parts = [];
  while (pending.length) {
    const child = pending.pop();
    if (hidden(child)) continue;
    if (child.nodeName === '#text') parts.push(child.value);
    pending.push(...(child.childNodes || []).slice().reverse());
  }
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
// HTML semantics, not regex matches in scripts/templates or hidden ancestors.
// This is an HTTP markup check; computed CSS and user interactions still need UI verification.
export function downloadPage(html) {
  assert.ok(Buffer.byteLength(html,'utf8') <= 2 * 1024 * 1024,'Live download markup is too large.');
  const anchors = [], sections = [];
  const pending = [{node:parse(html),section:null}];
  while (pending.length) {
    const {node,section} = pending.pop();
    if (hidden(node)) continue;
    let owner = section;
    if (node.namespaceURI === htmlNamespace) {
      const attrs = attributes(node);
      if (node.tagName === 'section' && attrs.id === 'downloads') {
        owner = {anchors:[]}; sections.push(owner);
      }
      if (node.tagName === 'a' && Object.hasOwn(attrs,'href')) {
        const anchor = {href:attrs.href,text:text(node)};
        anchors.push(anchor); if (owner) owner.anchors.push(anchor);
      }
    }
    pending.push(...(node.childNodes || []).slice().reverse().map(child=>({node:child,section:owner})));
  }
  return {anchors,sections};
}

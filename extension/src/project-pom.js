'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
async function ordinaryFile(filename, label) {
  const resolved = path.resolve(filename);
  const actual = await fs.realpath(resolved);
  const stat = await fs.lstat(resolved);
  if (actual !== resolved || !stat.isFile()) fail(`${label} must be a regular file without symbolic links.`);
  return resolved;
}
// A deliberately small, structural XML reader. Offsets preserve all unowned bytes.
// Unsupported namespaces, entities, DTDs and processing instructions fail closed.
function parseXml(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) fail('Unsupported POM XML. Use the ordinary Zero starter POM without DTDs or entities.');
  const document = {name: '#document', children: [], comments: []};
  const stack = [document];
  let offset = 0;
  const tokens = /<!--[\s\S]*?-->|<\?xml\s[^?]*\?>|<\/?[A-Za-z_][^<>]*>/g;
  let match;
  while ((match = tokens.exec(text))) {
    appendText(text.slice(offset, match.index), stack.at(-1));
    const token = match[0];
    if (token.startsWith('<!--')) {
      if (token.slice(4, -3).includes('--')) fail('Unsupported POM comment.');
      stack.at(-1).comments.push({text: token.slice(4, -3), start: match.index, end: tokens.lastIndex});
    } else if (token.startsWith('<?')) {
      if (match.index !== 0 || stack.length !== 1) fail('Unsupported POM processing instruction.');
      if (!/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>$/i.test(token)) fail('Use UTF-8 XML 1.0 for the project POM.');
    } else if (token.startsWith('</')) {
      const name = /^<\/([A-Za-z_][A-Za-z0-9_.-]*)\s*>$/.exec(token)?.[1];
      const node = stack.pop();
      if (!name || stack.length < 1 || node.name !== name) fail('The project POM XML is not well formed.');
      node.close = match.index; node.end = tokens.lastIndex;
    } else {
      const parts = /^<([A-Za-z_][A-Za-z0-9_.-]*)([\s\S]*?)(\/?)>$/.exec(token);
      if (!parts) fail('Unsupported POM XML names or namespaces.');
      const [, name, attributes, self] = parts;
      if (attributes.trim() && !(name === 'project' && stack.length === 1 && validRootAttributes(attributes))) fail('Unsupported POM attributes. Use the ordinary Zero starter layout.');
      const node = {name, children: [], comments: [], text: '', start: match.index, open: tokens.lastIndex, parent: stack.at(-1)};
      stack.at(-1).children.push(node);
      if (self) { node.close = match.index; node.end = tokens.lastIndex; node.selfClosing = true; } else stack.push(node);
    }
    offset = tokens.lastIndex;
  }
  appendText(text.slice(offset), stack.at(-1));
  if (stack.length !== 1 || document.children.length !== 1 || document.children[0].name !== 'project' || document.text?.trim()) fail('The project POM XML is not well formed.');
  const project = document.children[0];
  if (allNodes(project).some(node => node.children.length && node.text.trim())) fail('Unsupported mixed XML content in the project POM.');
  return project;
}
function validRootAttributes(input) {
  const entries = input.match(/(?:xmlns(?::xsi)?|xsi:schemaLocation)\s*=\s*(?:"[^"]*"|'[^']*')/g) || [];
  if (input.replace(/(?:xmlns(?::xsi)?|xsi:schemaLocation)\s*=\s*(?:"[^"]*"|'[^']*')/g, '').trim()) return false;
  const names = entries.map(item => item.split(/\s*=/)[0]);
  return names.length === new Set(names).size && entries.every(entry => {
    const content = entry.match(/=(?:\s*)["']([\s\S]*)["']$/)[1];
    if (entry.startsWith('xmlns:xsi')) return content === 'http://www.w3.org/2001/XMLSchema-instance';
    if (entry.startsWith('xmlns=' ) || /^xmlns\s*=/.test(entry)) return content === 'http://maven.apache.org/POM/4.0.0';
    return content === 'http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd';
  });
}
function appendText(text, node) {
  if (text.includes('<') || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('Unsupported POM XML text or entity.');
  node.text = (node.text || '') + text;
}
function value(node) {
  if (!node || node.children.length) fail('Expected one ordinary POM value.');
  return node.text.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"})[name]);
}
function single(node, name, optional = false) {
  const nodes = node.children.filter(child => child.name === name);
  if (nodes.length > 1 || (!optional && nodes.length !== 1)) fail(`Expected one ${name} in the ordinary Zero POM.`);
  return nodes[0];
}
function allNodes(node) { return [node, ...node.children.flatMap(allNodes)]; }
// Java performs Unicode translation before recognizing comments or strings.
// Declaration-only scanning never evaluates source and preserves the original file.
function javaDeclarationText(input) {
  let translated = '', trailingSlashes = 0, escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '\\' && (escaped || trailingSlashes % 2 === 0) && input[i + 1] === 'u') {
      let end = i + 1; while (input[end] === 'u') end++;
      const hex = input.slice(end, end + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Malformed Java Unicode escape. Fix the source before adding a library.');
      const decoded = String.fromCharCode(parseInt(hex, 16));
      translated += decoded; trailingSlashes = decoded === '\\' ? trailingSlashes + 1 : 0; escaped = true; i = end + 3;
    } else { translated += char; trailingSlashes = char === '\\' ? trailingSlashes + 1 : 0; escaped = false; }
  }
  let result = '';
  for (let i = 0; i < translated.length;) {
    if (translated.startsWith('//', i)) { const relative = translated.slice(i + 2).search(/[\r\n]/); const end = relative < 0 ? -1 : i + 2 + relative; i = end < 0 ? translated.length : end; result += ' '; }
    else if (translated.startsWith('/*', i)) { const end = translated.indexOf('*/', i + 2); if (end < 0) fail('Unclosed Java comment. Fix the source before adding a library.'); i = end + 2; result += ' '; }
    else if (translated[i] === '"' || translated[i] === "'") {
      const quote = translated.startsWith('"""', i) ? '"""' : translated[i]; i += quote.length;
      while (i < translated.length && !translated.startsWith(quote, i)) i += translated[i] === '\\' ? 2 : 1;
      if (i >= translated.length) fail('Unclosed Java string. Fix the source before adding a library.');
      i += quote.length; result += ' ';
    } else result += translated[i++];
  }
  // Java ignores these characters inside identifier names, including after
  // Unicode escape translation. Compare the compiler's names without editing source.
  return result.replace(/[\u0000-\u0008\u000e-\u001b\u007f-\u009f\p{Cf}]/gu, '');
}
async function projectFiles(root, catalog) {
  root = path.resolve(root);
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) fail('Open the ordinary student project directory without symbolic links.');
  await ordinaryFile(path.join(root, 'zero.json'), 'The Zero project marker');
  const pomPath = await ordinaryFile(path.join(root, 'pom.xml'), 'The project POM');
  const beforeText = await fs.readFile(pomPath, 'utf8');
  const classes = new Set(catalog.components.map(component => component.className));
  const sourceRoot = path.join(root, 'src');
  async function walk(directory) {
    let entries;
    try { entries = await fs.readdir(directory, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('The student source tree contains a symbolic link. Use ordinary source files before adding the library.');
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.endsWith('.java')) {
        const source = javaDeclarationText(await fs.readFile(filename, 'utf8'));
        const packageName = /\bpackage\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/.exec(source)?.[1]?.replace(/\s/g, '');
        for (const name of classes) {
          const simple = name.split('.').at(-1);
          if ((packageName === name.slice(0, -(simple.length + 1)) && new RegExp(`\\b(?:class|interface|enum|record)\\s+${simple}\\b`).test(source)) || filename.endsWith(path.join(...name.split('.')) + '.java')) fail(`A student source copy shadows ${name}. Keep your edits and move or rename the copy before using the Maven library.`);
        }
      }
    }
  }
  const sourceStat = await fs.lstat(sourceRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (sourceStat?.isSymbolicLink()) fail('The student source tree contains a symbolic link.');
  if (sourceStat) await walk(sourceRoot);
  return {root, pomPath, beforeText, beforeHash: hash(beforeText)};
}
module.exports = {parseXml, single, value, allNodes, projectFiles};

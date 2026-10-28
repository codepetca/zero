'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const {LESSON_IDS,lessonFiles,tutorialGroups,navigationIds,referencePath,EXTERNAL_LINKS} = require('./tutorial-catalog');
const escapeHtml = text => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function validateContent(value) {
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.lessons) || value.lessons.length !== LESSON_IDS.length || !Array.isArray(value.groups) || value.groups.length !== tutorialGroups.length) throw new Error('Tutorials are unavailable. Reinstall Zero to restore the bundled lessons.');
  const seen = new Set();
  for (const lesson of value.lessons) {
    if (!record(lesson) || !LESSON_IDS.includes(lesson.id) || seen.has(lesson.id) || typeof lesson.title !== 'string' || lesson.title.length > 200 || typeof lesson.markdown !== 'string' || Buffer.byteLength(lesson.markdown) > 256 * 1024 || lesson.source !== `student-template/lessons/${lessonFiles[lesson.id]}` || lesson.asset !== `${lesson.id.padStart(2,'0')}.svg` || !record(lesson.references) || Object.keys(lesson.references).length > 100) throw new Error('The bundled tutorial content is invalid. Reinstall Zero.');
    for (const [name, text] of Object.entries(lesson.references)) if (!referencePath(name) || typeof text !== 'string' || Buffer.byteLength(text) > 256 * 1024) throw new Error('The bundled tutorial reference is invalid. Reinstall Zero.');
    seen.add(lesson.id);
  }
  const ids = [];
  for (const [index,group] of value.groups.entries()) {
    const expected = tutorialGroups[index];
    if (!record(group) || group.id !== expected.id || group.title !== expected.title || !Array.isArray(group.lessons) || group.lessons.join(',') !== expected.lessons.join(',')) throw new Error('The bundled tutorial groups are invalid.');
    ids.push(...group.lessons);
  }
  if (ids.length !== LESSON_IDS.length || new Set(ids).size !== LESSON_IDS.length) throw new Error('The bundled tutorial groups are incomplete.');
  return value;
}
async function loadContent(extensionPath) {
  const filename = path.join(extensionPath, 'media/tutorial-content.json');
  const info = await fs.stat(filename);
  if (info.size > 3 * 1024 * 1024) throw new Error('The tutorial bundle exceeds its size limit. Reinstall Zero.');
  return validateContent(JSON.parse(await fs.readFile(filename,'utf8')));
}
function browserUrl(id) {
  if (!LESSON_IDS.includes(id)) throw new Error('Unknown tutorial.');
  return `https://zero.codepet.ca/tutorials/${id}`;
}
// All authored links are resolved against a bounded bundle. No arbitrary URL,
// command URI, file URI or HTML from Markdown is passed through to the webview.
function resolveLink(lesson, href, bundle) {
  const [file,fragment] = String(href).split('#');
  if (EXTERNAL_LINKS.includes(file)) return {external:file};
  if (/^[a-z]+:|^\//i.test(file)) return null;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(lesson.source),file));
  const other = bundle.lessons.find(item => item.source === target);
  if (other) return {lesson:other.id};
  if (target === 'student-template/lessons/README.md') return fragment === 'start-a-lesson' ? {browser:lesson.id} : {index:true};
  if (Object.hasOwn(lesson.references,target)) return {reference:target};
  if (!file && fragment && /^[a-z0-9-]+$/.test(fragment)) return {anchor:fragment};
  return null;
}
function renderMarkdown(text, {link, image, code} = {}) {
  const inline = value => {
    // Tokenize first, escape all unmatched text, and never reparse generated HTML.
    const pattern = /(`+)([^`]+)\1|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
    let result = '', start = 0;
    for (const token of value.matchAll(pattern)) {
      result += escapeHtml(value.slice(start,token.index));
      if (token[1]) result += `<code>${escapeHtml(token[2])}</code>`;
      else if (token[3] !== undefined) result += image?.(token[4],token[3]) || escapeHtml(token[3]);
      else if (token[5] !== undefined) result += link?.(token[6],inline(token[5])) || inline(token[5]);
      else result += `<strong>${escapeHtml(token[7])}</strong>`;
      start = token.index + token[0].length;
    }
    return result + escapeHtml(value.slice(start));
  };
  const lines = text.replace(/\r\n/g,'\n').split('\n');
  let html = '', index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {index++; continue;}
    if (/^```/.test(line)) {
      const body = []; index++;
      while (index < lines.length && !/^```/.test(lines[index])) body.push(lines[index++]);
      index++;
      html += code ? code(body.join('\n')) : `<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {const level = heading[1].length;html += `<h${level}>${inline(heading[2])}</h${level}>`;index++;continue;}
    const list = /^(?:\d+\.|[-*])\s+/.exec(line);
    if (list) {
      const ordered = /^\d/.test(line), tag = ordered ? 'ol' : 'ul'; html += `<${tag}>`;
      while (index < lines.length && (ordered ? /^\d+\.\s+/ : /^[-*]\s+/).test(lines[index])) {
        html += `<li>${inline(lines[index++].replace(/^(?:\d+\.|[-*])\s+/,''))}</li>`;
      }
      html += `</${tag}>`;continue;
    }
    const paragraph = [line];index++;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|```|\d+\.\s|[-*]\s)/.test(lines[index])) paragraph.push(lines[index++]);
    html += `<p>${inline(paragraph.join('\n'))}</p>`;
  }
  return html;
}
function renderLessons(bundle,{assetUri}) {
  const copies = new Map();
  let count = 0;
  const code = (text, fullFile = false) => {
    const id = `code-${count++}`; copies.set(id,text);
    const lines = fullFile ? text.replace(/\n$/, '').split('\n').map(line => `<span class="code-line">${escapeHtml(line)}</span>`).join('\n') : escapeHtml(text);
    return `<div class="code-block">${fullFile ? '<span class="code-label">Reference file lines</span>' : ''}<button type="button" class="copy" data-copy="${id}" aria-label="Copy code">Copy</button><pre data-copy="${id}" tabindex="0" aria-label="Code; press Enter to copy"><code>${lines}</code></pre></div>`;
  };
  const articles = bundle.lessons.map(lesson => {
    let refCount = 0;
    const referenceIds = Object.fromEntries(Object.keys(lesson.references).map(name => [name,`reference-${lesson.id}-${refCount++}`]));
    const options = {
      code,
      image:(href,alt) => href === `visuals/${lesson.asset}` ? `<img class="target" src="${escapeHtml(assetUri(lesson.asset))}" alt="${escapeHtml(alt)}">` : escapeHtml(alt),
      link:(href,label) => {
        const target = resolveLink(lesson,href,bundle);
        if (!target) return label;
        if (target.lesson) return `<button type="button" class="inline-link" data-lesson="${target.lesson}">${label}</button>`;
        if (target.browser) return `<button type="button" class="inline-link" data-browser-lesson="${target.browser}">${label}</button>`;
        if (target.index) return `<button type="button" class="inline-link" data-index="true">${label}</button>`;
        if (target.external) return `<button type="button" class="inline-link" data-external="${escapeHtml(target.external)}">${label}</button>`;
        if (target.reference) return `<a href="#${referenceIds[target.reference]}" data-reference="${referenceIds[target.reference]}">${label}</a>`;
        return label;
      }
    };
    const body = lesson.markdown.replace(/^# .+\n/,'').replace(/^(?:Next|Previous): .*$/gm,'').replace(/^Target illustration:.*$/gm,'');
    const group = bundle.groups.find(item => item.lessons.includes(lesson.id));
    const {previous,next} = navigationIds(lesson.id);
    const references = Object.entries(lesson.references).map(([name,text]) => `<details id="${referenceIds[name]}" class="reference"><summary>${escapeHtml(name.replace(/^teaching\/checkpoints\//,'Checkpoint ').replace(/^student-template\/examples\//,'Example '))}</summary>${name.endsWith('.java') ? code(text,true) : renderMarkdown(text,{code})}</details>`).join('');
    return `<article class="lesson" data-lesson-id="${lesson.id}" hidden><p class="eyebrow">${escapeHtml(group.title)} · Lesson ${lesson.id}</p><h1 tabindex="-1">${escapeHtml(lesson.title)}</h1><div class="lesson-content">${renderMarkdown(body,options)}</div>${references ? `<section class="references" aria-label="Full code references"><h2>Compare your code</h2><p>Try the task first. These completed references do not change your project. Their line numbers may differ from your own file.</p>${references}</section>` : ''}<nav class="pagination" aria-label="Lesson navigation">${previous ? `<button type="button" class="text-button" data-lesson="${previous}">← Previous lesson</button>` : '<span></span>'}${next ? `<button type="button" class="primary" data-lesson="${next}">Next lesson →</button>` : '<button type="button" class="text-button" data-index="true">All tutorials →</button>'}</nav></article>`;
  }).join('');
  const navigation = bundle.groups.map(group => `<optgroup label="${escapeHtml(group.title)}">${group.lessons.map(id => `<option value="${id}">${id}. ${escapeHtml(bundle.lessons.find(lesson => lesson.id === id).title)}</option>`).join('')}</optgroup>`).join('');
  return {articles,navigation,copies};
}
module.exports = {LESSON_IDS,escapeHtml,validateContent,loadContent,browserUrl,resolveLink,renderMarkdown,renderLessons};

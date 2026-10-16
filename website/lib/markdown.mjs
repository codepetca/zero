import path from "node:path";
import { isLessonDocumentId, examples } from "./learning.mjs";
import {courseStarterId, featuredProjectIds, projectHref} from "./project-curriculum.mjs";
const projectGuideLinks = new Set([courseStarterId, ...featuredProjectIds].map(projectHref));
export const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
const nodeText = (node) =>
  node.type === "text"
    ? node.value
    : (node.children ?? []).map(nodeText).join("");
export function documentHref(id) {
  return isLessonDocumentId(id)
    ? `/tutorials/${id.slice("lesson-".length)}`
    : `/docs/${id}`;
}
export function resolveContentLink(source, href, documents, sources, assets = {}) {
  const lessonDownload = href?.match(/^(?:https:\/\/zero\.codepet\.ca)?(\/generated\/(?:projects\/zero-project-(?:greeting|study|game)|learning-assets\/game-assets)\.zip)$/);
  if (lessonDownload) return lessonDownload[1];
  if (href?.startsWith("/generated/") || href?.startsWith("https://zero.codepet.ca/generated/")) return null;
  // Authored Hub links work on GitHub and use the local, publication-gated
  // project pages on the website. Arbitrary root routes remain unlinked.
  for (const projectLink of projectGuideLinks) {
    if (href === projectLink || href === `https://zero.codepet.ca${projectLink}`) return projectLink;
  }
  if (!href || href.startsWith("#") || /^(https?:|mailto:)/.test(href))
    return href;
  const [file, fragment] = href.split("#");
  const key = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), file),
  );
  if (Object.hasOwn(assets, key)) return assets[key];
  const target = Object.entries(documents).find(
    ([, doc]) => doc.source === key,
  );
  if (target) return documentHref(target[0]) + (fragment ? `#${fragment}` : "");
  const alias = Object.entries(documents).find(
    ([, doc]) => Object.hasOwn(doc.aliases ?? {}, key),
  );
  if (alias) {
    const anchor = fragment ? alias[1].aliases[key][fragment] : "";
    return documentHref(alias[0]) + (anchor ? `#${anchor}` : "");
  }
  if (!fragment && Object.hasOwn(sources, key)) {
    const example = examples.find((item) => key === `student-template/examples/${item.id}/README.md`);
    if (example) return `/hub?kind=example&example=${example.id}`;
  }
  if (Object.hasOwn(sources, key))
    return (
      `/source?file=${encodeURIComponent(key)}` +
      (fragment ? `#${fragment}` : "")
    );
  return null;
}
// Fold parsed blocks, preserving fenced code and nested Markdown exactly.
export function foldSections({ lesson = false, encouragement = "" } = {}) {
  return (tree) => {
    const counts = new Map();
    function visit(node) {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
        const base = slugify(nodeText(node));
        const count = counts.get(base) || 0;
        counts.set(base, count + 1);
        node.properties = {
          ...node.properties,
          id: count ? `${base}-${count}` : base,
        };
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    // Source guides also put Previous links in the introduction. The website
    // sidebar and Next lesson footer already provide lesson navigation.
    const content = tree.children.filter((node) => !(
      lesson && node.type === "element" && (
        node.tagName === "hr" ||
        (node.tagName === "p" && (
          nodeText(node).startsWith("Target illustration:") ||
          /^Previous:\s/.test(nodeText(node))
        ))
      )
    ));
    const lastBlock = content.findLast((node) => node.type === "element");
    if (
      lesson && lastBlock?.tagName === "p" &&
      /^(Next|Previous):\s/.test(nodeText(lastBlock))
    ) content.splice(content.indexOf(lastBlock), 1);
    const sections = [],
      intro = [];
    let current;
    const wrap = (heading, body) => ({
      type: "element",
      tagName: "details",
      properties: { className: ["reading-section"], open: true },
      children: [
        {
          type: "element",
          tagName: "summary",
          properties: {},
          children: [heading],
        },
        {
          type: "element",
          tagName: "div",
          properties: { className: ["reading-section-body"] },
          children: body,
        },
      ],
    });
    for (const node of content) {
      if (node.type === "element" && node.tagName === "h1") continue;
      if (node.type === "element" && node.tagName === "h2") {
        current = wrap(node, []);
        sections.push(current);
      } else if (current) current.children[1].children.push(node);
      else intro.push(node);
    }
    let lessonIntro = intro;
    const blocks = intro.filter((node) => node.type !== "text" || node.value.trim());
    const actions = blocks.findIndex((node) => node.type === "element" && node.tagName === "ol");
    if (lesson && actions >= 0 && nodeText(blocks[actions + 1] ?? {}).startsWith("Done:")) {
      const introduction = blocks.slice(0, actions);
      const visuals = introduction.filter((node) =>
        node.type === "element" && node.children?.some((child) => child.tagName === "img"));
      // The source's opening bold goal repeats the actions and Done checkpoint.
      const goal = introduction[0]?.tagName === "p" &&
        introduction[0].children?.length === 1 &&
        introduction[0].children[0].tagName === "strong" ? introduction[0] : null;
      lessonIntro = [{
        type: "element", tagName: "div", properties: { className: ["lesson-quick-path"] },
        children: [{
          type: "element", tagName: "section",
          properties: { id: "lesson-summary", className: ["lesson-summary-card"], "aria-labelledby": "lesson-summary-title" },
          children: [{
            type: "element", tagName: "h2", properties: { id: "lesson-summary-title" },
            children: [{ type: "text", value: "Summary" }],
          }, {
            type: "element", tagName: "div", properties: { className: ["lesson-summary-body"] },
            children: [{
              type: "element", tagName: "div", properties: { className: ["lesson-summary-steps"] },
              children: [...introduction.filter((node) => node !== goal && !visuals.includes(node)),
                blocks[actions], blocks[actions + 1]],
            }, ...(visuals.length ? [{
              type: "element", tagName: "div", properties: { className: ["lesson-summary-visual"] },
              children: visuals,
            }] : [])],
          }],
        }],
      }];
      const extra = blocks.slice(actions + 2);
      if (sections.length) sections[0].children[1].children.unshift(...extra);
      else lessonIntro.push(...extra);
    }
    if (lesson && encouragement && sections.length) {
      sections.at(-1).children[1].children.push({
        type: "element", tagName: "p", properties: { className: ["lesson-encouragement"] },
        children: [{ type: "text", value: encouragement }],
      });
    }
    tree.children = [
      ...(lesson
        ? lessonIntro
        : intro.some((n) => n.type === "element")
          ? [
              wrap(
                {
                  type: "element",
                  tagName: "h2",
                  properties: {},
                  children: [{ type: "text", value: "About this guide" }],
                },
                intro,
              ),
            ]
          : []),
      ...sections,
    ];
  };
}

import path from "node:path";
import { documentDestination } from "./document-navigation.mjs";
export const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
const nodeText = (node) =>
  node.type === "text"
    ? node.value
    : (node.children ?? []).map(nodeText).join("");
export function documentHref(id, fragment = '') {
  return documentDestination(id, fragment) ?? `/docs/${id}`;
}
export function resolveContentLink(source, href, documents, sources, assets = {}) {
  const lessonDownload = href?.match(/^(?:https:\/\/zero\.codepet\.ca)?(\/generated\/learning-assets\/(?:game|pet)-assets\.zip)$/);
  if (lessonDownload) return lessonDownload[1];
  if (href?.startsWith("/generated/") || href?.startsWith("https://zero.codepet.ca/generated/")) return null;
  // Retired example selectors must not become live links in older authored prose.
  if (href?.startsWith("/hub?") || href?.startsWith("https://zero.codepet.ca/hub?")) {
    const local = new URL(href, "https://zero.codepet.ca");
    if (local.origin === "https://zero.codepet.ca" && local.pathname === "/hub" &&
        (local.searchParams.has("example") || local.searchParams.getAll("kind").some(kind => ["example", "all"].includes(kind)))) return null;
  }
  const legacy = href?.match(/^(?:https:\/\/zero\.codepet\.ca)?\/docs\/([a-z-]+)(?:#(.*))?$/);
  if (legacy) return documentDestination(legacy[1], legacy[2] ?? '') ?? href;
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
  if (target) return documentHref(target[0], fragment);
  const alias = Object.entries(documents).find(
    ([, doc]) => Object.hasOwn(doc.aliases ?? {}, key),
  );
  if (alias) {
    const anchor = fragment ? alias[1].aliases[key][fragment] : "";
    return documentHref(alias[0], anchor);
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
    // Tutorial actions and their code are the lesson itself, not optional details.
    // Keep the guide reader's existing folding behavior separate.
    if (lesson) {
      tree.children = content.filter((node) => !(node.type === "element" && node.tagName === "h1"));
      if (encouragement) tree.children.push({
        type: "element", tagName: "p", properties: { className: ["lesson-encouragement"] },
        children: [{ type: "text", value: encouragement }],
      });
      return;
    }
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
    tree.children = [
      ...(intro.some((node) => node.type === "element")
        ? [wrap({
            type: "element", tagName: "h2", properties: {},
            children: [{ type: "text", value: "About this guide" }],
          }, intro)]
        : []),
      ...sections,
    ];
  };
}

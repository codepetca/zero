import path from "node:path";
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
  return /^lesson-[1-6]$/.test(id)
    ? `/tutorials/${id.slice(-1)}`
    : `/docs/${id}`;
}
export function resolveContentLink(source, href, documents, sources) {
  if (!href || href.startsWith("#") || /^(https?:|mailto:)/.test(href))
    return href;
  const [file, fragment] = href.split("#");
  const key = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), file),
  );
  const target = Object.entries(documents).find(
    ([, doc]) => doc.source === key,
  );
  if (target) return documentHref(target[0]) + (fragment ? `#${fragment}` : "");
  if (Object.hasOwn(sources, key))
    return (
      `/source?file=${encodeURIComponent(key)}` +
      (fragment ? `#${fragment}` : "")
    );
  return null;
}
// Fold parsed blocks, preserving fenced code and nested Markdown exactly.
export function foldSections({ lesson = false } = {}) {
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
    const sections = [],
      intro = [];
    let current;
    const wrap = (heading, body) => ({
      type: "element",
      tagName: "details",
      properties: { className: ["reading-section"] },
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
    for (const node of tree.children) {
      if (node.type === "element" && node.tagName === "h1") continue;
      if (node.type === "element" && node.tagName === "h2") {
        current = wrap(node, []);
        sections.push(current);
      } else if (current) current.children[1].children.push(node);
      else intro.push(node);
    }
    if (lesson && sections.length)
      sections[0].children[1].children.unshift(...intro);
    tree.children = [
      ...(lesson
        ? sections.length
          ? []
          : intro
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

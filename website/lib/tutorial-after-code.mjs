// Line numbers in the fence language mark additions without changing source text.
export function tutorialAfterLines(value, language) {
  const [added, removed = ""] = language.slice("language-java-after-".length).split("-r");
  const addedLines = new Set(added.split("-").map(Number));
  const removedLines = new Set(removed.split("-").filter(Boolean).map(Number));
  return value.replace(/\n$/, "").split("\n").map((line, index) => ({
    added: addedLines.has(index + 1),
    removed: removedLines.has(index + 1),
    code: line,
  }));
}

export function tutorialAfterCopyText(lines) {
  return lines.filter((line) => !line.removed).map((line) => line.code).join("\n") + "\n";
}

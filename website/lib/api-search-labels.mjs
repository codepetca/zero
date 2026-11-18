// Only overloads on the same owner need parameter types to distinguish them.
export function apiSearchLabels(categories) {
  const entries = categories.flatMap(category => category.entries);
  const counts = new Map();
  for (const entry of entries) {
    const key = JSON.stringify([entry.owner, entry.name]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(entries.map(entry => {
    const overloaded = counts.get(JSON.stringify([entry.owner, entry.name])) > 1;
    const label = entry.kind === 'field' ? entry.name
      : overloaded ? `${entry.name}(${entry.parameters.map(parameter => parameter.type).join(', ')})`
      : `${entry.name}()`;
    return [entry.id, label];
  }));
}

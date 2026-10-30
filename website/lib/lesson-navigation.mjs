export function orderGroupLessons(items, lessonIds) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return lessonIds.map((id) => byId.get(id)).filter(Boolean);
}

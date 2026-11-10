export function listingSlotsMessage(active, limit) {
  if (limit === null) return 'Your app slot allowance is temporarily unavailable. You can still manage or remove listed apps; try again later to add an app.';
  if (active > limit) return `${active} apps are listed, above your ${limit} app slot allowance. Remove apps until you are within your allowance before adding another.`;
  return `${active} of ${limit} app slots in use. When all slots are full, a newly published app replaces the first unprotected app in the queue.`;
}

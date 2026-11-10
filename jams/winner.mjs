export function onTimePages(entry, schedule) {
  const deadline = Date.parse(schedule.submissionsCloseAt);
  return !!entry.pagesVerification && Date.parse(entry.pagesVerification.verifiedAt) < deadline &&
    Date.parse(entry.submittedAt) < deadline;
}

export function canPickGameJamWinner(state, time) {
  return state.hosting === 'zero' && state.accepted?.manifest.type === 'game' &&
    state.moderation.status === 'active' && time >= Date.parse(state.accepted.manifest.schedule.submissionsCloseAt);
}

export function eligibleGameJamEntry(state, participantId) {
  const entry = state.entries[participantId]?.at(-1);
  if (entry?.status !== 'active' || state.registrations[participantId]?.status !== 'joined' ||
      entry.eventRevision !== state.accepted.revision || !onTimePages(entry, state.accepted.manifest.schedule)) return null;
  return entry;
}

export function gameJamWinningEntry(state, time) {
  if (!canPickGameJamWinner(state, time)) return null;
  const decision = state.history.findLast(record => record?.action === 'pick-winner');
  if (!decision || time < Date.parse(decision.at)) return null;
  const entry = eligibleGameJamEntry(state, decision.participantId);
  return entry?.revision === decision.revision ? entry : null;
}

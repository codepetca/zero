import {hostedManifestData} from './manifest.mjs';

export function onTimePages(entry, schedule) {
  const deadline = Date.parse(schedule.submissionsCloseAt);
  return !!entry.pagesVerification && Date.parse(entry.pagesVerification.verifiedAt) < deadline &&
    Date.parse(entry.submittedAt) < deadline;
}

export function canPickGameJamWinner(state, time) {
  return state.hosting === 'zero' && state.accepted?.manifest.type === 'game' &&
    state.moderation.status === 'active' && time >= Date.parse(state.accepted.manifest.schedule.submissionsCloseAt);
}

function nonScheduleManifest(manifest) {
  const {schedule,...details}=hostedManifestData(manifest);
  return JSON.stringify(details);
}

// Schedule edits publish a new acknowledgment revision. Entries submitted
// under the same approved details stay eligible without rewriting their history.
export function acceptsGameJamEntryRevision(state, revision) {
  const accepted=state.accepted;
  if(!accepted||!revision)return false;
  if(revision===accepted.revision)return true;
  if(state.hosting!=='zero'||!accepted.approvalMode)return false;
  const earlier=state.proposals.find(proposal=>proposal.revision===revision&&proposal.status==='approved');
  return !!earlier&&earlier.approvalMode===accepted.approvalMode&&
    nonScheduleManifest(earlier.manifest)===nonScheduleManifest(accepted.manifest);
}

export function eligibleGameJamEntry(state, participantId) {
  const entry = state.entries[participantId]?.at(-1);
  if (entry?.status !== 'active' || state.registrations[participantId]?.status !== 'joined' ||
      !acceptsGameJamEntryRevision(state,entry.eventRevision) || !onTimePages(entry, state.accepted.manifest.schedule)) return null;
  return entry;
}

export function gameJamWinningEntry(state, time) {
  if (!canPickGameJamWinner(state, time)) return null;
  const decision = state.history.findLast(record => record?.action === 'pick-winner');
  if (!decision || time < Date.parse(decision.at)) return null;
  const entry = eligibleGameJamEntry(state, decision.participantId);
  return entry?.revision === decision.revision ? entry : null;
}

import {formatJamDateTime} from './jam-draft.mjs';

// Plain-language visibility for a jam's creator and Zero maintainers. It mirrors
// the service rules: the ZeroHub directory lists only accepted, active jams;
// any accepted jam stays readable by link; an unaccepted jam is readable only
// by its creator and maintainers; gallery entries stay hidden until reveal.
export function jamVisibilityStatus(event, now = Date.now()) {
  const status = event?.moderation?.status || 'active';
  if (!event?.revision) {
    return {
      tone: 'hidden',
      listed: false,
      headline: event?.reviewStatus === 'rejected' ? 'Not published · Rejected' : 'Not published',
      details: ['Not listed on ZeroHub. Only you and Zero maintainers can open this jam.'],
    };
  }
  if (status === 'cancelled') {
    return {
      tone: 'hidden',
      listed: false,
      headline: 'Cancelled · Not listed on ZeroHub',
      details: ['Anyone with the link can still open this page and read the cancellation reason. Joining and submitting are closed.'],
    };
  }
  if (status === 'suspended') {
    return {
      tone: 'hidden',
      listed: false,
      headline: 'Suspended · Not listed on ZeroHub',
      details: ['Anyone with the link can still open this page. Joining and submitting are paused until a Zero maintainer resumes the jam.'],
    };
  }
  const schedule = event.schedule || {};
  const reveal = Date.parse(schedule.galleryRevealAt);
  const gallery = Number.isFinite(reveal)
    ? reveal > now
      ? `Submitted entries stay hidden until the gallery opens (${formatJamDateTime(schedule.galleryRevealAt, event.timezone || 'UTC')}).`
      : 'The gallery is open. Verified entries are public.'
    : 'Verified entries are public.';
  return {
    tone: 'listed',
    listed: true,
    headline: 'Listed on ZeroHub · Anyone can view',
    details: [gallery],
  };
}

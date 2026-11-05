import {jamsPreviewAvailable} from './jams-visibility.mjs';
import {readJamPagesBinding} from './jam-pages-binding.mjs';

// Pages observation is available only in the existing local preview. No
// participant or registry credential is passed to the public observer.
export function selectJamPagesBinding({env=process.env,reader=readJamPagesBinding}={}) {
  if (!jamsPreviewAvailable(env) || typeof reader !== 'function') return undefined;
  return async (...args) => {
    if (!jamsPreviewAvailable(env)) return {status:'unverified',reason:'unavailable'};
    const receipt=await reader(...args);
    return jamsPreviewAvailable(env) ? receipt : {status:'unverified',reason:'unavailable'};
  };
}

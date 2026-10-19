'use strict';

const WELCOME_KEY = 'zero.tutorialWelcomeShown';

// Native dialogs preserve editors; dismissing leaves local Run available. The profile flag
// records the offer, not successful authentication or tutorial completion.
function createWelcome({window, globalState, authentication, connect, startProject, eligible, isBusy = () => false}) {
  let disposed = false, pending;
  async function show(manual) {
    await authentication.refresh();
    if (disposed || (!manual && (!globalState || globalState.get(WELCOME_KEY) || !await eligible()))) return;
    if (globalState) await globalState.update(WELCOME_KEY, true);
    if (disposed) return;
    const detail = authentication.signedIn
      ? `GitHub is connected as ${authentication.accountLabel}. Create your own tutorial repository to start learning.`
      : 'Start with your own Greeting tutorial project. Zero will connect GitHub, create your repository and open its clone.';
    const choice = await window.showInformationMessage('Welcome to Zero.', {modal:true, detail}, 'Start tutorial', 'Later');
    if (disposed || isBusy() || choice !== 'Start tutorial') return;
    // The account may have changed while this dialog was open.
    await authentication.refresh();
    if (disposed || isBusy()) return;
    if (!authentication.signedIn) await connect();
    if (!disposed && !isBusy() && authentication.signedIn) await startProject();
  }
  return {
    show(manual = false) { return pending || (pending = show(manual).finally(() => {pending = undefined;})); },
    dispose() { disposed = true; }
  };
}

module.exports = {createWelcome, WELCOME_KEY};

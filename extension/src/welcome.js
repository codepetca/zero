'use strict';

const WELCOME_KEY = 'zero.githubSetupWelcomeShown';

// Native dialogs preserve editors; dismissing leaves local Run available. The profile flag
// records the offer, not successful authentication or tutorial completion.
function createWelcome({window, globalState, authentication, startProject, eligible, isBusy = () => false}) {
  let disposed = false, pending;
  async function show(manual) {
    await authentication.refresh();
    if (disposed || (!manual && (!globalState || globalState.get(WELCOME_KEY) || !await eligible()))) return;
    if (globalState) await globalState.update(WELCOME_KEY, true);
    if (disposed) return;
    const detail = authentication.signedIn
      ? `GitHub is connected as ${authentication.accountLabel}. Zero will check project access before creating your tutorial.`
      : 'Start with your own Greeting tutorial project. Zero will guide you through GitHub sign-in and project access, then create your repository and open its clone.';
    const choice = await window.showInformationMessage('Welcome to Zero.', {modal:true, detail}, 'Start tutorial', 'Later');
    if (disposed || isBusy() || choice !== 'Start tutorial') return;
    // The account may have changed while this dialog was open.
    await authentication.refresh();
    if (disposed || isBusy()) return;
    if (!disposed && !isBusy()) await startProject();
  }
  return {
    show(manual = false) { return pending || (pending = show(manual).finally(() => {pending = undefined;})); },
    dispose() { disposed = true; }
  };
}

module.exports = {createWelcome, WELCOME_KEY};

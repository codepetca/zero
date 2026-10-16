'use strict';

const WELCOME_KEY = 'zero.githubWelcomeShown';

// Native dialogs preserve editors; dismissing leaves local Run available. The profile flag
// records the offer, not successful authentication or tutorial completion.
function createWelcome({window, globalState, authentication, connect, startProject, eligible, isBusy = () => false}) {
  let disposed = false, pending;
  async function showConnected() {
    if (disposed || !authentication.signedIn) return;
    const choice = await window.showInformationMessage(`GitHub is connected as ${authentication.accountLabel}.`, {modal:true, detail:'Welcome to Zero. Create your own tutorial repository to start learning.'}, 'Start tutorial', 'Later');
    if (!disposed && !isBusy() && choice === 'Start tutorial') await startProject();
  }
  async function show(manual) {
    await authentication.refresh();
    if (disposed || (!manual && (!globalState || globalState.get(WELCOME_KEY) || !await eligible()))) return;
    if (globalState) await globalState.update(WELCOME_KEY, true);
    if (disposed) return;
    if (authentication.signedIn) return showConnected();
    const choice = await window.showInformationMessage('Welcome to Zero. Connect GitHub to start learning.', {modal:true, detail:'Create your own tutorial repository using your GitHub account. Choose Later to continue locally. You can return with Zero: Get Started.'}, 'Connect GitHub', 'Later');
    if (disposed || isBusy() || choice !== 'Connect GitHub') return;
    // The account may have changed while this dialog was open.
    await authentication.refresh();
    if (disposed || isBusy()) return;
    if (!authentication.signedIn) await connect();
    if (!disposed && authentication.signedIn) await showConnected();
  }
  return {
    show(manual = false) { return pending || (pending = show(manual).finally(() => {pending = undefined;})); },
    dispose() { disposed = true; }
  };
}

module.exports = {createWelcome, WELCOME_KEY};

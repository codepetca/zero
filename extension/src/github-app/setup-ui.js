'use strict';

function createGitHubSetup({vscode, authentication, repositories, installationUrl, active = () => true, report = () => {}}) {
  let disposed = false, pending, controller, closePicker;
  const needsApproval = error => error?.actionUrl === installationUrl && ['installation-required', 'permission-required', 'github-error'].includes(error.code);
  async function run() {
    const operation = controller = new AbortController();
    const alive = () => !disposed && active() && !operation.signal.aborted;
    try {
      const ticket = await authentication.capture();
      if (!alive()) return false;
      const check = async () => {
        await repositories.checkSetup({ticket, signal:operation.signal});
        if (!alive()) return false;
        await authentication.assertCurrent(ticket);
        return alive();
      };
      report('Checking GitHub project access…');
      try {
        const checked = vscode.window.withProgress
          ? await vscode.window.withProgress({location:vscode.ProgressLocation.Notification, title:'Checking GitHub setup', cancellable:true}, async (_, token) => {
            const subscription = token.onCancellationRequested(() => operation.abort());
            try {if (token.isCancellationRequested) operation.abort();return await check();}
            finally {subscription.dispose();}
          }) : await check();
        if (!checked) return false;
        report('GitHub is ready for your projects');
        return true;
      } catch (error) {
        if (!alive()) return false;
        if (!needsApproval(error)) throw error;
      }
      if (!alive()) return false;
      return await new Promise((resolve, reject) => {
        const picker = vscode.window.createQuickPick();
        const subscriptions = [];
        let finished = false, checking = false, opened = false;
        const finish = (result, error) => {
          if (finished) return;
          finished = true;
          closePicker = undefined;
          for (const subscription of subscriptions) subscription.dispose();
          picker.dispose();
          if (error) reject(error); else resolve(result);
        };
        closePicker = () => finish(false);
        picker.title = 'Connect GitHub · project access';
        picker.placeholder = `Signed in as ${ticket.session.label}. Approve Zero on GitHub, then return here.`;
        picker.ignoreFocusOut = true;
        picker.items = [
          {label:'Open GitHub', description:'Allow Zero to create and save your projects', detail:'GitHub calls this Install. Choose selected repositories; projects created by Zero receive access automatically.', action:'open'},
          {label:'Check again', description:'Continue after approving access on GitHub', action:'check'}
        ];
        async function recheck() {
          if (finished || checking || !alive()) return;
          checking = true;picker.busy = true;picker.enabled = false;
          try {
            if (await check()) {report('GitHub is ready for your projects');finish(true);}
            else finish(false);
          } catch (error) {
            if (!alive()) {finish(false);return;}
            if (!needsApproval(error)) {finish(false,error);return;}
            picker.placeholder = `Access not confirmed for ${ticket.session.label}. Approve Codepet Zero on GitHub, then check again.`;
          } finally {
            checking = false;
            if (!finished) {picker.busy = false;picker.enabled = true;}
          }
        }
        subscriptions.push(picker.onDidHide(() => {operation.abort();finish(false);}));
        subscriptions.push(picker.onDidAccept(() => {
          if (finished || checking || !alive()) return;
          if (picker.selectedItems[0]?.action === 'check') {void recheck();return;}
          if (picker.selectedItems[0]?.action !== 'open') return;
          checking = true;picker.busy = true;picker.enabled = false;
          void vscode.env.openExternal(vscode.Uri.parse(installationUrl)).then(result => {
            if (finished || !alive()) return;
            opened = Boolean(result);
            picker.placeholder = result ? 'Finish approval on GitHub. Return to Zero to continue automatically, or choose Check again.' : 'The browser did not open. Choose Open GitHub to retry.';
          }).catch(() => {
            if (!finished && alive()) picker.placeholder = 'The browser did not open. Choose Open GitHub to retry.';
          }).finally(() => {checking = false;if (!finished) {picker.busy = false;picker.enabled = true;}});
        }));
        if (vscode.window.onDidChangeWindowState) subscriptions.push(vscode.window.onDidChangeWindowState(event => {if (event.focused && opened) void recheck();}));
        if (!alive()) {finish(false);return;}
        picker.show();
      });
    } catch (error) {if (!alive()) return false;throw error;}
    finally {closePicker = undefined;if (controller === operation) controller = undefined;}
  }
  return {
    ensure() {return pending || (pending = run().finally(() => {pending = undefined;}));},
    dispose() {disposed = true;controller?.abort();closePicker?.();}
  };
}
module.exports = {createGitHubSetup};

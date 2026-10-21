'use strict';

// A native QuickPick keeps text entry and its short keyboard helper consistent.
function textInput(vscode, options = {}) {
  const title = options.title || options.placeHolder;
  const prompt = [options.prompt, '<Enter> to confirm · <Esc> to cancel'].filter(Boolean).join(' · ');
  const picker = vscode.window.createQuickPick();
  const [major, minor] = String(vscode.version || '').split('.').map(Number);
  const stablePrompt = major > 1 || (major === 1 && minor >= 108);
  // QuickPick.prompt is supported from VS Code 1.108. Older supported editors
  // can expose a proposed-only setter; use native InputBox on those editors.
  if (!stablePrompt || !('prompt' in picker)) {
    picker.dispose();
    return vscode.window.showInputBox({...options, title, prompt});
  }
  picker.placeholder = options.placeHolder;
  picker.title = title;
  picker.prompt = prompt;
  picker.value = options.value || '';
  picker.ignoreFocusOut = Boolean(options.ignoreFocusOut);
  picker.items = [];
  return new Promise((resolve,reject) => {
    let settled = false, revision = 0, accepting = false;
    const subscriptions = [];
    function finish(value,error) {
      if (settled) return;
      settled = true;
      for (const subscription of subscriptions) subscription.dispose();
      picker.dispose();
      if (error) reject(error); else resolve(value);
    }
    async function validate(value, generation) {
      let result;
      try { result = await options.validateInput?.(value); }
      catch (error) {
        if (settled || generation !== revision || picker.value !== value) return false;
        throw error;
      }
      if (settled || generation !== revision || picker.value !== value) return false;
      const message = typeof result === 'string' ? result : result?.message;
      picker.items = message ? [{label:message,alwaysShow:true}] : [];
      return !message || (typeof result !== 'string' && result.severity !== vscode.InputBoxValidationSeverity?.Error);
    }
    subscriptions.push(picker.onDidChangeValue(value => {
      void validate(value,++revision).catch(error=>finish(undefined,error));
    }));
    subscriptions.push(picker.onDidAccept(async () => {
      if (accepting || settled) return;
      accepting = true;
      const value = picker.value;
      try { if (await validate(value,++revision)) finish(value); }
      catch (error) { finish(undefined,error); }
      finally { accepting = false; }
    }));
    subscriptions.push(picker.onDidHide(()=>finish(undefined)));
    try { picker.show(); } catch (error) { finish(undefined,error); }
  });
}

// Preserve live editor getters and the original API; only Zero's input calls change.
function minimalPrompts(vscode) {
  const window = Object.create(vscode.window, {showInputBox:{value:options=>textInput(vscode,options)}});
  return Object.create(vscode, {window:{value:window}});
}
module.exports = {textInput,minimalPrompts};

'use strict';

// A native QuickPick keeps text entry and its short keyboard helper consistent.
function textInput(vscode, options = {}) {
  const picker = vscode.window.createQuickPick();
  picker.placeholder = options.placeHolder || options.title;
  picker.title = [options.prompt, '<Enter> to confirm · <Esc> to cancel'].filter(Boolean).join(' · ');
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

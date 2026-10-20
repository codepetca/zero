'use strict';
// Drive the native input control with the existing command fixtures' queued text.
function textInputs(vscode) {
  vscode.window.createQuickPick = () => {
    const listeners = {accept:new Set(),change:new Set(),hide:new Set()};
    const event = name => fn => {listeners[name].add(fn);return {dispose:()=>listeners[name].delete(fn)};};
    const emit = (name,value) => {for (const fn of [...listeners[name]]) fn(value);};
    const picker = {value:'',items:[],onDidAccept:event('accept'),onDidChangeValue:event('change'),onDidHide:event('hide'),
      dispose(){},show(){
        Promise.resolve().then(()=>vscode.window.showInputBox({title:picker.placeholder,placeHolder:picker.placeholder,prompt:picker.title,value:picker.value||undefined})).then(value=>{
          if(value===undefined)emit('hide');else{picker.value=value;emit('change',value);emit('accept');}
        }).catch(error=>{emit('hide');queueMicrotask(()=>{throw error;});});
      }};
    return picker;
  };
  return vscode;
}
module.exports = {textInputs};

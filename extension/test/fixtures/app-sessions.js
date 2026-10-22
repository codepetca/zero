'use strict';
const assert=require('node:assert/strict');
// Reuse these integration scenarios' lookup/event scripts as provider methods.
// The host API becomes a trap: production must use the owned provider, while
// registration remains available to exercise the Accounts integration.
function appSessions(vscode, provider) {
  const {getSession,onDidChangeSessions}=vscode.authentication;
  vscode.authentication.getSession=()=>assert.fail('Zero must not request host consent for its own session');
  vscode.authentication.onDidChangeSessions=()=>assert.fail('Zero must subscribe to its owned provider');
  return Object.assign(provider,{
    async getSessions(scopes,options) {
      const session=await getSession('zero-github',scopes,{silent:true,...options});
      return session?[session]:[];
    },
    createSession:scopes=>getSession('zero-github',scopes,{createIfNone:true}),
    onDidChangeSessions
  });
}
module.exports={appSessions};

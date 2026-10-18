'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execute = promisify(execFile);
const MAX_FILE_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const HISTORY_LIMIT = 40;
const SCHEME = 'zero-recovery';
const driftMessage = 'The project, file or Git history changed. Open the file and choose Review or restore changes again.';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Only local inspection commands are used. Preserve exact blob bytes, including
// trailing newlines; core.git intentionally trims ordinary command output.
async function localGit(root, args) {
  const {stdout} = await execute('git', ['--no-pager', ...args], {
    cwd:root, timeout:10000, maxBuffer:MAX_OUTPUT_BYTES, encoding:'buffer',
    env:{...process.env, GIT_OPTIONAL_LOCKS:'0', GIT_NO_LAZY_FETCH:'1', GIT_NO_REPLACE_OBJECTS:'1'}
  });
  return stdout;
}
function text(bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (value.length > MAX_FILE_BYTES) throw new Error('Recovery supports text files up to 512 KB. Use native file history for this file.');
  if (value.includes(0)) throw new Error('Recovery supports plain UTF-8 text files. Use native file history for this file.');
  try {return new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(value);}
  catch {throw new Error('Recovery supports plain UTF-8 text files. Use native file history for this file.');}
}
function eligible(relative) {
  const parts = relative.split('/');
  if (!relative || parts.some(part => !part || part.startsWith('.') || part === '..' || /[\\\x00-\x1f:<>"|?*\[\]]/.test(part))) return false;
  if (/^(?:README|LICENSE)(?:\.md|\.txt)?$/i.test(relative)) return true;
  if (!/^(?:src\/main\/java\/.+\.java|src\/main\/resources\/.+\.(?:txt|md|json|csv|properties|xml|css|fxml))$/i.test(relative)) return false;
  if (parts.some(part => /^(?:zero|target|build|dist|node_modules|private|secrets?|credentials?)$/i.test(part))) return false;
  return !/(?:^|[._-])(?:secret|credential|password|token)(?:[._-]|$)/i.test(parts.at(-1));
}
async function plainFile(root, filename) {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  if (!eligible(relative) || path.isAbsolute(relative)) throw new Error('Open a student Java, resource text or README file inside this project. Recovery excludes toolkit, private and generated files.');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Recovery cannot follow symbolic links. Open a regular student file inside this project.');
    if (current === filename ? !stat.isFile() : !stat.isDirectory()) throw new Error('Recovery needs a regular student file inside this project.');
    if (current === filename && (stat.size > MAX_FILE_BYTES || stat.nlink !== 1)) throw new Error('Recovery needs a plain text file up to 512 KB without hard links.');
  }
  if (await fs.realpath(filename) !== filename) throw new Error('Recovery cannot follow symbolic links.');
  const handle = await fs.open(filename,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) throw new Error('Recovery needs a plain text file up to 512 KB without hard links.');
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer,length,buffer.length-length,length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const bytes = buffer.subarray(0,length);
    const after = await fs.lstat(filename);
    if (after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || await fs.realpath(filename) !== filename) throw new Error(driftMessage);
    return {relative, content:text(bytes), fingerprint:hash(bytes), identity:`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`};
  } finally {await handle.close();}
}

function createRecoveryCommands(vscode, {project,isBusy,setBusy,setState,output,git=localGit}) {
  let disposed = false;
  const snapshots = new Map();
  const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    provideTextDocumentContent:uri => snapshots.get(uri.toString()) || ''
  });
  const run = async (root,args) => {
    const value = await git(root,args);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.length > MAX_OUTPUT_BYTES) throw new Error('Git history is too large to review here. Use native file history.');
    return bytes;
  };
  const meta = async (root,args) => (await run(root,args)).toString('utf8').trim();
  const report = (state,detail=state) => {setState(state);output.appendLine(detail);};
  const uriKey = uri => uri?.toString();
  const branchFor = root => meta(root,['symbolic-ref','-q','HEAD']).catch(error => {if (error.code === 1) return 'detached'; throw error;});
  async function context() {
    if (disposed) throw new Error('Recovery closed. Choose Review or restore changes again.');
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before using Recovery.');
    const root = await project();
    const canonical = await fs.realpath(root);
    const folders = vscode.workspace.workspaceFolders || [];
    if (root !== canonical || folders.length !== 1 || folders[0].uri.scheme !== 'file' || await fs.realpath(folders[0].uri.fsPath) !== root) throw new Error('Open one standalone student project in its own window before using Recovery.');
    const marker = await fs.lstat(path.join(root,'zero.json'));
    const gitDir = await fs.lstat(path.join(root,'.git')).catch(() => null);
    if (!marker.isFile() || marker.isSymbolicLink() || !gitDir?.isDirectory() || gitDir.isSymbolicLink()) throw new Error('Recovery needs a standalone student Git repository with zero.json.');
    if (await fs.realpath(await meta(root,['rev-parse','--show-toplevel'])) !== root || await fs.realpath(path.resolve(root,await meta(root,['rev-parse','--git-dir']))) !== path.join(root,'.git')) throw new Error('Recovery needs this project’s own standalone Git repository.');
    // Older supported Git versions may not honor GIT_NO_LAZY_FETCH. Refuse
    // partial/promisor clones before history/blob reads can request missing objects.
    const partial = await meta(root,['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']).catch(error => {if (error.code === 1) return ''; throw error;});
    if (partial) throw new Error('Recovery needs complete local Git history. Use native file history for this partial clone.');
    const head = await meta(root,['rev-parse','--verify','HEAD^{commit}']).catch(() => {throw new Error('This project needs a Git commit before Recovery can find earlier versions.');});
    if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error('This project needs a Git commit before Recovery can find earlier versions.');
    const branch = await branchFor(root);
    if (disposed || await project() !== root) throw new Error(driftMessage);
    return {root,head,branch,folders:folders.map(folder=>uriKey(folder.uri)).join('\n')};
  }
  function documentReady(document) {
    if (!document || document.isClosed || document.uri.scheme !== 'file') throw new Error('Open the student file you want to recover, then choose Recovery.');
    if (document.isDirty) throw new Error('This file has unsaved edits. Save or undo them yourself before Recovery; your edits have been kept.');
  }
  async function capture(base) {
    const document = vscode.window.activeTextEditor?.document;
    documentReady(document);
    const version = document.version, editorText = document.getText();
    const filename = document.uri.fsPath;
    const file = await plainFile(base.root,filename);
    const tree = await meta(base.root,['ls-files','--stage','-z','--',file.relative]);
    const tracked = /^(?:100644|100755) [a-f0-9]{40,64} 0\t([^\0]+)\0$/.exec(tree);
    if (!tracked || tracked[1] !== file.relative) throw new Error('Recovery needs a tracked file without merge conflicts. Use Source Control to review this file.');
    // A stale on-disk change must not replace a different editor buffer.
    const diskDocument = file.content.startsWith('\ufeff') ? file.content.slice(1) : file.content;
    documentReady(document);
    if (vscode.window.activeTextEditor?.document !== document || document.version !== version || document.getText() !== editorText) throw new Error(driftMessage);
    if (editorText !== diskDocument) throw new Error('The file on disk and editor differ. Reopen or save the file yourself before Recovery.');
    return {...base,...file,filename,document,version,editorText,tree};
  }
  async function validate(review) {
    const now = await context();
    if (now.root !== review.root || now.head !== review.head || now.branch !== review.branch || now.folders !== review.folders) throw new Error(driftMessage);
    const file = await plainFile(review.root,review.filename);
    if (file.fingerprint !== review.fingerprint || file.identity !== review.identity || await meta(review.root,['ls-files','--stage','-z','--',review.relative]) !== review.tree) throw new Error(driftMessage);
    if (await meta(review.root,['rev-parse','--verify','HEAD^{commit}']) !== review.head || await branchFor(review.root) !== review.branch) throw new Error(driftMessage);
    checkDocument(review);
  }
  function checkDocument(review) {
    documentReady(review.document);
    if (disposed || vscode.window.activeTextEditor?.document !== review.document || review.document.version !== review.version || review.document.getText() !== review.editorText) throw new Error(driftMessage);
  }
  async function restore(review) {
    const history = await meta(review.root,['log','--no-show-signature','--no-decorate',`--max-count=${HISTORY_LIMIT}`,'--format=%H%x00%cs%x00%s',review.head,'--',review.relative]);
    const versions = history.split('\n').filter(Boolean).map(line => {
      const [commit,date,...subject] = line.split('\0');
      if (!/^[a-f0-9]{40,64}$/.test(commit) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Could not read this file’s Git history. Use native file history.');
      return {label:`${date} · ${subject.join(' ').replace(/[\x00-\x1f]/g,' ') || 'Saved version'}`,description:commit.slice(0,8),commit};
    });
    if (!versions.length) throw new Error('No saved versions were found for this file. Commit your work to keep recoverable versions.');
    const selected = await vscode.window.showQuickPick(versions,{title:`Restore ${review.relative}`,placeHolder:`Choose a saved file version (latest ${HISTORY_LIMIT} changes)`});
    if (!selected) return;
    if (!versions.includes(selected)) throw new Error('Choose a listed saved version.');
    await validate(review);
    const tree = (await run(review.root,['ls-tree','-z',selected.commit,'--',review.relative])).toString('utf8');
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)\0$/.exec(tree);
    if (!match || match[3] !== review.relative) throw new Error('That version does not contain this regular file. Choose another saved version.');
    const length = await meta(review.root,['cat-file','-s',match[2]]);
    if (!/^\d+$/.test(length) || Number(length) > MAX_FILE_BYTES) throw new Error('That saved file is too large to restore here. Use native file history.');
    const historical = text(await run(review.root,['cat-file','blob',match[2]]));
    // VS Code owns BOM/encoding on save. Replacing text cannot safely change it.
    if (historical.startsWith('\ufeff') !== review.content.startsWith('\ufeff')) throw new Error('This version uses a different text encoding. Use native file history to restore it.');
    const content = historical.startsWith('\ufeff') ? historical.slice(1) : historical;
    const lineBreaks = content.match(/\r\n|\r|\n/g) || [];
    if (lineBreaks.some(value => value === '\r') || new Set(lineBreaks).size > 1) throw new Error('That version has mixed or unsupported line endings. Use native file history to restore it.');
    const eol = lineBreaks[0] === '\r\n' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF;
    if (content === review.editorText) {report('File already matches this version');return;}
    await validate(review);
    const snapshot = vscode.Uri.parse(`${SCHEME}:/${crypto.randomUUID()}/${path.basename(review.filename)}`);
    snapshots.set(snapshot.toString(),content);
    try {
      await vscode.commands.executeCommand('vscode.diff',snapshot,review.document.uri,`${path.basename(review.filename)} · ${selected.commit.slice(0,8)} ↔ current`,{preview:true});
      const answer = await vscode.window.showWarningMessage(`Restore ${path.basename(review.filename)} from ${selected.commit.slice(0,8)}?`,{modal:true,detail:'Only this file’s text will change. Undo is available in the editor. Review and save it, then use Commit & push to record the correction. Git history stays intact.'},'Restore file');
      if (answer !== 'Restore file') return;
      await validate(review);
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(review.document.positionAt(0),review.document.positionAt(review.editorText.length));
      const edits = [vscode.TextEdit.replace(range,content)];
      if (lineBreaks.length) edits.push(vscode.TextEdit.setEndOfLine(eol));
      edit.set(review.document.uri,edits);
      // No await between the final editor-version check and applyEdit. VS Code
      // applies a text edit as an undoable operation against its document version.
      checkDocument(review);
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('The editor could not restore this file. Your file was kept; review it before trying again.');
      report('File restored · review and save',`Restored ${review.relative} from ${selected.commit}. Undo in the editor if needed. Save, test, then Commit & push to record this correction; no commit history was rewritten.`);
    } finally {snapshots.delete(snapshot.toString());}
  }
  async function recovery() {
    if (disposed || isBusy()) return;
    setBusy(true);
    try {
      const initialDocument = vscode.window.activeTextEditor?.document;
      const base = await context();
      const choice = await vscode.window.showQuickPick([
        {label:'Review changes',description:'Open native Source Control',action:'review'},
        {label:'Discard changes in current file…',description:'Use the file’s native Discard Changes confirmation',action:'discard'},
        {label:'Restore an earlier file version…',description:'Preview a saved version, then restore only this file',action:'restore'}
      ],{title:'Review or restore changes',placeHolder:'Review or recover a file without rewriting Git history'});
      if (!choice) return;
      if (choice.action === 'review') {
        const now = await context();
        if (now.root !== base.root || now.head !== base.head || now.branch !== base.branch || now.folders !== base.folders) throw new Error(driftMessage);
        await vscode.commands.executeCommand('workbench.view.scm');return;
      }
      if (vscode.window.activeTextEditor?.document !== initialDocument) throw new Error(driftMessage);
      const review = await capture(base);
      await validate(review);
      if (choice.action === 'discard') {
        // git.clean requires private Git Resource objects. Use the supported SCM
        // surface so VS Code owns exact file selection and destructive consent.
        await vscode.commands.executeCommand('workbench.view.scm');
        report('Choose this file in Source Control',`In Source Control → Changes, find ${review.relative}. Choose its Discard Changes action and read VS Code’s confirmation. Do not choose Discard All Changes. Recovery has not changed any files.`);
        // Guidance has no decision to await. Keep native Git usable while its
        // notification remains open, and retain the instructions in Output.
        void Promise.resolve().then(() => vscode.window.showInformationMessage(`In Source Control → Changes, find ${review.relative} and choose its Discard Changes action. VS Code will ask you to confirm. Your file has not been changed.`))
          .catch(error => output.appendLine(`Recovery guidance could not open: ${error.message}`));
        return;
      }
      if (choice.action === 'restore') await restore(review);
    } finally {setBusy(false);}
  }
  return {commands:{'zero.recovery':recovery},dispose(){disposed=true;snapshots.clear();provider.dispose();}};
}
module.exports = {createRecoveryCommands};

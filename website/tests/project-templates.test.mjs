import test from 'node:test';
import assert from 'node:assert/strict';
import {templateDefinitions, templateDefinition, validatePublishedTemplates, publishedTemplate} from '../lib/project-templates.mjs';

const published = () => ({schema:1,templates:templateDefinitions.map((definition,index) => ({
  id:definition.id,repository:definition.repository,repositoryId:index+1,visibility:'public',
  isTemplate:true,defaultBranch:'main',commit:'a'.repeat(40),tree:'b'.repeat(40),
}))});

test('only the agreed five projects have standalone template definitions', () => {
  assert.deepEqual(templateDefinitions.map(item=>item.repository), ['codepetca/zero-starter','codepetca/zero-hello-java','codepetca/zero-study-session','codepetca/zero-coin-game','codepetca/zero-drawing-pad']);
  assert.equal(publishedTemplate({schema:1,templates:[]},'zero-starter'),null);
  assert.equal(publishedTemplate(published(),'study').templateHref,'https://github.com/codepetca/zero-study-session/generate');
  assert.equal(publishedTemplate(published(),'composed-study'),null);
  assert.throws(()=>templateDefinition('unknown'),/Unknown project template/);
});

test('a publication snapshot must establish all five public template identities and exact main commits', () => {
  assert.equal(validatePublishedTemplates(published()).templates.length,5);
  for (const change of [
    entry=>entry.repository='someone-else/zero-starter',entry=>entry.repositoryId=0,
    entry=>entry.visibility='private',entry=>entry.isTemplate=false,entry=>entry.defaultBranch='develop',
    entry=>entry.commit='main',entry=>entry.commit=123,entry=>entry.tree=null,
    entry=>entry.id='unknown',
  ]) {
    const snapshot=published(); change(snapshot.templates[0]);
    assert.throws(()=>validatePublishedTemplates(snapshot));
  }
  const partial=published(); partial.templates.pop();
  assert.throws(()=>validatePublishedTemplates(partial),/Invalid template publication snapshot/);
  const duplicate=published(); duplicate.templates[1]=duplicate.templates[0];
  assert.throws(()=>validatePublishedTemplates(duplicate),/Invalid published project template/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestListings, updateListing} from '../lib/hub-listings-client.mjs';

const project = {repositoryId:'123',title:'My game'};
const options = {csrfToken:'secret',project,action:'list',signal:AbortSignal.timeout(1000)};

test('confirmed replacement survives a separate failed refresh, with no repeated POST', async () => {
  const calls=[];
  const fetcher=async (url,init) => {
    calls.push([url,init]);
    if (init.method==='POST') return Response.json({status:'listed',replaced:'Old game'});
    throw new Error('offline');
  };
  const result=await updateListing({...options,fetcher});
  assert.equal(result.outcome,'confirmed');
  assert.equal(result.message,'My game replaced Old game on ZeroHub.');
  await assert.rejects(requestListings({fetcher,account:'42',before:'99',signal:options.signal}));
  assert.equal(calls.length,2);
  assert.equal(calls[0][1].headers['X-Hub-CSRF'],'secret');
  assert.deepEqual(JSON.parse(calls[0][1].body),{action:'list',repositoryId:'123'});
  assert.equal(calls[1][0],'/api/hub/listings?before=99');
});

test('lost and ambiguous responses remain uncertain and never replay the mutation', async () => {
  for (const reply of [() => {throw new Error('timeout');}, () => new Response('broken', {status:200}),
    () => Response.json({error:'unavailable'}, {status:503}), () => Response.json({status:'unexpected'})]) {
    let calls=0;
    const result=await updateListing({...options,fetcher:async()=>{calls++;return reply();}});
    assert.equal(result.outcome,'uncertain');
    assert.match(result.message,/could not confirm/);
    assert.equal(calls,1);
  }
});

test('a rejected request is reported and an account mismatch cannot reconcile stale data', async () => {
  const result=await updateListing({...options,fetcher:async()=>Response.json({error:'Reload ZeroHub.'},{status:403})});
  assert.equal(result.outcome,'rejected');
  assert.equal(result.message,'Reload ZeroHub.');
  await assert.rejects(requestListings({account:'42',before:null,fetcher:async()=>Response.json({account:'43',projects:[]})}),/Sign in again/);
  const current=await requestListings({account:'42',before:null,fetcher:async()=>Response.json({account:'42',projects:[],next:null})});
  assert.equal(current.account,'42');
});

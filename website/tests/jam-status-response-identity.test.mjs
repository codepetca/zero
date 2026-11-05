import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamDestinationBindingReader} from '../lib/jam-destination-binding.mjs';
import {createHubProjectStatusService, hubProjectsResponse} from '../lib/hub-project-status.mjs';

// Every authority, destination and provider response is synthetic. No network.
const target = {id:'old-project', kind:'game', repositoryId:'123', ownerId:'7',
  repositoryUrl:'https://github.com/student/project'};
const binding = {...target, owner:'student', repo:'project'};
const decision = () => ({revision:'a'.repeat(40), observedAt:0, isHeld:id => id === '202'});
const provider = (id = 123, ownerId = 7, stars = 3) => ({id, owner:{id:ownerId}, stargazers_count:stars, has_issues:true});
const options = {visibilityReader:async () => decision(), destinationReader:async () => binding};

test('active status rejects replacement, transferred and missing response identities without poisoning caches', async () => {
  for (const foreign of [provider(202, 7, 987), provider(123, 8, 987),
    {...provider(), id:undefined}, {...provider(), owner:undefined}, provider('123', 7), provider(123, '7')]) {
    let current = foreign, calls = 0;
    const service = createHubProjectStatusService({...options,
      fetchImpl:async () => {calls++; return Response.json(current);}});
    assert.equal(await service.statusTarget(target), null);
    current = provider();
    assert.equal((await service.statusTarget(target)).stars, 3);
    assert.equal(calls, 2, 'mismatched response was neither cached nor reused');
    assert.equal((await service.statusTarget(target)).stars, 3);
    assert.equal(calls, 2, 'verified aggregates retain normal caching');
  }
});

test('unknown saved owner is pinned to fresh observed owner before validating status response', async () => {
  const {ownerId, ...unknownOwner} = target;
  const service = createHubProjectStatusService({...options, fetchImpl:async () => Response.json(provider(123, 8))});
  assert.equal(await service.statusTarget(unknownOwner), null);
});

test('final rebind suppresses changed destinations after provider work', async () => {
  let current = binding, sourceReads = 0;
  const service = createHubProjectStatusService({...options,
    destinationReader:async () => {sourceReads++; return current;},
    fetchImpl:async () => {current = {...binding, repositoryId:'202'}; return Response.json(provider());}});
  assert.equal(await service.statusTarget(target), null);
  assert.equal(sourceReads, 2);
});

test('warm status cache hits still perform final source binding', async () => {
  let calls = 0, sourceReads = 0;
  const service = createHubProjectStatusService({...options,
    destinationReader:async () => {
      sourceReads++;
      return sourceReads === 4 ? {...binding, repositoryId:'202'} : binding;
    }, fetchImpl:async () => {calls++; return Response.json(provider());}});
  assert.equal((await service.statusTarget(target)).stars, 3);
  assert.equal(await service.statusTarget(target), null);
  assert.equal(calls, 1);
});

test('final source outage and authority loss cannot return completed provider results', async () => {
  for (const failure of ['source', 'authority']) {
    let completed = false;
    const service = createHubProjectStatusService({...options,
      visibilityReader:async () => completed && failure === 'authority' ? null : decision(),
      destinationReader:async () => {
        if (completed && failure === 'source') throw Error('private provider detail');
        return binding;
      }, fetchImpl:async () => {completed = true; return Response.json(provider());}});
    await assert.rejects(service.statusTarget(target), {message:'Project visibility is unavailable.'});
  }
});

test('repository provider outages remain unknown after successful final binding', async () => {
  let reads = 0;
  const service = createHubProjectStatusService({...options,
    destinationReader:async () => {reads++; return binding;},
    fetchImpl:async () => {throw Error('provider unavailable');}});
  const result = await service.statusTarget(target);
  assert.equal(result.stars, null); assert.equal(result.issuesEnabled, null);
  assert.equal(reads, 2);
});

test('mismatched active candidate does not suppress an unrelated project in a batch', async () => {
  const other = {...target, id:'other-project', repositoryId:'456', repositoryUrl:'https://github.com/student/other'};
  const destinationReader = async url => url === target.repositoryUrl ? binding : {...binding, repositoryUrl:url, repositoryId:'456', repo:'other'};
  const service = createHubProjectStatusService({...options, destinationReader,
    fetchImpl:async url => Response.json(url.endsWith('/project') ? provider(202, 7, 987) : provider(456, 7, 4))});
  service.resolve = async ({id}) => id === target.id ? target : other;
  const response = await hubProjectsResponse(new Request('https://zero.example/api/hub/projects?kind=game&ids=old-project,other-project'),
    {...options, destinationReader, service});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items.map(item => [item.id, item.stars]), [['other-project', 4]]);
});

test('inactive status retains existing parsing and performs no source observations', async () => {
  const service = createHubProjectStatusService({visibilityReader:async () => null,
    destinationReader:async () => assert.fail('inactive source read'),
    fetchImpl:async () => Response.json(provider(202, 8, 987))});
  assert.equal((await service.statusTarget(target)).stars, 987);
});

test('final route binding drops an earlier project replaced during a later provider batch', async () => {
  const records = ['one','two','three','four'].map((id, index) => ({id, repositoryId:String(101 + index),
    ownerId:'7', repositoryUrl:`https://github.com/student/${id}`}));
  let replaced = false;
  const destinationReader = async url => {
    const project = records.find(record => record.repositoryUrl === url);
    return {...project, repositoryId:replaced && project.id === 'one' ? '202' : project.repositoryId,
      owner:'student', repo:project.id};
  };
  const service = createHubProjectStatusService({...options, destinationReader, maintainedProjects:records,
    fetchImpl:async url => {
      const project = records.find(record => url.endsWith('/' + record.id));
      if (project.id === 'four') replaced = true;
      return Response.json(provider(Number(project.repositoryId)));
    }});
  const response = await hubProjectsResponse(new Request('https://zero.example/api/hub/projects?kind=game&ids=one,two,three,four'),
    {...options, destinationReader, service});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items.map(item => item.id), ['two','three','four']);
});

test('final route binding stays within the total deadline and honors cancellation', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let reads = 0, observedSignal, release;
    const service = {resolve:async () => target,
      statusTarget:async () => ({...target, stars:3, issuesEnabled:true, site:{status:'not-checked'}})};
    const destinationReader = async (_url, {signal}) => {
      if (++reads === 1) return binding;
      observedSignal = signal;
      if (cancel) controller.abort();
      return new Promise(resolve => {release = resolve;});
    };
    const response = await hubProjectsResponse(new Request('https://zero.example/api/hub/projects?kind=game&ids=old-project',
      {signal:controller.signal}), {...options, service, destinationReader, responseBudgetMs:500});
    assert.equal(response.status, 503);
    assert.equal(observedSignal.aborted, true);
    assert.doesNotMatch(await response.text(), /student|old-project/);
    release(binding);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2);
  }
});


test('parallel twelve-project HTTP batches share four-slot destination admission without 503', async () => {
  const records = Array.from({length:24}, (_, index) => ({id:`project${index}`, repositoryId:String(301 + index),
    ownerId:'7', repositoryUrl:`https://github.com/student/project${index}`}));
  let active = 0, peak = 0;
  const destinationReader = createJamDestinationBindingReader({fetchImpl:async url => {
    const project = records.find(record => url.endsWith('/' + record.id));
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return Response.json({id:Number(project.repositoryId), owner:{id:7, type:'User', login:'student'},
      private:false, name:project.id, full_name:`student/${project.id}`, html_url:project.repositoryUrl});
  }});
  const service = createHubProjectStatusService({...options, destinationReader, maintainedProjects:records,
    fetchImpl:async url => Response.json(provider(Number(records.find(record => url.endsWith('/' + record.id)).repositoryId)))});
  const responses = await Promise.all([records.slice(0, 12), records.slice(12)].map(batch =>
    hubProjectsResponse(new Request(`https://zero.example/api/hub/projects?kind=game&ids=${batch.map(project => project.id).join(',')}`),
      {...options, destinationReader, service})));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 12);
  }
  assert.equal(peak, 4);
});

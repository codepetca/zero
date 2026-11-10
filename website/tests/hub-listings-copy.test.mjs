import test from 'node:test';
import assert from 'node:assert/strict';
import {listingSlotsMessage} from '../lib/hub-listings-copy.mjs';
import {readFile} from 'node:fs/promises';

test('slot guidance distinguishes unknown, over-limit and full allowances', () => {
  assert.match(listingSlotsMessage(2, null), /temporarily unavailable.*manage or remove/);
  assert.match(listingSlotsMessage(2, 1), /above your 1 app slot allowance.*Remove apps/);
  assert.doesNotMatch(listingSlotsMessage(2, 1), /replaces/);
  assert.match(listingSlotsMessage(1, 1), /replaces the first unprotected/);
});

test('management keeps removal available and disables placement while the limit is unknown', async () => {
  const component = await readFile(new URL('../components/HubListings.tsx', import.meta.url), 'utf8');
  assert.match(component, /action\(project,'unlist','Remove from ZeroHub'\)/);
  assert.match(component, /action\(project,'list','Add to ZeroHub',data\.limit === null\)/);
});

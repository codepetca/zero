import test from "node:test";
import assert from "node:assert/strict";
import {copyCode} from "../lib/copy-code.mjs";

function fakeDocument(result = true) {
  const state = {selected: false, removed: false, restored: false};
  const field = {style: {}, setAttribute() {}, focus() {}, select() { state.selected = true; }, remove() { state.removed = true; }};
  const doc = {
    activeElement: {focus() { state.restored = true; }},
    body: {appendChild(element) { assert.equal(element, field); }},
    createElement(name) { assert.equal(name, "textarea"); return field; },
    execCommand(command) { assert.equal(command, "copy"); assert.equal(state.selected, true); return result; },
  };
  return {doc, state, field};
}

test("uses the browser clipboard when available", async () => {
  let copied;
  assert.equal(await copyCode("hello\n", {clipboard: {writeText: async (text) => { copied = text; }}}, {}), true);
  assert.equal(copied, "hello\n");
});

test("falls back on missing or denied clipboard and restores focus", async () => {
  for (const nav of [{}, {clipboard: {writeText: async () => { throw new Error("denied"); }}}]) {
    const {doc, state, field} = fakeDocument();
    assert.equal(await copyCode("line\n", nav, doc), true);
    assert.equal(field.value, "line\n");
    assert.deepEqual(state, {selected: true, removed: true, restored: true});
  }
});

test("does not report success when the browser refuses the fallback", async () => {
  const {doc, state} = fakeDocument(false);
  assert.equal(await copyCode("x", {}, doc), false);
  assert.equal(state.removed, true);
  assert.equal(state.restored, true);
  assert.equal(await copyCode("x", {}, {}), false);
});

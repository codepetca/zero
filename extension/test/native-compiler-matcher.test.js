'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');

test('native compiler collection ends when Maven hands off to the running app', () => {
  const matcher = manifest.contributes.problemMatchers.find(item => item.name === 'zero-java');
  assert.equal(matcher.background.activeOnStart, true);
  const begins = new RegExp(matcher.background.beginsPattern);
  const ends = new RegExp(matcher.background.endsPattern);
  const error = new RegExp(matcher.pattern.regexp);
  assert.ok(begins.test('[INFO] Scanning for projects...'));
  // Actual pinned Maven output, including a source path containing spaces.
  const failure = error.exec("[ERROR] /Users/student/Zero Projects/Coin/src/main/java/Main.java:[22,50] ';' expected");
  assert.deepEqual(failure.slice(1), ['/Users/student/Zero Projects/Coin/src/main/java/Main.java', '22', '50', "';' expected"]);
  for (const line of [
    '[INFO] --- compiler:3.14.0:compile (default-compile) @ my-app ---',
    '[INFO] Compiling 24 source files with javac [debug release 17] to target/classes',
    '[INFO] BUILD FAILURE',
    "[ERROR] /Users/student/Main.java:[22,50] ';' expected"
  ]) assert.equal(ends.test(line), false, line);
  assert.ok(ends.test('[INFO] --- javafx:0.0.8:run (default-cli) @ my-app ---'));
});

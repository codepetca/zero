'use strict';

// A tooling decision interrupts the originating action before it starts a build.
class BrowserToolingDecision extends Error {
  constructor(repair) {
    super(repair ? 'Some browser tools are missing.' : 'Browser action cancelled. No browser tools were changed.');
    this.repair = repair;
  }
}
module.exports = {BrowserToolingDecision};

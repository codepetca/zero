const assert = require('node:assert/strict');

async function followWorkOSLaunch(url) {
  const response = await fetch(url, {redirect:'manual'});
  assert.equal(response.status, 303);
  return new URL(response.headers.get('location'));
}

module.exports = {followWorkOSLaunch};

'use strict';
// One review keeps the initially observed repository/installation identity.
function createRefOnlyIdentityBinding({identify,assertSame}={}) {
 if(typeof identify!=='function'||typeof assertSame!=='function')throw new Error('Repository identity verification is required.');
 let reviewed;
 return Object.freeze({observe(access){if(reviewed===undefined)reviewed=identify(access);else assertSame(reviewed,access);return reviewed;}});
}
module.exports={createRefOnlyIdentityBinding};

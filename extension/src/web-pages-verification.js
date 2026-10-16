'use strict';
const https=require('node:https');
const dns=require('node:dns');
const net=require('node:net');
const {validateWebUrl}=require('./sharing/contracts');

function safePagesUrl(value,cname) {
  try {validateWebUrl(value);const url = new URL(value);const host=url.hostname.toLowerCase();return url.protocol === 'https:' && (/^[a-z0-9-]+\.github\.io$/i.test(host) || (cname && host===cname.toLowerCase() && !net.isIP(host) && host.includes('.'))) && !url.port && !url.username && !url.password && !url.search && !url.hash ? url.href : null;} catch {return null;}
}
function publicAddress(address) {
  if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !([0,10,127].includes(a) || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)));}
  // Public IPv6 global unicast only. IPv4-mapped, loopback, link-local and ULA
  // addresses cannot satisfy this prefix.
  return net.isIP(address)===6 && /^[23][a-f0-9]{3}:/i.test(address) && !/^2001:(?:0{1,4}|db8):/i.test(address) && !/^2002:/i.test(address);
}
function publicReadiness(url,{signal,get=https.get,lookup=dns.lookup}={}) {
  return new Promise((resolve,reject)=>{
    validateWebUrl(url);
    const req=get(url,{signal,headers:{'Cache-Control':'no-cache'},lookup(host,options,callback){
      lookup(host,{all:true},(error,addresses)=>{
        if(error)return callback(error);
        if(!addresses.length || addresses.some(item=>!publicAddress(item.address)))return callback(new Error('The Pages domain does not resolve to a public address.'));
        // The connection uses the checked DNS result; it cannot re-resolve to a
        // private address between validation and the actual HTTP request.
        const first=addresses[0];callback(null,options.all?[first]:first.address,...(options.all?[]:[first.family]));
      });
    }},response=>{
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>100){response.destroy();reject(new Error('Unexpected public version response.'));}else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        try {
          if(response.statusCode!==200)throw new Error('The public version file is not available yet.');
          resolve(new Response(Buffer.concat(chunks),{status:200,headers:response.headers}));
        } catch(error) {reject(error);}
      });
    });
    req.on('error',reject);
  });
}
async function boundedText(response) {
  if(!response.body)return '';
  const reader=response.body.getReader();let text='',size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100)return '';text+=new TextDecoder().decode(value);}return text.trim();} finally {await reader.cancel();}
}

module.exports={safePagesUrl,publicAddress,publicReadiness,boundedText};

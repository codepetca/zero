'use strict';
// A student's optional ZeroHub card image. Publish copies a valid, committed
// zerohub/thumbnail.png into the Pages site as zero-thumbnail.png. ZeroHub checks it
// again before showing it and otherwise draws a default pattern.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateGamePreview}=require('./sharing/game-preview');

const SOURCE='zerohub/thumbnail.png', PUBLISHED='zero-thumbnail.png';
const MAX_BYTES=1024*1024, MIN_SIDE=128, MAX_SIDE=2048;
const RULES=`a square PNG from ${MIN_SIDE} × ${MIN_SIDE} to ${MAX_SIDE} × ${MAX_SIDE} pixels, at most 1 MB`;
const gitBlob=bytes=>crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function checkThumbnail(input) {
  const bytes=Buffer.from(input);
  if(bytes.length>MAX_BYTES)return {valid:false};
  let size;
  try {size=validateGamePreview(bytes);} catch {return {valid:false};}
  return size.width>=MIN_SIDE&&size.width<=MAX_SIDE ? {valid:true,size:size.width} : {valid:false};
}

async function committedThumbnail({projectRoot,sourceSha,git}) {
  let bytes;
  try {bytes=await fs.readFile(path.join(projectRoot,SOURCE));}
  catch(error) {if(['ENOENT','EISDIR','ENOTDIR'].includes(error.code))return {status:'missing'};throw error;}
  if(!checkThumbnail(bytes).valid)return {status:'invalid',message:`${SOURCE} must be ${RULES}.`};
  // Publish the exact committed image, like the rest of the app's inputs.
  const listed=String(await git(projectRoot,['ls-tree','-z',sourceSha,'--',SOURCE]));
  const match=/^100644 blob ([a-f0-9]{40})\tzerohub\/thumbnail\.png\0?$/.exec(listed);
  if(match?.[1]!==gitBlob(bytes))return {status:'invalid',message:`${SOURCE} differs from the uploaded commit. Commit & push it, then publish again.`};
  return {status:'valid',bytes};
}

function withThumbnail(validated,thumbnail) {
  if(thumbnail?.status!=='valid'||!validated?.manifest||!Array.isArray(validated.manifest.files)||!Array.isArray(validated.siteFiles))return validated;
  // Never replace a file the game itself ships under the same name.
  if(validated.manifest.files.some(file=>file.path===PUBLISHED)||validated.siteFiles.some(file=>file.path===PUBLISHED))return validated;
  const bytes=Buffer.from(thumbnail.bytes);
  const file={path:PUBLISHED,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  return {...validated,manifest:{...validated.manifest,files:[...validated.manifest.files,file]},siteFiles:[...validated.siteFiles,{path:PUBLISHED,bytes}]};
}

function thumbnailNote(thumbnail) {
  if(thumbnail?.status==='valid')return `ZeroHub will show ${SOURCE}.`;
  if(thumbnail?.status==='invalid')return `${thumbnail.message} ZeroHub will show a default pattern.`;
  return '';
}

module.exports={SOURCE,PUBLISHED,MAX_BYTES,MIN_SIDE,MAX_SIDE,RULES,checkThumbnail,committedThumbnail,withThumbnail,thumbnailNote};

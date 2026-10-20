import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// All web branding is derived from the editable shared assets.
export async function prepareBrandAssets(root, site) {
  const source=path.join(root,'design/brand');
  const output=path.join(site,'public/generated/brand');
  await mkdir(output,{recursive:true});
  for(const name of ['zero-purple','zero-purple-on-white','zero-white-on-purple','zero-wordmark','zero-wordmark-dark'])
    await copyFile(path.join(source,`${name}.svg`),path.join(output,`${name}.svg`));
  // Keep the existing URL usable by older cached pages.
  await copyFile(path.join(source,'zero-purple.svg'),path.join(site,'public/generated/zero.svg'));
  const mark=await readFile(path.join(source,'zero-purple.svg'),'utf8');
  const darkWordmark=await readFile(path.join(source,'zero-wordmark-dark.svg'),'utf8');
  const lightColor=mark.match(/stroke="(#[a-f\d]{6})"/i)?.[1];
  const darkColor=darkWordmark.match(/stroke="(#[a-f\d]{6})"/i)?.[1];
  if(!lightColor || !darkColor) throw new Error('Website title icons must define their theme colors.');
  await writeFile(path.join(output,'favicon-light.svg'),mark);
  await writeFile(path.join(output,'favicon-dark.svg'),mark.replaceAll(lightColor,darkColor));
  // The initial browser icon follows the OS until the page applies its saved theme.
  const adaptive=mark.replaceAll(lightColor,'currentColor').replace(/(<svg[^>]*>)/,
    `$1<style>:root{color:${lightColor}}@media(prefers-color-scheme:dark){:root{color:${darkColor}}}</style>`);
  await writeFile(path.join(output,'favicon.svg'),adaptive);
  const inverse=await readFile(path.join(source,'zero-white-on-purple.svg'));
  await sharp(Buffer.from(mark)).resize(32,32).png().toFile(path.join(output,'favicon-32.png'));
  await sharp(inverse).resize(180,180).png().toFile(path.join(output,'apple-touch-icon.png'));
  const icon=await sharp(inverse).resize(360,360).png().toBuffer();
  await sharp({create:{width:1200,height:630,channels:4,background:'#683bef'}})
    .composite([{input:icon,left:420,top:135}]).png().toFile(path.join(output,'share.png'));
  await writeFile(path.join(output,'README.txt'),'Generated from design/brand SVG sources. Rebuild with npm run prepare.\n');
}

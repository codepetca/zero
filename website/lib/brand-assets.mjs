import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// All web branding is derived from the editable shared assets.
export async function prepareBrandAssets(root, site) {
  const source=path.join(root,'design/brand');
  const output=path.join(site,'public/generated/brand');
  await mkdir(output,{recursive:true});
  for(const name of ['zero-purple','zero-purple-on-white','zero-white-on-purple'])
    await copyFile(path.join(source,`${name}.svg`),path.join(output,`${name}.svg`));
  // Keep the existing URL usable by older cached pages.
  await copyFile(path.join(source,'zero-purple.svg'),path.join(site,'public/generated/zero.svg'));
  const inverse=await readFile(path.join(source,'zero-white-on-purple.svg'));
  for(const [name,size] of [['favicon-32',32],['apple-touch-icon',180]])
    await sharp(inverse).resize(size,size).png().toFile(path.join(output,`${name}.png`));
  const icon=await sharp(inverse).resize(360,360).png().toBuffer();
  await sharp({create:{width:1200,height:630,channels:4,background:'#683bef'}})
    .composite([{input:icon,left:420,top:135}]).png().toFile(path.join(output,'share.png'));
  await writeFile(path.join(output,'README.txt'),'Generated from design/brand SVG sources. Rebuild with npm run prepare.\n');
}

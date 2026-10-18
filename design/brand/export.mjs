import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import zip from '../../extension/src/web-export/zip.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../website/package.json', import.meta.url));
const sharp = require('sharp');
const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(directory, 'exports');
const variants = [
  {name:'zero-purple', label:'Purple · transparent'},
  {name:'zero-purple-on-white', label:'Purple on white'},
  {name:'zero-white-on-purple', label:'White on purple'}
];
await mkdir(output, {recursive:true});
for (const {name} of variants) {
  const svg = path.join(directory, `${name}.svg`);
  await sharp(await readFile(svg)).resize(1024,1024).png().toFile(path.join(output,`${name}.png`));
  await copyFile(svg,path.join(output,`${name}.svg`));
}
await copyFile(path.join(directory,'README.md'),path.join(output,'README.md'));

const tiles = [];
for (const [index,{name,label}] of variants.entries()) {
  const image = await sharp(path.join(output,`${name}.png`)).resize(256,256).png().toBuffer();
  tiles.push({input:image,left:32+index*320,top:24});
  const caption=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="48"><text x="160" y="30" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#080e25">${label}</text></svg>`);
  tiles.push({input:caption,left:index*320,top:288});
}
const backdrop=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="352"><defs><pattern id="checker" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="white"/><path d="M0 0h16v16H0zm16 16h16v16H16z" fill="#eeeeF3"/></pattern></defs><rect width="960" height="352" fill="#f5f6fa"/><rect x="32" y="24" width="256" height="256" fill="url(#checker)"/></svg>');
await sharp(backdrop).composite(tiles).png().toFile(path.join(output,'zero-icons-preview.png'));
const archiveNames=[...variants.flatMap(({name})=>[`${name}.svg`,`${name}.png`]),'README.md'];
const files=await Promise.all(archiveNames.map(async name=>({path:name,bytes:await readFile(path.join(output,name))})));
await writeFile(path.join(output,'zero-icons.zip'),zip.zipFiles(files));
console.log(`Exported three SVG/PNG variants, preview and ZIP to ${output}`);

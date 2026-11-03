// Standard-library ZIP writer: no npm dependencies, no original file or node_modules.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {root} from './build.mjs';
const table = Array.from({length:256},(_,n) => {for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1; return n>>>0;});
const crc32 = b => {let n=0xffffffff;for(const v of b)n=table[(n^v)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const files=[];
async function walk(dir) {for(const ent of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())await walk(file);else files.push(file);}}
await walk(root);
const parts=[],central=[];let offset=0;
for(const file of files.sort()) {
  const name=Buffer.from('quest-foundation/'+path.relative(root,file).replaceAll('\\','/'));
  if(name.includes(Buffer.from('node_modules/'))) continue;
  const raw=await readFile(file),compressed=deflateRawSync(raw),crc=crc32(raw);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  parts.push(local,name,compressed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);
  offset+=local.length+name.length+compressed.length;
}
const end=Buffer.alloc(22),centralSize=central.reduce((n,b)=>n+b.length,0);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
await writeFile(root+'.zip',Buffer.concat([...parts,...central,end]));
console.log(`ZIP written: ${root}.zip (${central.length/2} files)`);

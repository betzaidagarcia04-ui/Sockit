import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {optimize} from 'svgo';
let before=0,after=0,count=0;
for(const group of ['logos','patterns','icons']){
 const input=path.join('public/brand',group),output=path.join('public/brand/optimized',group);await mkdir(output,{recursive:true});
 for(const file of await readdir(input)){
  if(!file.endsWith('.svg'))continue;const source=await readFile(path.join(input,file),'utf8');
  const result=optimize(source,{path:file,floatPrecision:6,multipass:true});
  await writeFile(path.join(output,file),result.data);before+=Buffer.byteLength(source);after+=Buffer.byteLength(result.data);count++;
 }
}
console.log(`${count} SVG optimizados: ${before} → ${after} bytes. Los originales se conservan.`);

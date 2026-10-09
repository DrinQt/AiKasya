import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
await mkdir('public/icons',{recursive:true});
for(const size of [192,512]){
 await sharp('public/assets/aikasya-mascot.png').resize(size,size,{fit:'contain',background:'#fffcf5'}).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp('public/assets/aikasya-mascot.png').resize(180,180,{fit:'contain',background:'#fffcf5'}).png().toFile('public/icons/apple-touch-icon.png');
for(const [filename,target] of [['Pork_adobo.jpg','adobo.jpg'],['Ginisang_Munggo,_Apr_2024.jpg','monggo.jpg']]){
 const hash=createHash('md5').update(filename).digest('hex');
 const url=`https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(filename)}`;
 const response=await fetch(url,{headers:{'User-Agent':'AiKasyaFrontend/0.1 (sample meal photography)'}});
 if(!response.ok)throw new Error(`Food image download failed: ${response.status}`);
 await writeFile(`public/assets/${target}`,Buffer.from(await response.arrayBuffer()));
}
console.log('Official mascot app icons and local food photos prepared.');

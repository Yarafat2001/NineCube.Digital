/** Generate the narration first, so recording lengths use measured speech rather than estimates. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(join(root,'web/package.json'));
const ts=require('typescript');
const source=ts.createSourceFile('record.mjs',readFileSync(join(root,'web/scripts/record-walkthrough.mjs'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
function literal(node) {
 if(ts.isStringLiteralLike(node))return node.text;
 if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return literal(node.left)+literal(node.right);
 throw new Error('Narration must be literal text, not dynamically evaluated code.');
}
const scenes=[];
function visit(node) {
 if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='scene') {
  const [id,title,subtitle,caption,narration]=node.arguments.slice(0,5).map(literal);scenes.push({id,title,subtitle,caption,narration});
 }
 ts.forEachChild(node,visit);
}
visit(source);
const out=join(root,'docs/walkthrough');const raw=join(out,'narration/raw');mkdirSync(raw,{recursive:true});
writeFileSync(join(out,'narration-plan.json'),JSON.stringify({scenes},null,2));
const synthesis=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'tools/narrate-walkthrough.ps1'),'-ScenesJson',join(out,'narration-plan.json'),'-OutDir',raw],{encoding:'utf8'});
if(synthesis.status!==0)throw new Error(synthesis.stderr||synthesis.stdout);
function duration(buffer) {
 let rate,alignment,data;
 for(let i=12;i+8<=buffer.length;) {
  const tag=buffer.toString('ascii',i,i+4);const size=buffer.readUInt32LE(i+4);
  if(tag==='fmt '){rate=buffer.readUInt32LE(i+12);alignment=buffer.readUInt16LE(i+20);}
  if(tag==='data')data=size;
  i+=8+size+(size%2);
 }
 if(!rate||!alignment||!data)throw new Error('Invalid narration WAV');
 return data/(rate*alignment)*1000;
}
const timings={};scenes.forEach((scene,i)=>{
 const filename=`${String(i+1).padStart(2,'0')}-${scene.id}.wav`;
 timings[scene.id]={file:filename,durationMs:duration(readFileSync(join(raw,filename))),hash:createHash('sha256').update(scene.narration).digest('hex')};
});
writeFileSync(join(out,'narration/timings.json'),JSON.stringify(timings,null,2));
console.log(`Prepared ${scenes.length} narration clips from actual Windows voice audio.`);

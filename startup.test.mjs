import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const base=new URL('./',import.meta.url);
class Node {
 constructor(tag='div',text=''){this.tagName=tag;this.nodeType=tag==='#text'?3:1;this.textContent=text;this.childNodes=[];this.attributes=[];this.namespaceURI=null;this.handlers=[];this.value='';this.disabled=false;this.hidden=false;}
 get children(){return this.childNodes.filter(n=>n.nodeType===1)}
 append(...nodes){this.childNodes.push(...nodes)}
 replaceChildren(...nodes){this.childNodes=[...nodes]}
 setAttribute(name,value){let a=this.attributes.find(a=>a.name===name);if(a)a.value=value;else this.attributes.push({name,value})}
 getAttribute(name){return this.attributes.find(a=>a.name===name)?.value??null}
 removeAttribute(name){this.attributes=this.attributes.filter(a=>a.name!==name)}
 getElementsByTagName(tag){return this.children.flatMap(c=>[...(tag==='*'||c.tagName===tag?[c]:[]),...c.getElementsByTagName(tag)])}
 addEventListener(type,fn){this.handlers.push({type,fn})}
 focus(){this.focused=true} remove(){} click(){this.clicked=true}
 fire(type){for(const h of this.handlers.filter(h=>h.type===type))h.fn({type})}
}
// Test-only narrow XML stand-in. This exercises real app/core flow, NOT browser parser acceptance.
class Parser {
 parseFromString(source,mime){assert.equal(mime,'application/xml');const stack=[],root=new Node('document');stack.push(root);
 for(const token of source.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</'))stack.pop();else if(token.startsWith('<')){const [,tag,attrs]=token.match(/^<([a-z]+)(.*?)>$/);const n=new Node(tag);for(const a of attrs.matchAll(/([a-z]+)="([^"]*)"/g))n.setAttribute(a[1],a[2]);stack.at(-1).append(n);stack.push(n);}else stack.at(-1).append(new Node('#text',token.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'")));}
 function aggregate(n){for(const c of n.childNodes)aggregate(c);if(n.nodeType===1)n.textContent=n.childNodes.map(c=>c.textContent).join('')};aggregate(root);
 return {documentElement:root.children[0],getElementsByTagName:tag=>root.getElementsByTagName(tag)};
 }
}
async function boot({failPoint,input='kept input',file='app.mjs',rejectImport=false}={}){
 const nodes=new Map(),actions=['preview','undo','example','refused','html-download','receipt-download'];let binds=0,failed=false,downloaded=0;const blobs=[];
 const document={body:new Node('body'),createElement:tag=>{const n=new Node(tag);if(tag==='a')n.click=()=>{downloaded++};return n},getElementById(id){if(!nodes.has(id)){const n=new Node();n.value=id==='source'?input:id==='mode'?'add':'';n.disabled=['preview','undo','html-download','receipt-download'].includes(id);n.addEventListener=(type,fn)=>{binds++;if(failPoint===`bind${binds}`)throw Error('binding');n.handlers.push({type,fn})};nodes.set(id,n)}return nodes.get(id)}};
 for(const id of [...actions,'source','mode','status'])document.getElementById(id);
 if(failPoint==='readyStatus'){const n=nodes.get('status');let value='Loading';Object.defineProperty(n,'textContent',{get:()=>value,set:v=>{if(!failed&&v.startsWith('Ready')){failed=true;throw Error('status failure')}value=v}})}
 if(failPoint==='finalEnable'){const n=nodes.get('preview');let value=true;Object.defineProperty(n,'disabled',{get:()=>value,set:v=>{value=v;if(!failed&&v===false){failed=true;throw Error('enable failure')}}})}
 const context=vm.createContext({document,DOMParser:Parser,Blob,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test'},revokeObjectURL(){}},setTimeout:fn=>fn()});
 const core=new vm.SourceTextModule(fs.readFileSync(new URL('./core.mjs',import.meta.url),'utf8'),{context});await core.link(()=>{});await core.evaluate();
 const mod=new vm.SourceTextModule(fs.readFileSync(new URL(file,base),'utf8'),{context,importModuleDynamically:async()=>{if(rejectImport)throw Error('simulated import rejection');return core}});await mod.link(()=>{});await mod.evaluate();await new Promise(r=>setImmediate(r));
 return{nodes,actions,mod,blobs,get downloaded(){return downloaded},binds};
}
test('independent final Ready-status and final enable failures disable all actions; partial listeners stay inert',async()=>{
 for(const failPoint of ['readyStatus','finalEnable',...Array.from({length:8},(_,i)=>`bind${i+1}`)]){
 const b=await boot({failPoint});assert.equal(b.nodes.get('source').value,'kept input');for(const id of b.actions)assert.equal(b.nodes.get(id).disabled,true,`${failPoint}:${id}`);
 const before=JSON.stringify([...b.nodes].map(([id,n])=>[id,n.value,n.textContent,n.disabled]));for(const n of b.nodes.values()){n.fire('input');n.fire('change');n.fire('click')};assert.equal(JSON.stringify([...b.nodes].map(([id,n])=>[id,n.value,n.textContent,n.disabled])),before);
 }
});
test('successful gated callbacks run the actual core preview, export, Undo, reset and refused workflow',async()=>{
 const b=await boot({input:''});const n=id=>b.nodes.get(id);n('preview').fire('click');assert.match(n('status').textContent,/4 context changes, 2 role changes.*9 cell texts/);assert.equal(n('html-download').disabled,false);
 n('receipt-download').fire('click');assert.equal(b.downloaded,1);n('undo').fire('click');assert.equal(n('receipt-download').disabled,true);assert.match(n('status').textContent,/exact original structure/);
 n('preview').fire('click');n('source').value='edited';n('source').fire('input');assert.equal(n('html-download').disabled,true);
 n('example').fire('click');assert.equal(n('source').value,b.mod.namespace.WORKSHOP);n('preview').fire('click');n('mode').value='remove';n('mode').fire('change');assert.equal(n('html-download').disabled,true);n('preview').fire('click');assert.match(n('status').textContent,/0 context changes, 0 role changes/);
 n('refused').fire('click');n('preview').fire('click');assert.match(n('status').textContent,/Unsupported attribute: colspan/);assert.equal(n('receipt-download').disabled,true);assert.equal(n('source').value,b.mod.namespace.MERGED);
});
test('preserves whitespace and nonempty user text on successful startup',async()=>{for(const input of [' ','\n','custom text']){const b=await boot({input});assert.equal(b.nodes.get('source').value,input);assert.equal(b.nodes.get('preview').disabled,false)}});

test('import rejection disables actions and preserves loading-time input',async()=>{const b=await boot({rejectImport:true});assert.equal(b.binds,0);assert.equal(b.nodes.get('source').value,'kept input');for(const id of b.actions)assert.equal(b.nodes.get(id).disabled,true);assert.match(b.nodes.get('status').textContent,/could not load/)});
test('empty startup loads the exact fixture and eight listeners',async()=>{const b=await boot({input:''});assert.equal(b.nodes.get('source').value,b.mod.namespace.WORKSHOP);assert.equal(b.binds,8);assert.equal(b.nodes.get('preview').disabled,false)});

// Download encoding is distinct from parser round-trip and startup coverage.
test('actual HTML download bytes identify UTF-8; JSON remains unchanged and BOM-free',async()=>{
 const b=await boot({input:''}), n=id=>b.nodes.get(id);
 n('source').value=b.mod.namespace.WORKSHOP.replace('Workshop schedule · synthetic example','Café · 東京 😀').replace('09:00','€25');
 n('preview').fire('click');assert.equal(n('html-download').disabled,false);
 n('html-download').fire('click');n('receipt-download').fire('click');
 assert.equal(b.blobs.length,2);
 const bytes=Buffer.from(await b.blobs[0].arrayBuffer());
 assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf]);
 const fragment=bytes.subarray(3).toString('utf8');
 assert.match(fragment,/<caption>Café · 東京 😀<\/caption>/);assert.match(fragment,/>€25</);
 assert.equal(fragment[0],'<');
 const json=Buffer.from(await b.blobs[1].arrayBuffer());assert.equal(json[0],0x7b);
 const receipt=JSON.parse(json.toString('utf8'));assert.equal(receipt.preservation.cellCount,9);
 const changed=receipt.contextChanges.find(c=>c.text==='€25');assert.ok(changed);
 assert.equal(b.blobs[0].type,'text/html;charset=utf-8');assert.equal(b.blobs[1].type,'application/json;charset=utf-8');
});

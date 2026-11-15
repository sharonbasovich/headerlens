import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTable,proposeRowHeaders,contextForCell,compareTables,exportHTML,exportReceipt} from './core.mjs';
const fixture = () => ({caption:'Workshop times',rows:[['Workshop','Monday','Tuesday'].map(text=>({text,kind:'th',scope:'col'})),... [['Intro','09:00','11:00'],['Advanced','14:00','16:00']].map(row=>row.map(text=>({text,kind:'td',scope:null})))]});
const clone = x => JSON.parse(JSON.stringify(x));
test('synthetic correction separates four context and two role changes, preserving nine texts',()=>{
 const before=fixture(), after=proposeRowHeaders(before,true), diff=compareTables(before,after);
 assert.equal(diff.contextChanges.length,4); assert.equal(diff.roleChanges.length,2); assert.equal(diff.preservation.cellCount,9);
 assert.deepEqual(diff.contextChanges.map(x=>[x.text,x.before.map(h=>h.text),x.after.map(h=>h.text)]),[
 ['09:00',['Monday'],['Intro','Monday']],['11:00',['Tuesday'],['Intro','Tuesday']],['14:00',['Monday'],['Advanced','Monday']],['16:00',['Tuesday'],['Advanced','Tuesday']]]);
 assert.deepEqual(before,fixture());
});
test('no-op, repeated correction, reversal and repeated edit are deterministic',()=>{
 const a=fixture(),b=proposeRowHeaders(a,true);
 assert.deepEqual(proposeRowHeaders(b,true),b); assert.deepEqual(proposeRowHeaders(b,false),a);
 assert.equal(compareTables(a,proposeRowHeaders(a,false)).contextChanges.length,0);
 assert.equal(compareTables(b,b).roleChanges.length,0);
 assert.deepEqual(proposeRowHeaders(proposeRowHeaders(b,false),true),b);
});
test('frozen input and output mutations do not mutate baseline',()=>{
 const a=fixture(), saved=clone(a); a.rows.forEach(row=>{row.forEach(Object.freeze);Object.freeze(row);}); Object.freeze(a.rows);Object.freeze(a);
 const b=proposeRowHeaders(a,true); b.rows[1][1].text='changed'; assert.deepEqual(a,saved);
});
test('duplicate labels retain coordinate identity',()=>{
 const a=fixture(); a.rows.forEach(row=>row.forEach(c=>c.text='same'));
 const d=compareTables(a,proposeRowHeaders(a,true)); assert.equal(d.contextChanges.length,4);
 assert.deepEqual(d.contextChanges.map(c=>[c.row,c.col]),[[1,1],[1,2],[2,1],[2,2]]);
 assert.deepEqual(d.contextChanges[2].after.map(c=>[c.row,c.col]),[[2,0],[0,1]]);
});
test('mixed row headers change only affected row',()=>{
 const a=fixture();a.rows[1][0]={text:'Intro',kind:'th',scope:'row'};
 const d=compareTables(a,proposeRowHeaders(a,true));assert.equal(d.roleChanges.length,1);assert.equal(d.contextChanges.length,2);
});
test('corner retains explicit column scope and headers themselves have no data context',()=>{
 const a=proposeRowHeaders(fixture(),true); assert.deepEqual(a.rows[0][0],{text:'Workshop',kind:'th',scope:'col'});
 assert.deepEqual(contextForCell(a,0,0),[]);assert.deepEqual(contextForCell(a,1,0),[]);
 assert.deepEqual(contextForCell(fixture(),1,0),[{row:0,col:0,text:'Workshop',scope:'col'}]);
});
test('strict model refuses absent/implicit, multilevel and misplaced headers',()=>{
 for(const mutate of [a=>a.rows[0][0].scope=null,a=>a.rows[0][1].kind='td',a=>a.rows[1][0].scope='col',a=>a.rows[1][1]={text:'x',kind:'th',scope:'row'},a=>a.rows[1][1].scope='col']){const a=fixture();mutate(a);assert.throws(()=>validateTable(a));}
});
test('structural and executable extra fields are refused rather than silently discarded',()=>{
 for(const field of ['rowspan','colspan','headers','id','role','hidden','onclick','children']){const a=fixture();a.rows[1][1][field]='x';assert.throws(()=>validateTable(a));}
 const a=fixture();a.unknown=true;assert.throws(()=>validateTable(a));
});
test('missing fields, objects, ragged/sparse rows and malformed dimensions fail',()=>{
 for(const a of [null,[],{}, {caption:'',rows:[]},{caption:'',rows:[[{}]]}])assert.throws(()=>validateTable(a));
 for(const mutate of [a=>delete a.rows[1][0].scope,a=>a.rows[1].pop(),a=>delete a.rows[1][0],a=>delete a.rows[1],a=>a.rows[1]=null]){const a=fixture();mutate(a);assert.throws(()=>validateTable(a));}
});
test('size limits and text type enforced, including exact boundary',()=>{
 const a=fixture();a.caption='x'.repeat(500);a.rows[1][0].text='x'.repeat(500);assert.equal(validateTable(a),true);
 for(const mutate of [a=>a.caption='x'.repeat(501),a=>a.rows[1][0].text=4,a=>a.rows[1][0].text='x'.repeat(501),a=>{while(a.rows.length<31)a.rows.push(clone(a.rows[1]));},a=>a.rows.forEach(row=>{while(row.length<13)row.push(clone(row[1]));})]){const a=fixture();mutate(a);assert.throws(()=>validateTable(a));}
 const boundary=fixture();boundary.rows.forEach(row=>{while(row.length<12)row.push(clone(row[1]));});while(boundary.rows.length<30)boundary.rows.push(clone(boundary.rows[1]));assert.equal(validateTable(boundary),true);
});
test('non-roundtripping text is rejected, normal Unicode remains exact',()=>{
 for(const text of ['a\r\nb','\0','\ud800','\udc00']){const a=fixture();a.rows[1][0].text=text;assert.throws(()=>validateTable(a));}
 const a=fixture();a.rows[1][0].text='é 👩🏽‍💻\n世界';assert.equal(validateTable(a),true);assert.ok(exportHTML(a).includes('é 👩🏽‍💻\n世界'));
});
test('receipt cannot certify changed text, caption or dimensions',()=>{
 for(const mutate of [a=>a.rows[1][1].text='changed',a=>a.caption='changed',a=>a.rows.pop()]){const a=fixture(),b=clone(a);mutate(b);assert.throws(()=>compareTables(a,b));assert.throws(()=>exportReceipt(a,b));}
});
test('safe export escapes all text, never imports arbitrary attributes',()=>{
 const a=fixture();a.caption='<script>alert("x")</script>&';a.rows[1][1].text='<img src=x onerror="bad">\'&';
 const html=exportHTML(a);assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&#39;&amp;'));
 assert.equal((html.match(/<tr>/g)||[]).length,3);assert.equal((html.match(/scope="col"/g)||[]).length,3);
});
test('receipt parses to exact comparison, deterministic exports',()=>{
 const a=fixture(),b=proposeRowHeaders(a,true);assert.deepEqual(JSON.parse(exportReceipt(a,b)),compareTables(a,b));assert.equal(exportHTML(b),exportHTML(proposeRowHeaders(a,true)));
});
test('invalid coordinate/boolean arguments fail explicitly',()=>{
 for(const v of [1,0,null,undefined,'true'])assert.throws(()=>proposeRowHeaders(fixture(),v));
 for(const rc of [[-1,0],[0,-1],[3,0],[0,3],[NaN,0],[0,0.1],['1',0]])assert.throws(()=>contextForCell(fixture(),...rc));
});
test('getter and symbol schema fields rejected without invoking getters',()=>{
 const a=fixture();Object.defineProperty(a,'caption',{get(){throw new Error('getter invoked');}});assert.throws(()=>validateTable(a),/data fields/);
 const b=fixture();b[Symbol('x')]=true;assert.throws(()=>validateTable(b),/unsupported fields/);
});
test('seeded varied dimensions preserve text, count only retained-data changes',()=>{
 let seed=419;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<300;i++){const rows=2+rand()%29,cols=2+rand()%11;const a={caption:`case ${i}`,rows:Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>({text:`${rand()%4} & < ${r},${c}`,kind:r===0?'th':'td',scope:r===0?'col':null})))};const saved=clone(a),b=proposeRowHeaders(a,true),d=compareTables(a,b);assert.equal(d.roleChanges.length,rows-1);assert.equal(d.contextChanges.length,(rows-1)*(cols-1));assert.deepEqual(proposeRowHeaders(b,false),saved);assert.deepEqual(a,saved);}
});

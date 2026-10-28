import test from "node:test";
import assert from "node:assert/strict";
import {newState,chunk,advance,encode,decode,validateState} from "../src/chain-state.mjs";
const request={id:"chain-test-20261028",prompts:["ALPHA","BRAVO","CHARLIE"],maxHops:5,batchSize:1};
test("Les relais reprennent chaque etape une fois seulement",()=>{
 let s=newState(request);
 for(let i=1;i<=3;i++){
   assert.deepEqual(chunk(s),[request.prompts[i-1]]);
   s=advance(s,1);
   assert.equal(s.next,i);
   assert.equal(s.hop,i);
   assert.deepEqual(decode(encode(s)),s);
 }
 assert.deepEqual(s.confirmed,[1,2,3]);
 assert.deepEqual(chunk(s),[]);
});
test("Pas de duplication en cas de reponse incertaine",()=>{
 const s=newState(request);
 assert.throws(()=>advance(s,0),/non integralement confirmees/);
 assert.throws(()=>advance(s,2),/non integralement confirmees/);
 assert.equal(s.next,0);
});
test("Les etats forges ou limites sont bloques",()=>{
 const s=newState(request);
 assert.throws(()=>validateState({...s,next:2,confirmed:[1]}));
 assert.throws(()=>newState({...request,maxHops:0}));
 assert.throws(()=>newState({...request,maxHops:21}));
 assert.throws(()=>decode("pas&du_base64"));
});

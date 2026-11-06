import test from 'node:test';
import assert from 'node:assert/strict';
import {profiles,candidates,isMatch,loadState} from './data.js';
const filters={mode:'Team rescue',project:'ft_transcendence',campus:'Tetouan',schedule:'Any time'};
test('a match requires both a right swipe and an incoming like',()=>{
 const [aya,yassine]=profiles;
 assert.equal(isMatch(aya,[]),false);
 assert.equal(isMatch(aya,[{id:aya.id,action:'pass'}]),false);
 assert.equal(isMatch(aya,[{id:aya.id,action:'merge'}]),true);
 assert.equal(isMatch(yassine,[{id:yassine.id,action:'merge'}]),false);
});
test('filters respect project status, campus, hours, and prior decisions',()=>{
 assert.equal(candidates(filters,[]).length,3);
 assert.equal(candidates(filters,[{id:profiles[0].id,action:'pass'}]).length,2);
 assert.equal(candidates({...filters,mode:'Guidance'},[])[0].login,'lidrissi');
 assert.equal(candidates({...filters,schedule:'Morning'},[]).length,0);
 assert.equal(candidates({...filters,mode:'Schedule match',project:'Any project',campus:'All campuses'},[]).length,8);
});
test('bad local storage cannot break initial load',()=>{
 globalThis.localStorage={getItem:()=>'{invalid json'};
 assert.deepEqual(loadState().decisions,[]);
 globalThis.localStorage={getItem:()=>JSON.stringify({decisions:[{id:1,action:'merge'},{id:profiles[0].id,action:'merge'},{id:profiles[0].id,action:'merge'}]})};
 assert.equal(loadState().decisions.length,1);
 delete globalThis.localStorage;
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('Overview preserves pending and unavailable care states until every source confirms', () => {
  const listeners = [];
  const element = () => ({ textContent:'', append(){}, prepend(){}, replaceChildren(){}, setAttribute(){}, remove(){} });
  const elements = Object.fromEntries(['teacher-care-alerts','overview-care-status','overview-care-status-detail'].map(id=>[id,element()]));
  const query = () => ({ where(){return this;}, onSnapshot(options,next,error){listeners.push({next,error});return ()=>{};} });
  vm.runInNewContext(fs.readFileSync('js/holistic-portals.js','utf8'), {
    ClassCareHolistic:{schoolDate:()=> '2026-09-13'},
    ClassCare:{getFirebase:()=>({db:{collection:query}}),DB:{emotional_checkins:query(),attendance:query(),users:query(),grades:query()},onCurrentUser(cb){cb({uid:'audit',role:'teacher',pending_approval:false});return ()=>{};}},
    document:{createElement:element,getElementById:id=>elements[id]},window:{dispatchEvent(){},addEventListener(){}},CustomEvent:function(){},navigator:{onLine:false},setInterval:()=>0,clearInterval(){}
  });
  const status=()=>elements['overview-care-status'].textContent;
  const snapshot=(fromCache,docs=[])=>({metadata:{fromCache,hasPendingWrites:false},docs});
  listeners[0].next(snapshot(true));
  assert.match(status(),/awaiting confirmed/);
  listeners[5].error(new Error('offline'));
  listeners[1].next(snapshot(true));
  assert.equal(status(),'Care alerts unavailable');
  listeners.forEach(listener=>listener.next(snapshot(false)));
  assert.equal(status(),'No active holistic care alerts');
  listeners[5].next(snapshot(false,[{id:'alert',data:()=>({status:'Open',teacherId:'other'})}]));
  assert.match(status(),/^1 holistic care alert/);
  listeners[5].next(snapshot(true));
  assert.match(status(),/awaiting confirmed/);
});

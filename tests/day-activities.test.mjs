import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDate, buildDayActivityIndex, selectDayActivities} from '../src/day-activities.js';

test('activity dates use KST midnight, preserve date-only, reject missing/ambiguous/invalid dates', () => {
  for (const value of ['2026-11-01T15:00:00Z', Date.parse('2026-11-01T15:00:00Z'),'2026-11-02','2026-11-02T00:00:00+09:00']) assert.equal(activityDate(value),'2026-11-02');
  assert.equal(activityDate('2026-11-01T14:59:59.999Z'),'2026-11-01');
  for (const value of [null,undefined,false,'','bad','2026-02-30','2026-11-02T00:00:00',NaN,Infinity]) assert.equal(activityDate(value),'');
});
test('pure index selects multiple own journals/posts, keyed daily completion and actual task/main/sub completion', () => {
  const date = '2026-11-02', at = Date.parse(date+'T00:00:00+09:00');
  const state = {me:'me',mine:{
    'd-wrong-id':{kind:'diary',date,text:'one',at:1}, j2:{kind:'diary',date,at:at+86400000},
    wrongDate:{kind:'diary',date:'2026-11-01',at}, missingDate:{kind:'diary',at},
    q:{kind:'quest',days:[0],active:false,done:{[date]:at,'2026-11-01':0}},
    task:{kind:'mission',done:true,due:'2026-11-01',doneAt:at}, period:{kind:'mission',period:'month',done:true,doneAt:date},
    notDone:{kind:'mission',done:false,doneAt:at}, legacy:{kind:'mission',done:true,due:date,createdAt:at},
    foreign:{kind:'diary',date,owner:'other'}, foreignTask:{kind:'mission',done:true,doneAt:at,uid:'other'}
  },feed:{p1:{author:'me',createdAt:at,ref:{type:'diary',id:'d-wrong-id'}},p2:{author:'me',createdAt:date},other:{author:'other',createdAt:at}},
  projects:{main:{owner:'me',status:'done',doneAt:at},sub:{owner:'me',parentId:'main',status:'done',doneAt:at},legacy:{owner:'me',status:'done',end:date},active:{owner:'me',status:'active',doneAt:at},other:{owner:'other',status:'done',doneAt:at}}};
  const before = structuredClone(state), index = buildDayActivityIndex(state), day = selectDayActivities(index,date);
  assert.deepEqual(day.journals.map(x=>x.id),['d-wrong-id','j2']);
  assert.deepEqual(day.stories.map(x=>x.id),['p1','p2']);
  assert.deepEqual(day.daily.map(x=>x.id),['q']);
  assert.deepEqual(day.tasks.map(x=>x.id),['task','period']);
  assert.deepEqual(day.main.map(x=>x.id),['main']); assert.deepEqual(day.sub.map(x=>x.id),['sub']);
  assert.equal(day.count,9);
  assert.deepEqual(index.unknown.tasks.map(x=>x.id),['legacy']); assert.deepEqual(index.unknown.main.map(x=>x.id),['legacy']);
  for (const date of ['','invalid','2026-11-03']) assert.equal(selectDayActivities(index,date).count,0);
  assert.deepEqual(state,before);
  assert.equal(buildDayActivityIndex({...state,me:null}).days.size,0);
});

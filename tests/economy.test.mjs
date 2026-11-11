import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorage,emptySnapshot,clone,parseBackup} from '../src/storage.js';
import {createAPI} from '../src/runtime.js';
import {TIERS,activityReward,balances,economySummary,koreaDate,weekOf,levelStart,economyLevel,goalEligibility,CATALOG} from '../src/economy.js';
// Shop catalog is intentionally empty in the product; these fixture items exercise the purchase engine.
const FIXTURES=[{id:'frame-leaf',type:'frame',name:'테스트 테두리',cost:30,style:'leaf'},{id:'bg-night',type:'background',name:'테스트 배경',cost:500,style:'night'},{id:'frame-level',type:'frame',name:'성장 테두리',style:'growth'}];
const withFixtures = fn => async () => { CATALOG.splice(0, CATALOG.length, ...FIXTURES); try { await fn(); } finally { CATALOG.length = 0; } };
function setup({xp=0,gold=0,state=emptySnapshot()}={}){
  let time=Date.parse('2026-11-02T03:00:00Z'),i=0;const map=new Map();let fail=false;
  const driver={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(fail)throw new Error('quota');map.set(k,v);},removeItem:k=>map.delete(k)};
  if(!state.profiles.me)state.profiles.me={uid:'me',nick:'경제',stats:{xp,gold}};
  const storage=createStorage({driver,now:()=>time});storage.save(state);
  const api=createAPI({state,storage,id:()=>`id${++i}`,now:()=>time});
  return {state,storage,api,at:d=>{time=Date.parse(d+'T03:00:00Z');},time:t=>{time=t;},fail:v=>{fail=v;}};
}
const putTask=(h,id,lv='normal',projectId=null,done=true)=>h.api.putMine(id,{kind:'mission',name:id,lv,projectId,done});
const goal=(id,parentId=null)=>({owner:'me',title:id,end:'2027-01-01',status:'active',...(parentId?{parentId}:{})});
const delta=(r,xp,coins)=>{assert.equal(r.xp,xp);assert.equal(r.coins,coins);};
test('Korean midnight, Monday weekly anchor and level thresholds',()=>{
  assert.equal(koreaDate(Date.parse('2026-11-01T14:59:59Z')),'2026-11-01');
  assert.equal(koreaDate(Date.parse('2026-11-01T15:00:00Z')),'2026-11-02');
  assert.equal(weekOf('2026-11-08'),'2026-11-02');assert.equal(weekOf('2026-11-09'),'2026-11-09');
  for(let L=1;L<=100;L++){assert.equal(economyLevel(levelStart(L)).L,L);if(L>1)assert.equal(economyLevel(levelStart(L)-1).L,L-1);}
});
for(const [i,lv] of TIERS.entries())for(const kind of ['quest','mission'])test(`${kind} ${lv} exact tier values`,async()=>{
  const h=setup();const r=kind==='quest'?await h.api.putMine('q',{kind,name:'q',lv,done:{'2026-11-02':1}}):await putTask(h,'t',lv);
  const xp=(kind==='quest'?[5,10,15,20,25]:[10,20,30,40,50])[i],coins=xp;
  delta(r,xp,coins+30);assert.deepEqual(activityReward(kind,lv),{xp,coins});
});
test('hundreds of daily and task completions pay fully, undo restores originals without count or soft caps',async()=>{
  const h=setup();for(let i=0;i<200;i++){
    delta(await putTask(h,'epic'+i,'epic'),50,50+(i===0?30:0));
    delta(await h.api.putMine('daily'+i,{kind:'quest',lv:'epic',done:{'2026-11-02':1}}),25,25);
  }
  delta(await h.api.putMine('journal',{kind:'diary',date:'2026-11-02'}),10,5);
  const q=economySummary(h.state,Date.parse('2026-11-02T03:00:00Z'));assert.equal(q.dailyXP,15010);assert.equal(q.dailyCoins,15005);assert.equal(q.gold,15035);
  delta(await h.api.putMine('epic0',{...h.state.mine.epic0,done:false}),-50,-80);
  delta(await h.api.putMine('epic0',{...h.state.mine.epic0,done:true,lv:'tiny'}),50,80);
  delta(await putTask(h,'new','epic'),50,50);
});
test('difficulty changes never recalculate; reversal and restoration use original amounts across dates',async()=>{
  const h=setup();await putTask(h,'a','tiny');delta(await h.api.putMine('a',{...h.state.mine.a,lv:'epic'}),0,0);
  delta(await h.api.putMine('a',{...h.state.mine.a,done:false}),-10,-40);
  h.at('2026-11-03');delta(await h.api.putMine('a',{...h.state.mine.a,done:true}),10,40);
  assert.equal(economySummary(h.state,Date.parse('2026-11-03T03:00:00Z')).dailyXP,0);assert.equal(balances(h.state).gold,40);
});
test('delete activity, diary and goal does not remove minted growth; recreate source cannot duplicate',async()=>{
  const h=setup();await putTask(h,'a');const b=balances(h.state);await h.api.delMine('a');assert.equal(balances(h.state).xp,b.xp);
  delta(await putTask(h,'a'),0,0);
  delta(await h.api.putMine('d',{kind:'diary',date:'2026-11-02',text:'private'}),10,5);
  await h.api.delMine('d');delta(await h.api.putMine('other-d',{kind:'diary',date:'2026-11-02'}),0,0);
});
test('journal once per date, private/public equality, no historical/future journal payout',async()=>{
  const h=setup();delta(await h.api.putMine('d',{kind:'diary',date:'2026-11-02'}),10,5);
  delta(await h.api.putMine('d',{...h.state.mine.d,text:'changed'}),0,0);
  delta(await h.api.addPost({text:'share',ref:{type:'diary',id:'d'}}),0,0);
  delta(await h.api.putMine('past',{kind:'diary',date:'2026-11-01'}),0,0);
  delta(await h.api.putMine('future',{kind:'diary',date:'2026-11-03'}),0,0);
});
test('social operations never reward XP or coins',async()=>{
  const h=setup();delta(await h.api.saveProfile({nick:'changed'}),0,0);delta(await h.api.addPost({text:'hello'}),0,0);
  delta(await h.api.addReply('id1','reply'),0,0);delta(await h.api.like('id1',true),0,0);delta(await h.api.likeReply('id2',true),0,0);delta(await h.api.follow('someone',true),0,0);delta(await h.api.join('id1'),0,0);
});
test('main and sub creation have no weekly limits; same-title recreation stays deduped',async()=>{
  const h=setup();delta(await h.api.putProject('main',goal('main')),20,10);
   delta(await h.api.putProject('main2',goal('main2')),20,10);
   delta(await h.api.putProject('sub1',goal('sub1','main')),10,5);delta(await h.api.putProject('sub2',goal('sub2','main')),10,5);delta(await h.api.putProject('sub3',goal('sub3','main')),10,5);
  await h.api.delProject('main');h.at('2026-11-09');delta(await h.api.putProject('recreated',goal('main')),0,0);
  delta(await h.api.putProject('fresh',goal('fresh')),20,10);
});
test('invalid creation has zero payout, existing/imported goals never get creation reward on edit',async()=>{
  const state=emptySnapshot();state.projects.old={id:'old',...goal('old')};const h=setup({state});
  delta(await h.api.putProject('old',{...state.projects.old,title:'edited'}),0,0);
  delta(await h.api.putProject('invalid',{owner:'me',title:'no deadline'}),0,0);
  delta(await h.api.putProject('orphan',goal('orphan','missing')),0,0);
});
test('goal activity history tracks distinct task and metric dates without gating eligibility',async()=>{
  const h=setup();await h.api.putProject('g',{...goal('g'),metric:{start:0,target:10}});await h.api.putProject('s',goal('s','g'));
  await putTask(h,'t1','tiny','s');await putTask(h,'t2','tiny','s');assert.equal(goalEligibility(h.state,h.state.projects.g).days,1);
  h.at('2026-11-03');await h.api.putMine('ml',{kind:'mlog',projectId:'g',logs:[{v:0,at:1}]});assert.equal(goalEligibility(h.state,h.state.projects.g).days,1);
  await h.api.putMine('ml',{kind:'mlog',projectId:'g',logs:[{v:0,at:1},{v:1,at:2},{v:1,at:3}]});assert.equal(goalEligibility(h.state,h.state.projects.g).days,2);
  h.at('2026-11-04');await h.api.addPost({ref:{id:'s'},value:2,text:'metric'});assert.equal(goalEligibility(h.state,h.state.projects.g).days,3);
  delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);
  await h.api.putProject('g',{...h.state.projects.g,status:'active'});delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100); // restore, not a new lifetime issue
  assert.equal(h.state.economy.events.filter(r=>r.type==='issue'&&r.source===JSON.stringify(['goal','g'])).length,1);
});
test('manual goal completion without activity pays once; repeat transitions restore original claim',async()=>{
  const h=setup();await h.api.putProject('g',goal('g'));assert.equal(goalEligibility(h.state,h.state.projects.g).eligible,true);delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);assert.equal(h.state.projects.g.status,'done');
  await h.api.putProject('g',{...h.state.projects.g,status:'active'});for(const [i,d] of ['2026-11-02','2026-11-03','2026-11-04'].entries()){h.at(d);await putTask(h,'t'+i,'tiny','g');}
  delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);
  assert.equal(h.state.economy.events.filter(r=>r.type==='issue'&&r.source===JSON.stringify(['goal','g'])).length,1);
});
test('sub completions beyond five and main completions beyond one pay in the same week',async()=>{
  const h=setup();await h.api.putProject('g',goal('g'));await h.api.putProject('g2',goal('g2'));
  for(let i=0;i<6;i++)await h.api.putProject('s'+i,goal('s'+i,'g'));
  for(const [n,d] of ['2026-11-02','2026-11-03','2026-11-04'].entries()){h.at(d);for(let i=0;i<6;i++)await putTask(h,`t${i}-${n}`,'tiny','s'+i);await putTask(h,'other'+n,'tiny','g2');}
  for(let i=0;i<6;i++){const r=await h.api.putProject('s'+i,{...h.state.projects['s'+i],status:'done'});delta(r,60,30);}
  delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);delta(await h.api.putProject('g2',{...h.state.projects.g2,status:'done'}),200,100);
});
test('weekly 3 + 5 distinct actual days automatic once, undo previous week reverses and restores',async()=>{
  const h=setup();for(let i=0;i<5;i++){h.at(`2026-11-0${i+2}`);const r=await putTask(h,'t'+i,'tiny');delta(r,10+(i===2?60:i===4?40:0),10+(i===0?30:i===2?30:i===4?20:0));}
  assert.equal(economySummary(h.state,Date.parse('2026-11-06T03:00:00Z')).weeklyDays,5);h.at('2026-11-09');delta(await h.api.putMine('t4',{...h.state.mine.t4,done:false}),-50,-30);
  delta(await h.api.putMine('t4',{...h.state.mine.t4,done:true}),50,30);
  assert.equal(h.state.economy.events.filter(r=>r.type==='issue'&&r.kind==='weekly').length,2);
});
test('rest is free planned, nonactivity and unrewarded; no retro rest after activity',async()=>{
  const h=setup();delta(await h.api.putMine('rest',{kind:'rest',days:{'2026-11-02':1,'2026-11-03':1}}),0,0);
  delta(await putTask(h,'rest-task'),0,0);assert.equal(economySummary(h.state).weeklyDays,0);
  h.at('2026-11-04');await putTask(h,'activity');await assert.rejects(h.api.putMine('rest',{kind:'rest',days:{'2026-11-04':1}}),/이미 활동/);
  await assert.rejects(h.api.putMine('rest',{kind:'rest',days:{'2026-11-01':1}}),/오늘 이후/);
});
test('migration exact baseline once, non-5 legacy balances, old purchases retained, no retro first/weekly/milestones',async()=>{
  const state=emptySnapshot();state.profiles.me={uid:'me',stats:{xp:123,gold:37}};state.mine.old={id:'old',kind:'mission',done:true};state.mine.restbuy={id:'restbuy',kind:'buy',rewardId:'rest',cost:300};
  const h=setup({state});delta(await h.api.initEconomy(),0,0);assert.equal(balances(state).xp,123);assert.equal(balances(state).gold,37);assert.equal(state.economy.inventory['frame-level'],undefined);assert.equal(state.economy.purchases.restbuy.legacy,true);
  delta(await putTask(h,'new','tiny'),10,10);const saved=clone(state);await h.api.initEconomy();assert.equal(state.economy.events.filter(r=>r.type==='baseline').length,1);assert.deepEqual(parseBackup(h.storage.export(state)).economy,state.economy);assert.equal(saved.economy.version,1);
});
test('fallback legacy arithmetic is frozen, not new tier arithmetic',async()=>{
  const state=emptySnapshot();state.mine.q={id:'q',kind:'quest',lv:'normal',done:{'2026-11-01':1}};state.mine.t={id:'t',kind:'mission',done:true,lv:'hard'};state.mine.d={id:'d',kind:'diary'};
  const h=setup({state});delete state.profiles.me.stats;await h.api.initEconomy();assert.equal(balances(state).xp,40);assert.equal(balances(state).gold,40);
});
test('coin debt displayed separately and future earnings offset; purchase cannot overdraft',async()=>{
  const h=setup();await putTask(h,'t','tiny');await h.api.putMine('r',{kind:'reward',name:'reward',cost:40});await h.api.redeem('r','purchase');await h.api.purchaseAction('purchase','use');
  await h.api.putMine('t',{...h.state.mine.t,done:false});assert.equal(balances(h.state).raw,-40);assert.equal(balances(h.state).gold,0);assert.equal(balances(h.state).debt,40);
  await assert.rejects(h.api.redeem('r','bad'),/부족/);await putTask(h,'offset','epic');assert.equal(balances(h.state).debt,0);assert.equal(balances(h.state).gold,10);
});
test('personal price validation, planned cancellation only, hiding and deletion never refund',async()=>{
  const h=setup({gold:100});for(const cost of [0,7.5,-5,NaN,'7'])await assert.rejects(h.api.putMine('bad',{kind:'reward',name:'bad',cost}));
  await h.api.putMine('ok1',{kind:'reward',name:'ok',cost:1});await h.api.putMine('ok7',{kind:'reward',name:'ok',cost:7});await h.api.delMine('ok1');await h.api.delMine('ok7');
  await h.api.putMine('r',{kind:'reward',name:'r',cost:25});delta(await h.api.redeem('r','a'),0,-25);delta(await h.api.purchaseAction('a','cancel'),0,25);await assert.rejects(h.api.purchaseAction('a','cancel'));
  await h.api.redeem('r','b');await h.api.purchaseAction('b','use');await assert.rejects(h.api.purchaseAction('b','cancel'));delta(await h.api.purchaseAction('b','hide'),0,0);delta(await h.api.delMine('b'),0,0);assert.equal(balances(h.state).gold,75);
  await assert.rejects(h.api.putMine('a',{...h.state.mine.a,state:'planned'}),/전용 명령/);
});
test('personal once, daily and weekly limits include hidden/used purchases and survive reward edits',async()=>{
  const h=setup({gold:1000});await h.api.putMine('once',{kind:'reward',name:'one',cost:5,repeat:'once'});await h.api.redeem('once','o');await h.api.purchaseAction('o','hide');await assert.rejects(h.api.redeem('once','o2'),/1회/);
  await h.api.putMine('r',{kind:'reward',name:'limited',cost:5,dailyLimit:1,weeklyLimit:2});await h.api.redeem('r','a');await assert.rejects(h.api.redeem('r','b'),/일일/);h.at('2026-11-03');await h.api.redeem('r','b');h.at('2026-11-04');await assert.rejects(h.api.redeem('r','c'),/주간/);h.at('2026-11-09');await h.api.redeem('r','c');
});
test('legacy direct buy path charges canonical reward price, cannot inject free buys',async()=>{
  const h=setup({gold:100});await h.api.putMine('r',{kind:'reward',name:'r',cost:30});delta(await h.api.putMine('buy',{kind:'buy',rewardId:'r',cost:5}),0,-30);assert.equal(h.state.mine.buy.cost,30);
  await assert.rejects(h.api.putMine('rest-ticket',{kind:'buy',rewardId:'rest',cost:5}),/보상을 찾을/);
});
test('style purchase, apply, transactional 10min refund removes inventory and equipment, one cancel per item',withFixtures(async()=>{
  const h=setup({gold:2000});await h.api.buyStyle('frame-leaf','a');await h.api.equip('frame-leaf');assert.equal(h.state.economy.equipped.frame,'frame-leaf');
  await assert.rejects(h.api.buyStyle('frame-leaf','dup'));delta(await h.api.purchaseAction('a','cancel'),0,30);assert.equal(h.state.economy.inventory['frame-leaf'],undefined);assert.equal(h.state.economy.equipped.frame,undefined);
  await h.api.buyStyle('frame-leaf','b');await assert.rejects(h.api.purchaseAction('b','cancel'),/상품당/);
  await h.api.buyStyle('bg-night','c');h.time(Date.parse('2026-11-02T03:10:01Z'));await assert.rejects(h.api.purchaseAction('c','cancel'),/10분/);
}));
test('level cosmetics persist after XP correction, no duplicate milestone issue; selection only once',withFixtures(async()=>{
  const h=setup({xp:90});await putTask(h,'up','tiny');assert.ok(h.state.economy.inventory['frame-level']);await h.api.putMine('up',{...h.state.mine.up,done:false});assert.ok(h.state.economy.inventory['frame-level']);await h.api.putMine('up',{...h.state.mine.up,done:true});assert.equal(h.state.economy.events.filter(r=>r.type==='milestone'&&r.level===2).length,1);
  const g=setup({xp:levelStart(15)-10});await putTask(g,'up','tiny');await g.api.chooseMilestone(15,'frame-leaf');await assert.rejects(g.api.chooseMilestone(15,'bg-night'));assert.ok(g.state.economy.inventory['frame-leaf']);
}));
test('quota rollback covers task + events + first bonus, purchase/refund/equipment without partial changes',withFixtures(async()=>{
  const h=setup({gold:1000});await h.api.initEconomy();let before=clone(h.state);h.fail(true);await assert.rejects(putTask(h,'fail'));assert.deepEqual(h.state,before);h.fail(false);
  await h.api.buyStyle('frame-leaf','a');await h.api.equip('frame-leaf');before=clone(h.state);h.fail(true);await assert.rejects(h.api.purchaseAction('a','cancel'));assert.deepEqual(h.state,before);
}));
test('append-only event prefixes preserved across normal writes and reload',async()=>{
  const h=setup();await putTask(h,'a');const prefix=clone(h.state.economy.events);await h.api.putMine('a',{...h.state.mine.a,done:false});assert.deepEqual(h.state.economy.events.slice(0,prefix.length),prefix);
  const saved=h.storage.load(),fresh=createAPI({state:saved,storage:h.storage,id:()=> 'unused',now:()=>Date.parse('2026-11-03T03:00:00Z')});delta(await fresh.putMine('a',{...saved.mine.a,done:true}),30,60);assert.equal(saved.economy.events.filter(r=>r.type==='baseline').length,1);
});
test('all catalog prices and new event increments use multiples of five',async()=>{const h=setup();for(const lv of TIERS)await putTask(h,lv,lv);assert.ok(CATALOG.filter(x=>x.cost).every(x=>x.cost%5===0));assert.ok(h.state.economy.events.every(r=>r.xp%5===0&&r.coins%5===0));});
test('migration quota failure does not stamp baseline or lose old records',async()=>{
  const state=emptySnapshot();state.mine.old={id:'old',kind:'mission',done:true};const h=setup({state});const before=clone(state);h.fail(true);await assert.rejects(h.api.initEconomy(),/quota/);assert.deepEqual(state,before);assert.equal(h.storage.load().economy,undefined);h.fail(false);await h.api.initEconomy();assert.equal(state.economy.events.filter(r=>r.type==='baseline').length,1);
});
test('empty migration never invents profile or activity',async()=>{const h=setup();delete h.state.profiles.me;await h.api.initEconomy();assert.deepEqual(h.state.profiles,{});assert.deepEqual(h.state.mine,{});assert.deepEqual(h.state.projects,{});assert.equal(balances(h.state).xp,0);});
test('future habits reject atomically while undo never limits new sources',async()=>{
  const h=setup();await h.api.initEconomy();const before=clone(h.state);await assert.rejects(h.api.putMine('q',{kind:'quest',done:{'2026-11-03':1}}),/미래/);assert.deepEqual(h.state,before);
  for(let i=0;i<3;i++)await putTask(h,'t'+i,'epic');await h.api.putMine('t0',{...h.state.mine.t0,done:false});delta(await putTask(h,'new','epic'),50,50);
});
test('rest cancellation never promotes prior resting completion into weekly activity',async()=>{
  const h=setup();await h.api.putMine('rest',{kind:'rest',days:{'2026-11-02':1}});await putTask(h,'t');await h.api.putMine('rest',{kind:'rest',days:{}});assert.equal(economySummary(h.state,Date.parse('2026-11-02T03:00:00Z')).weeklyDays,0);await h.api.putMine('t',{...h.state.mine.t,done:false});delta(await h.api.putMine('t',{...h.state.mine.t,done:true}),0,0);
});
test('purchase simultaneous attempts serialize through the snapshot and cannot overspend',async()=>{const h=setup({gold:35});await h.api.putMine('r',{kind:'reward',name:'r',cost:30});const results=await Promise.allSettled([h.api.redeem('r','a'),h.api.redeem('r','b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(balances(h.state).gold,5);});

test('level 99, 100 and huge XP preserve curve, bounded milestones and accumulating total XP',async()=>{
  assert.equal(levelStart(100),106920);
  assert.deepEqual(economyLevel(levelStart(100)-1),{L:99,cur:2059,need:2060,pct:2059/2060*100});
  for(const xp of [levelStart(100),levelStart(100)+1,Number.MAX_SAFE_INTEGER])assert.deepEqual(economyLevel(xp),{L:100,cur:0,need:0,pct:100});
  const h=setup({xp:levelStart(100)-10});await h.api.initEconomy();delta(await putTask(h,'reach','tiny'),10,40);
  assert.equal(balances(h.state).L,100);assert.ok(h.state.economy.milestones['[100]']);
  const prefix=clone(h.state.economy.milestones);delta(await putTask(h,'beyond','epic'),50,50);
  assert.equal(balances(h.state).xp,106970);assert.deepEqual(h.state.economy.milestones,prefix);
  const imported=setup({xp:Number.MAX_SAFE_INTEGER});await imported.api.initEconomy();
  assert.equal(balances(imported.state).xp,Number.MAX_SAFE_INTEGER);assert.equal(Object.keys(imported.state.economy.milestones).length,22);
  assert.ok(Object.keys(imported.state.economy.milestones).every(k=>JSON.parse(k)[0]<=100));
  assert.equal(imported.state.economy.events.length,1);assert.deepEqual(imported.state.economy.inventory,{});
});
test('version 1 ledger amounts including partial and zero claims survive import, undo and recomplete',async()=>{
  const seed=setup();await seed.api.initEconomy();const state=clone(seed.state),date='2026-11-02';
  const original=[['old-task','task',30,15],['partial','task',5,0],['zero','task',0,0],['daily','habit',15,10],['g','mainDone',0,0]];
  for(const [id,kind,xp,coins] of original){
    const source=JSON.stringify(kind==='habit'?['habit',id,date]:[kind==='mainDone'?'goal':'task',id]);
    state.economy.claims[source]={kind,xp,coins,active:true,date,week:date,daily:kind!=='mainDone',projects:[]};
    state.economy.events.push({seq:state.economy.events.length+1,at:Date.parse(date+'T03:00:00Z'),date,type:'issue',source,xp,coins});
    if(kind==='mainDone')state.projects[id]={id,...goal(id),status:'done'};
    else state.mine[id]={id,kind:kind==='habit'?'quest':'mission',lv:'normal',done:kind==='habit'?{[date]:1}:true};
  }
  state.economy.claims.first={kind:'first',xp:0,coins:0,active:true,date,baseline:true};
  const h=setup({state:parseBackup(JSON.stringify(state))}),prefix=clone(state.economy.events);await h.api.initEconomy();
  assert.deepEqual(h.state.economy.events,prefix);h.at('2026-11-09');
  for(const [id,kind,xp,coins] of original){
    if(kind==='mainDone'){
      delta(await h.api.putProject(id,{...h.state.projects[id],status:'active'}),0-xp,0-coins);
      delta(await h.api.putProject(id,{...h.state.projects[id],status:'done'}),xp,coins);
    }else{
      delta(await h.api.putMine(id,{...h.state.mine[id],lv:'epic',done:kind==='habit'?{}:false}),0-xp,0-coins);
      delta(await h.api.putMine(id,{...h.state.mine[id],done:kind==='habit'?{[date]:1}:true}),xp,coins);
    }
  }
  delta(await putTask(h,'new','normal'),30,30);
  assert.deepEqual(h.state.economy.events.slice(0,prefix.length),prefix);
  assert.equal(h.state.economy.claims['["task","new"]'].policyVersion,2);
  assert.equal(h.state.economy.version,1);
});
test('goal lifetime dedupe survives deletion, rename, duplicate IDs and repeated undo',async()=>{
  const h=setup();await h.api.putProject('g',goal('Target'));await h.api.putProject('duplicate',goal(' Target '));
  delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);
  delta(await h.api.putProject('duplicate',{...h.state.projects.duplicate,status:'done'}),0,0);
  for(let i=0;i<3;i++){
    delta(await h.api.putProject('g',{...h.state.projects.g,status:'active'}),-200,-100);
    delta(await h.api.putProject('g',{...h.state.projects.g,status:'done'}),200,100);
  }
  await h.api.putProject('g',{...h.state.projects.g,title:'Renamed'});await h.api.delProject('g');
  delta(await h.api.putProject('recreated',{...goal('Target'),status:'done'}),0,0);
  await h.api.delProject('recreated');delta(await h.api.putProject('recreated',{...goal('Target'),status:'done'}),0,0);
  const foreign={...goal('other'),owner:'other'};assert.equal(goalEligibility(h.state,foreign).eligible,false);
  delta(await h.api.putProject('other',{...foreign,status:'done'}),0,0);
});

test('study sessions are tracked without XP/coins; completing every chapter completes the learning note once',async()=>{
  const h=setup();const note={kind:'note',cat:'learn',f:{title:'강의'},ch:[{id:'c1',t:'1강',st:'doing'},{id:'c2',t:'2강',st:'todo'}],sessions:[]};
  await h.api.putMine('n1',note);
  delta(await h.api.putMine('n1',{...note,sessions:[{id:'s1',ch:'c1',start:0,min:50}]}),0,0);
  delta(await h.api.putMine('n1',{...note,ch:[{id:'c1',t:'1강',st:'done'},{id:'c2',t:'2강',st:'done'}]}),30,30);
  delta(await h.api.putMine('n1',{...note,ch:[{id:'c1',t:'1강',st:'done'},{id:'c2',t:'2강',st:'done'}],f:{title:'수정'}}),0,0);
  delta(await h.api.delMine('n1'),-30,-30);
});

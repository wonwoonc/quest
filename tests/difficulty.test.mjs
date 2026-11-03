import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TIERS, DAILY_DIFFICULTY, TASK_DIFFICULTY, difficultyIcon, activityReward, activityRewardPreview, koreaDate} from '../src/economy.js';

test('both kinds share five names and fixed ascending SVG geometry with one theme hue',()=>{
  assert.deepEqual(TIERS,['tiny','easy','normal','hard','epic']);
  const names=['아주 쉬움','쉬움','보통','어려움','아주 어려움'];
  const descriptions=['부담 거의 없음','가벼운 노력','적당한 집중','상당한 노력','큰 시간·집중 필요'];
  let geometry;
  for(const metadata of [DAILY_DIFFICULTY,TASK_DIFFICULTY]){
    assert.deepEqual(Object.keys(metadata),TIERS);
    assert.deepEqual(Object.values(metadata).map(x=>x.n),names);
    assert.deepEqual(Object.values(metadata).map(x=>x.d),descriptions);
    for(const [i,key] of TIERS.entries()){
      const {e}=metadata[key];
      assert.equal(e,difficultyIcon(key));
      assert.match(e,/width="24" height="16" viewBox="0 0 24 16"[^>]*aria-hidden="true"[^>]*focusable="false"/);
      const bars=[...e.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"\/>/g)];
      assert.equal(bars.length,5);
      assert.equal(bars.filter(b=>b[5]==='var(--accent)').length,i+1);
      assert.equal(bars.filter(b=>b[5]==='var(--track)').length,4-i);
      const coords=bars.map(b=>b.slice(1,5));
      if(geometry)assert.deepEqual(coords,geometry);else geometry=coords;
      bars.forEach((b,j)=>{assert.equal(+b[2]+ +b[4],16);if(j)assert.ok(+b[4]>+bars[j-1][4]);});
      assert.doesNotMatch(e,/<circle|<path|#[0-9a-f]|[🔰🥉🥈🥇👑🟢🔵🟡🟠🔴]/iu);
    }
  }
  assert.equal(difficultyIcon('gold'),difficultyIcon('normal'));
  assert.equal(difficultyIcon('\"><script>'),difficultyIcon('normal'));
  assert.deepEqual(TIERS.map(lv=>activityReward('quest',lv)),[[5,5],[10,10],[15,15],[20,20],[25,25]].map(([xp,coins])=>({xp,coins})));
  assert.deepEqual(TIERS.map(lv=>activityReward('mission',lv)),[[10,10],[20,20],[30,30],[40,40],[50,50]].map(([xp,coins])=>({xp,coins})));
});

test('preview is uncapped regardless of historical claims, without mutating or counting extras',()=>{
  const at=Date.parse('2026-11-02T03:00:00Z'),date=koreaDate(at);
  const s={mine:{},economy:{events:[],claims:{
    used:{daily:true,date,xp:140,coins:80,active:true},
    undone:{daily:true,date,xp:5,coins:5,active:false},
    first:{date,xp:0,coins:30,active:true},
    weekly:{date,xp:100,coins:50,active:true},
    baseline:{daily:true,date,xp:500,coins:500,active:true,baseline:true},
    yesterday:{daily:true,date:'2026-11-01',xp:150,coins:90,active:true}
  }}};
  const before=structuredClone(s);
  for(const kind of ['quest','mission'])for(const tier of TIERS){
    const p=activityRewardPreview(s,kind,tier,at);
    assert.equal(p.xp,activityReward(kind,tier).xp);assert.equal(p.coins,activityReward(kind,tier).coins);
    assert.equal(p.remainingXP,undefined);assert.equal(p.remainingCoins,undefined);
    assert.equal(p.clipped,false);
  }
  assert.deepEqual(s,before);
  s.economy.claims.used.xp=145;s.economy.claims.used.coins=85;
  assert.equal(activityRewardPreview(s,'mission','epic',at).xp,50);
  assert.equal(activityRewardPreview(s,'mission','epic',at).coins,50);
  s.economy.claims.used.xp=0;
  assert.equal(activityRewardPreview(s,'mission','epic',at).xp,50);
  s.mine.rest={days:{[date]:true}};
  assert.equal(activityRewardPreview(s,'quest','normal',at).xp,0);
  assert.equal(activityRewardPreview(s,'quest','normal',at).rested,true);
});

test('all eight UI selectors delegate to one explicit kind-aware helper',async()=>{
  const source=await readFile(new URL('../src/legacy-app.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bLABELS\b|\blvRow\b|d:meta.n/);
  assert.equal((source.match(/\$\{difficultySelector\(c,/g)||[]).length,8);
  assert.doesNotMatch(source,/difficulty-(?:detail|guide|payout)|activityRewardPreview/);
  const css=await readFile(new URL('../src/shell.html',import.meta.url),'utf8');
  assert.doesNotMatch(css,/difficulty-(?:detail|guide|payout)/);
  assert.doesNotMatch(source,/[🔰🥉🥈🥇🟢🔵🟡🟠🔴]/u);
  assert.doesNotMatch(source,/esc\([^\n]*\.e\)|(?:title|aria-label)="\$\{[^}]*\.e\}/);
});

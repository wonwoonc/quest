/** Local, deterministic economy. All mutations run inside storage.commit, never in render.
 * This is an audit trail, NOT a trusted server ledger. JSON imports/device time are untrusted.
 */
import {noteComplete, noteReward} from './notes.js';
export const ENGINE_VERSION = 1;
export const POLICY_VERSION = 2;
export const MAX_LEVEL = 100;
export const TIERS = ['tiny','easy','normal','hard','epic'];
export const LABELS = ['아주 가볍게','가볍게','꾸준히','도전','큰 도전'];
// Shared presentation; persisted tier keys remain unchanged.
export const DIFFICULTY_NAMES = ['아주 쉬움','쉬움','보통','어려움','아주 어려움'];
export const DIFFICULTY_DESCRIPTIONS = ['부담 거의 없음','가벼운 노력','적당한 집중','상당한 노력','큰 시간·집중 필요'];
// Trusted markup only: never interpolate caller-provided strings into SVG/attributes.
// The surrounding visible label (or titled badge) supplies the difficulty name.
export function difficultyIcon(tier) {
  const active = TIERS.indexOf(tierKey(tier)) + 1;
  const bars = TIERS.map((_,i) => `<rect x="${i*5}" y="${12-i*3}" width="3" height="${4+i*3}" fill="var(--${i<active?'accent':'track'})"/>`).join('');
  return `<svg class="difficulty-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" aria-hidden="true" focusable="false" style="width:24px;height:16px;flex:none;vertical-align:-2px">${bars}</svg>`;
}
const difficultyMeta = () => Object.fromEntries(TIERS.map((key,i) =>
  [key,{n:DIFFICULTY_NAMES[i],d:DIFFICULTY_DESCRIPTIONS[i],e:difficultyIcon(key)}]));
export const DAILY_DIFFICULTY = difficultyMeta();
export const TASK_DIFFICULTY = difficultyMeta();
export const DAILY_XP = [5,10,15,20,25];
export const DAILY_COINS = [5,10,15,20,25];
export const TASK_XP = [10,20,30,40,50];
export const TASK_COINS = [10,20,30,40,50];
// 기존 배경·테두리·칭호·카드 꾸미기 상품은 전부 제거했다.
// 새 아이템은 {id,type,name,cost,style} 형태로 이 배열에 추가한다.
export const CATALOG = [];

/* Called once per day per habit while walking streaks (hundreds of thousands of calls on a long history), so the
   formatted date is remembered per Korean calendar day instead of building a Date and an ISO string every time. */
const KD = new Map();
export function koreaDate(at = Date.now()) {
  const day = Math.floor((at + 9*3600000) / 86400000);
  let date = KD.get(day);
  if (date === undefined) {
    date = new Date(at + 9*3600000).toISOString().slice(0,10);
    if (typeof at === 'number' && Number.isFinite(day)) { if (KD.size > 4096) KD.clear(); KD.set(day, date); }
  }
  return date;
}
export function weekOf(date) { const d = new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7); return d.toISOString().slice(0,10); }
export function levelStart(L) { return 100*(L-1)+10*(L-1)*(L-2); }
export function economyLevel(xp) {
  const x = Math.max(0,Number.isFinite(xp)?xp:0);
  if(x>=levelStart(MAX_LEVEL))return {L:MAX_LEVEL,cur:0,need:0,pct:100};
  let L=1;while(L<MAX_LEVEL&&levelStart(L+1)<=x)L++;
  const cur=x-levelStart(L),need=levelStart(L+1)-levelStart(L);
  return {L,cur,need,pct:cur/need*100};
}
export function tierKey(v) { return ({bronze:'easy',silver:'easy',gold:'normal',diamond:'hard',gm:'hard'})[v] || (TIERS.includes(v) ? v : 'normal'); }
export function activityReward(kind, lv) { const i=TIERS.indexOf(tierKey(lv)); return kind==='quest' ? {xp:DAILY_XP[i],coins:DAILY_COINS[i]} : {xp:TASK_XP[i],coins:TASK_COINS[i]}; }
const key = (...p) => JSON.stringify(p);
const values = s => Object.values(s.mine);
const norm = s => String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
function ancestors(s,id) { const out=[]; while(id && s.projects[id] && !out.includes(id)){out.push(id);id=s.projects[id].parentId;} return out; }
function event(e,at,type,source,xp=0,coins=0,extra={}) { const row={seq:e.events.length+1,at,date:koreaDate(at),type,source,xp,coins,...extra}; e.events.push(row); return row; }
export function balances(s) { const rows=s.economy?.events||[]; const xp=rows.reduce((n,r)=>n+r.xp,0),raw=rows.reduce((n,r)=>n+r.coins,0); return {xp,raw,gold:Math.max(0,raw),debt:Math.max(0,-raw),...economyLevel(xp)}; }
// Exact old UI arithmetic, used ONCE only if no published numeric profile balance exists.
export function legacyBalance(s,me='me') {
  let xp=0,gold=0;
  for(const m of values(s)){
    if(m.kind==='quest'){const r=({easy:[5,5],normal:[10,10],hard:[20,20]})[m.lv? tierKey(m.lv):'easy']||[5,5]; const n=Object.keys(m.done||{}).length;xp+=n*r[0];gold+=n*r[1];}
    if(m.kind==='mission'&&m.done){const r=({easy:5,normal:10,hard:20})[m.lv]||10;xp+=r;gold+=r;}
    if(m.kind==='diary'){xp+=10;gold+=10;}
    if(m.kind==='buy')gold-=m.cost||0;
  }
  for(const p of Object.values(s.projects))if(p.owner===me&&p.status==='done'){const r=p.parentId?50:100;xp+=r;gold+=r;}
  xp+=Object.values(s.feed).filter(p=>p.author===me).length*5;
  const replies={}; for(const r of Object.values(s.replies))if(r.author===me){const d=koreaDate(r.createdAt||0);replies[d]=(replies[d]||0)+1;}
  xp+=Object.values(replies).reduce((n,v)=>n+Math.min(10,v)*3,0);
  const st=s.profiles[me]?.stats; return {xp:Number.isFinite(st?.xp)?st.xp:xp,coins:Number.isFinite(st?.gold)?st.gold:gold};
}
function fingerprint(s,p) { return key(p.parentId?'sub':'main',p.parentId?norm(s.projects[p.parentId]?.title||p.parentId):'',norm(p.title)); }
export function migrateEconomy(s,at,me='me') {
  if(s.economy){if(s.economy.version!==ENGINE_VERSION)throw new Error('지원하지 않는 경제 버전입니다.');return;}
  const b=legacyBalance(s,me), e=s.economy={version:ENGINE_VERSION,events:[],claims:{},seenGoals:{},inventory:{},equipped:{},milestones:{},metricLast:{},purchases:{},legacyNote:true};
  event(e,at,'baseline','migration',b.xp,b.coins,{note:'기존 잔액 보존 · 소급 보너스 없음'});
  const blocked=(source,kind,date,projectId)=>{e.claims[source]={xp:0,coins:0,active:true,kind,date,week:weekOf(date),projects:ancestors(s,projectId),baseline:true};};
  for(const m of values(s)){
    if(m.kind==='quest')for(const d of Object.keys(m.done||{}))blocked(key('habit',m.id,d),'habit',d,m.projectId);
    if(m.kind==='mission'&&m.done)blocked(key('task',m.id),'task',koreaDate(m.doneAt||m.createdAt||at),m.projectId);
    if(m.kind==='diary')blocked(key('journal',m.date||m.id.replace(/^d-/,'')),'journal',m.date||koreaDate(m.at||at));
    if(m.kind==='buy')e.purchases[m.id]={legacy:true,...m,state:'used'};
  }
  for(const p of Object.values(s.projects))if(p.owner===me){e.seenGoals[key('id',p.id)]=true;e.seenGoals[fingerprint(s,p)]=true;if(p.status==='done'){blocked(key('goal',p.id),'goal',koreaDate(p.doneAt||at));e.claims[key('goal',p.id)].goalFingerprint=fingerprint(s,p);}}
  if(Object.values(e.claims).some(c=>['habit','task'].includes(c.kind)))e.claims.first={xp:0,coins:0,active:true,kind:'first',date:koreaDate(at),baseline:true};
  for(let L=2;L<=economyLevel(b.xp).L;L++)if(isMilestone(L))e.milestones[key(L)]={legacy:true};
  // Existing numeric history becomes the comparison baseline, not new activity.
  const history=[];
  for(const m of values(s))if(m.kind==='mlog')for(const l of m.logs||[])history.push({pid:m.projectId,v:l.v,at:l.at});
  for(const p of Object.values(s.feed))if(p.author===me&&p.ref&&Number.isFinite(p.value))history.push({pid:p.ref.id,v:p.value,at:p.createdAt});
  history.sort((a,b)=>a.at-b.at).forEach(l=>{e.metricLast[key(l.pid)]=l.v;});
}
function claim(s,source,kind,want,at,{date=koreaDate(at),daily=false,projects=[],eligible=true}={}) {
  const e=s.economy,old=e.claims[source];
  if(old){if(!old.active){event(e,at,'restore',source,old.xp,old.coins);old.active=true;}return old;}
  let {xp,coins}=want; const week=weekOf(koreaDate(at));
  if(!eligible)xp=coins=0;
  // Persist original issuance (including zero), then the audit event. Same atomic snapshot.
  const c={xp,coins,active:true,kind,date,week,daily,projects,policyVersion:POLICY_VERSION};e.claims[source]=c;event(e,at,'issue',source,xp,coins,{kind,policyVersion:POLICY_VERSION});return c;
}
function reverse(s,source,at){const e=s.economy,c=e.claims[source];if(c?.active){event(e,at,'reverse',source,-c.xp,-c.coins);c.active=false;}}
function activity(s,source,kind,record,date,at,on){
  if(on){const rested=!!s.mine.rest?.days?.[date]; const c=claim(s,source,kind,activityReward(kind==='habit'?'quest':'mission',record.lv),at,{date,daily:true,eligible:!rested,projects:ancestors(s,record.projectId)});if(rested)c.nonactivity=true;
    if(rested||c.nonactivity)return;
    if(!s.economy.claims.first)claim(s,'first','first',{xp:0,coins:30},at,{projects:[],date});
    if(!s.economy.firstSource)s.economy.firstSource=source;
    if(s.economy.firstSource===source&&s.economy.claims.first&&!s.economy.claims.first.active)claim(s,'first','first',{xp:0,coins:30},at);
  }else{reverse(s,source,at);if(s.economy.firstSource===source)reverse(s,'first',at);}
}
export function activityDays(s,week) { return [...new Set(Object.values(s.economy?.claims||{}).filter(c=>c.active&&!c.baseline&&!c.nonactivity&&['habit','task'].includes(c.kind)&&weekOf(c.date)===week&&!s.mine.rest?.days?.[c.date]).map(c=>c.date))].sort(); }
export function goalEligibility(s,p,at=Date.now(),me='me') {
  const days=new Set();for(const c of Object.values(s.economy?.claims||{}))if(c.active&&!c.baseline&&!c.nonactivity&&c.kind==='task'&&c.projects?.includes(p.id)&&!s.mine.rest?.days?.[c.date])days.add(c.date);
  for(const r of s.economy?.events||[])if(r.type==='metric'&&!r.nonactivity&&r.projects?.includes(p.id))days.add(r.date);
  const prior=s.economy?.claims[key('goal',p.id)],fp=fingerprint(s,p);
  const duplicate=Object.entries(s.economy?.claims||{}).some(([source,c])=>{
    if(!['goal','mainDone','subDone'].includes(c.kind)||source===key('goal',p.id))return false;
    const original=Object.values(s.projects).find(g=>source===key('goal',g.id));
    return (c.goalFingerprint||(original&&fingerprint(s,original)))===fp;
  });
  const eligible=p.owner===me&&!prior&&!duplicate;
  return {days:days.size,eligible,xp:eligible?(p.parentId?60:200):0,coins:eligible?(p.parentId?30:100):0,reason:p.owner!==me?'내 목표만 완료 보상 지급':prior||duplicate?'이미 완료 판정됨':'최초 완료 확인 시 지급'};
}
function metric(s,pid,v,at){if(!s.projects[pid]||!Number.isFinite(v))return;const e=s.economy,k=key(pid),prev=Object.hasOwn(e.metricLast,k)?e.metricLast[k]:s.projects[pid].metric?.start;e.metricLast[k]=v;if(prev!==v)event(e,at,'metric',key('metric',pid),0,0,{value:v,projects:ancestors(s,pid),nonactivity:!!s.mine.rest?.days?.[koreaDate(at)]});}
function isMilestone(L){return L===2||L===3||L===5||(L>=10&&L%5===0);}
function milestones(s,at){const e=s.economy;for(let L=2;L<=balances(s).L;L++){if(!isMilestone(L)||e.milestones[key(L)])continue;const item=L===2?'frame-level':L===3?'title-level':L===5?'theme-level':L===10?'bg-level':null;e.milestones[key(L)]={item,choice:!item};if(item)e.inventory[item]={source:'level',level:L};event(e,at,'milestone',key(L),0,0,{level:L,item});}}
export function processEconomy(s,before,at,me='me') {
  const e=s.economy;
  // Backfill only dedupe metadata, never historical amounts/events. Preserve it before deletion/rename.
  for(const p of Object.values(before.projects)){
    const c=e.claims[key('goal',p.id)];
    if(c&&!c.goalFingerprint)c.goalFingerprint=fingerprint(before,p);
  }
  for(const [id,m] of Object.entries(s.mine)){
    const old=before.mine[id];
    if(m.kind==='rest')for(const d of Object.keys(m.days||{}))if(!old?.days?.[d]){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<koreaDate(at))throw new Error('휴식 계획은 오늘 이후 날짜를 골라 주세요.');
      if(Object.values(e.claims).some(c=>c.active&&['habit','task'].includes(c.kind)&&c.date===d))throw new Error('이미 활동을 완료한 날은 휴식일로 지정할 수 없어요.');
    }
    if(m.kind==='reward'&&JSON.stringify(m)!==JSON.stringify(old)){validatePrice(m.cost);if(!['once','repeat'].includes(m.repeat||'repeat'))throw new Error('보상 반복 설정 오류');for(const k of ['dailyLimit','weeklyLimit'])if(m[k]!=null&&(!Number.isInteger(m[k])||m[k]<1))throw new Error('횟수 제한은 1 이상의 정수입니다.');}
    if(m.kind==='quest'){for(const d of new Set([...Object.keys(m.done||{}),...Object.keys(old?.done||{})]))if(!!m.done?.[d]!==!!old?.done?.[d]){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>koreaDate(at))throw new Error('미래 활동 보상은 기록할 수 없습니다.');activity(s,key('habit',id,d),'habit',m,d,at,!!m.done?.[d]);}}
    if(m.kind==='mission'&&!!m.done!==!!old?.done)activity(s,key('task',id),'task',m,koreaDate(at),at,!!m.done);
    if(m.kind==='diary'&&!old){const d=m.date||koreaDate(at);claim(s,key('journal',d),'journal',{xp:10,coins:5},at,{date:koreaDate(at),daily:true,eligible:d===koreaDate(at)});}
    if(m.kind==='note'&&noteComplete(s,m)&&!noteComplete(before,old)){const r=noteReward(s,m);if(r.xp>0)claim(s,key('note',id),'note',{xp:r.xp,coins:r.coins},at,{daily:true});}
    if(m.kind==='note'){const now=new Set((m.sessions||[]).map(x=>x.id));
      for(const x of old?.sessions||[])if(!now.has(x.id))reverse(s,key('study',id,x.id),at);}
    if(m.kind==='mlog'){const n=old?.logs?.length||0;for(const l of (m.logs||[]).slice(n))metric(s,m.projectId,l.v,at);}
    if(m.kind==='buy'&&!old&&!e.purchases[id])redeemPersonal(s,m.rewardId,id,at);
    if(m.kind==='buy'&&old&&e.purchases[id]&&!e.purchases[id].legacy){const p=e.purchases[id];if(m.cost!==p.cost||m.rewardId!==p.rewardId||m.state!==p.state)throw new Error('구매 내역은 전용 명령으로만 변경할 수 있습니다.');}
  }
  for(const [id,old] of Object.entries(before.mine))if(old.kind==='note'&&!s.mine[id]){reverse(s,key('note',id),at);for(const x of old.sessions||[])reverse(s,key('study',id,x.id),at);}
  for(const [id,p] of Object.entries(s.feed)){const old=before.feed[id];if(p.author===me&&p.ref&&Number.isFinite(p.value)&&p.value!==old?.value)metric(s,p.ref.id,p.value,at);}
  for(const [id,p] of Object.entries(s.projects))if(p.owner===me){const old=before.projects[id],fp=fingerprint(s,p);
    if(!old&&!e.seenGoals[key('id',id)]){const seen=e.seenGoals[fp];e.seenGoals[key('id',id)]=true;e.seenGoals[fp]=true;const sub=!!p.parentId;claim(s,key('create',id),sub?'subCreate':'mainCreate',{xp:sub?10:20,coins:sub?5:10},at,{eligible:!seen&&!!norm(p.title)&&(sub?!!s.projects[p.parentId]&&!s.projects[p.parentId].parentId:!!p.end)});}
    if(p.status==='done'&&old?.status!=='done'){const q=goalEligibility(s,p,at,me);claim(s,key('goal',id),p.parentId?'subDone':'mainDone',{xp:q.xp,coins:q.coins},at,{eligible:q.eligible});}
    const completed=e.claims[key('goal',id)];if(completed&&!completed.goalFingerprint)completed.goalFingerprint=fp;
    if(p.status!=='done'&&old?.status==='done')reverse(s,key('goal',id),at);
    e.seenGoals[fp]=true;
  }
  const weeks=new Set([weekOf(koreaDate(at)),...Object.values(e.claims).filter(c=>['task','habit'].includes(c.kind)&&!c.baseline).map(c=>weekOf(c.date))]);
  for(const week of weeks){const days=activityDays(s,week).length;
    for(const [n,xp,coins] of [[3,60,30],[5,40,20]]){const source=key('weekly',week,n);if(days>=n)claim(s,source,'weekly',{xp,coins},at);else reverse(s,source,at);}
  }
  milestones(s,at);
}
export function validatePrice(cost){if(!Number.isSafeInteger(cost)||cost<1)throw new Error('가격은 1 이상의 정수로 입력해 주세요.');}
function spend(s,source,cost,at){validatePrice(cost);if(balances(s).raw<cost)throw new Error('사용 가능한 코인이 부족해요.');event(s.economy,at,'spend',source,0,-cost);}
export function redeemPersonal(s,rewardId,id,at){const r=s.mine[rewardId];if(r?.kind!=='reward')throw new Error('보상을 찾을 수 없습니다.');validatePrice(r.cost);const e=s.economy;if(e.purchases[id])throw new Error('중복 구매 ID입니다.');const date=koreaDate(at),week=weekOf(date),rows=Object.values(e.purchases).filter(p=>p.rewardId===rewardId&&p.state!=='cancelled');if(r.repeat==='once'&&rows.length)throw new Error('1회 보상은 한 번만 교환할 수 있어요.');if(r.dailyLimit&&rows.filter(p=>koreaDate(p.at)===date).length>=r.dailyLimit)throw new Error('일일 교환 한도에 도달했어요.');if(r.weeklyLimit&&rows.filter(p=>weekOf(koreaDate(p.at))===week).length>=r.weeklyLimit)throw new Error('주간 교환 한도에 도달했어요.');spend(s,key('personal',id),r.cost,at);const p={id,kind:'buy',name:r.name,cost:r.cost,rewardId,state:'planned',at,img:r.img||null};e.purchases[id]={...p};s.mine[id]={...p};}
export function purchaseStyle(s,itemId,id,at){const e=s.economy,item=CATALOG.find(x=>x.id===itemId&&x.cost);if(!item)throw new Error('상품이 없습니다.');if(e.inventory[itemId]||e.purchases[id])throw new Error('이미 보유한 상품 또는 중복 구매입니다.');spend(s,key('style',id),item.cost,at);e.inventory[itemId]={source:'shop',purchase:id};e.purchases[id]={id,itemId,name:item.name,cost:item.cost,state:'owned',at,kind:'style'};}
export function purchaseAction(s,id,action,at){const e=s.economy,p=e.purchases[id];if(!p)throw new Error('구매 내역이 없습니다.');if(action==='hide'){p.hidden=true;if(s.mine[id])s.mine[id].hidden=true;return;}if(action==='use'){if(p.state!=='planned'||p.legacy)throw new Error('사용 예정 보상만 사용 처리할 수 있어요.');p.state='used';}else if(action==='cancel'){
  if(p.kind==='style'){if(p.state!=='owned'||at-p.at<0||at-p.at>600000||Object.values(e.purchases).some(x=>x.itemId===p.itemId&&x.state==='cancelled'))throw new Error('꾸미기 취소는 상품당 한 번, 구매 후 10분 이내입니다.');delete e.inventory[p.itemId];for(const [type,item] of Object.entries(e.equipped))if(item===p.itemId)delete e.equipped[type];}
  else if(p.state!=='planned'||p.legacy)throw new Error('사용 예정 보상만 환불할 수 있어요.');
  p.state='cancelled';event(e,at,'refund',key('purchase',id),0,p.cost);
}else throw new Error('알 수 없는 구매 명령입니다.');if(s.mine[id])s.mine[id]={...s.mine[id],state:p.state};}
export function equipStyle(s,itemId){const e=s.economy,item=CATALOG.find(x=>x.id===itemId);if(!item||!e.inventory[itemId])throw new Error('보유하지 않은 꾸미기입니다.');if(e.equipped[item.type]===itemId)delete e.equipped[item.type];else e.equipped[item.type]=itemId;}
export function chooseMilestone(s,L,itemId,at){const e=s.economy,m=e.milestones[key(L)],item=CATALOG.find(x=>x.id===itemId);if(!m?.choice||m.selected||!item||e.inventory[itemId])throw new Error('선택 가능한 성장 보상이 아닙니다.');m.selected=itemId;e.inventory[itemId]={source:'level',level:L};event(e,at,'selection',key(L),0,0,{item:itemId});}
export function economySummary(s,at=Date.now()){const date=koreaDate(at),week=weekOf(date),rows=Object.values(s.economy?.claims||{}).filter(c=>c.daily&&c.date===date&&!c.baseline);return {...balances(s),dailyXP:rows.reduce((n,c)=>n+(c.active?c.xp:0),0),dailyCoins:rows.reduce((n,c)=>n+(c.active?c.coins:0),0),weeklyDays:activityDays(s,week).length};}
// New-completion base preview only. Never claims rewards or includes first/weekly extras.
export function activityRewardPreview(s,kind,lv,at=Date.now()) {
  const base=activityReward(kind,lv);
  const rested=!!s.mine?.rest?.days?.[koreaDate(at)];
  const xp=rested?0:base.xp,coins=rested?0:base.coins;
  return {base,xp,coins,rested,clipped:false};
}

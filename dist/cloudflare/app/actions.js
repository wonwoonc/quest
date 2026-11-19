/* 퀘스트라인 — 사용자 행동(체크, 미루기, 추가, 달성, 구매). 보상은 항목에 award로 붙이고 합계는 계산한다 */
import {get, live, habitLog, habitOn, streak, rewardFor, BONUS, todayItems, addD, qProg, subsOf, totals, SHIELD, FREE, parseMany, EVERYDAY} from "./logic.js";
import {app, act, T, uid, pass, event} from "./store.js";
import {toast, float, party} from "./ui.js";

const S = () => app.S;
const areaOfQuest = id => { const q = id && get(S(), "quests", id); if (!q) return []; if (q.area && q.area.length) return q.area; const p = q.parent && get(S(), "quests", q.parent); return p && p.area || []; };

/* 체크 전후 레벨을 비교해 레벨업 축하 */
function watchLevel(fn){
  const before = totals(S()).level.L; const undo = fn(); const after = totals(S()).level.L;
  if (after > before){ act(d => d.profile({seenLevel:after}), {silent:true}); party({kind:"level", L:after}); event("level_" + after); }
  return undo;
}
/* 오늘 전부 끝내면 클리어 보너스 한 번 */
function maybeClear(d){
  const t = T(), items = todayItems(S(), t).filter(i => !i.late);
  const id = "clear:" + t, has = get(S(), "marks", id);
  if (items.length >= 2 && items.every(i => i.done)){ if (!has){ d.put("marks", {id, kind:"clear", date:t, award:BONUS.clear}); return true; } }
  else if (has) d.del("marks", id);
  return false;
}

export function toggle(it){
  const t = T(); let cleared = false, gained = null;
  const undo = watchLevel(() => act(d => {
    if (it.k === "h"){
      const h = get(S(), "habits", it.id), lid = `${it.id}|${t}`;
      if (habitLog(S(), it.id, t)) d.del("logs", lid);
      else { gained = rewardFor("h", h.lv, streak(S(), t) + 1); d.put("logs", {id:lid, habit:it.id, date:t, award:gained, area:h.area || areaOfQuest(h.quest)}); }
    } else if (it.k === "m"){
      const m = get(S(), "missions", it.id);
      if (m.done) d.patch("missions", it.id, {done:false, doneAt:null, award:null});
      else { gained = rewardFor("m", m.lv, streak(S(), t) + 1); d.patch("missions", it.id, {done:true, doneAt:t, award:gained, area:m.area && m.area.length ? m.area : areaOfQuest(m.quest)}); }
    } else if (it.k === "e"){ const e = get(S(), "events", it.id); d.patch("events", it.id, {done:!e.done}); }
    cleared = maybeClear(d);
  }));
  if (gained) float(`+${gained.xp} XP`, it.k === "h" ? "h" : "");
  if (cleared){ party({kind:"clear"}); event("clear"); }
  else if (gained) toast(it.k === "h" ? "일일 퀘스트 완료" : "미션 완료", undo);
  return undo;
}

export function postpone(it, days = 1){
  if (it.k === "h"){ toast("일일 퀘스트는 미룰 수 없어요. 휴식권을 써 보세요."); return; }
  const col = it.k === "m" ? "missions" : "events", x = get(S(), col, it.id), base = it.late ? T() : (x.due || x.date || T());
  const to = addD(base, days), undo = act(d => d.patch(col, it.id, col === "missions" ? {due:to} : {date:to, end:x.end ? addD(x.end, days) : null}));
  toast(days === 1 ? "내일로 옮겼어요" : "옮겼어요", undo);
}
export function bringLate(){ const t = T(), late = live(S(), "missions").filter(m => !m.done && m.due && m.due < t); if (!late.length) return; const undo = act(d => late.forEach(m => d.patch("missions", m.id, {due:t}))); toast(`${late.length}개를 오늘로 옮겼어요`, undo); }

/* 무료 한도 */
export const limits = () => ({quests:live(S(), "quests").filter(q => !q.parent && q.status === "active").length, habits:live(S(), "habits").filter(h => !h.paused).length});
export const canAdd = kind => pass() || (kind === "quest" ? limits().quests < FREE.quests : kind === "habit" ? limits().habits < FREE.habits : true);

/* 빠른 추가: 해석 결과 여러 개를 한 번에 */
export function addParsed(list, force){
  const now = Date.now(); let n = 0, blocked = 0; const ids = [];
  const habitsLeft = pass() ? 1e9 : FREE.habits - limits().habits; let hUsed = 0;
  const undo = act(d => list.forEach((p, i) => {
    const type = force || p.type; if (!p.title) return; const id = uid() + i;
    if (type === "h"){ if (hUsed >= habitsLeft){ blocked++; return; } hUsed++; d.put("habits", {id, title:p.title, rule:p.rule || EVERYDAY(), time:p.time, lv:p.lv || "easy", area:p.area, quest:p.quest, start:T(), createdAt:now}); }
    else if (type === "e") d.put("events", {id, title:p.title, date:p.date, time:p.time, etime:p.etime, allDay:!p.time, createdAt:now});
    else d.put("missions", {id, title:p.title, due:p.dateSet || !p.quest ? p.date : null, time:p.time, etime:p.etime, lv:p.lv || "normal", area:p.area && p.area.length ? p.area : areaOfQuest(p.quest), quest:p.quest, createdAt:now, order:now + i});
    n++; ids.push(id);
  }));
  if (n) toast(n === 1 ? "추가했어요" : `${n}개 추가했어요`, undo);
  if (blocked) setTimeout(() => toast(`무료 플랜은 일일 퀘스트 ${FREE.habits}개까지예요`), n ? 2700 : 0);
  event("add"); return {n, blocked, ids};
}
export const quickParse = (text, quests) => parseMany(text, T(), quests || live(S(), "quests").filter(q => q.status === "active"));

/* 퀘스트 */
export function createQuest({title, why, due, area, stages = [], missions = [], ai}){
  const now = Date.now(), id = uid();
  act(d => {
    d.put("quests", {id, title, why, due:due || null, area:area || [], status:"active", createdAt:now, order:now, ai:!!ai});
    stages.forEach((s, i) => { const sid = uid() + "s" + i; d.put("quests", {id:sid, parent:id, title:s.title, due:s.due || null, status:"active", createdAt:now + i, order:i});
      (s.missions || []).forEach((m, j) => d.put("missions", {id:uid() + "m" + i + j, title:m.title || m, quest:sid, due:m.due || null, lv:m.lv || "normal", area:area || [], createdAt:now, order:j})); });
    missions.forEach((m, j) => d.put("missions", {id:uid() + "x" + j, title:m.title || m, quest:id, due:m.due || null, lv:m.lv || "normal", area:area || [], createdAt:now, order:j}));
  });
  event(ai ? "quest_ai" : "quest_new"); return id;
}
export function achieve(q){
  const p = qProg(S(), q); if (p.left > 0) return false;
  const aw = q.parent ? BONUS.stage : BONUS.main;
  watchLevel(() => act(d => d.patch("quests", q.id, {status:"done", doneAt:T(), award:aw})));
  if (!q.parent){ party({kind:"quest", q:get(S(), "quests", q.id)}); event("quest_done"); } else { float(`+${aw.xp} XP`); toast("스테이지 달성"); }
  return true;
}
export function reopen(q){ act(d => d.patch("quests", q.id, {status:"active", doneAt:null, award:null})); }
export function giveUp(q){ const undo = act(d => { d.patch("quests", q.id, {status:"gaveup", doneAt:T()}); if (!q.parent) subsOf(S(), q.id).forEach(s => s.status === "active" && d.patch("quests", s.id, {status:"gaveup"})); }); toast("내려놓았어요. 기록은 남아요.", undo); }
export function removeQuest(q){
  const undo = act(d => { const ids = [q.id, ...subsOf(S(), q.id).map(s => s.id)]; ids.forEach(i => d.del("quests", i)); live(S(), "missions").filter(m => ids.includes(m.quest)).forEach(m => d.del("missions", m.id)); live(S(), "habits").filter(h => ids.includes(h.quest)).forEach(h => d.patch("habits", h.id, {quest:null})); });
  toast("삭제했어요", undo);
}

/* 상점·휴식권 */
export function buy(r){
  const {coins} = totals(S()); if (coins < r.cost){ toast(`코인이 ${r.cost - coins}개 부족해요`); return; }
  const undo = act(d => d.put("buys", {id:uid(), reward:r.id, name:r.name, cost:r.cost, at:Date.now(), date:T()}));
  toast(`'${r.name}' 보상을 받았어요`, undo); event("buy");
}
export function buyShield(){
  const t = totals(S()); if (t.shields >= SHIELD.max){ toast(`휴식권은 ${SHIELD.max}장까지 가질 수 있어요`); return; }
  if (t.coins < SHIELD.cost){ toast(`코인이 ${SHIELD.cost - t.coins}개 부족해요`); return; }
  const undo = act(d => d.put("marks", {id:"sb:" + uid(), kind:"shieldbuy", cost:SHIELD.cost, at:Date.now()})); toast("휴식권 1장을 샀어요", undo);
}
/* 어제(또는 지정한 날) 쉬었다고 표시 → 연속 기록 유지 */
export function rest(date){
  const t = totals(S()); if (t.shields < 1){ toast("휴식권이 없어요"); return; }
  if (get(S(), "marks", "rest:" + date)) return;
  const undo = act(d => d.put("marks", {id:"rest:" + date, kind:"rest", date})); toast("휴식권을 썼어요. 연속 기록이 이어져요.", undo); event("rest");
}
/* 어제 아무것도 안 했고 그제까지 연속이었으면 휴식권 제안 */
export function streakAtRisk(){
  const t = T(), y = addD(t, -1), s = S(); if (!s) return null;
  const days = new Set(); live(s, "missions").forEach(m => m.done && m.doneAt && days.add(m.doneAt)); live(s, "logs").forEach(l => days.add(l.date)); live(s, "marks").forEach(k => k.kind === "rest" && days.add(k.date));
  if (days.has(y) || days.has(t)) return null;
  const before = streak(s, addD(t, -2)); return before >= 3 ? {date:y, n:before} : null;
}
export const habitDueToday = h => habitOn(h, T());

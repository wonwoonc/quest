/* 퀘스트라인 — 상태 저장소. 화면은 useApp()으로 구독하고, 바꿀 때는 act()를 쓴다.
 * 이 기기(localStorage)에 바로 저장하고, 로그인 상태면 잠시 뒤 서버와 항목 단위로 합쳐 올린다. */
import {useEffect, useState} from "./vendor/hooks.js";
import {blank, valid, merge, totals, COLS, dk, SHIELD} from "./logic.js";
import {auth, store as cloud, api} from "./cloud.js";

const LS = {get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } }, set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
export {LS};
const key = () => "ql:state:" + (auth.user ? auth.user.id : "guest");

export const app = {S:null, ent:{plan:"free", status:"none"}, ai:null, sync:"local", mode:"boot", tick:0};
const subs = new Set();
const emit = () => { app.tick++; subs.forEach(f => f(app.tick)); };
export function useApp(){ const [, set] = useState(0); useEffect(() => { subs.add(set); set(app.tick); return () => subs.delete(set); }, []); return app; } // 구독 전에 바뀐 것도 놓치지 않게
export const T = () => dk(new Date());
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const pass = () => app.ent && app.ent.plan === "pass";
export const sum = () => totals(app.S);

/* ── 바꾸기 ──
 * act(d => { d.put("missions", {...}); d.del("events", id); }) → 되돌리기 함수를 돌려준다 */
export function act(fn, {silent} = {}){
  const S = app.S, before = [], now = Date.now();
  const d = {
    S, now,
    put(col, item){ const prev = S[col][item.id]; before.push([col, item.id, prev ? {...prev} : null]); S[col][item.id] = {...item, u:now}; return S[col][item.id]; },
    patch(col, id, ch){ const prev = S[col][id]; if (!prev) return null; return d.put(col, {...prev, ...ch}); },
    del(col, id){ const prev = S[col][id]; if (!prev) return; before.push([col, id, {...prev}]); S[col][id] = {id, del:true, u:now}; },
    profile(ch){ before.push(["profile", null, {...S.profile}]); S.profile = {...S.profile, ...ch, u:now}; },
  };
  fn(d);
  persist(); if (!silent) emit();
  return () => { const t = Date.now(); for (const [col, id, prev] of before.reverse()) { if (col === "profile") S.profile = {...prev, u:t}; else S[col][id] = prev ? {...prev, u:t} : {id, del:true, u:t}; } persist(); emit(); };
}

/* ── 저장과 동기화 ── */
let timer = null, pushing = false, again = false;
function persist(){ LS.set(key(), app.S); if (!auth.user) return; setSync("saving"); clearTimeout(timer); timer = setTimeout(syncNow, 700); }
function setSync(s){ if (app.sync !== s){ app.sync = s; emit(); } }
export async function syncNow(){
  if (!auth.user || !app.S) return;
  if (pushing){ again = true; return; } pushing = true;
  try {
    const remote = await cloud.load();
    const merged = valid(remote) ? merge(app.S, remote) : app.S;
    await cloud.save(merged);
    if (merged !== app.S){ app.S = merged; LS.set(key(), merged); }
    setSync("saved"); emit();
  } catch (e) {
    if (e.code === "session_not_found"){ app.mode = "auth"; emit(); }
    setSync(navigator.onLine === false || e.code === "network" ? "offline" : "error");
  } finally { pushing = false; if (again){ again = false; syncNow(); } }
}
addEventListener("online", () => syncNow());
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
setInterval(() => { if (document.visibilityState === "visible" && auth.user && app.sync !== "saving") syncNow(); }, 60000);

/* ── 구독 정보 ── */
export function effective(e){ if (!e || e.plan !== "pass" || !e.period_end) return {plan:"free", status:e ? e.status : "none", trialUsed:!!(e && e.trial_used)}; const end = new Date(e.period_end).getTime(), g = e.status === "past_due" ? 3 * 864e5 : 0; return end + g > Date.now() ? {plan:"pass", status:e.status, period_end:e.period_end, interval:e.interval, trialUsed:!!e.trial_used} : {plan:"free", status:"expired", trialUsed:!!e.trial_used}; }
export async function loadEnt(){
  if (!auth.user){ app.ent = {plan:"free", status:"none"}; return; }
  try { app.ent = effective(await cloud.entitlement()); } catch (_) {}
  try { const m = await api("me"); if (m && m.ai) app.ai = m.ai; } catch (_) {}
  grantShields(); emit();
}
/* 매달 휴식권: 무료 1장, 패스 4장(달 중간에 패스가 되면 차이만큼 추가). 보유 최대 8장 */
export function grantShields(){
  const S = app.S; if (!S) return; const m = T().slice(0, 7), have = totals(S).shields;
  const want = pass() ? SHIELD.passPerMonth : SHIELD.freePerMonth;
  const got = Object.values(S.marks).filter(k => !k.del && k.kind === "grant" && k.month === m).reduce((a, k) => a + (k.n || 0), 0);
  const n = Math.min(want - got, SHIELD.max - have);
  if (n > 0) act(d => d.put("marks", {id:`grant:${m}:${got + n}`, kind:"grant", month:m, n}), {silent:true});
}

/* ── 시작 ── */
export async function startUser(){
  app.mode = "app";
  const local = LS.get(key()), guest = LS.get("ql:state:guest");
  app.S = valid(local) ? local : null;
  if (app.S) emit();
  setSync("saving");
  try {
    const remote = await cloud.load();
    let S = valid(remote) ? (app.S ? merge(app.S, remote) : remote) : app.S;
    if (valid(guest) && COLS.some(c => Object.keys(guest[c]).length > (c === "rewards" ? 2 : 0))) { S = S ? merge(S, guest) : guest; LS.set("ql:state:guest", null); } // 둘러보기 기록을 계정으로
    if (!S) S = blank((auth.user.email || "").split("@")[0].slice(0, 12));
    app.S = S; LS.set(key(), S); LS.set("ql:guest", null);
    await cloud.save(S); setSync("saved");
  } catch (e) { if (!app.S) app.S = blank(); setSync(e.code === "network" ? "offline" : "error"); }
  await loadEnt(); emit();
}
export function startGuest(){ app.mode = "app"; const g = LS.get("ql:state:guest"); app.S = valid(g) ? g : blank(); LS.set("ql:guest", 1); setSync("local"); grantShields(); persist(); emit(); }
export function signedOut(){ app.S = null; app.ent = {plan:"free", status:"none"}; app.mode = "auth"; app.sync = "local"; emit(); }
export function setMode(m){ app.mode = m; emit(); }
export const event = n => { try { cloud.event(n); } catch (_) {} };

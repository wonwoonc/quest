/* 퀘스트라인 — 기록: 달력, 일일 퀘스트 기록, 주간·월간 리포트 */
import {useState} from "./vendor/hooks.js";
import {html, I, Row, Empty, openSheet, SheetHead, Seg} from "./ui.js";
import {live, get, todayItems, habitOn, habitLog, habitStreak, addD, addM, pd, dk, pad, WD, md, sunStart, AREAS, AREA_KEYS, ruleLabel, streak, bestStreak} from "./logic.js";
import {app, useApp, T, pass} from "./store.js";
import {toggle} from "./actions.js";
import {YearDots, Paywall, QuickAdd} from "./sheets.js";
import {openItem, questName} from "./today.js";

/* 하루에 있었던 일 */
function dayMarks(S, d){
  const m = live(S, "missions").some(x => x.due === d || x.doneAt === d), h = live(S, "logs").some(l => l.date === d), e = live(S, "events").some(x => x.date === d || (x.end && x.date <= d && x.end >= d));
  return {m, h, e};
}
function itemsOn(S, d, t){
  if (d === t) return todayItems(S, t).filter(i => !i.late);
  const out = [];
  live(S, "habits").filter(h => (d < t ? !!habitLog(S, h.id, d) : habitOn(h, d))).forEach(h => out.push({k:"h", id:h.id, title:h.title, time:h.time || "", done:!!habitLog(S, h.id, d), quest:h.quest}));
  live(S, "missions").filter(m => (m.done ? m.doneAt === d : m.due === d)).forEach(m => out.push({k:"m", id:m.id, title:m.title, time:m.time || "", done:!!m.done, quest:m.quest, late:!m.done && d < t, due:m.due}));
  live(S, "events").filter(e => e.date === d || (e.end && e.date <= d && e.end >= d)).forEach(e => out.push({k:"e", id:e.id, title:e.title, time:e.allDay ? "" : e.time || "", done:!!e.done, allDay:!!e.allDay}));
  return out.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

export function Record(){
  useApp(); const S = app.S, t = T(), [ym, setYm] = useState(t.slice(0, 7)), [sel, setSel] = useState(t), [rep, setRep] = useState("week");
  const first = ym + "-01", start = sunStart(first), cells = []; for (let i = 0; i < 42; i++) { const d = addD(start, i); if (i >= 35 && d.slice(0, 7) !== ym) break; cells.push(d); }
  const list = itemsOn(S, sel, t), habits = live(S, "habits").sort((a, b) => (a.paused ? 1 : 0) - (b.paused ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
  const [y, mo] = ym.split("-").map(Number);
  return html`<header class="top"><h1>기록</h1></header>
    <div class="card cal">
      <div class="calh"><button class="ib" onClick=${() => setYm(addM(first, -1).slice(0, 7))} aria-label="이전 달"><${I.left}/></button><b>${y}년 ${mo}월</b>${ym !== t.slice(0, 7) ? html`<button class="chip sm" onClick=${() => { setYm(t.slice(0, 7)); setSel(t); }}>오늘</button>` : ""}<button class="ib" onClick=${() => setYm(addM(first, 1).slice(0, 7))} aria-label="다음 달"><${I.right}/></button></div>
      <div class="wk">${WD.map((w, i) => html`<span class=${i === 0 ? "sun" : i === 6 ? "sat" : ""}>${w}</span>`)}</div>
      <div class="days">${cells.map(d => { const k = dayMarks(S, d), wd = pd(d).getDay(); return html`<button class="day ${d === t ? "today" : ""} ${d === sel ? "sel" : ""} ${d.slice(0, 7) !== ym ? "out" : ""}" onClick=${() => { setSel(d); if (d.slice(0, 7) !== ym) setYm(d.slice(0, 7)); }} aria-pressed=${d === sel} aria-label=${d}><span class="n ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}">${+d.slice(8)}</span><span class="dots">${k.m && html`<i class="m"></i>`}${k.h && html`<i class="h"></i>`}${k.e && html`<i class="e"></i>`}</span></button>`; })}</div>
    </div>
    <div class="sect"><h2>${sel === t ? "오늘" : `${md(sel)} (${WD[pd(sel).getDay()]})`}</h2><span class="c num">${list.filter(i => i.done).length}/${list.length}</span><button class="more" onClick=${() => openSheet(QuickAdd, {date:sel})}>+ 이날에 추가</button></div>
    <div class="card list">${list.length ? list.map(it => html`<${Row} key=${it.k + it.id} it=${it} readonly=${sel !== t && it.k === "h"} sub=${questName(it.quest)} onCheck=${() => toggle(it)} onOpen=${() => openItem(it)}/>`) : html`<${Empty} title=${sel < t ? "기록이 없어요" : "아직 비어 있어요"}>${sel > t ? "이날 할 일을 미리 넣어 둘 수 있어요." : ""}</${Empty}>`}</div>
    <div class="sect"><h2>리포트</h2><div class="sp"></div><${Seg} label="기간" value=${rep} onChange=${setRep} options=${[["week","이번 주"],["month","이번 달"]]}/></div>
    <${Report} kind=${rep}/>
    <div class="sect"><h2>일일 퀘스트</h2><span class="c num">${habits.filter(h => !h.paused).length}개</span></div>
    ${habits.length ? html`<div class="hmrow">${habits.map(h => html`<button class="card hm ${h.paused ? "paused" : ""}" key=${h.id} onClick=${() => openSheet(HabitYear, {id:h.id})}><div class="h"><b>${h.title}</b><span class="num">${h.paused ? "멈춤" : `${habitStreak(S, h, t)}일`}</span></div><${MonthSq} h=${h} ym=${t.slice(0, 7)}/><small>${ruleLabel(h.rule)}</small></button>`)}</div>`
      : html`<div class="card"><${Empty} title="일일 퀘스트가 없어요" action=${html`<button class="pill" onClick=${() => openSheet(QuickAdd, {type:"h"})}><${I.plus}/>만들기</button>`}>매일 반복할 작은 행동을 정해 보세요.</${Empty}></div>`}`;
}

export function MonthSq({h, ym}){
  const t = T(), first = ym + "-01", pad0 = pd(first).getDay(), cells = []; for (let i = 0; i < pad0; i++) cells.push(html`<i class="e"></i>`);
  for (let d = first; d.slice(0, 7) === ym; d = addD(d, 1)) { const on = !!habitLog(app.S, h.id, d); cells.push(html`<i class=${`${on ? "on" : d > t ? "fu" : ""} ${d === t ? "t" : ""}`}></i>`); }
  return html`<div class="sq" aria-hidden="true">${cells}</div>`;
}
function HabitYear({id}){
  useApp(); const h = get(app.S, "habits", id), [y, setY] = useState(+T().slice(0, 4)); if (!h) return null;
  const n = live(app.S, "logs").filter(l => l.habit === id && l.date.startsWith(String(y))).length;
  return html`<${SheetHead} title=${h.title}/><div class="calh"><button class="ib" onClick=${() => setY(y - 1)} aria-label="이전 해"><${I.left}/></button><b class="num">${y}년 · ${n}일</b><button class="ib" disabled=${y >= +T().slice(0, 4)} onClick=${() => setY(y + 1)} aria-label="다음 해"><${I.right}/></button></div><${YearDots} hid=${id} year=${y}/>
    <button class="btn sec" onClick=${() => openItem({k:"h", id})}>편집</button>`;
}

/* 리포트: 기간 안 완료 수, 클리어한 날, 경험치, 영역 밸런스, 지난 기간과 비교 */
function stat(S, from, to){
  let done = 0, xp = 0; const area = {}; AREA_KEYS.forEach(a => area[a] = 0); const days = new Set(), byDay = {};
  const add = (d, aw, ar) => { done++; xp += aw && aw.xp || 0; days.add(d); byDay[d] = (byDay[d] || 0) + 1; (ar || []).forEach(a => a in area && (area[a] += 1)); };
  live(S, "missions").forEach(m => m.done && m.doneAt >= from && m.doneAt <= to && add(m.doneAt, m.award, m.area));
  live(S, "logs").forEach(l => l.date >= from && l.date <= to && add(l.date, l.award, l.area));
  const clears = live(S, "marks").filter(k => k.kind === "clear" && k.date >= from && k.date <= to).length;
  let due = 0, hit = 0; live(S, "habits").forEach(h => { for (let d = from; d <= to && d <= T(); d = addD(d, 1)) if (habitOn(h, d) || habitLog(S, h.id, d)) { due++; if (habitLog(S, h.id, d)) hit++; } });
  return {done, xp, area, days:days.size, clears, rate:due ? Math.round(hit / due * 100) : null, byDay};
}
function Report({kind}){
  const S = app.S, t = T();
  const from = kind === "week" ? sunStart(t) : t.slice(0, 8) + "01", to = kind === "week" ? addD(from, 6) : addD(addM(from, 1), -1);
  const pf = kind === "week" ? addD(from, -7) : addM(from, -1), pt = addD(from, -1);
  const a = stat(S, from, to), b = stat(S, pf, pt), max = Math.max(1, ...Object.values(a.area));
  const diff = a.done - b.done, top = AREA_KEYS.slice().sort((x, y) => a.area[y] - a.area[x]), low = top.filter(k => a.area[k] === 0);
  const locked = kind === "month" && !pass();
  const nDays = kind === "week" ? 7 : pd(to).getDate(), bars = Array.from({length:nDays}, (_, i) => addD(from, i)), bmax = Math.max(1, ...bars.map(d => a.byDay[d] || 0));
  const body = html`<div class="kpis"><div class="kpi"><b>${a.done}</b><small>완료</small></div><div class="kpi"><b>${a.days}</b><small>움직인 날</small></div><div class="kpi"><b>${a.rate == null ? "-" : a.rate + "%"}</b><small>일일 퀘스트</small></div></div>
    <div class="bars" aria-label="날짜별 완료 수">${bars.map(d => html`<div class=${d > t ? "fu" : ""}><i style=${`height:${Math.round((a.byDay[d] || 0) / bmax * 100)}%`}></i>${kind === "week" && html`<small>${WD[pd(d).getDay()]}</small>`}</div>`)}</div>
    <div class="abal">${AREA_KEYS.map(k => html`<div><span>${AREAS[k].name}</span><div class="bar"><i style=${`width:${a.area[k] / max * 100}%`}></i></div><span class="num">${a.area[k]}</span></div>`)}</div>
    <p class="insight">${a.done === 0 ? "아직 이번 기간 기록이 없어요. 오늘 하나만 체크해 볼까요?" : `${kind === "week" ? "지난주" : "지난달"}보다 ${diff === 0 ? "똑같이" : diff > 0 ? `${diff}개 더` : `${-diff}개 덜`} 해냈어요.${a.area[top[0]] > 0 ? ` ${AREAS[top[0]].name}에 가장 힘을 썼고` : ""}${low.length ? `, ${low.map(k => AREAS[k].name).slice(0, 2).join("·")}은 비어 있어요.` : ", 다섯 영역을 고르게 챙겼어요."}`}</p>`;
  return html`<div class="card report"><h3>${kind === "week" ? `${md(from)} ~ ${md(to)}` : `${+from.slice(5, 7)}월`}</h3><p>+${a.xp} XP · 클리어 ${a.clears}일 · 최고 연속 ${bestStreak(S)}일</p>
    ${locked ? html`<div class="locked"><div class="blur" aria-hidden="true">${body}</div><div class="cta"><button class="pill" onClick=${() => openSheet(Paywall, {reason:"report"})}><${I.lock}/>패스로 월간 리포트 보기</button></div></div>` : body}</div>`;
}

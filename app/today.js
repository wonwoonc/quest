/* 퀘스트라인 — 오늘 화면 */
import {useState} from "./vendor/hooks.js";
import {html, I, Row, Empty, openSheet, Avatar, titleOf} from "./ui.js";
import {get, live, todayItems, inbox, streak, qProg, ddayLabel, pd, WD, addD, habitStreak, rewardFor} from "./logic.js";
import {app, useApp, T, sum} from "./store.js";
import {toggle, postpone, bringLate, streakAtRisk, rest} from "./actions.js";
import {QuickAdd, MissionEdit, HabitEdit, EventEdit} from "./sheets.js";

export const openItem = it => openSheet(it.k === "h" ? HabitEdit : it.k === "e" ? EventEdit : MissionEdit, {id:it.id});
export const questName = id => { const q = id && get(app.S, "quests", id); if (!q) return ""; const p = q.parent && get(app.S, "quests", q.parent); return p ? `${p.title} · ${q.title}` : q.title; };

export function Hero({compact}){
  const S = app.S, s = sum(), t = T(), st = streak(S, t);
  return html`<a class="card hero" href="#me">
    <div class="av"><${Avatar} L=${s.level.L} hue=${S.profile.hue} size=${76}/></div>
    <div><div class="nm"><b>${S.profile.name}</b><span class="lv">Lv${s.level.L}</span>${!compact && html`<small class="ttl">${titleOf(s.level.L)}</small>`}</div>
      <div class="bar" role="progressbar" aria-valuenow=${s.level.pct} aria-valuemin="0" aria-valuemax="100" aria-label="다음 레벨까지"><i style=${`width:${s.level.pct}%`}></i></div>
      <div class="stats"><span title="연속 기록"><${I.fire}/><b>${st}</b>일</span><span title="코인"><${I.coin}/><b>${s.coins}</b></span><span title="휴식권"><${I.shield}/><b>${s.shields}</b></span><span class="xpn num">${s.level.rest}/${s.level.need} XP</span></div></div>
  </a>`;
}

export function Today(){
  useApp(); const S = app.S, t = T(), d = pd(t), [showDone, setShowDone] = useState(false), [showInbox, setShowInbox] = useState(false);
  const items = todayItems(S, t), late = items.filter(i => i.late), now = items.filter(i => !i.late), open = now.filter(i => !i.done), done = now.filter(i => i.done);
  const risk = streakAtRisk(), s = sum(), ib = inbox(S), st = streak(S, t);
  const quests = live(S, "quests").filter(q => !q.parent && q.status === "active").sort((a, b) => (a.order || 0) - (b.order || 0));
  const hr = new Date().getHours(), evening = hr * 60 + new Date().getMinutes() >= toMin(S.profile.eveningAt || "21:30");
  const tm = addD(t, 1), tmItems = evening ? todayItems(S, tm).filter(i => !i.late) : [];
  const greet = hr < 5 ? "늦은 밤이에요" : hr < 11 ? "좋은 아침이에요" : hr < 17 ? "오늘도 한 걸음" : hr < 21 ? "오늘 하루 어땠나요" : "하루를 마무리해요";
  const row = it => html`<${Row} key=${it.k + it.id} it=${it} sub=${questName(it.quest)} onCheck=${() => toggle(it)} onOpen=${() => openItem(it)} onSwipeLeft=${it.k !== "h" && !it.done ? () => postpone(it) : null}/>`;
  const next = open.find(i => i.time && i.time >= `${String(hr).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`);
  const allDone = now.length > 0 && open.length === 0;
  return html`<header class="top"><h1><small>${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일</small>${greet}</h1><${SyncDot}/></header>
    <${Hero} compact/>
    ${risk && s.shields > 0 && html`<div class="card banner"><${I.shield}/><div><b>어제 쉬셨네요</b><small>휴식권을 쓰면 ${risk.n}일 연속 기록이 이어져요. (남은 휴식권 ${s.shields}장)</small></div><button class="pill sm" onClick=${() => rest(risk.date)}>쓰기</button></div>`}
    ${late.length > 0 && html`<div class="card banner warn"><${I.clock}/><div><b>지난 미완료 ${late.length}개</b><small>오늘 할 일로 옮겨서 다시 시작해요.</small></div><button class="pill sm" onClick=${bringLate}>오늘로</button></div>`}
    <div class="sect"><h2>오늘 할 일</h2><span class="c num">${done.length}/${now.length}</span>${next && html`<span class="next">다음 <b class="num">${next.time.replace(/^0/, "")}</b> ${next.title}</span>`}</div>
    ${now.length === 0 ? html`<div class="card"><${Empty} title="오늘 할 일이 비어 있어요" action=${html`<button class="pill" onClick=${() => openSheet(QuickAdd)}><${I.plus}/>추가하기</button>`}>작은 것 하나부터 시작해 보세요. 예: '물 한 잔 마시기'</${Empty}></div>`
      : html`<div class="card list">${open.map(row)}
        ${allDone && html`<div class="clear"><${I.trophy}/><div><b>오늘 할 일 클리어</b><small>${st}일 연속 · 내일도 이 흐름 그대로</small></div></div>`}
        ${done.length > 0 && html`<button class="fold ${showDone ? "open" : ""}" aria-expanded=${showDone} onClick=${() => setShowDone(!showDone)}>완료 ${done.length}개<${I.chev}/></button>${showDone && done.map(row)}`}
      </div>`}
    ${late.length > 0 && html`<div class="sect"><h2>지난 미완료</h2><span class="c">밀어서 내일로</span></div><div class="card list">${late.map(row)}</div>`}
    ${evening && html`<div class="sect"><h2>내일 미리 보기</h2><span class="c num">${tmItems.length}개</span><button class="more" onClick=${() => openSheet(QuickAdd, {date:tm})}>내일 할 일 추가</button></div>
      <div class="card list">${tmItems.length ? tmItems.slice(0, 5).map(it => html`<${Row} it=${it} readonly sub=${questName(it.quest)} onOpen=${() => openItem(it)}/>`) : html`<${Empty} title="내일 계획이 비어 있어요">자기 전에 세 가지만 정해 두면 아침이 가벼워져요.</${Empty}>`}</div>`}
    ${quests.length > 0 && html`<div class="sect"><h2>진행 중인 퀘스트</h2><a class="more" href="#quests">전체</a></div>
      <div class="strip">${quests.map(q => { const p = qProg(S, q); return html`<a class="card qmini" href=${"#q/" + q.id}><b>${q.title}</b><div class="bar"><i style=${`width:${p.pct}%`}></i></div><div class="meta"><span>${p.total ? `미션 ${p.done}/${p.total}` : p.st ? `스테이지 ${p.sd}/${p.st}` : "미션을 추가해 보세요"}</span>${q.due && html`<span class="num">${ddayLabel(q.due, t)}</span>`}</div></a>`; })}</div>`}
    ${ib.length > 0 && html`<div class="sect"><h2>날짜 없는 미션</h2><span class="c num">${ib.length}</span><button class="more" onClick=${() => setShowInbox(!showInbox)} aria-expanded=${showInbox}>${showInbox ? "접기" : "펼치기"}</button></div>
      ${showInbox && html`<div class="card list">${ib.slice(0, 30).map(m => { const it = {k:"m", id:m.id, title:m.title, done:false, quest:m.quest}; return html`<${Row} it=${it} sub=${questName(m.quest)} onCheck=${() => toggle(it)} onOpen=${() => openItem(it)}/>`; })}</div>`}`}`;
}
const toMin = s => { const [h, m] = (s || "0:0").split(":").map(Number); return h * 60 + m; };

export function SyncDot(){
  const s = app.sync; if (s === "local") return null; const label = {local:"이 기기에만 저장", saving:"저장 중", saved:"저장됨", offline:"오프라인 · 연결되면 저장", error:"저장 실패 · 다시 시도해요"}[s] || "";
  return html`<span class="sync ${s}" title=${label} aria-label=${label} role="status"><i></i><span>${s === "saved" || s === "saving" || s === "local" ? "" : label}</span></span>`;
}

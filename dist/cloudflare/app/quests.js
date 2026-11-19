/* 퀘스트라인 — 퀘스트 목록, 새 퀘스트(직접·AI), 퀘스트 상세 */
import {useState} from "./vendor/hooks.js";
import {html, I, Row, Empty, openSheet, closeSheet, SheetHead, toast, Chip, Confirm} from "./ui.js";
import {get, live, qProg, subsOf, ddayLabel, dayLabel, AREAS, AREA_KEYS, addD, addM, md, habitStreak, habitLog, ruleLabel, FREE} from "./logic.js";
import {app, useApp, act, T, uid, pass, event} from "./store.js";
import {api, auth} from "./cloud.js";
import {toggle, postpone, createQuest, achieve, reopen, giveUp, removeQuest, canAdd} from "./actions.js";
import {QuickAdd, Paywall} from "./sheets.js";
import {openItem} from "./today.js";

const mainsOf = (S, status) => live(S, "quests").filter(q => !q.parent && (status === "active" ? q.status === "active" : status === "done" ? q.status === "done" : q.status === "gaveup")).sort((a, b) => status === "active" ? (a.order || 0) - (b.order || 0) : (b.doneAt || "").localeCompare(a.doneAt || ""));
const progText = p => p.total ? `미션 ${p.done}/${p.total}` : p.st ? `스테이지 ${p.sd}/${p.st}` : "아직 미션이 없어요";
export const newQuest = () => canAdd("quest") ? openSheet(NewQuest) : openSheet(Paywall, {reason:"quest"});

export function Quests(){
  useApp(); const S = app.S, [tab, setTab] = useState("active"), t = T();
  const list = mainsOf(S, tab), counts = {active:mainsOf(S, "active").length, done:mainsOf(S, "done").length, gaveup:mainsOf(S, "gaveup").length};
  const move = (q, dir) => { const arr = mainsOf(S, "active"), i = arr.findIndex(x => x.id === q.id), j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; act(d => arr.forEach((x, k) => x.order !== k && d.patch("quests", x.id, {order:k}))); };
  return html`<header class="top"><h1>퀘스트</h1></header>
    <div class="tabs" role="tablist">${[["active","진행 중"],["done","달성"],["gaveup","내려놓음"]].map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${l}<span class="num">${counts[k]}</span></button>`)}</div>
    ${tab === "active" && html`<button class="newq" onClick=${newQuest}><${I.plus}/><span><b>새 메인 퀘스트</b>큰 목표를 스테이지와 미션으로 나눠요${!pass() ? ` · 무료 ${counts.active}/${FREE.quests}` : ""}</span></button>`}
    ${list.length === 0 ? html`<div class="card"><${Empty} title=${tab === "active" ? "진행 중인 퀘스트가 없어요" : tab === "done" ? "아직 달성한 퀘스트가 없어요" : "내려놓은 퀘스트가 없어요"}>${tab === "active" ? "3개월 안에 이루고 싶은 일 하나를 떠올려 보세요." : ""}</${Empty}></div>`
      : list.map((q, i) => { const p = qProg(S, q), subs = subsOf(S, q.id); return html`<div class="card qcard ${q.status}" key=${q.id}>
        <a class="qlink" href=${"#q/" + q.id}><div class="h"><h3>${q.title}</h3>${q.status === "active" && q.due && html`<span class="dday ${q.due < t ? "late" : ""} num">${ddayLabel(q.due, t)}</span>`}${q.status === "done" && html`<span class="tag m">${md(q.doneAt)} 달성</span>`}</div>
          <div class="sub">${(q.area || []).map(a => html`<span>${AREAS[a].name}</span>`)}${subs.length > 0 && html`<span>스테이지 ${subs.filter(s => s.status === "done").length}/${subs.length}</span>`}</div>
          <div class="prog"><div class="bar"><i style=${`width:${p.pct}%`}></i></div><span class="num">${progText(p)}</span></div></a>
        ${tab === "active" && list.length > 1 && html`<div class="reo"><button class="ib sm" disabled=${i === 0} onClick=${() => move(q, -1)} aria-label="위로"><${I.chev} /></button><button class="ib sm" disabled=${i === list.length - 1} onClick=${() => move(q, 1)} aria-label="아래로"><${I.chev}/></button></div>`}
      </div>`; })}`;
}

/* ── 새 메인 퀘스트 ── */
function NewQuest(){
  const [mode, setMode] = useState("ai");
  return html`<${SheetHead} title="새 메인 퀘스트"/>
    <div class="seg2" role="tablist"><button role="tab" aria-selected=${mode === "ai"} onClick=${() => setMode("ai")}><${I.spark}/>AI와 설계</button><button role="tab" aria-selected=${mode === "self"} onClick=${() => setMode("self")}><${I.edit}/>직접 만들기</button></div>
    ${mode === "ai" ? html`<${AiPlan}/>` : html`<${SelfPlan}/>`}`;
}
function SelfPlan(){
  const [title, setTitle] = useState(""), [why, setWhy] = useState(""), [due, setDue] = useState(addM(T(), 3)), [area, setArea] = useState([]), [stages, setStages] = useState(["", "", ""]);
  const ok = title.trim().length > 0;
  const save = () => { if (!ok) return; const id = createQuest({title:title.trim(), why:why.trim(), due, area, stages:stages.map(s => s.trim()).filter(Boolean).map((s, i, a) => ({title:s, due:stageDue(T(), due, i, a.length)}))}); closeSheet(); location.hash = "#q/" + id; toast("퀘스트를 시작했어요"); };
  return html`<div class="field"><label>목표</label><input autofocus value=${title} onInput=${e => setTitle(e.target.value)} placeholder="예: 하프 마라톤 완주" maxlength="40"/></div>
    <div class="field"><label>왜 이루고 싶나요 <small>(힘들 때 다시 보여 드려요)</small></label><input value=${why} onInput=${e => setWhy(e.target.value)} placeholder="예: 나도 해낼 수 있다는 걸 확인하고 싶어서" maxlength="80"/></div>
    <div class="field"><label>마감</label><div class="chips">${[[1,"1개월"],[3,"3개월"],[6,"6개월"]].map(([n, l]) => html`<${Chip} on=${due === addM(T(), n)} onClick=${() => setDue(addM(T(), n))}>${l}</${Chip}>`)}<input type="date" value=${due} min=${T()} onInput=${e => e.target.value && setDue(e.target.value)} aria-label="마감 날짜"/></div></div>
    <div class="field"><label>영역</label><div class="chips">${AREA_KEYS.map(a => html`<${Chip} on=${area.includes(a)} onClick=${() => setArea(area.includes(a) ? area.filter(x => x !== a) : [...area, a].slice(-2))}>${AREAS[a].name}</${Chip}>`)}</div></div>
    <div class="field"><label>스테이지 <small>(순서대로 거칠 단계, 비워도 돼요)</small></label>${stages.map((s, i) => html`<div class="stin"><span class="num">${i + 1}</span><input value=${s} onInput=${e => setStages(stages.map((x, j) => j === i ? e.target.value : x))} placeholder=${["예: 5km 쉬지 않고 달리기", "예: 10km 완주", "예: 하프 코스 연습"][i] || "스테이지"} maxlength="30"/></div>`)}
      ${stages.length < 6 && html`<button type="button" class="chip" onClick=${() => setStages([...stages, ""])}>+ 스테이지</button>`}</div>
    <button class="btn" disabled=${!ok} onClick=${save}>퀘스트 시작</button>`;
}
const stageDue = (t, due, i, n) => { if (!due) return null; const span = Math.max(1, Math.round((new Date(due) - new Date(t)) / 864e5)); return addD(t, Math.round(span * (i + 1) / n)); };

function AiPlan(){
  const [goal, setGoal] = useState(""), [deadline, setDeadline] = useState(addM(T(), 3)), [now, setNow] = useState(""), [hours, setHours] = useState("30분");
  const [st, setSt] = useState("form"), [plan, setPlan] = useState(null), [msg, setMsg] = useState("");
  if (!auth.user) return html`<div class="card note"><b>AI 설계는 로그인하면 쓸 수 있어요</b><p>무료로 한 번 체험할 수 있어요. 둘러보기 기록은 로그인하면 그대로 옮겨져요.</p><a class="btn" href="#auth" onClick=${closeSheet}>로그인</a></div>`;
  const ask = async () => {
    setSt("think"); setMsg("");
    try { const r = await api("ai-plan", {goal, deadline, now, hours, today:T()}); setPlan(r.plan); setSt("plan"); if (r.left != null) app.ai = {...(app.ai || {}), left:r.left}; event("ai_plan"); }
    catch (e) { if (e.code === "need_pass"){ closeSheet(); openSheet(Paywall, {reason:"ai"}); return; } setMsg(e.message); setSt("form"); }
  };
  const accept = () => {
    const p = plan, ms = p.missions.map(m => ({title:m.title, due:m.due})), first = p.stages[0];
    const id = createQuest({title:p.title, due:deadline, area:p.area, ai:true, stages:p.stages.map((s, i) => ({title:s.title, due:s.due, missions:i === 0 ? ms : []})), missions:first ? [] : ms});
    const now = Date.now(); act(d => p.habits.forEach((h, i) => { if (!canAdd("habit")) return; d.put("habits", {id:uid() + "h" + i, title:h.title, rule:{type:"week", days:h.days}, time:h.time, lv:"easy", area:p.area, quest:id, start:T(), createdAt:now}); }));
    closeSheet(); location.hash = "#q/" + id; toast("AI가 짠 계획으로 시작해요");
  };
  if (st === "think") return html`<div class="think" role="status"><i></i><i></i><i></i>스테이지와 첫 주 미션을 짜는 중이에요</div>`;
  if (st === "plan" && plan) return html`<div class="plan"><h4>${plan.title}</h4>
      <div class="grp"><small>스테이지</small>${plan.stages.map((s, i) => html`<div class="it"><b class="num">${i + 1}</b>${s.title}<span class="num">${md(s.due)}</span></div>`)}</div>
      <div class="grp"><small>이번 주 미션</small>${plan.missions.map(m => html`<div class="it"><${I.check}/>${m.title}<span class="num">${dayLabel(m.due, T())}</span></div>`)}</div>
      ${plan.habits.length > 0 && html`<div class="grp"><small>일일 퀘스트</small>${plan.habits.map(h => html`<div class="it"><${I.repeat}/>${h.title}<span class="num">${ruleLabel({type:"week", days:h.days})}</span></div>`)}</div>`}</div>
    <button class="btn" onClick=${accept}>이대로 시작</button><button class="btn sec" onClick=${() => setSt("form")}>다시 짜기</button>
    <p class="hint">시작한 뒤에도 모든 항목을 고칠 수 있어요.</p>`;
  return html`<div class="field"><label>이루고 싶은 목표</label><input autofocus value=${goal} onInput=${e => setGoal(e.target.value)} placeholder="예: 토익 850점, 5kg 감량, 첫 앱 출시" maxlength="120"/></div>
    <div class="field"><label>지금 상태 <small>(선택)</small></label><input value=${now} onInput=${e => setNow(e.target.value)} placeholder="예: 지난달 모의고사 650점" maxlength="160"/></div>
    <div class="field"><label>하루에 쓸 수 있는 시간</label><div class="chips">${["15분", "30분", "1시간", "2시간 이상"].map(h => html`<${Chip} on=${hours === h} onClick=${() => setHours(h)}>${h}</${Chip}>`)}</div></div>
    <div class="field"><label>마감</label><div class="chips">${[[1,"1개월"],[3,"3개월"],[6,"6개월"]].map(([n, l]) => html`<${Chip} on=${deadline === addM(T(), n)} onClick=${() => setDeadline(addM(T(), n))}>${l}</${Chip}>`)}<input type="date" value=${deadline} min=${T()} onInput=${e => e.target.value && setDeadline(e.target.value)} aria-label="마감 날짜"/></div></div>
    ${msg && html`<p class="err" role="alert">${msg}</p>`}
    <button class="btn" disabled=${goal.trim().length < 2} onClick=${ask}><${I.spark}/>계획 짜기</button>
    <p class="hint">${pass() ? `오늘 남은 횟수 ${app.ai && app.ai.left != null ? app.ai.left : 20}번` : app.ai && app.ai.left === 0 ? "무료 체험을 이미 썼어요" : "무료로 한 번 써 볼 수 있어요"}</p>`;
}

/* ── 퀘스트 상세(메인·스테이지 공용) ── */
export function QuestView({id}){
  useApp(); const S = app.S, q = get(S, "quests", id), t = T(), [showDone, setShowDone] = useState(false), [add, setAdd] = useState("");
  if (!q) return html`<header class="top"><a class="back" href="#quests"><${I.left}/>퀘스트</a></header><div class="card"><${Empty} title="퀘스트를 찾을 수 없어요">삭제했거나 다른 기기에서 지웠을 수 있어요.</${Empty}></div>`;
  const parent = q.parent && get(S, "quests", q.parent), p = qProg(S, q), subs = q.parent ? [] : subsOf(S, q.id);
  const ms = live(S, "missions").filter(m => m.quest === q.id).sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.order || 0) - (b.order || 0));
  const open = ms.filter(m => !m.done), done = ms.filter(m => m.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  const habits = live(S, "habits").filter(h => h.quest === q.id || (!q.parent && subs.some(s => s.id === h.quest)));
  const active = q.status === "active", canDone = active && p.left === 0 && (p.total + p.st) > 0;
  const addOne = e => { e.preventDefault(); const v = add.trim(); if (!v) return; act(d => d.put("missions", {id:uid(), title:v, quest:q.id, due:null, lv:"normal", area:q.area && q.area.length ? q.area : parent && parent.area || [], createdAt:Date.now(), order:Date.now()})); setAdd(""); };
  const mRow = m => { const it = {k:"m", id:m.id, title:m.title, done:!!m.done, due:m.due, time:m.due === t ? m.time : "", late:!m.done && m.due && m.due < t, check:m.checklist}; return html`<${Row} key=${m.id} it=${it} sub=${m.due && !it.late ? dayLabel(m.due, t) : ""} onCheck=${() => toggle(it)} onOpen=${() => openItem(it)} onSwipeLeft=${!m.done && m.due ? () => postpone(it) : null}/>`; };
  const moveStage = (s, dir) => { const arr = subs.slice(), i = arr.findIndex(x => x.id === s.id), j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; act(d => arr.forEach((x, k) => d.patch("quests", x.id, {order:k}))); };
  return html`<header class="top"><a class="back" href=${parent ? "#q/" + parent.id : "#quests"}><${I.left}/>${parent ? parent.title : "퀘스트"}</a><span class="sp"></span><button class="ib" onClick=${() => openSheet(QuestMenu, {id})} aria-label="퀘스트 메뉴"><${I.more}/></button></header>
    <div class="card qhead">
      <span class="crumb">${q.parent ? "스테이지" : "메인 퀘스트"}${q.status === "done" ? ` · ${md(q.doneAt)} 달성` : q.status === "gaveup" ? " · 내려놓음" : ""}</span>
      <h2>${q.title}</h2>
      ${q.why && html`<p class="why">“${q.why}”</p>`}
      <div class="sub">${q.due && html`<span class="num ${active && q.due < t ? "lateTxt" : ""}"><${I.cal}/>${md(q.due)} 마감 · ${ddayLabel(q.due, t)}</span>`}${(q.area || []).map(a => html`<span>${AREAS[a].name}</span>`)}</div>
      <div class="prog"><div class="bar"><i style=${`width:${p.pct}%`}></i></div><span class="num">${p.pct}%</span></div>
      <p class="hint">${progText(p)}${p.st ? ` · 스테이지 ${p.sd}/${p.st}` : ""}</p>
      ${active && html`<button class="achieve" disabled=${!canDone} onClick=${() => achieve(q)}>${canDone ? (q.parent ? "스테이지 달성" : "메인 퀘스트 달성") : (p.total + p.st) === 0 ? "미션을 추가하면 달성할 수 있어요" : `남은 ${p.left}개를 끝내면 달성할 수 있어요`}</button>`}
      ${q.status !== "active" && html`<button class="btn sec" onClick=${() => reopen(q)}>다시 진행하기</button>`}
    </div>
    ${!q.parent && html`<div class="sect"><h2>스테이지</h2><span class="c num">${subs.filter(s => s.status === "done").length}/${subs.length}</span>${active && html`<button class="more" onClick=${() => openSheet(StageNew, {parent:q.id})}>+ 추가</button>`}</div>
      ${subs.length ? html`<div class="stg">${subs.map((s, i) => { const sp = qProg(S, s); return html`<div class="card ${s.status}" key=${s.id}><a href=${"#q/" + s.id}><small class="num">STAGE ${i + 1}${s.due ? ` · ${md(s.due)}` : ""}</small><b>${s.title}</b><div class="bar"><i style=${`width:${s.status === "done" ? 100 : sp.pct}%`}></i></div><small>${s.status === "done" ? "달성" : s.status === "gaveup" ? "내려놓음" : progText(sp)}</small></a>
        ${subs.length > 1 && active && html`<div class="reo h"><button class="ib sm" disabled=${i === 0} onClick=${() => moveStage(s, -1)} aria-label="앞으로"><${I.left}/></button><button class="ib sm" disabled=${i === subs.length - 1} onClick=${() => moveStage(s, 1)} aria-label="뒤로"><${I.right}/></button></div>`}</div>`; })}</div>`
        : html`<div class="card"><${Empty} title="스테이지가 없어요">큰 목표는 3~4단계로 나누면 끝까지 가기 쉬워요.</${Empty}></div>`}`}
    ${habits.length > 0 && html`<div class="sect"><h2>연결된 일일 퀘스트</h2></div><div class="card list">${habits.map(h => { const on = !!habitLog(S, h.id, t), it = {k:"h", id:h.id, title:h.title, done:on}; return html`<${Row} key=${h.id} it=${it} sub=${`${ruleLabel(h.rule)} · ${habitStreak(S, h, t)}일 연속`} onCheck=${() => toggle(it)} onOpen=${() => openItem(it)}/>`; })}</div>`}
    <div class="sect"><h2>미션</h2><span class="c num">${done.length}/${ms.length}</span>${active && html`<button class="more" onClick=${() => openSheet(QuickAdd, {quest:q.id})}>날짜와 함께 추가</button>`}</div>
    <div class="card list">${open.map(mRow)}
      ${open.length === 0 && html`<${Empty} title=${ms.length ? "남은 미션이 없어요" : "첫 미션을 적어 보세요"}>${ms.length ? (subs.length && p.left ? "스테이지를 마무리하면 달성할 수 있어요." : "") : "오늘 바로 할 수 있는 작은 행동이 좋아요."}</${Empty}>`}
      ${active && html`<form class="inline-add" onSubmit=${addOne}><input value=${add} onInput=${e => setAdd(e.target.value)} placeholder="미션 추가 (날짜 없이)" aria-label="미션 추가"/><button disabled=${!add.trim()}>추가</button></form>`}
      ${done.length > 0 && html`<button class="fold ${showDone ? "open" : ""}" aria-expanded=${showDone} onClick=${() => setShowDone(!showDone)}>완료 ${done.length}개<${I.chev}/></button>${showDone && done.map(mRow)}`}
    </div>`;
}

function StageNew({parent}){
  const [title, setTitle] = useState(""), [due, setDue] = useState("");
  const save = e => { e.preventDefault(); if (!title.trim()) return; const n = subsOf(app.S, parent).length; act(d => d.put("quests", {id:uid(), parent, title:title.trim(), due:due || null, status:"active", createdAt:Date.now(), order:n})); closeSheet(); };
  return html`<form onSubmit=${save}><${SheetHead} title="스테이지 추가"/><div class="field"><label>이름</label><input autofocus value=${title} onInput=${e => setTitle(e.target.value)} maxlength="30" placeholder="예: 기출 5회 풀기"/></div><div class="field"><label>마감 <small>(선택)</small></label><input type="date" value=${due} onInput=${e => setDue(e.target.value)}/></div><button class="btn" disabled=${!title.trim()}>추가</button></form>`;
}

function QuestMenu({id}){
  const q = get(app.S, "quests", id); const [title, setTitle] = useState(q.title), [why, setWhy] = useState(q.why || ""), [due, setDue] = useState(q.due || ""), [area, setArea] = useState(q.area || []);
  const save = () => { if (!title.trim()) return; act(d => d.patch("quests", id, {title:title.trim(), why:why.trim(), due:due || null, area})); closeSheet(); };
  const extend = n => { const base = q.due && q.due > T() ? q.due : T(); setDue(addD(base, n)); };
  return html`<${SheetHead} title=${q.parent ? "스테이지 편집" : "퀘스트 편집"}/>
    <div class="field"><label>이름</label><input value=${title} onInput=${e => setTitle(e.target.value)} maxlength="40"/></div>
    ${!q.parent && html`<div class="field"><label>이루고 싶은 이유</label><input value=${why} onInput=${e => setWhy(e.target.value)} maxlength="80"/></div>`}
    <div class="field"><label>마감</label><div class="chips"><input type="date" value=${due} onInput=${e => setDue(e.target.value)} aria-label="마감 날짜"/><${Chip} onClick=${() => extend(7)}>+1주</${Chip}><${Chip} onClick=${() => extend(30)}>+1개월</${Chip}></div></div>
    <div class="field"><label>영역</label><div class="chips">${AREA_KEYS.map(a => html`<${Chip} on=${area.includes(a)} onClick=${() => setArea(area.includes(a) ? area.filter(x => x !== a) : [...area, a].slice(-2))}>${AREAS[a].name}</${Chip}>`)}</div></div>
    <button class="btn" onClick=${save}>저장</button>
    ${q.status === "active" && html`<${Confirm} cls="btn sec" label="내려놓기" sure="기록은 남기고 내려놓을까요?" onYes=${() => { giveUp(q); closeSheet(); }}/>`}
    <${Confirm} label="삭제" sure="미션까지 모두 지울까요?" onYes=${() => { const back = q.parent ? "#q/" + q.parent : "#quests"; removeQuest(q); closeSheet(); location.hash = back; }}/>`;
}

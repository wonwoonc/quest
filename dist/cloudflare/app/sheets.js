/* 퀘스트라인 — 시트: 빠른 추가, 미션·일일 퀘스트·일정 편집, 축하 */
import {useState, useMemo, useRef, useEffect} from "./vendor/hooks.js";
import {html, I, SheetHead, closeSheet, openSheet, toast, Chip, Confirm, Avatar, ui, endParty, useUI, titleOf} from "./ui.js";
import {get, live, LV, LV_KEYS, AREAS, AREA_KEYS, ruleLabel, dayLabel, tmFmt, md, WD, EVERYDAY, addD, habitStreak, bestStreak, occursOn, habitLog, pd, dk, pad, FREE, BONUS, qProg} from "./logic.js";
import {app, act, T, uid, pass, useApp} from "./store.js";
import {addParsed, quickParse, canAdd, limits} from "./actions.js";

/* ── 빠른 추가: 한 줄(또는 여러 줄)로 미션·일일 퀘스트·일정 ── */
export function QuickAdd({quest, date, type}){
  useApp(); const [text, setText] = useState(""), [force, setForce] = useState(type || null);
  const qs = live(app.S, "quests").filter(q => q.status === "active");
  const list = useMemo(() => quickParse(text, qs).map(p => ({...p, quest:p.quest || quest || null, date:p.dateSet ? p.date : (date || p.date), dateSet:p.dateSet || !!date})), [text]);
  const one = list[0], kind = force || (one ? one.type : "m");
  const submit = e => { e && e.preventDefault(); if (!list.length) return; const r = addParsed(list, force); if (r.n) closeSheet(); else if (r.blocked) openSheet(Paywall, {reason:"habit"}); };
  const qn = id => { const q = id && get(app.S, "quests", id); return q && q.title; };
  return html`<form onSubmit=${submit}>
    <${SheetHead} title="추가하기"/>
    <textarea class="qi" rows=${Math.min(6, Math.max(1, text.split("\n").length))} autofocus placeholder="예: 내일 오후 3시 치과 / 매일 아침 7시 스트레칭" value=${text}
      onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); submit(); } }} aria-label="할 일 입력"></textarea>
    <div class="types" role="group" aria-label="종류">
      ${[["m","미션"],["h","일일 퀘스트"],["e","일정"]].map(([k, l]) => html`<${Chip} cls=${k} on=${kind === k} onClick=${() => setForce(force === k ? null : k)}>${l}</${Chip}>`)}
    </div>
    <div class="parsed" aria-live="polite">
      ${list.length > 1 ? html`<span class="tag">${list.length}개를 한 번에 추가해요</span>` : one ? html`
        ${kind === "h" ? html`<span class="tag h"><${I.repeat}/>${ruleLabel(one.rule || EVERYDAY())}</span>` : html`<span class="tag"><${I.cal}/>${quest && !one.dateSet && !date ? "날짜 없음" : dayLabel(one.date, T())}</span>`}
        ${one.time && html`<span class="tag"><${I.clock}/>${tmFmt(one.time)}${one.etime ? " ~ " + tmFmt(one.etime) : ""}</span>`}
        ${one.lv === "hard" && html`<span class="tag">어려움</span>`}
        ${one.area.map(a => html`<span class="tag">${AREAS[a].name}</span>`)}
        ${qn(one.quest) && html`<span class="tag m"><${I.flag}/>${qn(one.quest)}</span>`}` : html`<span class="hint">날짜·시간·반복은 문장에 그대로 쓰면 알아들어요.</span>`}
    </div>
    <button class="btn" disabled=${!list.length}>${list.length > 1 ? `${list.length}개 추가` : "추가"}</button>
    <p class="hint">여러 개는 줄을 바꿔 쓰세요(Shift+Enter). <code>#퀘스트이름</code>으로 연결, <code>!</code>는 어려움.</p>
  </form>`;
}

/* ── 공용 입력 ── */
const Field = ({label, children}) => html`<div class="field"><label>${label}</label>${children}</div>`;
const AreaPick = ({value = [], onChange}) => html`<div class="chips">${AREA_KEYS.map(a => html`<${Chip} on=${value.includes(a)} onClick=${() => onChange(value.includes(a) ? value.filter(x => x !== a) : [...value, a].slice(-2))}>${AREAS[a].name}</${Chip}>`)}</div>`;
const LvPick = ({value, onChange}) => html`<div class="chips">${LV_KEYS.map(k => html`<${Chip} on=${value === k} onClick=${() => onChange(k)}>${LV[k]}</${Chip}>`)}</div>`;
export function QuestPick({value, onChange, allowNone = true}){
  const mains = live(app.S, "quests").filter(q => !q.parent && q.status === "active").sort((a, b) => (a.order || 0) - (b.order || 0));
  return html`<select value=${value || ""} onChange=${e => onChange(e.target.value || null)}>
    ${allowNone && html`<option value="">연결 안 함</option>`}
    ${mains.map(q => html`<option value=${q.id}>${q.title}</option>${live(app.S, "quests").filter(s => s.parent === q.id && s.status === "active").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => html`<option value=${s.id}>　└ ${s.title}</option>`)}`)}
  </select>`;
}
function RulePick({rule, onChange}){
  const r = rule || EVERYDAY(), set = x => onChange({...x});
  return html`<div>
    <div class="chips">${[["week","요일마다"],["biweek","격주"],["month","매달"],["every","N일마다"]].map(([k, l]) => html`<${Chip} on=${r.type === k} onClick=${() => set(k === "week" ? EVERYDAY() : k === "biweek" ? {type:"biweek", days:[pd(T()).getDay()], anchor:T()} : k === "month" ? {type:"month", dates:[pd(T()).getDate()]} : {type:"every", n:2, anchor:T()})}>${l}</${Chip}>`)}</div>
    ${(r.type === "week" || r.type === "biweek") && html`<div class="wdpick">${WD.map((w, i) => html`<button type="button" class=${i === 0 ? "sun" : i === 6 ? "sat" : ""} aria-pressed=${r.days.includes(i)} onClick=${() => { const days = r.days.includes(i) ? r.days.filter(x => x !== i) : [...r.days, i].sort(); if (days.length) set({...r, days}); }}>${w}</button>`)}</div>`}
    ${r.type === "month" && html`<div class="mdpick">${Array.from({length:31}, (_, i) => i + 1).map(n => html`<button type="button" aria-pressed=${r.dates.includes(n)} onClick=${() => { const dates = r.dates.includes(n) ? r.dates.filter(x => x !== n) : [...r.dates, n].sort((a, b) => a - b); if (dates.length) set({...r, dates}); }}>${n}</button>`)}</div>`}
    ${r.type === "every" && html`<div class="stepper"><button type="button" onClick=${() => set({...r, n:Math.max(2, r.n - 1)})} aria-label="줄이기">−</button><b class="num">${r.n}일마다</b><button type="button" onClick=${() => set({...r, n:Math.min(60, r.n + 1)})} aria-label="늘리기">+</button></div>`}
    <p class="hint">${ruleLabel(r)}</p>
  </div>`;
}
const DateIn = ({value, onChange, none = "날짜 없음"}) => html`<div class="dtrow"><input type="date" value=${value || ""} onInput=${e => onChange(e.target.value || null)}/>${value && html`<button type="button" class="chip" onClick=${() => onChange(null)}>${none}</button>`}${!value && html`<button type="button" class="chip" onClick=${() => onChange(T())}>오늘</button><button type="button" class="chip" onClick=${() => onChange(addD(T(), 1))}>내일</button>`}</div>`;
const TimeIn = ({value, end, onChange, onEnd}) => html`<div class="dtrow"><input type="time" step="300" value=${value || ""} onInput=${e => onChange(e.target.value)} aria-label="시작 시간"/>${onEnd && html`<span class="muted">~</span><input type="time" step="300" value=${end || ""} disabled=${!value} onInput=${e => onEnd(e.target.value)} aria-label="끝 시간"/>`}${value && html`<button type="button" class="chip" onClick=${() => { onChange(""); onEnd && onEnd(""); }}>시간 없음</button>`}</div>`;

/* ── 미션 편집 ── */
export function MissionEdit({id}){
  const m0 = get(app.S, "missions", id); const [m, setM] = useState(m0 ? {...m0, checklist:m0.checklist || []} : null), [nc, setNc] = useState("");
  if (!m) return html`<${SheetHead} title="미션"/><p class="hint">삭제된 미션이에요.</p>`;
  const up = ch => setM({...m, ...ch});
  const save = () => { if (!m.title.trim()) return; act(d => d.put("missions", {...m, title:m.title.trim(), etime:m.time ? m.etime : ""})); closeSheet(); };
  const addCk = () => { if (!nc.trim()) return; up({checklist:[...m.checklist, {id:uid(), t:nc.trim(), done:false}]}); setNc(""); };
  return html`<${SheetHead} title="미션"/>
    <input class="title-in" value=${m.title} onInput=${e => up({title:e.target.value})} aria-label="제목"/>
    <${Field} label="날짜"><${DateIn} value=${m.due} onChange=${v => up({due:v})}/></${Field}>
    <${Field} label="시간"><${TimeIn} value=${m.time} end=${m.etime} onChange=${v => up({time:v})} onEnd=${v => up({etime:v})}/></${Field}>
    <${Field} label="체크리스트">
      <div class="cklist">${m.checklist.map((c, i) => html`<div class="ckit"><button type="button" class="ck sm ${c.done ? "on" : ""}" aria-pressed=${c.done} onClick=${() => up({checklist:m.checklist.map((x, j) => j === i ? {...x, done:!x.done} : x)})} aria-label="체크"><${I.check}/></button><input value=${c.t} onInput=${e => up({checklist:m.checklist.map((x, j) => j === i ? {...x, t:e.target.value} : x)})} aria-label="항목"/><button type="button" class="ib sm" onClick=${() => up({checklist:m.checklist.filter((_, j) => j !== i)})} aria-label="항목 삭제"><${I.x}/></button></div>`)}
      <div class="ckit add"><span class="ck sm ghost"></span><input placeholder="항목 추가" value=${nc} onInput=${e => setNc(e.target.value)} onKeyDown=${e => { if (e.key === "Enter" && !e.isComposing){ e.preventDefault(); addCk(); } }}/></div></div>
    </${Field}>
    <${Field} label="난이도"><${LvPick} value=${m.lv || "normal"} onChange=${v => up({lv:v})}/></${Field}>
    <${Field} label="영역"><${AreaPick} value=${m.area || []} onChange=${v => up({area:v})}/></${Field}>
    <${Field} label="퀘스트"><${QuestPick} value=${m.quest} onChange=${v => up({quest:v})}/></${Field}>
    <${Field} label="메모"><textarea rows="3" value=${m.note || ""} onInput=${e => up({note:e.target.value})} placeholder="자세한 내용"></textarea></${Field}>
    <button class="btn" onClick=${save}>저장</button>
    <${Confirm} label="삭제" sure="정말 삭제할까요?" onYes=${() => { const undo = act(d => d.del("missions", id)); closeSheet(); toast("삭제했어요", undo); }}/>`;
}

/* ── 일정 편집 ── */
export function EventEdit({id}){
  const e0 = get(app.S, "events", id); const [e, setE] = useState(e0 ? {...e0} : null);
  if (!e) return html`<${SheetHead} title="일정"/><p class="hint">삭제된 일정이에요.</p>`;
  const up = ch => setE({...e, ...ch});
  const save = () => { if (!e.title.trim()) return; act(d => d.put("events", {...e, title:e.title.trim(), allDay:!e.time, end:e.end && e.end > e.date ? e.end : null})); closeSheet(); };
  return html`<${SheetHead} title="일정"/>
    <input class="title-in" value=${e.title} onInput=${x => up({title:x.target.value})} aria-label="제목"/>
    <${Field} label="날짜"><div class="dtrow"><input type="date" value=${e.date} onInput=${x => x.target.value && up({date:x.target.value})}/><span class="muted">~</span><input type="date" value=${e.end || ""} min=${e.date} onInput=${x => up({end:x.target.value || null})} aria-label="끝 날짜"/></div></${Field}>
    <${Field} label="시간"><${TimeIn} value=${e.time} end=${e.etime} onChange=${v => up({time:v})} onEnd=${v => up({etime:v})}/></${Field}>
    <${Field} label="장소"><input value=${e.place || ""} onInput=${x => up({place:x.target.value})} placeholder="선택"/></${Field}>
    <${Field} label="메모"><textarea rows="3" value=${e.note || ""} onInput=${x => up({note:x.target.value})}></textarea></${Field}>
    <button class="btn" onClick=${save}>저장</button>
    <${Confirm} label="삭제" sure="정말 삭제할까요?" onYes=${() => { const undo = act(d => d.del("events", id)); closeSheet(); toast("삭제했어요", undo); }}/>`;
}

/* ── 일일 퀘스트 편집 + 올해 기록 ── */
export function HabitEdit({id}){
  useApp(); const h0 = get(app.S, "habits", id); const [h, setH] = useState(h0 ? {...h0} : null);
  if (!h) return html`<${SheetHead} title="일일 퀘스트"/><p class="hint">삭제된 일일 퀘스트예요.</p>`;
  const up = ch => setH({...h, ...ch}), t = T();
  const save = () => { if (!h.title.trim()) return; act(d => d.put("habits", {...h, title:h.title.trim()})); closeSheet(); };
  const total = live(app.S, "logs").filter(l => l.habit === id).length;
  const togglePause = () => { if (h.paused && !pass() && limits().habits >= FREE.habits){ openSheet(Paywall, {reason:"habit"}); return; } act(d => d.patch("habits", id, {paused:!h.paused})); up({paused:!h.paused}); toast(h.paused ? "다시 시작했어요" : "잠시 멈췄어요. 연속 기록은 그대로예요."); };
  return html`<${SheetHead} title="일일 퀘스트"/>
    <div class="hstat"><div><b class="num">${habitStreak(app.S, h0, t)}</b><small>연속</small></div><div><b class="num">${total}</b><small>누적</small></div><div><b class="num">${bestOf(id)}</b><small>최고 연속</small></div></div>
    <${YearDots} hid=${id}/>
    <input class="title-in" value=${h.title} onInput=${e => up({title:e.target.value})} aria-label="제목"/>
    <${Field} label="반복"><${RulePick} rule=${h.rule} onChange=${r => up({rule:r})}/></${Field}>
    <${Field} label="시간"><${TimeIn} value=${h.time} onChange=${v => up({time:v})}/></${Field}>
    <${Field} label="난이도"><${LvPick} value=${h.lv || "easy"} onChange=${v => up({lv:v})}/></${Field}>
    <${Field} label="영역"><${AreaPick} value=${h.area || []} onChange=${v => up({area:v})}/></${Field}>
    <${Field} label="퀘스트"><${QuestPick} value=${h.quest} onChange=${v => up({quest:v})}/></${Field}>
    <button class="btn" onClick=${save}>저장</button>
    <button class="btn sec" onClick=${togglePause}>${h.paused ? "다시 시작" : "잠시 멈추기"}</button>
    <${Confirm} label="삭제" sure="기록까지 모두 지울까요?" onYes=${() => { const undo = act(d => { d.del("habits", id); }); closeSheet(); toast("삭제했어요", undo); }}/>`;
}
function bestOf(hid){ const days = live(app.S, "logs").filter(l => l.habit === hid).map(l => l.date).sort(); const h = get(app.S, "habits", hid); let best = 0, cur = 0, prev = null;
  for (const d of days){ let gap = prev ? addD(prev, 1) : null; while (gap && gap < d && !occursOn(h.rule, gap)) gap = addD(gap, 1); cur = prev && gap === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; } return best; }
export function YearDots({hid, year}){
  const y = year || +T().slice(0, 4), t = T(), start = `${y}-01-01`, first = pd(start).getDay(), h = get(app.S, "habits", hid);
  const cells = []; for (let i = 0; i < first; i++) cells.push(html`<i class="e"></i>`);
  for (let d = start; d.slice(0, 4) === String(y); d = addD(d, 1)) { const on = !!habitLog(app.S, hid, d), due = h && occursOn(h.rule, d) && d >= (h.start || ""); cells.push(html`<i class=${`${on ? "on" : d > t ? "fu" : due ? "" : "off"} ${d === t ? "t" : ""}`} title=${d}></i>`); }
  return html`<div class="year" aria-label=${`${y}년 기록`}><div class="ygrid">${cells}</div><div class="ylab">${Array.from({length:12}, (_, i) => html`<span>${i + 1}월</span>`)}</div></div>`;
}

/* ── 패스 안내 ── */
export const PERKS = [`메인 퀘스트 제한 없이 (무료 ${FREE.quests}개)`, `일일 퀘스트 제한 없이 (무료 ${FREE.habits}개)`, "AI 퀘스트 설계 하루 20번 (무료 1번 체험)", "매달 휴식권 4장 (무료 1장)", "월간 리포트와 영역 밸런스"];
export function Paywall({reason}){
  const msg = reason === "quest" ? `무료 플랜은 진행 중인 메인 퀘스트 ${FREE.quests}개까지예요.` : reason === "habit" ? `무료 플랜은 일일 퀘스트 ${FREE.habits}개까지예요.` : reason === "ai" ? "AI 퀘스트 설계는 패스에서 넉넉하게 쓸 수 있어요." : reason === "report" ? "주간·월간 리포트 전체는 패스에서 볼 수 있어요." : "";
  return html`<${SheetHead} title="퀘스트라인 패스"/>
    ${msg && html`<p class="lead">${msg}</p>`}
    <ul class="perks">${PERKS.map(p => html`<li><${I.ok}/>${p}</li>`)}</ul>
    <button class="btn" onClick=${() => { closeSheet(); location.hash = "#me/pass"; }}>요금 보기</button>`;
}

/* ── 축하(레벨업·하루 클리어·퀘스트 달성) ── */
export function PartyHost(){
  useUI(); const p = ui.party; const ref = useRef(null);
  useEffect(() => { if (p && ref.current) ref.current.focus(); }, [p]);
  if (!p) return null;
  const S = app.S, L = p.L;
  const body = p.kind === "level" ? html`<div class="ring"><div><span><small>LEVEL</small><b>${L}</b></span></div></div><h3>레벨 ${L} 달성</h3><p>${titleOf(L) !== titleOf(L - 1) ? `새 칭호 '${titleOf(L)}'` : `보너스 코인 ${L * 10}개`}${[5, 10, 15, 20, 30].includes(L) ? " · 캐릭터에 새 장식이 생겼어요" : ""}</p>`
    : p.kind === "clear" ? html`<div class="burst"><${I.trophy}/></div><h3>오늘 할 일 클리어</h3><p>보너스 +${BONUS.clear.xp} XP · ${BONUS.clear.c}코인</p>`
    : html`<div class="burst"><${I.flag}/></div><h3>메인 퀘스트 달성</h3><p class="qt">${p.q && p.q.title}</p>${p.q && recap(S, p.q)}<p>보너스 +${BONUS.main.xp} XP · ${BONUS.main.c}코인</p>`;
  return html`<div class="lvup" onClick=${e => e.target === e.currentTarget && endParty()}><div class="box" role="dialog" aria-modal="true" aria-label="축하">${confetti()}${body}<button class="btn" ref=${ref} onClick=${endParty}>좋아요</button></div></div>`;
}
function recap(S, q){ const p = qProg(S, q), days = q.createdAt ? Math.max(1, Math.round((Date.now() - q.createdAt) / 864e5)) : null;
  return html`<div class="recap"><div><b class="num">${days || "-"}</b><small>일 동안</small></div><div><b class="num">${p.total}</b><small>미션</small></div><div><b class="num">${p.st}</b><small>스테이지</small></div></div>`; }
const confetti = () => html`<div class="confetti" aria-hidden="true">${Array.from({length:18}, (_, i) => html`<i style=${`--x:${(i * 37) % 100}%;--d:${(i % 6) * .08}s;--c:${["var(--accent)", "var(--habit)", "var(--event)", "var(--gold)"][i % 4]}`}></i>`)}</div>`;

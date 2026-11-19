/* 퀘스트라인 — 공통 화면 부품(아이콘, 시트, 알림, 줄, 캐릭터) */
import {h} from "./vendor/preact.js";
import {useState, useEffect, useRef} from "./vendor/hooks.js";
import htm from "./vendor/htm.js";
import {levelOf, TITLES, tmFmt, dayLabel} from "./logic.js";
import {app, T} from "./store.js";
export const html = htm.bind(h);

/* ── 아이콘(SVG) ── */
const P = (d, w = 2) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{__html:d}}></svg>`;
export const I = {
  today:() => P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  quests:() => P('<path d="M5 21V4h12l-2.5 4.5L17 13H5"/>'),
  record:() => P('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>'),
  me:() => P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  plus:() => P('<path d="M12 5v14M5 12h14"/>', 2.6), check:() => P('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3.2),
  chev:() => P('<path d="M6 9l6 6 6-6"/>', 2.4), left:() => P('<path d="M15 6l-6 6 6 6"/>', 2.4), right:() => P('<path d="M9 6l6 6-6 6"/>', 2.4), x:() => P('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
  edit:() => P('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/>'), trash:() => P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  clock:() => P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), cal:() => P('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>'),
  repeat:() => P('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  flag:() => P('<path d="M5 21V4h12l-2.5 4.5L17 13H5"/>', 2.4), lock:() => P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  ok:() => P('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6), bell:() => P('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/>'),
  trophy:() => P('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>'),
  more:() => P('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', 2.6),
  inbox:() => P('<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5"/>'), arrowR:() => P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  download:() => P('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'), pause:() => P('<path d="M9 5v14M15 5v14"/>', 2.6), play:() => P('<path d="M7 5l12 7-12 7z"/>'),
  spark:() => html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7"/></svg>`,
  fire:() => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EE8420" d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .1 1.6.8 2.7 2 3.2C11 8.5 11 5 12 2z"/></svg>`,
  coin:() => html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#E8B23A"/><circle cx="12" cy="12" r="6" fill="none" stroke="#B9851A" stroke-width="1.6"/></svg>`,
  shield:() => html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#3B78DD" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" fill="#3B78DD" fill-opacity=".18"/></svg>`,
};

/* ── 시트·알림·축하 ── */
export const ui = {sheet:null, toast:null, party:null};
const uiSubs = new Set();
const uiEmit = () => uiSubs.forEach(f => f(Math.random()));
export function useUI(){ const [, s] = useState(0); useEffect(() => { uiSubs.add(s); s(Math.random()); return () => uiSubs.delete(s); }, []); return ui; }
export const openSheet = (C, props = {}) => { ui.sheet = {C, props, k:Math.random()}; uiEmit(); };
export const closeSheet = () => { ui.sheet = null; uiEmit(); };
let tt = null;
export function toast(text, undo){ ui.toast = {text, undo, k:Math.random()}; uiEmit(); clearTimeout(tt); tt = setTimeout(() => { ui.toast = null; uiEmit(); }, undo ? 5000 : 2600); }
export const party = p => { ui.party = p; uiEmit(); };
export const endParty = () => { ui.party = null; uiEmit(); };

export function SheetHost(){
  useUI(); const s = ui.sheet, ref = useRef(null);
  useEffect(() => { if (!s) return; const k = e => { if (e.key === "Escape") closeSheet(); }; addEventListener("keydown", k); const f = ref.current && ref.current.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 60); return () => removeEventListener("keydown", k); }, [s && s.k]);
  if (!s) return null;
  return html`<div class="scrim" onClick=${e => e.target === e.currentTarget && closeSheet()}><div class="sheet" role="dialog" aria-modal="true" ref=${ref}><div class="grab"></div><${s.C} ...${s.props} key=${s.k}/></div></div>`;
}
export const SheetHead = ({title, children}) => html`<div class="sh-head"><h3>${title}</h3>${children}<button class="ib" onClick=${closeSheet} aria-label="닫기"><${I.x}/></button></div>`;
export function ToastHost(){ useUI(); const t = ui.toast; if (!t) return null;
  return html`<div class="toast" role="status" key=${t.k}><span>${t.text}</span>${t.undo && html`<button onClick=${() => { t.undo(); ui.toast = null; uiEmit(); }}>되돌리기</button>`}</div>`; }

/* ── XP 떠오르기 ── */
let pt = {x:innerWidth / 2, y:innerHeight / 2};
addEventListener("pointerdown", e => { pt = {x:e.clientX, y:e.clientY}; }, true);
export function float(text, kind){ const d = document.createElement("div"); d.className = "xpf " + (kind || ""); d.textContent = text; d.style.left = pt.x + "px"; d.style.top = (pt.y - 18) + "px"; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); try { navigator.vibrate && navigator.vibrate(10); } catch (_) {} }

/* ── 캐릭터 ── */
export const titleOf = L => TITLES.reduce((a, [l, t]) => L >= l ? t : a, TITLES[0][1]);
export function Avatar({size = 76, L = 1, hue = 152}){
  const body = `hsl(${hue} 62% 38%)`, soft = `hsl(${hue} 50% 88%)`;
  return html`<svg viewBox="0 0 100 100" width=${size} height=${size} aria-hidden="true" class="avatar">
    <circle cx="50" cy="104" r="46" fill=${soft}/>
    ${L >= 5 && html`<path d="M27 68 Q50 54 73 68 L82 100 L18 100z" fill="#D9534F" opacity=".9"/>`}
    <rect x="32" y="62" width="36" height="38" rx="14" fill=${body}/>
    ${L >= 15 && html`<rect x="32" y="74" width="36" height="5" fill="#E8B23A"/>`}
    <circle cx="50" cy="44" r="20" fill="#F6D2B4"/>
    <path d="M30 42 Q32 22 50 22 Q68 22 70 42 Q62 32 50 34 Q38 32 30 42z" fill="#3A2A22"/>
    <circle cx="43" cy="46" r="2.4" fill="#2A1E18"/><circle cx="57" cy="46" r="2.4" fill="#2A1E18"/>
    <path d="M45 53 Q50 57 55 53" stroke="#2A1E18" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${L >= 10 && html`<path d="M37 24 L41 14 L46 21 L50 11 L54 21 L59 14 L63 24z" fill="#E8B23A"/>`}
    ${L >= 20 && html`<path d="M82 16l2.4 6.6L91 25l-6.6 2.4L82 34l-2.4-6.6L73 25l6.6-2.4z" fill="#E8B23A"/>`}
    ${L >= 30 && html`<circle cx="50" cy="44" r="27" fill="none" stroke="#E8B23A" stroke-width="1.6" stroke-dasharray="3 4" opacity=".8"/>`}
  </svg>`;
}

/* ── 할 일 한 줄: 체크, 밀어서 완료/미루기 ── */
export function Row({it, onCheck, onOpen, onSwipeLeft, readonly, sub}){
  const ref = useRef(null), st = useRef(null), [dx, setDx] = useState(0);
  const kind = it.k === "h" ? "habit" : it.k === "e" ? "event" : "mission";
  const down = e => { if (readonly || e.button > 0 || e.target.closest("button")) return; st.current = {x:e.clientX, y:e.clientY, on:false}; };
  const move = e => { const s = st.current; if (!s) return; const x = e.clientX - s.x, y = e.clientY - s.y; if (!s.on){ if (Math.abs(y) > 10) { st.current = null; return; } if (Math.abs(x) > 12) { s.on = true; try { ref.current.setPointerCapture(e.pointerId); } catch (_) {} } } if (s.on){ e.preventDefault(); setDx(Math.max(onSwipeLeft ? -110 : 0, Math.min(110, x))); } };
  const up = () => { const s = st.current; st.current = null; if (!s || !s.on){ setDx(0); return; } if (dx > 80) onCheck && onCheck(); else if (dx < -80 && onSwipeLeft) onSwipeLeft(); setDx(0); s.swiped = true; ref.current && (ref.current.dataset.swiped = "1"); setTimeout(() => ref.current && delete ref.current.dataset.swiped, 50); };
  const click = e => { if (ref.current && ref.current.dataset.swiped) return; if (e.target.closest(".ck")) return; onOpen && onOpen(); };
  return html`<div class="rowwrap">
    <div class="swipe-bg ${dx > 0 ? "ok" : dx < 0 ? "later" : ""}" aria-hidden="true">${dx > 0 ? html`<span>${it.done ? "되돌리기" : "완료"}</span>` : dx < 0 ? html`<span style="margin-left:auto">내일로</span>` : ""}</div>
    <div class="row ${it.done ? "done" : ""}" ref=${ref} style=${dx ? `transform:translateX(${dx}px)` : ""} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onClick=${click} role="button" tabindex="0" onKeyDown=${e => (e.key === "Enter") && onOpen && onOpen()}>
      <button class="ck ${kind} ${it.done ? "on" : ""}" disabled=${readonly} onClick=${e => { e.stopPropagation(); onCheck && onCheck(); }} aria-pressed=${!!it.done} aria-label=${`${it.title} ${it.done ? "완료 취소" : "완료"}`}><${I.check}/></button>
      <span class="t"><b>${it.title}</b><small>${it.k === "h" ? html`<span class="tag h">일일</span>` : it.k === "e" ? html`<span class="tag e">일정</span>` : html`<span class="tag m">미션</span>`}
        ${it.late && html`<span class="tag late">${dayLabel(it.due, T())} 미완료</span>`}${it.etime && it.time && html`<span>~ ${tmFmt(it.etime)}</span>`}${it.check && it.check.length ? html`<span>☐ ${it.check.filter(c => c.done).length}/${it.check.length}</span>` : ""}${sub && html`<span class="qn">${sub}</span>`}</small></span>
      ${it.time ? html`<span class="tm num">${tmFmt(it.time)}</span>` : it.allDay ? html`<span class="tm">종일</span>` : ""}
    </div></div>`;
}

export const Empty = ({title, children, action}) => html`<div class="empty"><b>${title}</b><span>${children}</span>${action}</div>`;
export const Seg = ({value, options, onChange, label}) => html`<div class="seg" role="group" aria-label=${label}>${options.map(([v, l]) => html`<button type="button" aria-pressed=${value === v} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;
export const Chip = ({on, onClick, children, cls = ""}) => html`<button type="button" class="chip ${cls}" aria-pressed=${!!on} onClick=${onClick}>${children}</button>`;
export function Confirm({label, sure, onYes, cls = "btn sec danger"}){ const [s, set] = useState(false); return html`<button type="button" class=${cls} onClick=${() => s ? onYes() : set(true)}>${s ? sure : label}</button>`; }
export const levelInfo = () => { const t = levelOf(0); return t; };

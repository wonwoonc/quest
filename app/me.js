/* 퀘스트라인 — 나: 캐릭터, 능력치, 휴식권, 보상 상점, 패스, 설정 */
import {useState, useEffect} from "./vendor/hooks.js";
import {html, I, Avatar, titleOf, openSheet, closeSheet, SheetHead, toast, Chip, Confirm, Empty} from "./ui.js";
import {live, get, AREAS, AREA_KEYS, SHIELD, PRICES, streak, bestStreak, md, FREE} from "./logic.js";
import {app, useApp, act, T, uid, pass, sum, LS, loadEnt, signedOut, event} from "./store.js";
import {auth, store as cloud, api} from "./cloud.js";
import {buy, buyShield, limits} from "./actions.js";
import {pushState, enablePush, disablePush} from "./push.js";
import {PERKS} from "./sheets.js";
import {PREVIEW} from "./config.js";

export function Me({sub}){
  useApp(); const S = app.S, s = sum(), t = T(), [shop, setShop] = useState("do");
  useEffect(() => { if (sub === "pass") { openSheet(Pass); history.replaceState(null, "", "#me"); } }, [sub]);
  const rewards = live(S, "rewards").filter(r => (r.type || "do") === shop).sort((a, b) => a.cost - b.cost), buys = live(S, "buys").sort((a, b) => (b.at || 0) - (a.at || 0));
  const e = app.ent;
  return html`<header class="top"><h1>나</h1><button class="ib" onClick=${() => openSheet(Settings)} aria-label="설정"><${I.more}/></button></header>
    <div class="card me"><div class="av"><${Avatar} L=${s.level.L} hue=${S.profile.hue} size=${110}/></div>
      <div><div class="nm"><b>${S.profile.name}</b><span class="lv">Lv${s.level.L}</span></div><small class="ttl">${titleOf(s.level.L)}</small>
        <div class="bar"><i style=${`width:${s.level.pct}%`}></i></div><small class="num muted">다음 레벨까지 ${s.level.need - s.level.rest} XP</small>
        <div class="stats"><span><${I.fire}/><b>${streak(S, t)}</b>일 연속</span><span>최고 <b>${bestStreak(S)}</b>일</span></div></div></div>
    <div class="sect"><h2>능력치</h2><span class="c">완료한 일의 영역에 따라 자라요</span></div>
    <div class="card pad"><${Radar} stats=${s.stats}/></div>
    <div class="sect"><h2>지갑</h2></div>
    <div class="wallet"><div class="card"><${I.coin}/><b class="num">${s.coins}</b><small>코인</small></div>
      <button class="card" onClick=${() => openSheet(Shields)}><${I.shield}/><b class="num">${s.shields}</b><small>휴식권</small></button></div>
    ${!pass() ? html`<button class="passcard" onClick=${() => openSheet(Pass)}><${I.spark}/><span><b>퀘스트라인 패스</b><small>제한 없이, AI 설계와 월간 리포트까지 · 연간은 7일 무료 체험</small></span><${I.right}/></button>`
      : html`<button class="card passon" onClick=${() => openSheet(Pass)}><${I.spark}/><span><b>패스 이용 중</b><small>${e.status === "canceled" ? `${md(e.period_end.slice(0, 10))}까지 · 해지 예약됨` : e.status === "trialing" ? `무료 체험 · ${md(e.period_end.slice(0, 10))} 첫 결제` : `다음 결제 ${md(e.period_end.slice(0, 10))}`}</small></span><${I.right}/></button>`}
    <div class="sect"><h2>보상 상점</h2><span class="c">코인으로 나에게 주는 선물</span><button class="more" onClick=${() => openSheet(RewardEdit, {type:shop === "log" ? "do" : shop})}>+ 보상</button></div>
    <div class="shop-tabs" role="tablist">${[["do","즐길 거리"],["get","갖고 싶은 것"],["log","받은 보상"]].map(([k, l]) => html`<button class="chip" role="tab" aria-pressed=${shop === k} onClick=${() => setShop(k)}>${l}</button>`)}</div>
    ${shop === "log" ? (buys.length ? html`<div class="card list">${buys.slice(0, 50).map(b => html`<div class="row static"><span class="t"><b>${b.name}</b><small>${md(b.date)}</small></span><span class="cost num"><${I.coin}/>${b.cost}</span></div>`)}</div>` : html`<div class="card"><${Empty} title="아직 받은 보상이 없어요">코인이 모이면 나에게 선물해 보세요.</${Empty}></div>`)
      : rewards.length ? html`<div class="rw">${rewards.map(r => html`<div class="card" key=${r.id}><button class="rwb" onClick=${() => openSheet(RewardEdit, {id:r.id})} aria-label=${r.name + " 편집"}><b>${r.name}</b></button><span class="cost num"><${I.coin}/>${r.cost}</span><button class="pill sm ${s.coins < r.cost ? "dis" : ""}" onClick=${() => buy(r)}>${s.coins < r.cost ? `${r.cost - s.coins} 부족` : "받기"}</button></div>`)}</div>`
      : html`<div class="card"><${Empty} title="보상을 만들어 보세요">예: 치킨 먹기 200코인, 새 운동화 1500코인</${Empty}></div>`}`;
}

/* 오각형 능력치 */
function Radar({stats}){
  const ks = AREA_KEYS, max = Math.max(10, ...ks.map(k => stats[k])), R = 70, c = 100, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / ks.length; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const poly = r => ks.map((_, i) => pt(i, r).join(",")).join(" "), val = ks.map((k, i) => pt(i, Math.max(.06, stats[k] / max) * R).join(",")).join(" ");
  return html`<svg viewBox="0 0 200 200" class="radar" role="img" aria-label=${ks.map(k => `${AREAS[k].stat} ${stats[k]}`).join(", ")}>
    ${[1, .66, .33].map(f => html`<polygon points=${poly(R * f)} fill="none" stroke="var(--line)" stroke-width="1"/>`)}
    <polygon points=${val} fill="color-mix(in srgb,var(--accent) 26%,transparent)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${ks.map((k, i) => { const [x, y] = pt(i, R + 18); return html`<text x=${x} y=${y} text-anchor="middle" dominant-baseline="middle" class="rl">${AREAS[k].stat}<tspan class="rv" dx="3">${stats[k]}</tspan></text>`; })}
  </svg>`;
}

function Shields(){
  useApp(); const s = sum();
  return html`<${SheetHead} title="휴식권"/>
    <p class="lead">쉬어 가는 날에 쓰면 연속 기록이 끊기지 않아요. 하루를 놓친 다음 날, 오늘 화면에서 쓸 수 있어요.</p>
    <div class="kpis two"><div class="kpi"><b class="num">${s.shields}</b><small>보유 (최대 ${SHIELD.max})</small></div><div class="kpi"><b class="num">${pass() ? SHIELD.passPerMonth : SHIELD.freePerMonth}</b><small>매달 받는 수</small></div></div>
    <button class="btn" onClick=${buyShield} disabled=${s.shields >= SHIELD.max}><${I.coin}/>${SHIELD.cost}코인으로 1장 사기</button>
    ${!pass() && html`<p class="hint">패스는 매달 ${SHIELD.passPerMonth}장을 받아요.</p>`}`;
}

function RewardEdit({id, type}){
  const r0 = id && get(app.S, "rewards", id); const [name, setName] = useState(r0 ? r0.name : ""), [cost, setCost] = useState(r0 ? r0.cost : 100), [tp, setTp] = useState(r0 ? r0.type || "do" : type || "do");
  const save = e => { e.preventDefault(); if (!name.trim()) return; act(d => d.put("rewards", {id:r0 ? r0.id : uid(), name:name.trim(), cost:Math.max(1, Math.min(99999, +cost || 1)), type:tp})); closeSheet(); };
  return html`<form onSubmit=${save}><${SheetHead} title=${r0 ? "보상 편집" : "새 보상"}/>
    <div class="field"><label>이름</label><input autofocus value=${name} onInput=${e => setName(e.target.value)} maxlength="30" placeholder="예: 늦잠 자기"/></div>
    <div class="field"><label>종류</label><div class="chips"><${Chip} on=${tp === "do"} onClick=${() => setTp("do")}>즐길 거리</${Chip}><${Chip} on=${tp === "get"} onClick=${() => setTp("get")}>갖고 싶은 것</${Chip}></div></div>
    <div class="field"><label>가격(코인)</label><div class="chips"><input type="number" inputmode="numeric" min="1" max="99999" value=${cost} onInput=${e => setCost(e.target.value)}/>${[50, 200, 1000].map(n => html`<${Chip} on=${+cost === n} onClick=${() => setCost(n)}>${n}</${Chip}>`)}</div><p class="hint">미션 하나에 보통 2~8코인, 하루 클리어에 10코인을 받아요.</p></div>
    <button class="btn" disabled=${!name.trim()}>저장</button>
    ${r0 && html`<${Confirm} label="삭제" sure="정말 삭제할까요?" onYes=${() => { const undo = act(d => d.del("rewards", id)); closeSheet(); toast("삭제했어요", undo); }}/>`}</form>`;
}

/* ── 패스: 요금 선택 → 포트원 카드 등록 → 서버가 결제·예약 ── */
let sdk = null;
const loadSdk = () => sdk || (sdk = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdn.portone.io/v2/browser-sdk.js"; s.onload = () => ok(window.PortOne); s.onerror = () => { sdk = null; no(new Error("결제창을 불러오지 못했어요.")); }; document.head.appendChild(s); }));
export function Pass(){
  useApp(); const e = app.ent, [iv, setIv] = useState("year"), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [pays, setPays] = useState(null);
  useEffect(() => { if (auth.user && pass()) cloud.payments().then(setPays).catch(() => setPays([])); }, [e.status]);
  const trial = iv === "year" && !e.trialUsed;
  const go = async () => {
    if (PREVIEW){ toast("결제는 정식 주소에서 할 수 있어요"); return; }
    if (!auth.user){ closeSheet(); location.hash = "#auth"; toast("결제하려면 먼저 로그인해 주세요"); return; }
    setBusy(true); setMsg("");
    try {
      const cfg = await api("config"); if (!cfg.ready || !cfg.ready.pay) throw new Error("결제 준비가 아직 끝나지 않았어요. 곧 열릴 예정이에요.");
      const PortOne = await loadSdk();
      const r = await PortOne.requestIssueBillingKey({storeId:cfg.storeId, channelKey:cfg.channelKey, billingKeyMethod:"CARD", issueId:"ql-" + uid(), issueName:iv === "year" ? "퀘스트라인 패스 연간" : "퀘스트라인 패스 월간", customer:{customerId:auth.user.id, email:auth.user.email || undefined}, redirectUrl:location.origin + location.pathname + "#me/pass"});
      if (!r || r.code || !r.billingKey) throw new Error(r && r.message || "카드 등록을 취소했어요.");
      const out = await api("subscribe", {billingKey:r.billingKey, interval:iv});
      await loadEnt(); event("subscribe_" + iv);
      toast(out.trial ? "7일 무료 체험을 시작했어요" : out.resumed ? "패스를 다시 이어 가요" : "패스를 시작했어요");
    } catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };
  const cancel = async () => { setBusy(true); setMsg(""); try { await api("cancel", {}); await loadEnt(); toast("해지를 예약했어요. 남은 기간은 그대로 쓸 수 있어요."); } catch (x) { setMsg(x.message); } finally { setBusy(false); } };
  if (pass()) return html`<${SheetHead} title="퀘스트라인 패스"/>
    <div class="kpis two"><div class="kpi"><b>${e.interval === "year" ? "연간" : "월간"}</b><small>${e.status === "trialing" ? "무료 체험 중" : e.status === "canceled" ? "해지 예약" : e.status === "past_due" ? "결제 확인 필요" : "이용 중"}</small></div><div class="kpi"><b class="num">${md(e.period_end.slice(0, 10))}</b><small>${e.status === "canceled" ? "이용 종료일" : "다음 결제일"}</small></div></div>
    ${e.status === "past_due" && html`<p class="err">지난 결제가 실패했어요. 3일 안에 카드를 다시 등록하지 않으면 무료 플랜으로 바뀌어요.</p>`}
    ${pays && pays.length > 0 && html`<div class="field"><label>결제 내역</label><div class="card list flat">${pays.map(p => html`<div class="row static"><span class="t"><b>${p.interval === "year" ? "연간" : "월간"} · ${(p.amount || 0).toLocaleString()}원</b><small>${md((p.paid_at || p.created_at).slice(0, 10))}</small></span><span class="tag ${p.status === "PAID" ? "m" : "late"}">${p.status === "PAID" ? "완료" : "실패"}</span></div>`)}</div></div>`}
    ${msg && html`<p class="err" role="alert">${msg}</p>`}
    ${e.status === "canceled" || e.status === "past_due" ? html`<button class="btn" disabled=${busy} onClick=${go}>${e.status === "past_due" ? "카드 다시 등록" : "해지 취소하고 계속 쓰기"}</button>`
      : html`<${Confirm} cls="btn sec" label="구독 해지" sure=${`${md(e.period_end.slice(0, 10))}까지 쓰고 해지할까요?`} onYes=${cancel}/>`}
    <p class="fine">해지해도 남은 기간은 그대로 쓸 수 있어요. <a href="./legal.html#refund" target="_blank" rel="noopener">결제·환불 정책</a> · 문의 wonwoonc10@gmail.com</p>`;
  return html`<${SheetHead} title="퀘스트라인 패스"/>
    <ul class="perks">${PERKS.map(p => html`<li><${I.ok}/>${p}</li>`)}</ul>
    <div class="plans">
      <button class="plan-opt" aria-pressed=${iv === "year"} onClick=${() => setIv("year")}><span><b>연간 <span class="save">48% 할인</span></b><small>${e.trialUsed ? "한 번에 결제" : "7일 무료 체험 후 결제"}</small></span><span class="pr">${PRICES.year.toLocaleString()}원<small>월 ${Math.round(PRICES.year / 12).toLocaleString()}원꼴</small></span></button>
      <button class="plan-opt" aria-pressed=${iv === "month"} onClick=${() => setIv("month")}><span><b>월간</b><small>언제든 해지</small></span><span class="pr">${PRICES.month.toLocaleString()}원<small>매달</small></span></button>
    </div>
    ${msg && html`<p class="err" role="alert">${msg}</p>`}
    <button class="btn" disabled=${busy} onClick=${go}>${busy ? "처리 중…" : trial ? "7일 무료로 시작" : `${(iv === "year" ? PRICES.year : PRICES.month).toLocaleString()}원 결제하고 시작`}</button>
    <p class="fine">${trial ? `체험이 끝나는 날 ${PRICES.year.toLocaleString()}원이 결제돼요. 그 전에 해지하면 결제되지 않아요.` : "다음 결제일 전에 해지하면 더 결제되지 않아요."} 카드 정보는 결제사(포트원)가 보관해요. <a href="./legal.html#refund" target="_blank" rel="noopener">결제·환불 정책</a></p>`;
}

/* ── 설정 ── */
const theme = () => LS.get("ql:theme") || "auto";
export const applyTheme = (v = theme()) => { if (v === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = v; };
function Settings(){
  useApp(); const S = app.S, [name, setName] = useState(S.profile.name), [th, setTh] = useState(theme()), [push, setPush] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setPush); }, []);
  const setT = v => { setTh(v); LS.set("ql:theme", v); applyTheme(v); };
  const prof = ch => act(d => d.profile(ch));
  const exportData = () => { const b = new Blob([JSON.stringify(S, null, 1)], {type:"application/json"}), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `questline-${T()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const togglePush = async () => { setBusy(true); try { if (push === "on"){ await disablePush(); setPush("off"); toast("알림을 껐어요"); } else { const r = await enablePush(); setPush(r); toast(r === "on" ? "알림을 켰어요" : r === "denied" ? "브라우저 설정에서 알림을 허용해 주세요" : "이 기기에서는 알림을 쓸 수 없어요"); } } finally { setBusy(false); } };
  const out = async () => { await auth.signOut(); LS.set("ql:guest", null); signedOut(); closeSheet(); location.hash = ""; };
  const del = async () => { setBusy(true); try { if (pass() && app.ent.status !== "canceled") await api("cancel", {}); /* 정기결제 예약부터 끊는다 */ await auth.deleteAccount(); Object.keys(localStorage).filter(k => k.startsWith("ql:")).forEach(k => localStorage.removeItem(k)); signedOut(); closeSheet(); toast("계정을 삭제했어요"); } catch (e) { toast(e.message || "삭제하지 못했어요"); } finally { setBusy(false); } };
  return html`<${SheetHead} title="설정"/>
    <div class="field"><label>이름</label><div class="chips"><input value=${name} maxlength="12" onInput=${e => setName(e.target.value)} onBlur=${() => name.trim() && name !== S.profile.name && prof({name:name.trim()})}/></div></div>
    <div class="field"><label>캐릭터 색</label><div class="hues">${[152, 200, 262, 330, 24, 45].map(h => html`<button style=${`--h:${h}`} aria-pressed=${S.profile.hue === h} onClick=${() => prof({hue:h})} aria-label=${"색 " + h}></button>`)}</div></div>
    <div class="field"><label>화면</label><div class="chips">${[["auto","기기 설정"],["light","밝게"],["dark","어둡게"]].map(([k, l]) => html`<${Chip} on=${th === k} onClick=${() => setT(k)}>${l}</${Chip}>`)}</div></div>
    <div class="field"><label>알림</label>
      ${!auth.user ? html`<p class="hint">로그인하면 아침·저녁 알림을 받을 수 있어요.</p>` : html`<div class="chips"><button class="chip" aria-pressed=${push === "on"} disabled=${busy || push === "unsupported"} onClick=${togglePush}>${push === "on" ? "켜짐" : push === "unsupported" ? "이 기기에서 지원 안 함" : "꺼짐"}</button></div>
      ${push === "on" && html`<div class="dtrow"><span>아침</span><input type="time" step="300" value=${S.profile.remindAt} onChange=${e => prof({remindAt:e.target.value})}/><span>저녁</span><input type="time" step="300" value=${S.profile.eveningAt} onChange=${e => prof({eveningAt:e.target.value})}/></div>`}
      ${push === "unsupported" && /iPhone|iPad/.test(navigator.userAgent) && html`<p class="hint">아이폰은 공유 → '홈 화면에 추가'로 설치한 뒤 알림을 켤 수 있어요.</p>`}`}
    </div>
    ${!PREVIEW && html`<div class="field"><label>데이터</label><button class="btn sec" onClick=${exportData}><${I.download}/>내 기록 내보내기(JSON)</button></div>`}
    <div class="field"><label>계정</label>${PREVIEW ? html`<p class="hint">미리보기에서는 로그인하지 않아요. 기록은 이 브라우저에만 저장돼요.</p>` : auth.user ? html`<p class="hint">${auth.user.email}</p><button class="btn sec" onClick=${out}>로그아웃</button><${Confirm} label="계정 삭제" sure="모든 기록이 지워져요. 삭제할까요?" onYes=${del}/>` : html`<p class="hint">지금은 이 기기에만 저장돼요. 로그인하면 기록이 그대로 옮겨지고 다른 기기에서도 볼 수 있어요.</p><a class="btn" href="#auth" onClick=${closeSheet}>로그인 / 가입</a>`}</div>
    <p class="fine"><a href="./legal.html#terms" target="_blank" rel="noopener">이용약관</a> · <a href="./legal.html#refund" target="_blank" rel="noopener">결제·환불</a> · <a href="./legal.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="./legal.html#biz" target="_blank" rel="noopener">사업자 정보</a> · (주)원운컴퍼니 · wonwoonc10@gmail.com</p>`;
}

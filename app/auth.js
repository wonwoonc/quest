/* 퀘스트라인 — 첫 화면(소개·로그인·가입·비밀번호 찾기)과 처음 3단계 안내 */
import {useState} from "./vendor/hooks.js";
import {html, I, Avatar, Chip} from "./ui.js";
import {auth} from "./cloud.js";
import {app, act, startUser, startGuest, T, uid, useApp, event} from "./store.js";
import {EVERYDAY, AREAS, AREA_KEYS, addM} from "./logic.js";
import {createQuest} from "./actions.js";
import {APP, PREVIEW} from "./config.js";

const KR = {invalid_credentials:"이메일 또는 비밀번호가 맞지 않아요.", email_not_confirmed:"메일함에서 인증 링크를 먼저 눌러 주세요.", user_already_exists:"이미 가입된 이메일이에요. 로그인해 주세요.", weak_password:"비밀번호는 8자 이상으로 정해 주세요.", over_email_send_rate_limit:"메일을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.", network:"인터넷 연결을 확인해 주세요.", validation_failed:"이메일 형식을 확인해 주세요."};
const kr = e => KR[e.code] || e.message || "잠시 후 다시 시도해 주세요.";

export function Auth({recovery}){
  const [mode, setMode] = useState(recovery ? "reset" : "intro"), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [sent, setSent] = useState("");
  const run = async fn => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(kr(e)); } finally { setBusy(false); } };
  const submit = e => { e.preventDefault(); run(async () => {
    if (mode === "in"){ await auth.signIn(email.trim(), pw); await startUser(); location.hash = ""; }
    else if (mode === "up"){ if (pw.length < 8) throw {code:"weak_password"}; const r = await auth.signUp(email.trim(), pw); if (r.session){ event("signup"); await startUser(); location.hash = ""; } else setSent("가입 확인 메일을 보냈어요. 메일의 링크를 누르면 바로 시작돼요."); }
    else if (mode === "forgot"){ await auth.recover(email.trim()); setSent("비밀번호를 바꿀 수 있는 링크를 메일로 보냈어요."); }
    else if (mode === "reset"){ if (pw.length < 8) throw {code:"weak_password"}; await auth.setPassword(pw); await startUser(); location.hash = ""; }
  }); };
  if (mode === "intro") return html`<div class="intro">
    <div class="hero-art"><${Avatar} L=${12} size=${132}/></div>
    <h1>할 일이 경험치가 되는<br/>나의 성장 RPG</h1>
    <p>큰 목표는 퀘스트로, 오늘 할 일은 미션으로. 체크할 때마다 캐릭터가 자라요.</p>
    <ul class="perks">${["한 줄로 적으면 날짜·시간·반복까지 알아서 정리", "AI가 목표를 스테이지와 이번 주 미션으로 설계", "연속 기록, 휴식권, 보상 상점으로 끝까지"].map(p => html`<li><${I.ok}/>${p}</li>`)}</ul>
    ${PREVIEW ? html`<button class="btn" onClick=${() => { startGuest(); }}>시작하기</button><p class="fine">미리보기예요. 기록은 이 브라우저에만 저장돼요. 로그인·결제·AI 설계·알림은 정식 주소(myquestline.pages.dev/app)에서 쓸 수 있어요.</p>` : html`
    <button class="btn" onClick=${() => setMode("up")}>무료로 시작하기</button>
    <button class="btn sec" onClick=${() => setMode("in")}>이미 계정이 있어요</button>
    <button class="linkbtn" onClick=${() => { startGuest(); event("guest"); }}>가입 없이 둘러보기</button>`}
  </div>`;
  const title = {in:"로그인", up:"가입하기", forgot:"비밀번호 찾기", reset:"새 비밀번호"}[mode];
  return html`<div class="authbox">
    ${mode !== "reset" && html`<button class="back" onClick=${() => { setMode("intro"); setSent(""); setMsg(""); }}><${I.left}/>처음으로</button>`}
    <h1>${title}</h1>
    ${sent ? html`<div class="card note"><b>메일을 확인해 주세요</b><p>${sent}</p><p class="hint">${email}</p><button class="btn sec" onClick=${() => { setSent(""); setMode("in"); }}>로그인 화면으로</button></div>` : html`
    ${(mode === "in" || mode === "up") && APP.oauth.includes("google") && html`<a class="btn social" href=${auth.oauthUrl("google")}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>Google로 계속하기</a><div class="or"><span>또는 이메일</span></div>`}
    <form onSubmit=${submit} class="authform">
      ${mode !== "reset" && html`<div class="field"><label for="em">이메일</label><input id="em" type="email" autocomplete="email" required value=${email} onInput=${e => setEmail(e.target.value)}/></div>`}
      ${mode !== "forgot" && html`<div class="field"><label for="pw">${mode === "reset" ? "새 비밀번호" : "비밀번호"}</label><input id="pw" type="password" autocomplete=${mode === "in" ? "current-password" : "new-password"} required minlength=${mode === "in" ? 1 : 8} value=${pw} onInput=${e => setPw(e.target.value)} placeholder=${mode === "in" ? "" : "8자 이상"}/></div>`}
      ${msg && html`<p class="err" role="alert">${msg}</p>`}
      <button class="btn" disabled=${busy}>${busy ? "잠시만요…" : title}</button>
    </form>
    ${mode === "in" && html`<button class="linkbtn" onClick=${() => setMode("forgot")}>비밀번호를 잊었어요</button>`}
    ${mode === "up" && html`<p class="fine">가입하면 <a href="./legal.html#terms" target="_blank" rel="noopener">이용약관</a>과 <a href="./legal.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a>에 동의하게 돼요.</p>`}`}
  </div>`;
}

/* 처음 3단계: 이름 → 첫 일일 퀘스트 → 첫 메인 퀘스트(건너뛰기 가능) */
const HABITS = [["물 한 잔 마시기", "health", "07:30"], ["10분 걷기", "health", ""], ["책 10쪽 읽기", "growth", "22:00"], ["영어 단어 10개", "growth", ""], ["가계부 쓰기", "money", "21:30"], ["부모님께 안부 연락", "social", ""]];
const GOALS = [["5kg 감량하기", "health"], ["토익 850점", "growth"], ["비상금 300만 원 모으기", "money"], ["포트폴리오 완성", "career"], ["책 12권 읽기", "growth"]];
export function Onboarding(){
  useApp(); const S = app.S, [step, setStep] = useState(0), [name, setName] = useState(S.profile.name === "모험가" ? "" : S.profile.name), [picks, setPicks] = useState([]), [goal, setGoal] = useState(""), [garea, setGarea] = useState([]);
  const finish = () => {
    const now = Date.now();
    act(d => { d.profile({name:(name.trim() || "모험가").slice(0, 12), onboarded:true}); picks.slice(0, 3).forEach((i, k) => { const [t, a, tm] = HABITS[i]; d.put("habits", {id:uid() + k, title:t, rule:EVERYDAY(), time:tm, lv:"easy", area:[a], start:T(), createdAt:now + k}); }); });
    if (goal.trim()) createQuest({title:goal.trim(), due:addM(T(), 3), area:garea});
    event("onboarded"); location.hash = goal.trim() ? "" : "";
  };
  return html`<div class="onb">
    <div class="steps" aria-label=${`${step + 1}/3단계`}>${[0, 1, 2].map(i => html`<i class=${i <= step ? "on" : ""}></i>`)}</div>
    ${step === 0 && html`<h1>뭐라고 불러 드릴까요?</h1><p>캐릭터 이름이 돼요. 나중에 바꿀 수 있어요.</p>
      <div class="hero-art"><${Avatar} L=${1} hue=${S.profile.hue} size=${120}/></div>
      <input class="title-in" autofocus maxlength="12" value=${name} onInput=${e => setName(e.target.value)} placeholder="이름 또는 별명" onKeyDown=${e => e.key === "Enter" && !e.isComposing && setStep(1)}/>
      <button class="btn" onClick=${() => setStep(1)}>다음</button>`}
    ${step === 1 && html`<h1>매일 할 작은 일 하나</h1><p>일일 퀘스트는 매일 체크하는 습관이에요. 너무 쉬워 보이는 걸 고르는 게 비결이에요. (최대 3개)</p>
      <div class="pickgrid">${HABITS.map(([t, a], i) => html`<button aria-pressed=${picks.includes(i)} onClick=${() => setPicks(picks.includes(i) ? picks.filter(x => x !== i) : [...picks, i].slice(-3))}><b>${t}</b><small>${AREAS[a].name}</small></button>`)}</div>
      <button class="btn" onClick=${() => setStep(2)}>${picks.length ? `${picks.length}개로 다음` : "나중에 정할게요"}</button>`}
    ${step === 2 && html`<h1>이루고 싶은 큰 목표</h1><p>메인 퀘스트로 만들어 스테이지와 미션으로 나눠 갈 거예요. 3개월 안에 이루고 싶은 것 하나면 충분해요.</p>
      <input class="title-in" maxlength="40" value=${goal} onInput=${e => setGoal(e.target.value)} placeholder="예: 하프 마라톤 완주"/>
      <div class="chips">${GOALS.map(([g, a]) => html`<${Chip} on=${goal === g} onClick=${() => { setGoal(g); setGarea([a]); }}>${g}</${Chip}>`)}</div>
      <button class="btn" onClick=${finish}>${goal.trim() ? "모험 시작" : "목표 없이 시작"}</button>
      <p class="hint">로그인하면 메인 퀘스트를 AI가 스테이지와 이번 주 미션으로 짜 줄 수 있어요.</p>`}
    ${step > 0 && html`<button class="linkbtn" onClick=${() => setStep(step - 1)}>이전</button>`}
  </div>`;
}

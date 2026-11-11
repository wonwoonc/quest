/* 로그인·가입 화면(배포판 전용). 앱이 시작되기 전에 #app에 그린다. 앱과 같은 카드·버튼 스타일(body.onboarding)을 쓴다.
 * view: login | signup | sent | forgot | forgot-sent | reset | choice | loading | error */
import {TERMS, PRIVACY} from './legal.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIN_PW = 8;
const fmtAt = at => { const d = new Date(at); return Number.isFinite(d.getTime()) ? `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '알 수 없음'; };
const summary = snap => { const p = Object.values(snap.profiles || {})[0], mine = Object.values(snap.mine || {});
  return `<b>${esc(p && p.nick ? p.nick : '캐릭터 없음')}</b><small>메인 퀘스트 ${Object.values(snap.projects || {}).filter(x => !x.parentId).length}개 · 미션 ${mine.filter(m => m.kind === 'mission').length}개 · 일일 퀘스트 ${mine.filter(m => m.kind === 'quest').length}개 · 저널 ${mine.filter(m => m.kind === 'diary').length}개</small>`; };
const doc = (title, list) => `<details class="authdoc"><summary>${title} 보기</summary><div class="helplist">${list.map(([t, b]) => `<div class="helpitem"><b>${t}</b>${b}</div>`).join('')}</div></details>`;
const head = (title, copy) => `<p class="login-brand">퀘스트</p><h1 id="auth-title" class="authh">${title}</h1>${copy ? `<p class="login-copy">${copy}</p>` : ''}`;
const field = (id, label, type, ac, value = '') => `<label class="field authf"><span class="lab">${label}</span><input type="${type}" id="${id}" autocomplete="${ac}" value="${esc(value)}"${type === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : ''} required></label>`;

export function authView(st) {
  const msg = st.error ? `<p class="autherr" role="alert">${esc(st.error)}</p>` : st.info ? `<p class="authinfo" role="status">${esc(st.info)}</p>` : '';
  const busy = st.busy ? ' disabled' : '';
  let body;
  switch (st.view) {
    case 'loading': body = `${head('불러오는 중…', esc(st.info || '계정 기록을 확인하고 있어요.'))}`; return `<section class="card login-card authcard" aria-busy="true">${body}</section>`;
    case 'error': body = `${head('연결하지 못했어요', '')}<p class="autherr" role="alert">${esc(st.error)}</p><button type="button" class="btn big full" data-auth="retry">다시 시도</button><button type="button" class="link authlink" data-auth="logout">다른 계정으로 로그인</button>`; break;
    case 'signup': body = `${head('이메일로 가입하기', '')}
      <form data-auth-form="signup" novalidate>${field('auth-email', '이메일', 'email', 'email', st.email)}${field('auth-pw', `비밀번호 (${MIN_PW}자 이상)`, 'password', 'new-password')}${field('auth-pw2', '비밀번호 확인', 'password', 'new-password')}
      <div class="authagree"><label class="toggle"><input type="checkbox" id="auth-all"> <b>모두 동의</b></label>
      <label class="toggle"><input type="checkbox" class="auth-req" id="auth-age"> 만 14세 이상이에요 (필수)</label>
      <label class="toggle"><input type="checkbox" class="auth-req" id="auth-terms"> 이용약관에 동의해요 (필수)</label>${doc('이용약관', TERMS)}
      <label class="toggle"><input type="checkbox" class="auth-req" id="auth-privacy"> 개인정보 수집·이용에 동의해요 (필수)</label>${doc('개인정보처리방침', PRIVACY)}</div>
      ${msg}<button type="submit" class="btn big full"${busy}>${st.busy ? '가입하는 중…' : '가입하기'}</button></form>
      <button type="button" class="link authlink" data-auth="go" data-v="login">이미 계정이 있어요. 로그인하기</button>`; break;
    case 'sent': body = `${head('인증 메일을 보냈어요', `<b>${esc(st.email)}</b>로 보낸 메일의 링크를 누르면 가입이 끝나요. 메일이 안 보이면 스팸함도 확인해 주세요.`)}
      ${msg}<button type="button" class="btn big full sec" data-auth="resend"${busy}>인증 메일 다시 받기</button><button type="button" class="btn big full" data-auth="go" data-v="login">로그인 화면으로</button>`; break;
    case 'forgot': body = `${head('비밀번호 찾기', '가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드려요.')}
      <form data-auth-form="forgot" novalidate>${field('auth-email', '이메일', 'email', 'email', st.email)}${msg}<button type="submit" class="btn big full"${busy}>${st.busy ? '보내는 중…' : '링크 받기'}</button></form>
      <button type="button" class="link authlink" data-auth="go" data-v="login">로그인 화면으로</button>`; break;
    case 'forgot-sent': body = `${head('메일을 보냈어요', `<b>${esc(st.email)}</b>로 보낸 메일의 링크를 눌러 새 비밀번호를 정해 주세요.`)}<button type="button" class="btn big full" data-auth="go" data-v="login">로그인 화면으로</button>`; break;
    case 'reset': body = `${head('새 비밀번호 정하기', '')}<form data-auth-form="reset" novalidate>${field('auth-pw', `새 비밀번호 (${MIN_PW}자 이상)`, 'password', 'new-password')}${field('auth-pw2', '새 비밀번호 확인', 'password', 'new-password')}${msg}<button type="submit" class="btn big full"${busy}>${st.busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button></form>`; break;
    case 'choice': body = `${head('어떤 기록으로 이어 갈까요?', '이 기기와 계정에 서로 다른 기록이 있어요. 고르지 않은 기록은 백업 파일로 내려받아 두니 나중에 설정 → 백업 불러오기로 되살릴 수 있어요.')}
      <div class="authchoice"><button type="button" class="card authopt" data-auth="pick" data-v="local"><span class="lab">이 기기의 기록</span>${summary(st.choice.local)}<small>마지막 저장 ${fmtAt(st.choice.local.at)}</small></button>
      <button type="button" class="card authopt" data-auth="pick" data-v="server"><span class="lab">계정에 저장된 기록</span>${summary(st.choice.server)}<small>마지막 저장 ${fmtAt(st.choice.serverAt)}</small></button></div>`; return `<section class="authwrap" aria-labelledby="auth-title">${body}</section>`;
    default: body = `${head('작은 실천으로<br>시작하는 나의 모험', '')}
      <form data-auth-form="login" novalidate>${field('auth-email', '이메일', 'email', 'email', st.email)}${field('auth-pw', '비밀번호', 'password', 'current-password')}${msg}
      <button type="submit" class="btn big full"${busy}>${st.busy ? '로그인하는 중…' : '로그인'}</button></form>
      <button type="button" class="link authlink" data-auth="go" data-v="forgot">비밀번호를 잊으셨나요?</button>
      <p class="login-divider">처음 오셨나요?</p><button type="button" class="btn big full sec" data-auth="go" data-v="signup">이메일로 가입하기</button>`;
  }
  return `<section class="card login-card authcard" aria-labelledby="auth-title">${body}</section>`;
}

/* 화면 상태와 이벤트. actions: {signIn, signUp, resend, recover, updatePassword, retry, logout} — 모두 Promise. 실패 시 Error.message를 보여 준다. */
export function mountAuth({root, body, actions, initial = {view:'login'}}) {
  let st = {email:'', ...initial}, picker = null;
  let shown = null;
  // 같은 화면을 다시 그릴 때(오류 표시 등) 입력한 값과 동의 체크를 유지한다.
  const draw = () => {
    const keep = shown === st.view ? [...root.querySelectorAll('input[id]')].map(el => [el.id, el.type === 'checkbox' ? el.checked : el.value]) : [];
    body.classList.add('onboarding'); root.dataset.v = 'login'; root.innerHTML = authView(st); shown = st.view;
    for (const [id, v] of keep){ const el = root.querySelector('#' + id); if (!el) continue; if (el.type === 'checkbox') el.checked = v; else el.value = v; }
  };
  const set = patch => { st = {...st, ...patch}; draw(); };
  const val = id => { const el = root.querySelector('#' + id); return el ? String(el.value || '') : ''; };
  const run = async (fn, after) => { set({busy:true, error:'', info:''}); try { const r = await fn(); after(r); } catch (e) { set({busy:false, error:e && e.message ? e.message : '잠시 후 다시 시도해 주세요.'}); } };
  function onClick(e){
    const b = e.target.closest('[data-auth]'); if (!b || st.busy) return;
    const a = b.dataset.auth;
    if (a === 'go') set({view:b.dataset.v, error:'', info:''});
    else if (a === 'resend') run(() => actions.resend(st.email), () => set({busy:false, info:'인증 메일을 다시 보냈어요.'}));
    else if (a === 'retry') actions.retry();
    else if (a === 'logout') actions.logout();
    else if (a === 'pick' && picker){ const r = picker; picker = null; set({view:'loading', info:'기록을 정리하고 있어요.'}); r(b.dataset.v === 'local' ? 'local' : 'server'); }
  }
  function onChange(e){
    if (e.target.id === 'auth-all') root.querySelectorAll('.auth-req').forEach(x => { x.checked = e.target.checked; });
    else if (e.target.classList && e.target.classList.contains('auth-req')){ const all = root.querySelector('#auth-all'); if (all) all.checked = [...root.querySelectorAll('.auth-req')].every(x => x.checked); }
  }
  function onSubmit(e){
    const f = e.target.closest('[data-auth-form]'); if (!f) return; e.preventDefault(); if (st.busy) return;
    const kind = f.dataset.authForm, email = val('auth-email').trim(), pw = val('auth-pw'), pw2 = val('auth-pw2');
    const bad = m => set({error:m, info:'', email:email || st.email});
    if (kind !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('이메일 주소를 다시 확인해 주세요.');
    if (kind === 'login'){ if (!pw) return bad('비밀번호를 입력해 주세요.'); st.email = email; return run(() => actions.signIn(email, pw), () => {}); }
    if (kind === 'forgot'){ st.email = email; return run(() => actions.recover(email), () => set({busy:false, view:'forgot-sent'})); }
    if (pw.length < MIN_PW) return bad(`비밀번호는 ${MIN_PW}자 이상으로 정해 주세요.`);
    if (pw !== pw2) return bad('비밀번호 확인이 일치하지 않아요.');
    if (kind === 'reset') return run(() => actions.updatePassword(pw), () => {});
    if (![...root.querySelectorAll('.auth-req')].every(x => x.checked)) return bad('필수 항목에 모두 동의해 주세요.');
    st.email = email; run(() => actions.signUp(email, pw), r => { if (r && r.confirm) set({busy:false, view:'sent'}); });
  }
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('submit', onSubmit);
  draw();
  return {
    set, state:() => st,
    choose:choice => new Promise(resolve => { picker = resolve; set({view:'choice', choice, busy:false, error:''}); }),
    unmount(){ root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('submit', onSubmit); root.innerHTML = ''; }
  };
}

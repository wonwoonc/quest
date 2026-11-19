/* 퀘스트라인 — 시작과 화면 전환 */
import {render} from "./vendor/preact.js";
import {useState, useEffect} from "./vendor/hooks.js";
import {html, I, SheetHost, ToastHost, openSheet, toast} from "./ui.js";
import {app, useApp, LS, startUser, startGuest, setMode, grantShields} from "./store.js";
import {auth} from "./cloud.js";
import {Today} from "./today.js";
import {Quests, QuestView} from "./quests.js";
import {Record} from "./record.js";
import {Me, applyTheme} from "./me.js";
import {Auth, Onboarding} from "./auth.js";
import {QuickAdd, PartyHost} from "./sheets.js";

applyTheme();
const route = () => { const h = location.hash.replace(/^#\/?/, ""), [a, b] = h.split("/"); return {name:a || "today", arg:b || ""}; };
function useRoute(){ const [r, set] = useState(route()); useEffect(() => { const f = () => { set(route()); scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return r; }

/* 설치 안내: 세 번째 방문부터, 닫으면 30일 동안 숨김 */
let deferred = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
function InstallTip(){
  const [show, setShow] = useState(false);
  useEffect(() => { const n = (LS.get("ql:visits") || 0) + 1; LS.set("ql:visits", n); const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone; const hid = LS.get("ql:installHide") || 0;
    if (!standalone && n >= 3 && Date.now() - hid > 30 * 864e5) setTimeout(() => setShow(true), 1500); }, []);
  if (!show) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!deferred && !ios) return null;
  const hide = () => { LS.set("ql:installHide", Date.now()); setShow(false); };
  return html`<div class="card install"><img src="./icon-192.png" alt="" width="40" height="40"/><div><b>홈 화면에 추가</b><small>${ios ? "공유 버튼 → '홈 화면에 추가'를 누르면 앱처럼 쓸 수 있어요." : "앱처럼 바로 열고 알림도 받을 수 있어요."}</small></div>${!ios && html`<button class="pill sm" onClick=${async () => { deferred.prompt(); await deferred.userChoice; deferred = null; hide(); }}>설치</button>`}<button class="ib sm" onClick=${hide} aria-label="닫기"><${I.x}/></button></div>`;
}

function Nav({name}){
  const tabs = [["today", "오늘", I.today], ["quests", "퀘스트", I.quests], null, ["record", "기록", I.record], ["me", "나", I.me]];
  const cur = name === "q" ? "quests" : name;
  return html`<nav class="nav" aria-label="주요 화면"><div class="in"><span class="brand"><img src="./icon.svg" alt="" width="28" height="28"/>퀘스트라인</span>${tabs.map(t => t ? html`<a href=${"#" + (t[0] === "today" ? "" : t[0])} aria-current=${cur === t[0] ? "page" : null}><${t[2]}/>${t[1]}</a>` : html`<button class="plus" onClick=${() => openSheet(QuickAdd, cur === "q" ? {quest:route().arg} : {})} aria-label="추가하기"><${I.plus}/><span>추가하기</span></button>`)}</div></nav>`;
}

function App(){
  useApp(); const r = useRoute();
  useEffect(() => { const k = e => { if (e.key === "n" && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && app.mode === "app" && !document.querySelector(".scrim")) { e.preventDefault(); openSheet(QuickAdd); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  if (app.mode === "boot") return html`<div class="boot" aria-busy="true"><div class="spin"></div></div>`;
  if (app.mode === "auth" || app.mode === "recovery" || (r.name === "auth" && !auth.user)) return html`<main class="app solo"><${Auth} recovery=${app.mode === "recovery"}/></main><${ToastHost}/>`;
  if (!app.S) return html`<div class="boot"><div class="spin"></div></div>`;
  if (!app.S.profile.onboarded) return html`<main class="app solo"><${Onboarding}/></main><${ToastHost}/>`;
  const guest = !auth.user;
  const screen = r.name === "quests" ? html`<${Quests}/>` : r.name === "q" ? html`<${QuestView} id=${r.arg} key=${r.arg}/>` : r.name === "record" ? html`<${Record}/>` : r.name === "me" ? html`<${Me} sub=${r.arg}/>` : html`<${Today}/>`;
  return html`<main class="app" id="main">
      ${guest && html`<div class="demo"><span>둘러보기 중 · <b>이 기기에만</b> 저장돼요</span><a href="#auth" onClick=${() => setMode("auth")}>로그인하고 보관</a></div>`}
      ${r.name === "today" && html`<${InstallTip}/>`}
      ${screen}
    </main>
    <${Nav} name=${r.name}/><${SheetHost}/><${ToastHost}/><${PartyHost}/>`;
}

async function boot(){
  render(html`<${App}/>`, document.getElementById("root"));
  const red = await auth.fromRedirect();
  if (red && red.error) toast(red.error);
  if (red && red.type === "recovery"){ app.mode = "recovery"; setMode("recovery"); return; }
  if (auth.user) await startUser();
  else if (LS.get("ql:guest")) startGuest();
  else setMode("auth");
  /* 날짜가 바뀌면 다시 그리고 휴식권 지급 확인 */
  let day = new Date().getDate(); setInterval(() => { const d = new Date().getDate(); if (d !== day){ day = d; grantShields(); setMode(app.mode); } }, 30000);
}
boot();

/* 오프라인용 서비스 워커. 새 버전이 오면 다음에 열 때 적용 */
if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(() => {}));

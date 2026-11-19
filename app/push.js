/* 퀘스트라인 — 웹 푸시 구독. 서버 설정(VAPID 공개키)이 없으면 'unsupported'로 둔다 */
import {store as cloud, api} from "./cloud.js";
const ok = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const reg = () => navigator.serviceWorker.getRegistration("./");
const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
export async function pushState(){
  if (!ok()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try { const r = await reg(); const s = r && await r.pushManager.getSubscription(); return s ? "on" : "off"; } catch (_) { return "off"; }
}
export async function enablePush(){
  if (!ok()) return "unsupported";
  let cfg; try { cfg = await api("config"); } catch (_) { return "unsupported"; }
  if (!cfg.vapid) return "unsupported";
  const p = await Notification.requestPermission(); if (p !== "granted") return "denied";
  const r = await reg() || await navigator.serviceWorker.register("./sw.js", {scope:"./"});
  const s = await r.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64(cfg.vapid)});
  await cloud.push({...s.toJSON(), tz:Intl.DateTimeFormat().resolvedOptions().timeZone});
  return "on";
}
export async function disablePush(){ const r = await reg(); const s = r && await r.pushManager.getSubscription(); if (s){ try { await cloud.unpush(s.endpoint); } catch (_) {} await s.unsubscribe(); } }

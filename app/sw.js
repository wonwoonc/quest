/* 퀘스트라인 서비스 워커: 화면 파일을 저장해 오프라인에서도 열리게 하고, 알림을 띄운다 */
const V = "ql-app-__BUILD__";
const SHELL = ["./", "./index.html", "./app.css", "./main.js", "./ui.js", "./store.js", "./logic.js", "./cloud.js", "./actions.js", "./sheets.js", "./today.js", "./quests.js", "./record.js", "./me.js", "./auth.js", "./push.js", "./config.js", "./vendor/preact.js", "./vendor/hooks.js", "./vendor/htm.js", "./icon.svg", "./icon-192.png", "./manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ql-app-") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  /* 화면 이동은 네트워크 먼저(새 버전), 안 되면 저장본 */
  if (e.request.mode === "navigate"){ e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put("./index.html", c)); return r; }).catch(() => caches.match("./index.html"))); return; }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok){ const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })));
});
/* 내용 없는 푸시가 오면 서버에서 이 구독에 맞는 문구를 받아 띄운다 */
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let m = {title:"퀘스트라인", body:"오늘의 퀘스트를 확인해 보세요.", url:"./"};
    try { const s = await self.registration.pushManager.getSubscription(); if (s){ const r = await fetch("/api/app/push-msg?endpoint=" + encodeURIComponent(s.endpoint)); if (r.ok) m = {...m, ...(await r.json())}; } } catch (_) {}
    if (m.skip) return;
    await self.registration.showNotification(m.title, {body:m.body, icon:"./icon-192.png", badge:"./icon-192.png", tag:m.tag || "ql", data:{url:m.url || "./"}});
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); return c ? (c.navigate(url), c.focus()) : self.clients.openWindow(url); }));
});

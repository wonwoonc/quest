/* 배포판 커뮤니티: 스토리·답글·공감·팔로우·차단을 모든 사용자와 서버(supabase/community.sql)에서 공유한다.
 * - 앱 화면은 그대로 S.feed / S.replies / S.follows / S.profiles를 읽는다. 서버에서 받은 것을 이 형태로 바꿔 넣는다(mergeView).
 * - 내 활동은 앱이 평소처럼 내 기록에 쓰고, 이 모듈이 바뀐 부분만 골라 서버에 올린다(extract → diff → 요청).
 * - 앱 안에서 나는 'me', 다른 사람은 계정 id(uuid). 서버에는 내 계정 id로 저장된다.
 * - 남이 쓴 내용은 그대로 믿지 않고 앱이 쓰는 필드만 골라 담는다(cleanPost 등). */
import {balances} from './economy.js';

export const ME = 'me';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
const time = v => Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;
const on = v => !!v && v !== 0;
const COLOR = /^#[0-9a-f]{3,8}$/i;
const REF_TYPES = new Set(['project', 'mission', 'project_done', 'quest', 'diary']);

// 스토리에 붙는 기록 카드(ref): 문자열·숫자·참거짓만, 한 단계 extra까지.
function cleanFlat(o, depth = 0){
  const out = {}; if (!plain(o)) return out;
  for (const [k, v] of Object.entries(o).slice(0, 24)){
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else if (depth === 0 && k === 'extra' && plain(v)) out[k] = cleanFlat(v, 1);
    else if (depth === 1 && Array.isArray(v)) out[k] = v.filter(x => typeof x === 'number' && Number.isFinite(x)).slice(0, 7);
  }
  return out;
}
export function cleanRef(r){
  if (!plain(r) || !REF_TYPES.has(r.type) || !ID.test(String(r.id || ''))) return null;
  const out = cleanFlat(r); out.type = r.type; out.id = r.id; out.label = str(r.label, 200); return out;
}
export function cleanPost(d){
  const p = plain(d) ? d : {}, out = {text:str(p.text, 4000), mood:typeof p.mood === 'string' ? p.mood.slice(0, 40) : null, ref:cleanRef(p.ref)};
  if (typeof p.value === 'number' && Number.isFinite(p.value)) out.value = p.value;
  if (p.noReply === true) out.noReply = true;
  if (p.hideLikes === true) out.hideLikes = true;
  if (Number.isInteger(p.imgs) && p.imgs > 0) out.imgs = Math.min(p.imgs, 4);
  return out;
}
const FACEV = /^[a-z0-9]{1,16}$/, STYLES = new Set(['photo', 'fullbody']);
// 다른 사람의 프로필 사진은 'rf~<계정 id>' 키로 가리키고, 실제 주소는 서명된 임시 주소(remote)로 받는다.
const cleanProfile = (uid, priv, d) => { const p = plain(d) ? d : {}, face = FACEV.test(p.face || '') ? p.face : '';
  return {uid, nick:str(p.nick, 40) || '모험가', bio:str(p.bio, 300), color:COLOR.test(p.color || '') ? p.color : '#3DBE8B', private:!!priv, stats:{xp:time(p.xp)},
    face:face ? 'rf~' + uid : null, faceV:face || null, avatarStyle:face && STYLES.has(p.avatarStyle) ? p.avatarStyle : null}; };
export const facePath = (uid, v) => `${uid}/p/face-${v}`;
export const photoPath = (uid, postId, i) => `${uid}/s/${postId}~${i}`;
// 볼 사진 목록: 남의 스토리 사진과 프로필 사진(내 것은 이 기기 기록에 있다)
export function mediaPaths(me, view, rows){
  const out = [], authors = new Map((rows || []).map(r => [r.id, r.author]));
  for (const p of Object.values(view.feed)) if (p.author !== ME && p.imgs) for (let i = 0; i < p.imgs; i++) out.push({key:`${p.id}~${i}`, path:photoPath(authors.get(p.id) || p.author, p.id, i)});
  for (const p of Object.values(view.profiles)) if (p.faceV) out.push({key:p.face, path:facePath(p.uid, p.faceV)});
  return out;
}
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i += Math.max(1, Math.floor(s.length / 4096))) h = (h * 33 + s.charCodeAt(i)) >>> 0; return (h.toString(36) + s.length.toString(36)).slice(0, 16); };
const faceData = (snap, me) => { const f = me && me.face; if (!f || typeof f !== 'string') return ''; const v = f.startsWith('data:') ? f : (snap.media || {})[f]; return typeof v === 'string' && v.startsWith('data:image/') ? v : ''; };
export function dataBytes(src){
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(src || '')); if (!m) return null;
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return {type:m[1], bytes};
}

/* 서버 행 → 앱 형태. me: 내 계정 id. */
export function toView(me, rows){
  const m = u => u === me ? ME : u;
  const feed = {}, replies = {}, follows = {}, profiles = {}, pending = {}, requests = [];
  for (const r of rows.profiles || []) if (r.user_id !== me && UUID.test(r.user_id)) profiles[r.user_id] = cleanProfile(r.user_id, r.private, r.data);
  for (const r of [...(rows.posts || []), ...(rows.myPosts || [])]){
    if (!ID.test(String(r.id)) || !UUID.test(String(r.author)) || feed[r.id]) continue;
    const c = cleanPost(r.data);
    feed[r.id] = {...c, id:r.id, author:m(r.author), imgs:c.imgs || 0, reactions:{}, joiners:{}, createdAt:time(r.at)};
  }
  for (const r of rows.myPosts || []) if (r.hidden === true && feed[r.id] && feed[r.id].author === ME) feed[r.id].modHidden = true;
  for (const r of rows.likes || []) if (feed[r.post_id] && UUID.test(String(r.user_id))) feed[r.post_id].reactions[m(r.user_id)] = {k:'heart', at:time(r.at)};
  for (const r of [...(rows.replies || []), ...(rows.myReplies || [])]){
    if (!ID.test(String(r.id)) || !feed[r.post_id] || !UUID.test(String(r.author)) || replies[r.id]) continue;
    replies[r.id] = {id:r.id, postId:r.post_id, author:m(r.author), text:str(r.text, 2000), parentId:ID.test(String(r.parent_id || '')) ? r.parent_id : null, likes:{}, createdAt:time(r.at)};
  }
  for (const r of rows.myReplies || []) if (r.hidden === true && replies[r.id] && replies[r.id].author === ME) replies[r.id].modHidden = true;
  for (const r of rows.rlikes || []) if (replies[r.reply_id] && UUID.test(String(r.user_id))) replies[r.reply_id].likes[m(r.user_id)] = time(r.at);
  for (const f of rows.follows || []){
    if (!UUID.test(String(f.follower)) || !UUID.test(String(f.followee))) continue;
    if (!f.accepted){ if (f.follower === me) pending[f.followee] = true; else if (f.followee === me) requests.push({uid:f.follower, at:time(f.at)}); continue; }
    const from = m(f.follower), to = m(f.followee); follows[from + '~' + to] = {from, to, at:time(f.at)};
  }
  const mine = {
    posts:Object.fromEntries((rows.myPosts || []).filter(r => feed[r.id]).map(r => [r.id, postKey(feed[r.id])])),
    replies:Object.fromEntries(Object.values(replies).filter(r => r.author === ME).map(r => [r.id, replyKey(r)])),
    likes:Object.fromEntries(Object.values(feed).filter(p => on(p.reactions[ME])).map(p => [p.id, p.reactions[ME].at])),
    rlikes:Object.fromEntries(Object.values(replies).filter(r => on(r.likes[ME])).map(r => [r.id, r.likes[ME]])),
    follows:Object.fromEntries([...(rows.follows || [])].filter(f => f.follower === me).map(f => [f.followee, time(f.at)])),
    blocks:(rows.blocks || []).map(b => b.blocked).filter(u => UUID.test(String(u))).sort(),
    profile:rows.me ? JSON.stringify({private:!!rows.me.private, data:rows.me.data || {}}) : ''
  };
  requests.sort((a, b) => b.at - a.at);
  return {feed, replies, follows, profiles, pending, requests, mine};
}

const postKey = p => JSON.stringify({data:cleanPost(p), at:time(p.createdAt)});
const replyKey = r => JSON.stringify({post_id:r.postId, parent_id:r.parentId || null, text:r.text, at:time(r.createdAt)});

/* 내 기록 + 서버 보기 → 화면에 쓸 기록. 내 글·답글은 내 기록이 기준이고, 남의 것과 공감·팔로우는 서버가 기준. */
export function mergeView(snap, view){
  const s = {...snap};
  const feed = {};
  for (const [id, p] of Object.entries(view.feed)) feed[id] = p;
  for (const [id, p] of Object.entries(snap.feed || {})) if (p && p.author === ME){ const sv = view.feed[id];
    feed[id] = {...p, reactions:sv ? sv.reactions : {}}; if (sv && sv.modHidden) feed[id].modHidden = true; else delete feed[id].modHidden; }
  // 남의 스토리에 내가 누른 공감은 서버 기준(view.feed에 이미 있음)
  const replies = {};
  for (const [id, r] of Object.entries(view.replies)) replies[id] = r;
  for (const [id, r] of Object.entries(snap.replies || {})) if (r && r.author === ME && feed[r.postId]){ const sv = view.replies[id];
    replies[id] = {...r, likes:sv ? sv.likes : {}}; if (sv && sv.modHidden) replies[id].modHidden = true; else delete replies[id].modHidden; }
  s.feed = feed; s.replies = replies; s.follows = {...view.follows};
  for (const u of Object.keys(view.pending)) s.follows[ME + '~' + u] = {from:ME, to:u, at:view.mine.follows[u] || 0};
  const own = (snap.profiles || {})[ME];
  s.profiles = {...view.profiles, ...(own ? {[ME]:own} : {})};
  return s;
}

/* 서버에 올릴 내 몫: 내 글·답글, 내가 누른 공감, 내 팔로우, 차단 목록, 공개 프로필 */
export function extract(snap){
  const feed = snap.feed || {}, replies = snap.replies || {}, me = (snap.profiles || {})[ME];
  const blocked = ((snap.mine || {}).settings || {}).blocked;
  let xp = 0; try { xp = balances(snap).xp; } catch { xp = 0; }
  return {
    posts:Object.fromEntries(Object.values(feed).filter(p => p && p.author === ME && ID.test(String(p.id))).map(p => [p.id, postKey(p)])),
    replies:Object.fromEntries(Object.values(replies).filter(r => r && r.author === ME && ID.test(String(r.id)) && feed[r.postId]).map(r => [r.id, replyKey(r)])),
    likes:Object.fromEntries(Object.values(feed).filter(p => p && p.author !== ME && on((p.reactions || {})[ME]) && ID.test(String(p.id))).map(p => [p.id, time(p.reactions[ME].at)])),
    rlikes:Object.fromEntries(Object.values(replies).filter(r => r && r.author !== ME && on((r.likes || {})[ME]) && ID.test(String(r.id))).map(r => [r.id, time(r.likes[ME])])),
    follows:Object.fromEntries(Object.values(snap.follows || {}).filter(f => f && f.from === ME && UUID.test(String(f.to))).map(f => [f.to, time(f.at)])),
    blocks:Array.isArray(blocked) ? [...new Set(blocked.filter(u => UUID.test(String(u))))].sort() : [],
    profile:me ? JSON.stringify({private:!!me.private, data:{nick:str(me.nick, 40), bio:str(me.bio, 300), color:COLOR.test(me.color || '') ? me.color : '#3DBE8B', xp,
      ...(faceData(snap, me) ? {face:hash(faceData(snap, me)), avatarStyle:STYLES.has(me.avatarStyle) ? me.avatarStyle : null} : {})}}) : ''
  };
}

/* 두 시점의 내 몫을 비교해 서버 요청 목록을 만든다(순서대로 실행). */
export function diff(a, b, me){
  const ops = [], add = (x, y) => Object.keys(y).filter(k => x[k] !== y[k]), gone = (x, y) => Object.keys(x).filter(k => !(k in y));
  const inList = ids => 'in.(' + ids.map(encodeURIComponent).join(',') + ')';
  if (b.profile && a.profile !== b.profile){ const p = JSON.parse(b.profile); ops.push({method:'POST', path:'/rest/v1/profiles_pub?on_conflict=user_id', prefer:'resolution=merge-duplicates,return=minimal', body:{user_id:me, ...p}}); }
  const posts = add(a.posts, b.posts); if (posts.length) ops.push({method:'POST', path:'/rest/v1/posts?on_conflict=id', prefer:'resolution=merge-duplicates,return=minimal', body:posts.map(id => ({id, author:me, ...JSON.parse(b.posts[id])}))});
  const replies = add(a.replies, b.replies); for (const id of replies) ops.push({method:'POST', path:'/rest/v1/replies?on_conflict=id', prefer:'resolution=ignore-duplicates,return=minimal', body:{id, author:me, ...JSON.parse(b.replies[id])}});
  const likes = Object.keys(b.likes).filter(k => !(k in a.likes)); if (likes.length) ops.push({method:'POST', path:'/rest/v1/post_likes?on_conflict=post_id,user_id', prefer:'resolution=ignore-duplicates,return=minimal', body:likes.map(id => ({post_id:id, user_id:me, at:b.likes[id]}))});
  const rlikes = Object.keys(b.rlikes).filter(k => !(k in a.rlikes)); if (rlikes.length) ops.push({method:'POST', path:'/rest/v1/reply_likes?on_conflict=reply_id,user_id', prefer:'resolution=ignore-duplicates,return=minimal', body:rlikes.map(id => ({reply_id:id, user_id:me, at:b.rlikes[id]}))});
  const fol = Object.keys(b.follows).filter(k => !(k in a.follows)); if (fol.length) ops.push({method:'POST', path:'/rest/v1/follows?on_conflict=follower,followee', prefer:'resolution=ignore-duplicates,return=minimal', body:fol.map(u => ({follower:me, followee:u, at:b.follows[u]}))});
  const blk = b.blocks.filter(u => !a.blocks.includes(u)); if (blk.length) ops.push({method:'POST', path:'/rest/v1/blocks?on_conflict=blocker,blocked', prefer:'resolution=ignore-duplicates,return=minimal', body:blk.map(u => ({blocker:me, blocked:u}))});
  const unblk = a.blocks.filter(u => !b.blocks.includes(u)); if (unblk.length) ops.push({method:'DELETE', path:`/rest/v1/blocks?blocker=eq.${me}&blocked=${inList(unblk)}`});
  const unfol = gone(a.follows, b.follows); if (unfol.length) ops.push({method:'DELETE', path:`/rest/v1/follows?follower=eq.${me}&followee=${inList(unfol)}`});
  const unrl = gone(a.rlikes, b.rlikes); if (unrl.length) ops.push({method:'DELETE', path:`/rest/v1/reply_likes?user_id=eq.${me}&reply_id=${inList(unrl)}`});
  const unl = gone(a.likes, b.likes); if (unl.length) ops.push({method:'DELETE', path:`/rest/v1/post_likes?user_id=eq.${me}&post_id=${inList(unl)}`});
  const delPosts = gone(a.posts, b.posts);
  const delReplies = gone(a.replies, b.replies).filter(id => !delPosts.includes(JSON.parse(a.replies[id]).post_id));
  if (delReplies.length) ops.push({method:'DELETE', path:`/rest/v1/replies?author=eq.${me}&id=${inList(delReplies)}`});
  if (delPosts.length) ops.push({method:'DELETE', path:`/rest/v1/posts?author=eq.${me}&id=${inList(delPosts)}`});
  // 지운 스토리의 사진, 바뀌기 전 프로필 사진은 저장소에서도 지운다.
  const files = delPosts.flatMap(id => { const n = (JSON.parse(a.posts[id]).data || {}).imgs || 0; return Array.from({length:n}, (_, i) => photoPath(me, id, i)); });
  const oldFace = a.profile ? (JSON.parse(a.profile).data || {}).face : '', newFace = b.profile ? (JSON.parse(b.profile).data || {}).face : '';
  if (oldFace && oldFace !== newFace && b.profile) files.push(facePath(me, oldFace));
  if (files.length) ops.push({method:'DELETE', path:'/storage/v1/object/media', body:{prefixes:files}});
  return ops;
}

/* 내 기록(user_state)에는 내 몫만 남긴다: 남의 글·답글·프로필·팔로우와 남이 누른 공감은 서버에서 다시 받는다. */
export function ownOnly(snap){
  if (!plain(snap)) return snap;
  const s = {...snap};
  s.feed = Object.fromEntries(Object.entries(snap.feed || {}).filter(([, p]) => p && p.author === ME).map(([k, p]) => [k, {...p, reactions:{}, joiners:{}}]));
  s.replies = Object.fromEntries(Object.entries(snap.replies || {}).filter(([, r]) => r && r.author === ME).map(([k, r]) => [k, {...r, likes:{}}]));
  s.follows = {};
  s.profiles = Object.fromEntries(Object.entries(snap.profiles || {}).filter(([k]) => k === ME));
  return s;
}

/* 서버와 주고받기. rest(path, {method, body, prefer}) → JSON. */
export function createCommunity({rest, me, sign = async () => [], upload = async () => {}, now = Date.now, delay = 1200, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {}}){
  let base = null, want = null, wantSnap = null, timer = null, running = null;
  const signed = new Map(), uploaded = new Set();
  // 서명 주소는 1시간짜리: 45분 안에 받은 것은 다시 쓰고(사진이 깜빡이지 않게), 나머지만 새로 받는다.
  async function remoteFor(list){
    const fresh = p => { const s = signed.get(p); return s && now() - s.at < 45 * 60000; };
    const need = [...new Set(list.map(x => x.path).filter(p => !fresh(p)))];
    for (let i = 0; i < need.length; i += 100){
      try { for (const r of await sign(need.slice(i, i + 100))) signed.set(r.path, {url:r.url, at:now()}); } catch { /* 사진 없이 보여 준다 */ }
    }
    const out = {}; for (const x of list){ const s = signed.get(x.path); if (s) out[x.key] = s.url; } return out;
  }
  async function put(path, src){
    if (uploaded.has(path)) return; const d = dataBytes(src); if (!d) return;
    try { await upload(path, d.bytes, d.type); uploaded.add(path); }
    catch (e) { if (e && e.code === 'network') throw e; /* 거절된 사진(너무 큼 등)은 건너뛴다 */ }
  }
  // 스토리·프로필을 올리기 전에 그 사진부터 올린다.
  async function uploadsFor(op, snap){
    if (!snap) return;
    if (op.method === 'POST' && op.path.startsWith('/rest/v1/posts?')) for (const p of op.body) for (let i = 0; i < (p.data.imgs || 0); i++) await put(photoPath(me(), p.id, i), (snap.media || {})[`${p.id}~${i}`]);
    if (op.method === 'POST' && op.path.startsWith('/rest/v1/profiles_pub?') && op.body.data && op.body.data.face) await put(facePath(me(), op.body.data.face), faceData(snap, (snap.profiles || {})[ME]));
  }
  const q = (path, o) => rest(path, o);
  async function fetchView(){
    const id = encodeURIComponent(me());
    const [profiles, posts, myPosts, replies, myReplies, likes, rlikes, follows, blocks] = await Promise.all([
      q('/rest/v1/profiles_pub?select=user_id,private,data&limit=1000'),
      q('/rest/v1/posts?select=id,author,data,at&order=created_at.desc&limit=300'),
      q(`/rest/v1/posts?select=id,author,data,at,hidden&author=eq.${id}`),
      q('/rest/v1/replies?select=id,post_id,author,parent_id,text,at&order=created_at.desc&limit=3000'),
      q(`/rest/v1/replies?select=id,post_id,author,parent_id,text,at,hidden&author=eq.${id}`),
      q('/rest/v1/post_likes?select=post_id,user_id,at&limit=10000'),
      q('/rest/v1/reply_likes?select=reply_id,user_id,at&limit=10000'),
      q('/rest/v1/follows?select=follower,followee,accepted,at&limit=10000'),
      q(`/rest/v1/blocks?select=blocked&blocker=eq.${id}`)
    ]);
    const meRow = (profiles || []).find(r => r.user_id === me());
    const view = toView(me(), {profiles, posts, myPosts, replies, myReplies, likes, rlikes, follows, blocks, me:meRow});
    view.remote = await remoteFor(mediaPaths(me(), view, posts)); return view;
  }
  async function run(){
    while (want && base){
      const target = want, snap = wantSnap, ops = diff(base, target, me());
      if (!ops.length){ if (want === target) want = null; break; }
      onState('saving');
      for (const op of ops){
        try { await uploadsFor(op, snap); await q(op.path, op); }
        catch (e) {
          if (e && e.code === 'network'){ onState('offline', e); return; }
          // 서버가 거절한 요청(이미 지워진 스토리에 답글 등)은 건너뛴다. 계속 붙잡고 있으면 다음 저장도 막힌다.
        }
      }
      base = target; if (want === target) want = null;
    }
    onState('saved');
  }
  const flush = async () => { if (timer){ clearTimer(timer); timer = null; } while (running) await running; if (!want || !base) return; running = run().finally(() => { running = null; }); return running; };
  return {
    fetchView,
    // 서버 보기를 화면에 넣은 뒤 호출: 그때부터 서버와 내 기록의 차이를 올린다(처음에는 서버에 없던 내 글을 올림).
    ready(view, snap){ base = view.mine; want = extract(snap); wantSnap = snap; if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, 0); },
    // 내 기록이 바뀔 때마다 호출: 바뀐 몫을 모아서 올린다.
    change(snap){ if (!base) return; want = extract(snap); wantSnap = snap; if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, delay); },
    flush, pending:() => !!want || !!running,
    accept:async uid => q(`/rest/v1/follows?follower=eq.${encodeURIComponent(uid)}&followee=eq.${encodeURIComponent(me())}`, {method:'PATCH', body:{accepted:true}, prefer:'return=minimal'}),
    reject:async uid => q(`/rest/v1/follows?follower=eq.${encodeURIComponent(uid)}&followee=eq.${encodeURIComponent(me())}`, {method:'DELETE'}),
    // 회원 탈퇴 전: 내 사진을 저장소에서 모두 지운다(계정 삭제만으로는 저장소 파일이 지워지지 않는다).
    async purgeMedia(){
      for (const kind of ['s', 'p']){
        for (let guard = 0; guard < 50; guard++){
          let list; try { list = await q('/storage/v1/object/list/media', {method:'POST', body:{prefix:`${me()}/${kind}`, limit:500, offset:0}}); }
          catch (e) { if (e && e.code === 'network') throw e; break; } // 저장소가 아직 없으면 지울 사진도 없다
          const names = (Array.isArray(list) ? list : []).map(x => x && x.name).filter(Boolean);
          if (!names.length) break;
          await q('/storage/v1/object/media', {method:'DELETE', body:{prefixes:names.map(n => `${me()}/${kind}/${n}`)}});
        }
      }
    },
    report:async (type, target, reason = '') => q('/rest/v1/reports', {method:'POST', body:{reporter:me(), target_type:type, target_id:String(target).slice(0, 64), reason:String(reason).slice(0, 500)}, prefer:'return=minimal'})
  };
}

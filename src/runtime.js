/** UI API contract: async operations resolve only AFTER storage flush.
 * Explicit state/storage/id/clock inputs; no hidden UI globals, no server identity.
 * Transactions cover one API call, not multiple UI calls or multiple browser tabs.
 */
import {clone} from './storage.js';
import {migrateEconomy, processEconomy, redeemPersonal, purchaseStyle, purchaseAction, equipStyle, chooseMilestone, balances} from './economy.js';
// 수치 기록이 붙은 스토리는 시작값·목표·단위를 함께 담는다. 다른 회원은 내 퀘스트를 갖고 있지 않아서, 이 값으로 수치 그래프를 그린다.
function metricSnap(s, p){
  const m = p && typeof p.value === 'number' && p.ref && s.projects && s.projects[p.ref.id] && s.projects[p.ref.id].metric;
  if (m && Number.isFinite(+m.start) && Number.isFinite(+m.target)) p.ref = {...p.ref, extra:{...(p.ref.extra || {}), ms:+m.start, mt:+m.target, mu:String(m.unit || '').slice(0, 20)}};
  return p;
}
export function createAPI({state, storage, id, now = Date.now, color = '#3DBE8B'}) {
  const me = storage.identity;
  const write = fn => async (...args) => {
    let result;
    storage.commit(state, next => {
      const at = now(); migrateEconomy(next, at, me);
      const before = clone(next), start = next.economy.events.length, balance = balances(next);
      fn(next, ...args); processEconomy(next, before, at, me);
      const after = balances(next);
      result = {xp:after.xp-balance.xp, coins:after.raw-balance.raw, events:clone(next.economy.events.slice(start))};
    });
    return result;
  };
  const doc = (map, key) => { if (!Object.hasOwn(map, key)) throw new Error('문서를 찾을 수 없습니다.'); return map[key]; };
  const put = (map, key, value) => { if (!key || ['__proto__','prototype','constructor'].includes(key)) throw new Error('잘못된 ID입니다.'); map[key] = {...clone(value), id:key}; };
  return {
    initEconomy:write(() => {}),
    redeem:write((s, rewardId, purchaseId = id()) => redeemPersonal(s,rewardId,purchaseId,now())),
    buyStyle:write((s, itemId, purchaseId = id()) => purchaseStyle(s,itemId,purchaseId,now())),
    purchaseAction:write((s, key, action) => purchaseAction(s,key,action,now())),
    equip:write((s, itemId) => equipStyle(s,itemId)),
    chooseMilestone:write((s, level, itemId) => chooseMilestone(s,level,itemId,now())),
    saveProfile:write((s, p) => { s.profiles[me] = {uid:me, nick:'로컬 테스트', color, bio:'', private:false, ...s.profiles[me], ...clone(p)}; }),
    saveStats:write((s, stats) => { doc(s.profiles, me).stats = clone(stats); }),
    putMine:write((s, key, value) => put(s.mine, key, value)),
    delMine:write((s, key) => { delete s.mine[key]; }),
    putProject:write((s, key, value) => put(s.projects, key, value)),
    delProject:write((s, key) => {
      const p = s.projects[key]; delete s.projects[key];
      for (const m of Object.values(s.mine)) if (m.projectId === key) m.projectId = null;
      if (p?.cover && !Object.values(s.projects).some(x => x.cover === p.cover)) delete s.media[p.cover];
    }),
    addPost:write((s, post, photos = []) => {
      const key = id(); photos.forEach((src, i) => { s.media[key+'~'+i] = src; });
      s.feed[key] = metricSnap(s, {...clone(post), id:key, author:me, imgs:photos.length, reactions:{}, joiners:{}, createdAt:now()});
    }),
    delPost:write((s, key) => {
      delete s.feed[key];
      // Exact prefix (including ~): deleting a must never delete ab~0 or another workspace.
      for (const mediaKey of Object.keys(s.media)) if (mediaKey.startsWith(key+'~')) delete s.media[mediaKey];
      for (const [replyKey, reply] of Object.entries(s.replies)) if (reply.postId === key) delete s.replies[replyKey];
    }),
    editPost:write((s, key, patch) => { s.feed[key] = metricSnap(s, {...doc(s.feed,key), ...clone(patch), id:key}); }),
    like:write((s, key, value) => { const p = doc(s.feed,key); p.reactions = {...p.reactions, [me]:value ? {k:'heart', at:now()} : 0}; }),
    join:write((s, key) => { const p = doc(s.feed,key); p.joiners = {...p.joiners, [me]:now()}; }),
    addReply:write((s, pid, text, parentId) => { doc(s.feed,pid); const key = id(); s.replies[key] = {id:key, postId:pid, author:me, text, parentId:parentId || null, likes:{}, createdAt:now()}; }),
    editReply:write((s, key, text) => { const r = doc(s.replies,key); if (r.author !== me) throw new Error('내 답글만 고칠 수 있어요.'); r.text = String(text); r.editedAt = now(); }),
    delReply:write((s, key) => { if (doc(s.replies,key).author !== me) throw new Error('내 답글만 지울 수 있어요.'); delete s.replies[key]; }),
    likeReply:write((s, key, value) => { const r = doc(s.replies,key); r.likes = {...r.likes, [me]:value ? now() : 0}; }),
    follow:write((s, user, value) => { const key = me+'~'+user; if (value) s.follows[key] = {from:me, to:user, at:now()}; else delete s.follows[key]; }),
    getMedia:async key => state.media[key] || '',
    putMedia:write((s, key, data) => { if (!key || ['__proto__','constructor','prototype'].includes(key)) throw new Error('잘못된 이미지 키입니다.'); s.media[key] = data; })
  };
}

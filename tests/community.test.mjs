import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toView, mergeView, extract, diff, ownOnly, cleanPost, createCommunity, mediaPaths, dataBytes, ME} from '../src/community.js';
import {emptySnapshot, validateSnapshot} from '../src/storage.js';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
const rows = () => ({
  profiles:[{user_id:A, private:false, data:{nick:'나', xp:10}}, {user_id:B, private:false, data:{nick:'<b>비</b>', bio:'안녕', color:'red;x', xp:120}}, {user_id:C, private:true, data:{nick:'씨'}}],
  posts:[{id:'pb1', author:B, data:{text:'비의 글', ref:{type:'project', id:'x"onclick=1', label:'목표'}, evil:{__proto__:1}}, at:2000},
    {id:'pa1', author:A, data:{text:'내 글'}, at:1000}],
  myPosts:[{id:'pa1', author:A, data:{text:'내 글'}, at:1000}],
  replies:[{id:'rb1', post_id:'pa1', author:B, parent_id:null, text:'좋아요', at:1500}, {id:'ra1', post_id:'pb1', author:A, parent_id:null, text:'응원해요', at:2100}, {id:'orphan', post_id:'gone', author:B, text:'x', at:1}],
  myReplies:[{id:'ra1', post_id:'pb1', author:A, parent_id:null, text:'응원해요', at:2100}],
  likes:[{post_id:'pa1', user_id:B, at:1600}, {post_id:'pb1', user_id:A, at:2050}],
  rlikes:[{reply_id:'rb1', user_id:A, at:1700}],
  follows:[{follower:A, followee:B, accepted:true, at:5}, {follower:B, followee:A, accepted:true, at:6}, {follower:A, followee:C, accepted:false, at:7}, {follower:C, followee:A, accepted:false, at:8}],
  blocks:[], me:{user_id:A, private:false, data:{nick:'나', xp:10}}
});

test('community view: server rows become app records; I am "me"; untrusted fields are dropped', () => {
  const v = toView(A, rows());
  assert.equal(v.feed.pa1.author, ME); assert.equal(v.feed.pb1.author, B);
  assert.equal(v.feed.pb1.ref, null, 'ref with unsafe id is dropped'); assert.ok(!('evil' in v.feed.pb1));
  assert.deepEqual(Object.keys(v.feed.pa1.reactions), [B]); assert.equal(v.feed.pb1.reactions[ME].at, 2050);
  assert.equal(v.replies.rb1.likes[ME], 1700); assert.ok(!v.replies.orphan, 'replies to unknown stories are skipped');
  assert.ok(v.follows[`${ME}~${B}`] && v.follows[`${B}~${ME}`]); assert.ok(!v.follows[`${ME}~${C}`], 'pending is not following');
  assert.deepEqual(v.pending, {[C]:true}); assert.deepEqual(v.requests, [{uid:C, at:8}]);
  assert.equal(v.profiles[B].color, '#3DBE8B'); assert.equal(v.profiles[B].stats.xp, 120); assert.ok(!v.profiles[A], 'own profile stays local');
  assert.deepEqual(Object.keys(v.mine.posts), ['pa1']); assert.deepEqual(Object.keys(v.mine.replies), ['ra1']);
  assert.deepEqual(v.mine.likes, {pb1:2050}); assert.deepEqual(v.mine.follows, {[B]:5, [C]:7});
  assert.deepEqual(cleanPost({text:'a', value:3, noReply:true, ref:{type:'quest', id:'q1', label:'물', extra:{streak:3, days:[1, 2, 'x'], deep:{a:1}}}}),
    {text:'a', mood:null, ref:{type:'quest', id:'q1', label:'물', extra:{streak:3, days:[1, 2]}}, value:3, noReply:true});
});

test('community merge: my stories stay mine (with server likes), others come from the server; result passes snapshot validation', () => {
  const v = toView(A, rows());
  const local = {...emptySnapshot(), profiles:{me:{uid:'me', nick:'나', private:false}},
    feed:{pa1:{id:'pa1', author:ME, text:'내 글', imgs:2, reactions:{}, joiners:{}, createdAt:1000}, new1:{id:'new1', author:ME, text:'아직 안 올린 글', imgs:0, reactions:{}, joiners:{}, createdAt:3000}}};
  const m = mergeView(local, v);
  assert.equal(m.feed.pa1.imgs, 2, 'local copy of my story is kept'); assert.deepEqual(Object.keys(m.feed.pa1.reactions), [B]);
  assert.ok(m.feed.new1 && m.feed.pb1); assert.ok(m.follows[`${ME}~${C}`], 'pending request kept for the button label');
  assert.equal(m.profiles.me.nick, '나'); assert.equal(m.profiles[B].nick, '<b>비</b>');
  validateSnapshot(m);
  // 처음 연결: 서버에 없던 내 글만 올린다
  const ops = diff(v.mine, extract(m), A);
  assert.deepEqual(ops.map(o => o.method + ' ' + o.path.split('?')[0]), ['POST /rest/v1/profiles_pub', 'POST /rest/v1/posts']);
  assert.deepEqual(ops[1].body.map(x => x.id), ['pa1', 'new1'], 'my story with photos is re-sent with its photo count');
  assert.equal(ops[1].body[0].data.imgs, 2); assert.equal(ops[1].body[1].author, A); assert.equal(ops[1].body[1].data.text, '아직 안 올린 글');
  // 내 기록에는 내 몫만 저장
  const own = ownOnly(m);
  assert.deepEqual(Object.keys(own.feed).sort(), ['new1', 'pa1']); assert.deepEqual(own.feed.pa1.reactions, {});
  assert.deepEqual(Object.keys(own.replies), ['ra1']); assert.deepEqual(own.follows, {}); assert.deepEqual(Object.keys(own.profiles), ['me']);
});

test('community diff: likes, replies, follows, blocks, edits and deletes become the right requests', () => {
  const v = toView(A, rows()), s0 = mergeView({...emptySnapshot(), profiles:{me:{uid:'me', nick:'나', private:false}}}, v), a = extract(s0);
  const s1 = structuredClone(s0);
  delete s1.feed.pb1.reactions[ME];                                   // 공감 취소
  s1.replies.rb1.likes = {};                                          // 답글 공감 취소
  s1.replies.ra2 = {id:'ra2', postId:'pb1', author:ME, text:'또', parentId:'rb1', likes:{}, createdAt:4000};
  delete s1.follows[`${ME}~${B}`]; s1.follows[`${ME}~${C}`] = {from:ME, to:C, at:7};
  s1.mine.settings = {kind:'settings', blocked:[B, 'local-fake']};
  s1.feed.pa1.text = '고친 글';
  s1.profiles.me.private = true;
  const ops = diff(a, extract(s1), A).map(o => `${o.method} ${decodeURIComponent(o.path)}`);
  assert.deepEqual(ops.map(o => o.split('?')[0]), ['POST /rest/v1/profiles_pub', 'POST /rest/v1/posts', 'POST /rest/v1/replies', 'POST /rest/v1/blocks', 'DELETE /rest/v1/follows', 'DELETE /rest/v1/reply_likes', 'DELETE /rest/v1/post_likes']);
  assert.match(ops[4], new RegExp(`follower=eq.${A}&followee=in.\\(${B}\\)`));
  // 내 스토리 삭제: 그 스토리의 내 답글은 서버가 함께 지운다(따로 요청하지 않음)
  const s2 = structuredClone(s1); delete s2.feed.pa1; for (const [k, r] of Object.entries(s2.replies)) if (r.postId === 'pa1') delete s2.replies[k];
  const del = diff(extract(s1), extract(s2), A).map(o => `${o.method} ${decodeURIComponent(o.path)}`);
  assert.deepEqual(del, [`DELETE /rest/v1/posts?author=eq.${A}&id=in.(pa1)`]);
});

test('community sync: waits for the first server view, uploads in order, keeps unsent changes when offline, skips rejected requests', async () => {
  const calls = []; let offline = false, reject = false;
  const rest = async (path, o = {}) => { if (offline){ const e = new Error('net'); e.code = 'network'; throw e; } calls.push((o.method || 'GET') + ' ' + path.split('?')[0]); if (reject && o.method === 'POST' && path.startsWith('/rest/v1/replies')) throw Object.assign(new Error('x'), {code:'23503'}); return path.startsWith('/rest/v1/profiles_pub') && !o.method ? rows().profiles : []; };
  let fire = null; const states = [];
  const c = createCommunity({rest, me:() => A, setTimer:fn => { fire = fn; return 1; }, clearTimer:() => {}, onState:s => states.push(s)});
  const base = {...emptySnapshot(), profiles:{me:{uid:'me', nick:'나', private:false}}};
  c.change({...base, feed:{p:{id:'p', author:ME, text:'x', reactions:{}, createdAt:1}}});
  assert.equal(c.pending(), false, 'nothing is sent before the server view is known');
  const view = await c.fetchView(); assert.equal(calls.length, 9); calls.length = 0;
  const snap = mergeView(base, view); c.ready(view, snap); fire(); await c.flush();
  assert.deepEqual(calls, ['POST /rest/v1/profiles_pub']); calls.length = 0;
  const s2 = structuredClone(snap); s2.feed.p1 = {id:'p1', author:ME, text:'새 글', imgs:0, reactions:{}, joiners:{}, createdAt:9};
  offline = true; c.change(s2); fire(); await c.flush(); assert.equal(c.pending(), true); assert.ok(states.includes('offline'));
  offline = false; reject = true; s2.replies.r = {id:'r', postId:'p1', author:ME, text:'답', likes:{}, createdAt:10}; c.change(s2); await c.flush();
  assert.deepEqual(calls, ['POST /rest/v1/posts', 'POST /rest/v1/replies']); assert.equal(c.pending(), false, 'rejected request does not block later saves');
  calls.length = 0; await c.report('post', 'p1'); await c.accept(C); await c.reject(C);
  assert.deepEqual(calls, ['POST /rest/v1/reports', 'PATCH /rest/v1/follows', 'DELETE /rest/v1/follows']);
});

test('community photos: my photos upload before the story; others\' photos and faces come as signed links (reused, not re-signed every minute); hidden stories are labelled for the author', async () => {
  const JPG = 'data:image/jpeg;base64,' + Buffer.from('jpeg-bytes').toString('base64');
  assert.deepEqual([...dataBytes(JPG).bytes].map(c => String.fromCharCode(c)).join(''), 'jpeg-bytes'); assert.equal(dataBytes('data:image/svg+xml;base64,AA=='), null);
  const r = rows(); r.posts[0].data.imgs = 2; r.profiles[1].data.face = 'abc12'; r.profiles[1].data.avatarStyle = 'photo'; r.myPosts[0].hidden = true; r.myReplies[0].hidden = true;
  const v = toView(A, r);
  assert.equal(v.feed.pb1.imgs, 2); assert.equal(v.profiles[B].face, 'rf~' + B); assert.equal(v.profiles[B].avatarStyle, 'photo'); assert.equal(v.feed.pa1.modHidden, true); assert.equal(v.replies.ra1.modHidden, true); assert.ok(!v.replies.rb1.modHidden);
  assert.deepEqual(mediaPaths(A, v, r.posts), [{key:'pb1~0', path:`${B}/s/pb1~0`}, {key:'pb1~1', path:`${B}/s/pb1~1`}, {key:'rf~' + B, path:`${B}/p/face-abc12`}]);
  const local = {...emptySnapshot(), profiles:{me:{uid:'me', nick:'나', face:'face-1', avatarStyle:'photo'}}, media:{'face-1':JPG}, feed:{pa1:{id:'pa1', author:ME, text:'내 글', imgs:0, reactions:{}, joiners:{}, createdAt:1000}}};
  assert.equal(mergeView(local, v).feed.pa1.modHidden, true);
  // 업로드·서명 흐름
  const calls = []; let t = 0, signs = 0;
  const rest = async (path, o = {}) => { calls.push((o.method || 'GET') + ' ' + path.split('?')[0]); return path.startsWith('/rest/v1/posts?') && !o.method ? r.posts : path.startsWith('/rest/v1/profiles_pub') && !o.method ? r.profiles : []; };
  const c = createCommunity({rest, me:() => A, now:() => t, setTimer:fn => { fn(); return 1; }, clearTimer:() => {},
    sign:async paths => { signs++; return paths.map(p => ({path:p, url:'https://x.supabase.co/storage/v1/object/sign/media/' + p + '?token=' + t})); },
    upload:async (path, bytes, type) => { calls.push('UPLOAD ' + path + ' ' + type + ' ' + bytes.length); }});
  let view = await c.fetchView(); assert.match(view.remote['pb1~1'], /pb1~1\?token=0$/); assert.match(view.remote['rf~' + B], /face-abc12/); assert.equal(signs, 1);
  t = 10 * 60000; view = await c.fetchView(); assert.equal(signs, 1, 'fresh links are reused'); assert.match(view.remote['pb1~0'], /token=0$/);
  t = 50 * 60000; view = await c.fetchView(); assert.equal(signs, 2); assert.match(view.remote['pb1~0'], /token=3000000$/);
  calls.length = 0;
  const snap = mergeView(local, view); c.ready(view, snap); await c.flush(); calls.length = 0;
  const s2 = structuredClone(snap); s2.feed.p9 = {id:'p9', author:ME, text:'사진 스토리', imgs:1, reactions:{}, joiners:{}, createdAt:5}; s2.media['p9~0'] = JPG;
  c.change(s2); await c.flush();
  assert.deepEqual(calls, [`UPLOAD ${A}/s/p9~0 image/jpeg 10`, 'POST /rest/v1/posts']);
  // 스토리를 지우면 사진도 저장소에서 지운다
  calls.length = 0; const s3 = structuredClone(s2); delete s3.feed.p9; c.change(s3); await c.flush();
  assert.deepEqual(calls, ['DELETE /rest/v1/posts', 'DELETE /storage/v1/object/media']);
  // 회원 탈퇴 전 사진 정리: 목록 → 삭제 → 빈 목록
  let listed = 0; const purgeCalls = [];
  const p = createCommunity({rest:async (path, o = {}) => { purgeCalls.push(o.method + ' ' + path + (o.body && o.body.prefixes ? ' ' + o.body.prefixes.join(',') : ''));
    return path.includes('/list/') ? (listed++ % 2 === 0 ? [{name:'x~0'}] : []) : null; }, me:() => A});
  await p.purgeMedia();
  assert.deepEqual(purgeCalls, ['POST /storage/v1/object/list/media', `DELETE /storage/v1/object/media ${A}/s/x~0`, 'POST /storage/v1/object/list/media', 'POST /storage/v1/object/list/media', `DELETE /storage/v1/object/media ${A}/p/x~0`, 'POST /storage/v1/object/list/media']);
});

test('community SQL: row level security on every table, private accounts need approval, blocks hide both ways, reports are insert-only', async () => {
  const sql = await readFile(new URL('../supabase/community.sql', import.meta.url), 'utf8');
  for (const t of ['profiles_pub', 'posts', 'replies', 'post_likes', 'reply_likes', 'follows', 'blocks', 'reports']){
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?references auth\\.users\\(id\\) on delete cascade`), t + ' cascades on account deletion');
  }
  assert.match(sql, /can_see\(owner uuid\)[\s\S]*b\.blocker = owner and b\.blocked = auth\.uid\(\)\) or \(b\.blocker = auth\.uid\(\) and b\.blocked = owner/);
  assert.match(sql, /new\.accepted := not coalesce\(\(select p\.private/);
  assert.match(sql, /grant insert on public\.reports to authenticated;/); assert.doesNotMatch(sql, /on public\.reports for select/);
  assert.match(sql, /revoke all on public\.profiles_pub[^;]*from anon/);
  const sql2 = await readFile(new URL('../supabase/community-2.sql', import.meta.url), 'utf8');
  assert.match(sql2, /values \('media', 'media', false,/); assert.match(sql2, /on storage\.objects for select to authenticated using \(bucket_id = 'media' and public\.media_visible\(name\)\)/);
  assert.match(sql2, /if tg_op = 'INSERT' then new\.hidden := false; else new\.hidden := old\.hidden; end if;/);
  assert.match(sql2, /vault\.decrypted_secrets where name = 'resend_api_key'/); assert.doesNotMatch(sql2, /re_[A-Za-z0-9]{8,}/, 'no real API key in the file');
  assert.match(sql, /not hidden and public\.can_see\(author\)/, 'base script keeps the hidden rule if it is run again');
  assert.match(sql2, /create trigger replies_keep_hidden/); assert.match(sql2, /target_type = 'reply'/);
});

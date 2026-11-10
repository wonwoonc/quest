/** Snapshot contract: JSON-only, v2, seven dictionary collections. Preferences use a separate key.
 * Backend boundary: no DOM, no fixture imports, no account/provider capabilities.
 * Writes are synchronous and fail loudly; never silently replace corrupt data.
 */
export const COLLECTIONS = ['profiles', 'projects', 'feed', 'replies', 'follows', 'mine', 'media'];
export const NAMESPACES = Object.freeze({empty:'quest:foundation:empty:v2', demo:'quest:foundation:demo:v2'});
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
export function emptySnapshot() {
  return {v:2, at:0, ...Object.fromEntries(COLLECTIONS.map(k => [k, {}]))};
}
/** Deep copy of JSON data. Same result as JSON.parse(JSON.stringify(v)) for the values a snapshot may hold
 * (undefined members are dropped, undefined array slots become null) but strings are shared, not re-encoded:
 * a snapshot with several megabytes of images copies in microseconds instead of re-serialising every image. */
export function clone(v) {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? null : v;
  if (Array.isArray(v)) { const out = new Array(v.length); for (let i = 0; i < v.length; i++) out[i] = v[i] === undefined ? null : clone(v[i]); return out; }
  if (typeof v.toJSON === 'function') return clone(v.toJSON());
  const out = {};
  for (const key of Object.keys(v)) { const child = v[key]; if (child !== undefined && typeof child !== 'function' && typeof child !== 'symbol') out[key] = clone(child); }
  return out;
}
/* ---- import-only rules -------------------------------------------------------------------------------------
 * A backup file is untrusted input. Besides the structural checks above, an imported file must not carry values
 * that the UI places into HTML attributes (ids, image sources, colours, counters) in any shape other than the app
 * itself writes. Text the user types (names, notes, journals) stays free-form; the UI escapes it when rendering. */
const SAFE_ID = /^[\w.~:@+-]{1,128}$/;
const SAFE_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)[;,][\w+/=%.,;:~!*'()-]*$/i;
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const ID_KEYS = new Set(['id', 'projectId', 'parentId', 'postId', 'afterId', 'noteId', 'rewardId', 'author', 'owner', 'uid', 'from', 'to']);
const IMAGE_KEYS = new Set(['face', 'cover', 'img']);
const NUMBER_KEYS = new Set(['cond', 'streak', 'total', 'imgs', 'cost', 'dailyLimit', 'weeklyLimit', 'ind', 'size', 'order']);
function inspectStrict(v, key) {
  if (typeof v === 'string') {
    if (!v) return;
    if (ID_KEYS.has(key) && !SAFE_ID.test(v)) throw new Error(`백업의 ${key} 값에 허용되지 않는 문자가 있습니다.`);
    if (IMAGE_KEYS.has(key) && !SAFE_ID.test(v) && !SAFE_IMAGE.test(v)) throw new Error('백업의 이미지 값이 올바르지 않습니다.');
    if (key === 'color' && !SAFE_COLOR.test(v)) throw new Error('백업의 색상 값이 올바르지 않습니다.');
    if (NUMBER_KEYS.has(key) && !NUMERIC.test(v)) throw new Error(`백업의 ${key} 값이 숫자가 아닙니다.`);
    return;
  }
  if (v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) { for (const child of v) inspectStrict(child, key); return; }
  for (const [k, child] of Object.entries(v)) inspectStrict(child, k);
}
function validateImport(snapshot) {
  for (const name of COLLECTIONS) {
    for (const [id, doc] of Object.entries(snapshot[name])) {
      if (!SAFE_ID.test(id)) throw new Error('백업의 문서 ID에 허용되지 않는 문자가 있습니다.');
      if (name === 'media') { if (doc && !SAFE_IMAGE.test(doc)) throw new Error('백업의 이미지 형식이 올바르지 않습니다.'); }
      else inspectStrict(doc, '');
    }
  }
  return snapshot;
}
function inspect(v, depth = 0) {
  if (depth > 32) throw new Error('백업 중첩 깊이가 너무 큽니다.');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number' && Number.isFinite(v)) return;
  if (!Array.isArray(v) && !plain(v)) throw new Error('JSON 데이터만 저장할 수 있습니다.');
  for (const [key, child] of Object.entries(v)) {
    if (FORBIDDEN.has(key)) throw new Error('허용되지 않는 데이터 키입니다.');
    inspect(child, depth + 1);
  }
}
export function validateSnapshot(input, {allowLegacy = false} = {}) {
  if (!plain(input) || !(input.v === 2 || (allowLegacy && input.v === 1))) throw new Error('지원하지 않는 백업 버전입니다.');
  inspect(input);
  if (input.at !== undefined && (!Number.isFinite(input.at) || input.at < 0)) throw new Error('백업 시간이 올바르지 않습니다.');
  for (const name of COLLECTIONS) {
    if (!plain(input[name])) throw new Error(`백업의 ${name} 컬렉션이 올바르지 않습니다.`);
    for (const [id, doc] of Object.entries(input[name])) {
      if (!id || id.length > 512) throw new Error('문서 ID가 올바르지 않습니다.');
      if (name === 'media') {
        if (typeof doc !== 'string' || (doc && !/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(doc))) throw new Error('이미지 형식이 올바르지 않습니다.');
      } else {
        if (!plain(doc)) throw new Error(`문서 ${id} 형식이 올바르지 않습니다.`);
        if (doc.id !== undefined && doc.id !== id) throw new Error('문서 ID와 키가 일치하지 않습니다.');
        for (const key of ['author', 'owner', 'uid', 'kind', 'postId', 'from', 'to']) {
          if (doc[key] !== undefined && typeof doc[key] !== 'string') throw new Error(`문서의 ${key} 형식이 올바르지 않습니다.`);
        }
        for (const key of ['createdAt', 'doneAt', 'at', 'imgs']) {
          if (doc[key] != null && (!Number.isFinite(doc[key]) || doc[key] < 0)) throw new Error(`문서의 ${key} 값이 올바르지 않습니다.`);
        }
        if (doc.imgs !== undefined && (!Number.isInteger(doc.imgs) || doc.imgs > 4)) throw new Error('이미지 수가 올바르지 않습니다.');
        for (const key of ['nick', 'bio', 'text', 'name', 'title']) {
          if (doc[key] != null && typeof doc[key] !== 'string') throw new Error(`문서의 ${key} 값이 올바르지 않습니다.`);
        }
        for (const key of ['done', 'reactions', 'joiners', 'likes', 'items', 'stats']) {
          if (doc[key] != null && typeof doc[key] !== 'boolean' && !plain(doc[key])) throw new Error(`문서의 ${key} 값이 올바르지 않습니다.`);
        }
      }
    }
  }
  if (input.economy !== undefined && (!plain(input.economy) || input.economy.version !== 1 || !Array.isArray(input.economy.events) || !plain(input.economy.claims))) throw new Error('경제 원장 형식이 올바르지 않습니다.');
  if (input.economy) {
    for (const name of ['seenGoals','inventory','equipped','milestones','metricLast','purchases']) if (!plain(input.economy[name])) throw new Error('경제 인덱스 형식이 올바르지 않습니다.');
    for (const c of Object.values(input.economy.claims)) if (!plain(c) || !Number.isFinite(c.xp) || !Number.isFinite(c.coins) || c.xp < 0 || c.coins < 0 || typeof c.active !== 'boolean') throw new Error('경제 지급 기록 형식이 올바르지 않습니다.');
  }
  if (input.economy) for (const [i, row] of input.economy.events.entries()) if (!plain(row) || row.seq !== i+1 || !Number.isFinite(row.xp) || !Number.isFinite(row.coins) || !Number.isFinite(row.at)) throw new Error('경제 이벤트 형식이 올바르지 않습니다.');
  const out = {v:2, at:input.at || 0, ...Object.fromEntries(COLLECTIONS.map(k => [k, clone(input[k])])), ...(input.economy ? {economy:clone(input.economy)} : {})};
  // Read compatibility only: expand old monthly bundles on explicit file import.
  if (input.v === 1) {
    const kinds = {m:'mission', d:'diary', b:'buy'};
    for (const [bid, doc] of Object.entries(out.mine)) {
      if (doc.kind === 'ax') {
        if (!kinds[doc.of] || !plain(doc.items)) throw new Error('이전 아카이브 형식이 올바르지 않습니다.');
        for (const [id, item] of Object.entries(doc.items)) {
          if (!plain(item)) throw new Error('이전 아카이브 항목이 올바르지 않습니다.');
          if (!out.mine[id]) out.mine[id] = {...item, id, kind:kinds[doc.of]};
        }
        delete out.mine[bid];
      }
    }
    for (const doc of Object.values(out.mine)) delete doc._arch;
    return validateSnapshot(out);
  }
  return out;
}
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) throw new Error('백업 파일이 너무 크거나 잘못되었습니다.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSON 백업을 읽을 수 없습니다.'); }
  return validateImport(validateSnapshot(parsed, {allowLegacy:true}));
}
export function createStorage({driver, mode = 'empty', now = Date.now, onError = () => {}}) {
  if (!Object.hasOwn(NAMESPACES, mode)) throw new Error('잘못된 작업 공간입니다.');
  const key = NAMESPACES[mode], prefKey = key + ':preferences';
  const perform = fn => { try { return fn(); } catch (error) { onError(error); throw error; } };
  const capture = state => validateSnapshot({v:2, at:now(), ...Object.fromEntries(COLLECTIONS.map(k => [k, state[k]])), ...(state.economy ? {economy:state.economy} : {})});
  const persist = snapshot => perform(() => { const valid = validateSnapshot(snapshot); driver.setItem(key, JSON.stringify(valid)); return valid; });
  // `valid` must already be a validated snapshot that nobody else holds (the return value of validateSnapshot/persist).
  const adopt = (state, valid) => { for (const k of COLLECTIONS) state[k] = valid[k]; if (valid.economy) state.economy = valid.economy; else delete state.economy; return state; };
  const hydrate = (state, snapshot) => adopt(state, validateSnapshot(snapshot));
  return {
    key, mode, identity:'me', empty:emptySnapshot, capture, hydrate,
    load:() => perform(() => { const text = driver.getItem(key); return text === null ? null : validateSnapshot(JSON.parse(text)); }),
    save:state => persist(capture(state)),
    commit(state, mutate) {
      // capture = private validated copy; persist validates the mutated copy again before writing and returns
      // a fresh copy that the state adopts directly (no third validation pass, no extra copy).
      const next = capture(state); mutate(next); const valid = persist(next); adopt(state, valid); return valid;
    },
    export:state => JSON.stringify(capture(state), null, 2),
    import(text) { const valid = parseBackup(text); return persist(valid); },
    // Persist the empty state instead of removeItem: demo reset must NOT re-seed on reload.
    reset:() => perform(() => { driver.removeItem(prefKey); return persist(emptySnapshot()); }),
    preferences:{
      get:(name, fallback) => perform(() => { const raw = driver.getItem(prefKey); if (raw === null) return fallback; const p = JSON.parse(raw); inspect(p); if (!plain(p)) throw new Error('설정 형식이 올바르지 않습니다.'); return Object.hasOwn(p, name) ? p[name] : fallback; }),
      set:(name, value) => perform(() => { const raw = driver.getItem(prefKey); const p = raw === null ? {} : JSON.parse(raw); inspect(p); if (!plain(p) || FORBIDDEN.has(name)) throw new Error('설정 키가 올바르지 않습니다.'); p[name] = value; inspect(p); driver.setItem(prefKey, JSON.stringify(p)); })
    }
  };
}

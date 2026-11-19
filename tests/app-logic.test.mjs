import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/logic.js';
const T = '2026-11-19'; // 목요일

test('app parse v2: repeats, dates, time ranges, quest tags, difficulty', () => {
  const q = [{id:'q1', title:'토익 900점'}];
  let p = L.parse('매주 월수금 저녁 8시 헬스', T); assert.deepEqual([p.type, p.rule, p.time, p.title, p.area], ['h', {type:'week', days:[1,3,5]}, '20:00', '헬스', ['health']]);
  p = L.parse('격주 화요일 스터디', T); assert.deepEqual([p.type, p.rule.type, p.rule.days], ['h', 'biweek', [2]]);
  p = L.parse('매달 25일 가계부 정리', T); assert.deepEqual([p.type, p.rule, p.area], ['h', {type:'month', dates:[25]}, ['money']]);
  p = L.parse('3일마다 화분 물주기', T); assert.deepEqual([p.rule.type, p.rule.n], ['every', 3]);
  p = L.parse('금요일 오후 2시 치과 예약', T); assert.deepEqual([p.type, p.date, p.time, p.title], ['e', '2026-11-20', '14:00', '치과 예약']);
  p = L.parse('내일 3시~5시 팀 회의', T); assert.deepEqual([p.type, p.date, p.time, p.etime], ['e', '2026-11-20', '15:00', '17:00']);
  p = L.parse('저녁 8시부터 10시까지 강의 듣기', T); assert.deepEqual([p.time, p.etime, p.title], ['20:00', '22:00', '강의 듣기']);
  p = L.parse('다음 달 3일 자동차 보험 갱신', T); assert.equal(p.date, '2026-12-03');
  p = L.parse('12/24 선물 사기', T); assert.equal(p.date, '2026-12-24');
  p = L.parse('2/1 신년 계획', T); assert.equal(p.date, '2027-02-01');
  p = L.parse('5일 뒤 서류 제출', T); assert.equal(p.date, '2026-11-24');
  p = L.parse('다음 주 월요일 보고서 ! #토익', T, q); assert.deepEqual([p.date, p.lv, p.quest, p.title], ['2026-11-23', 'hard', 'q1', '보고서']);
  p = L.parse('회의록 정리', T); assert.equal(p.type, 'm', 'event words without date/time stay a mission');
  assert.equal(L.parseMany('- 우유 사기\n- 내일 7시 달리기\n\n3. 책 반납', T).length, 3);
});
test('app repeat rules', () => {
  assert.ok(L.occursOn({type:'biweek', days:[4], anchor:T}, T)); assert.ok(!L.occursOn({type:'biweek', days:[4], anchor:T}, '2026-11-26')); assert.ok(L.occursOn({type:'biweek', days:[4], anchor:T}, '2026-12-03'));
  assert.ok(L.occursOn({type:'month', dates:[31]}, '2026-11-30'), 'month end clamps');
  assert.ok(L.occursOn({type:'every', n:3, anchor:T}, '2026-11-25')); assert.ok(!L.occursOn({type:'every', n:3, anchor:T}, '2026-11-18'));
  assert.equal(L.ruleLabel({type:'week', days:[1,2,3,4,5]}), '평일');
});
test('app totals are derived: xp, coins (with level bonus and purchases), shields, stats', () => {
  const S = L.blank('a', 0);
  S.missions.m = {id:'m', done:true, doneAt:T, award:{xp:100, c:10}, area:['growth'], u:1};
  S.logs['h|' + T] = {id:'h|' + T, date:T, award:{xp:5, c:2}, area:['health'], u:1};
  S.buys.b = {id:'b', cost:30, u:1}; S.marks['grant:2026-11'] = {id:'grant:2026-11', kind:'grant', n:1, u:1}; S.marks['rest:x'] = {id:'rest:x', kind:'rest', date:'2026-11-17', u:1};
  const t = L.totals(S);
  assert.equal(t.xp, 105); assert.equal(t.level.L, 2); assert.equal(t.coins, 12 + 20 - 30); assert.equal(t.shields, 0); assert.equal(t.stats.growth, 10); assert.equal(t.stats.health, 1);
  S.missions.m.del = true; assert.equal(L.totals(S).xp, 5, 'deleted items stop counting');
});
test('app merge keeps the newest version of each item and both sides of habit logs', () => {
  const a = L.blank('a', 0), b = L.blank('b', 0);
  a.missions.x = {id:'x', title:'old', u:1}; b.missions.x = {id:'x', title:'new', u:2};
  a.logs['h|1'] = {id:'h|1', u:5}; b.logs['h|2'] = {id:'h|2', u:5};
  b.quests.q = {id:'q', del:true, u:9}; a.quests.q = {id:'q', title:'q', u:3};
  const m = L.merge(a, b, 10);
  assert.equal(m.missions.x.title, 'new'); assert.deepEqual(Object.keys(m.logs).sort(), ['h|1','h|2']); assert.ok(m.quests.q.del);
  assert.ok(!L.merge(a, b, 9 + 61 * 864e5).quests.q, 'old tombstones are dropped');
});
test('app quest progress, streaks and today list', () => {
  const S = L.blank('a', 0);
  S.quests = {m:{id:'m', status:'active', u:1}, s1:{id:'s1', parent:'m', status:'done', u:1}, s2:{id:'s2', parent:'m', status:'active', u:1}, s3:{id:'s3', parent:'m', status:'gaveup', u:1}};
  S.missions = {a:{id:'a', quest:'m', done:true, u:1}, b:{id:'b', quest:'s2', done:false, due:L.addD(T, -2), u:1}};
  assert.deepEqual(L.qProg(S, S.quests.m), {done:1, total:2, sd:1, st:2, left:2, pct:50});
  S.habits.h = {id:'h', title:'단어', rule:L.EVERYDAY(), time:'07:30', u:1};
  S.logs['h|' + L.addD(T, -1)] = {id:'h|' + L.addD(T, -1), date:L.addD(T, -1), u:1}; S.logs['h|' + L.addD(T, -2)] = {id:'x', date:L.addD(T, -2), u:1};
  assert.equal(L.streak(S, T), 2); assert.equal(L.habitStreak(S, S.habits.h, T), 2);
  const it = L.todayItems(S, T); assert.deepEqual(it.map(x => x.id), ['h', 'b']); assert.ok(it[1].late);
  S.habits.h.paused = true; assert.equal(L.todayItems(S, T).length, 1);
});

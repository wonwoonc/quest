import test from 'node:test';
import assert from 'node:assert/strict';
import {parse, levelOf, need, qProg, streak, todayItems, blank, valid, addD, habitOn} from '../next/logic.js';

const T = '2026-11-19'; // 목요일
test('next parse: habits, events, missions with date/time/area', () => {
  let p = parse('매주 월수금 저녁 8시 헬스', T);
  assert.deepEqual([p.type, p.days, p.time, p.title, p.area], ['h', [1,3,5], '20:00', '헬스', ['health']]);
  p = parse('금요일 오후 2시 치과 예약', T);
  assert.deepEqual([p.type, p.date, p.time, p.title], ['e', '2026-11-20', '14:00', '치과 예약']);
  p = parse('내일 7시 반 영단어 30개', T);
  assert.deepEqual([p.type, p.date, p.time, p.area], ['m', '2026-11-20', '07:30', ['growth']]);
  p = parse('3시 보고서 마감', T); assert.equal(p.time, '15:00', 'bare 1~6시 means afternoon');
  p = parse('12월 3일 이력서 제출', T); assert.equal(p.date, '2026-12-03');
  p = parse('1월 5일 신년 계획', T); assert.equal(p.date, '2027-01-05', 'past month rolls to next year');
  p = parse('다음 주 월요일 회의', T); assert.deepEqual([p.type, p.date], ['e', '2026-11-23']);
  p = parse('매일 물 2L', T); assert.deepEqual([p.type, p.days.length], ['h', 7]);
});
test('next levels: 100 * L^1.4 per level', () => {
  assert.equal(need(1), 100); assert.deepEqual(levelOf(0), {L:1, rest:0, need:100});
  assert.equal(levelOf(100).L, 2); assert.equal(levelOf(99).L, 1);
  const L10 = Array.from({length:9}, (_, i) => need(i + 1)).reduce((a, b) => a + b, 0); assert.equal(levelOf(L10).L, 10);
});
test('next quest progress counts stage missions and blocks achieving until all done', () => {
  const S = blank(); S.quests = [{id:'m', parent:null, status:'active'},{id:'s1', parent:'m', status:'done'},{id:'s2', parent:'m', status:'active'}];
  S.missions = [{id:'a', quest:'m', done:true},{id:'b', quest:'s2', done:false},{id:'c', quest:'x', done:false}];
  assert.deepEqual(qProg(S, S.quests[0]), {done:1, total:2, sd:1, st:2, left:2});
  S.missions[1].done = true; S.quests[2].status = 'done'; assert.equal(qProg(S, S.quests[0]).left, 0);
});
test('next streak and today list', () => {
  const S = blank(); S.habits = [{id:'h', days:[0,1,2,3,4,5,6], log:{[addD(T,-1)]:1, [addD(T,-2)]:1}, createdAt:'2026-01-01'}];
  assert.equal(streak(S, T), 2, 'today not done yet keeps yesterday streak');
  S.habits[0].log[T] = 1; assert.equal(streak(S, T), 3);
  S.user.rest = [addD(T,-3)]; S.habits[0].log[addD(T,-4)] = 1; assert.equal(streak(S, T), 5, 'rest day bridges the gap');
  S.missions = [{id:'m1', due:T, time:'09:00', done:false},{id:'m0', due:addD(T,-2), time:'', done:false},{id:'mf', due:addD(T,3), done:false}];
  S.events = [{id:'e', date:T, time:'14:00'}];
  const it = todayItems(S, T); assert.deepEqual(it.map(x => x.id), ['m1','e','h','m0'], 'timed first, then untimed');
  assert.ok(it.find(x => x.id === 'm0').late); assert.ok(!it.find(x => x.id === 'mf'));
  assert.equal(habitOn({days:[1], createdAt:'2027-01-01'}, '2026-11-23'), false, 'not before creation');
});
test('next state validation', () => { assert.ok(valid(blank('a'))); assert.ok(!valid({v:2})); assert.ok(!valid(null)); });

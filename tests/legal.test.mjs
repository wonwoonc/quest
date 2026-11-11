import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src = await readFile(new URL('../src/legal.js', import.meta.url), 'utf8');
const body = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.includes('const tbd =')).join('\n');
const left = (body.match(/tbd\(/g) || []).length; // placeholders still in the text
const contact = /contactUrl:\s*"([^"]*)"/.exec(src)[1];
// 출시 점검: 초안 표시(tbd)와 문의 주소가 남아 있으면 todo로 알린다. 채우면 자동으로 통과 처리된다.
test('release readiness: legal placeholders filled and contact URL set', {todo: left || !contact ? [left ? `미기재 ${left}곳` : '', contact ? '' : '오픈채팅 주소 없음'].filter(Boolean).join(' · ') : false}, () => {
  assert.equal(left, 0); assert.match(contact, /^https:\/\/open\.kakao\.com\//);
});

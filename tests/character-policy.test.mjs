import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CHARACTER_POLICY, characterOptions, permanentCharacterURL} from '../src/character-contract.js';
import {characterPrompt} from '../scripts/character-service.mjs';

const approved = 'https://www.genspark.ai/api/files/s/p8jwqX27?cache_control=3600';
test('approved policy is shared by client and server without legacy proportions', () => {
  const policy = characterOptions('#123ABC').policy;
  assert.equal(policy, CHARACTER_POLICY);
  assert.equal(policy.version, 1);
  assert.equal(policy.styleReference, approved);
  assert.equal(policy.referenceUse, 'style-only');
  const prompt = characterPrompt('#123ABC');
  for (const field of ['style', 'identity', 'clothing']) assert.ok(prompt.includes(policy[field]), field);
  for (const rule of [
    /MapleStory-inspired/, /head 55-60% of total character height/,
    /tiny compact torso/, /short legs and arms/, /tiny shoes/, /Smooth 2D curves/,
    /dark outlines/, /soft cel shading/, /anti-aliasing/,
    /No pixels, pixel art, dithering, stair steps, 3D or adult proportions/,
    /Image 1 is the actual user photo and the ONLY source of identity, hair, facial features and clothing/,
    /Image 2 is STYLE ONLY: never copy its person, face, hair, hoodie or outfit/,
    /appropriate visible clothing from image 1/,
    /modest casual T-shirt in the selected color, long pants and sneakers/,
    /Never force the style reference gray\/dark outfit/, /selected color is #123ABC/
  ]) assert.match(prompt, rule);
  assert.doesNotMatch(prompt, /3[-–](?:3\.5-)?head|3등신|k6ObJ12H/i);
});

test('source, docs and built bundles do not reintroduce the old reference or head count', async () => {
  for (const file of [
    'src/character-contract.js', 'scripts/character-service.mjs', 'src/legacy-app.js',
    'CHARACTER_API.md', 'README.md', 'dist/quest.html', 'dist/quest-demo.html'
  ]) {
    const text = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /k6ObJ12H|3[-–](?:3\.5-)?head|3등신/i, file);
    if (file !== 'scripts/character-service.mjs' && file !== 'src/legacy-app.js') assert.ok(text.includes(approved), file);
  }
  const ui = await readFile(new URL('../src/legacy-app.js', import.meta.url), 'utf8');
  assert.match(ui, /55~60%/);
  assert.match(ui, /참고 이미지는 스타일만 사용/);
  assert.match(ui, /회색·어두운 의상을 강제하지/);
});

const base = 'https://www.genspark.ai/api/files/s/Ab_09-Z';
test('permanent URL accepts strict platform URLs, preserving the optional numeric cache query', () => {
  for (const value of [base, approved, base + '?cache_control=0', base + '?cache_control=3600']) {
    assert.equal(permanentCharacterURL(value), value);
  }
});

test('permanent URL rejects injection, normalization and all other query forms', () => {
  for (const value of [
    null, undefined, 42, {}, '', 'javascript:alert(1)',
    base.replace('https:', 'http:'), base.replace('www.genspark.ai', 'genspark.ai'),
    base.replace('www.genspark.ai', 'www.genspark.ai.evil.test'),
    base.replace('www.genspark.ai', 'www.genspark.ai@evil.test'),
    base.replace('www.genspark.ai', 'user:pass@www.genspark.ai'),
    base.replace('www.genspark.ai', 'www.genspark.ai:443'),
    base.replace('www.genspark.ai', 'www.genspark.ai:8443'),
    base.replace('https:', 'HTTPS:'), base.replace('www.', 'WWW.'),
    ' ' + base, base + '\n', base + '\t', base + '/', base + '/evil',
    base + '#x', base + '#', base + '?', base + '?token=secret',
    base + '?cache_control=', base + '?cache_control=-1',
    base + '?cache_control=1.5', base + '?cache_control=1e3',
    base + '?cache_control=%33', base + '?cache_control=+1',
    base + '?cache_control=3600&x=1', base + '?cache_control=1&cache_control=2',
    base + '?CACHE_CONTROL=1', base + '?cache_control=3600#x',
    base.replace('Ab_09-Z', '%41b_09-Z'), base.replace('Ab_09-Z', '..'),
    base.replace('Ab_09-Z', '../s/Ab_09-Z'), base.replace('/s/', '/s//'),
    base.replace('/api/', '\\api\\'), base.replace('Ab_09-Z', 'abc%2Fdef'),
    base.replace('Ab_09-Z', 'abc" onclick="x'), base + '?cache_control=3600\r\n'
  ]) assert.equal(permanentCharacterURL(value), null, String(value));
});

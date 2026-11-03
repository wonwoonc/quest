import {characterOptions, validCharacterImage, CHARACTER_UNAVAILABLE, permanentCharacterURL} from './character-contract.js';

const ERROR_MESSAGES = {
  DEV_CODE_REQUIRED:'서버 시작 로그의 개발용 코드를 입력해 주세요.',
  ORIGIN_REJECTED:'같은 서버 주소에서만 생성할 수 있어요.',
  PROVIDER_CREDITS_STOPPED:'크레딧 또는 이용 한도 문제로 이 세션의 생성을 중단했어요. 자동 재시도하지 않아요.',
  SESSION_LIMIT:'이 서버 세션의 생성 시도 5회를 모두 사용했어요.',
  GENERATION_BUSY:'이미 생성 중이에요. 완료될 때까지 기다려 주세요.',
  GENERATION_COOLDOWN:'생성 시도 사이에는 최소 30초를 기다려 주세요.',
  GENERATION_TIMEOUT:'생성이 180초 안에 완료되지 않았어요. 자동 재시도하지 않아요.',
  BODY_TOO_LARGE:'사진과 요청을 합쳐 6MB 이하여야 해요.',
  INVALID_PHOTO:'올바른 JPG, PNG 또는 WebP 사진을 선택해 주세요.'
};

// Same-origin only: no provider credentials, billing or canvas fallback.
export function createCharacterClient({enabled = false, fetchImpl = (...args) => globalThis.fetch(...args)} = {}) {
  let devCode = ''; // Closure only: never persisted or sent in a URL.
  const request = async (options) => {
    let response;
    try { response = await fetchImpl('/api/characters', {credentials:'same-origin', cache:'no-store', ...options}); }
    catch { throw new Error('AI 캐릭터 서버에 연결할 수 없어요. 기존 캐릭터는 유지돼요.'); }
    let body;
    try { body = await response.json(); }
    catch { throw new Error('AI 캐릭터 서버 응답을 확인할 수 없어요. 기존 캐릭터는 유지돼요.'); }
    if (!response.ok) throw new Error(ERROR_MESSAGES[body?.code] || (response.status === 503 ? CHARACTER_UNAVAILABLE : 'AI 캐릭터 생성 요청에 실패했어요. 기존 캐릭터는 유지돼요.'));
    return body;
  };
  return {
    setDevCode(value) { devCode = typeof value === 'string' ? value.trim().slice(0,128) : ''; },
    async generate({file, color, consent}) {
      if (enabled !== true) throw new Error('사진 기반 생성은 개발 테스트에서만 이용할 수 있어요');
      if (consent !== true) throw new Error('사진 전송에 먼저 동의해 주세요.');
      if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type) || !file.size || file.size > 6 * 1024 * 1024 - 16 * 1024) throw new Error('6MB 미만의 JPG, PNG 또는 WebP 사진을 선택해 주세요.');
      const options = characterOptions(color);
      const capability = await request({method:'GET'});
      if (capability.configured !== true || capability.version !== 1) throw new Error(CHARACTER_UNAVAILABLE);
      if (capability.requiresCode && !devCode) throw new Error(ERROR_MESSAGES.DEV_CODE_REQUIRED);
      const body = new FormData();
      body.append('photo', file, file.name || 'photo.jpg');
      body.append('options', JSON.stringify(options));
      const result = await request({method:'POST', body, ...(devCode ? {headers:{'X-Quest-Dev-Code':devCode}} : {})});
      if (result.version !== 1 || result.avatarStyle !== 'fullbody' || !validCharacterImage(result.image)) throw new Error('생성된 전신 이미지 응답이 올바르지 않아요. 기존 캐릭터는 유지돼요.');
      const resultUrl = permanentCharacterURL(result.resultUrl);
      return {image:result.image, avatarStyle:'fullbody', ...(resultUrl ? {resultUrl} : {})};
    }
  };
}
// Transactional update: failure never replaces the existing avatar.
export const generateCharacter = async ({client, target, file, color, consent, onStart = () => {}, onChange = () => {}}) => {
  if (target.making) return false;
  target.making = true;
  try {
    onStart();
    const result = await client.generate({file, color, consent});
    target.face = result.image;
    target.avatarStyle = result.avatarStyle;
    target.characterResultUrl = result.resultUrl || '';
    target.characterError = '';
    return true;
  } catch (error) {
    target.characterError = error.message || 'AI 캐릭터 생성에 실패했어요.';
    return false;
  } finally {
    target.making = false;
    onChange();
  }
};

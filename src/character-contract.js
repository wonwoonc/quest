// Public policy only. A production server must enforce it independently.
export const CHARACTER_POLICY = Object.freeze({
  version:1,
  styleReference:'https://www.genspark.ai/api/files/s/p8jwqX27?cache_control=3600',
  referenceUse:'style-only',
  style:'Full-body MapleStory-inspired chibi: head 55-60% of total character height, tiny compact torso, short legs and arms, tiny shoes. Smooth 2D curves, clean dark outlines, soft cel shading, soft highlights and anti-aliasing. No pixels, pixel art, dithering, stair steps, 3D or adult proportions. White square background; keep shoes and the entire body visible.',
  identity:'Image 1 is the actual user photo and the ONLY source of identity, hair, facial features and clothing. Preserve these best effort; exact likeness is not guaranteed. Image 2 is STYLE ONLY: never copy its person, face, hair, hoodie or outfit.',
  clothing:'Use appropriate visible clothing from image 1. Where clothing is not visible, use a modest casual T-shirt in the selected color, long pants and sneakers. Never force the style reference gray/dark outfit.'
});
export const CHARACTER_UNAVAILABLE = 'AI 캐릭터 생성 서비스가 연결되지 않았어요. 기존 캐릭터는 유지돼요. 관리자에게 서비스 연결을 요청해 주세요.';
export function characterOptions(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('캐릭터 색을 확인해 주세요.');
  return {version:1, consent:true, color, avatarStyle:'fullbody', policy:CHARACTER_POLICY};
}
export function validCharacterImage(image) {
  return typeof image === 'string' && image.length < 12 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(image);
}
export function permanentCharacterURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.host !== 'www.genspark.ai' || url.username || url.password || url.hash ||
        !/^\/api\/files\/s\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
        (url.search && !/^\?cache_control=[0-9]+$/.test(url.search))) return null;
    // Reject URL-parser normalization (whitespace, escapes, traversal, ports, etc.).
    const exact = `https://www.genspark.ai${url.pathname}${url.search}`;
    return value === exact ? value : null;
  } catch { return null; }
}

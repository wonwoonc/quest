// 배포판 공개 페이지: /privacy(개인정보처리방침), /delete-account(계정 삭제 안내·요청).
// 앱스토어(Google Play·App Store) 등록에 필요한, 앱 없이도 열리는 웹 주소. 내용은 앱과 같은 src/legal.js에서 가져온다.
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const page = (title, body) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · 퀘스트</title><meta name="robots" content="index,follow">
<style>
:root{--bg:#F2F4F3;--card:#fff;--ink:#18201C;--sub:#4E5853;--muted:#6F7974;--line:#E4E8E6;--accent:#12A374;--fill:#F2F4F3;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0F1211;--card:#1B201E;--ink:#EDF1EF;--sub:#B5BEB9;--muted:#7D8883;--line:#2A312E;--accent:#2FC08E;--fill:#252B28;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "Noto Sans KR",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;padding:0 16px 48px;word-break:keep-all}
main{max-width:720px;margin:0 auto}header{padding:32px 4px 8px}header a{color:var(--accent);font-weight:800;font-size:20px;text-decoration:none}
h1{font-size:28px;line-height:1.35;margin:12px 0 4px}.meta{color:var(--muted);font-size:14px;margin:0 0 20px}
section{background:var(--card);border-radius:20px;padding:22px 22px 18px;margin:0 0 12px}h2{font-size:17px;margin:0 0 8px}
p,li{color:var(--sub);font-size:15px}p{margin:0 0 8px}ul,ol{margin:0 0 8px;padding-left:20px}li b{color:var(--ink)}a{color:var(--accent)}
.box{background:var(--fill);border-radius:14px;padding:14px 16px;margin:8px 0}footer{color:var(--muted);font-size:13px;text-align:center;margin-top:24px}footer a{color:var(--muted)}
</style></head><body><main><header><a href="/">퀘스트</a></header>${body}
<footer><a href="/privacy">개인정보처리방침</a> · <a href="/delete-account">계정 삭제</a> · (주)원운컴퍼니</footer></main></body></html>`;

export async function publicPages(root) {
  const {PRIVACY, LEGAL_META} = await import(pathToFileURL(path.join(root, 'src/legal.js')).href + '?t=' + Date.now());
  const M = LEGAL_META;
  const privacy = page('개인정보처리방침', `<h1>개인정보처리방침</h1><p class="meta">시행일 ${M.effective} · ${M.operator}</p>
${PRIVACY.map(([t, b]) => `<section><h2>${t}</h2>${b}</section>`).join('\n')}`);
  const del = page('계정 삭제', `<h1>퀘스트 계정 삭제</h1><p class="meta">${M.operator} · 퀘스트 앱(웹·Android·iOS)</p>
<section><h2>앱에서 바로 삭제하기</h2><ol><li>퀘스트에 로그인합니다.</li><li><b>설정</b>을 엽니다.</li><li>맨 아래 <b>회원 탈퇴</b>를 누르고 확인합니다.</li></ol><p>탈퇴하면 즉시 계정과 모든 기록이 삭제되고 되돌릴 수 없어요. 필요하면 먼저 설정 → <b>기록 파일로 저장</b>으로 기록을 내려받아 두세요.</p></section>
<section><h2>앱을 쓸 수 없을 때 삭제 요청하기</h2><p>가입한 이메일 주소로 아래 주소에 메일을 보내 주세요.</p>
<div class="box"><p><b>받는 사람</b> <a href="mailto:${M.email}?subject=${encodeURIComponent('퀘스트 계정 삭제 요청')}">${M.email}</a><br><b>제목</b> 퀘스트 계정 삭제 요청<br><b>내용</b> 삭제할 계정의 이메일 주소</p></div>
<p>본인 확인 후 지체 없이, 늦어도 요청을 받은 날부터 10일 안에 삭제하고 결과를 메일로 알려 드려요.</p></section>
<section><h2>삭제되는 정보</h2><ul><li>계정 정보: 이메일 주소, 비밀번호(암호화된 값)</li><li>앱 기록 전체: 캐릭터와 프로필, 메인 퀘스트·스테이지·미션·일일 퀘스트, 저널, 자료실 노트와 첨부 파일, 상점 보상, 스토리와 답글</li></ul></section>
<section><h2>삭제 후에도 보관되는 정보</h2><ul><li>서비스 접속 기록: 통신비밀보호법에 따라 3개월 보관 후 삭제</li><li>서버 백업에 남은 사본: 백업 보관 주기가 지나면 함께 삭제</li></ul><p>자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 확인해 주세요.</p></section>`);
  return {'privacy.html':privacy, 'delete-account.html':del};
}

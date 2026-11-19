/* 퀘스트라인 넥스트 운영 설정 — 출시 전에 운영자가 직접 채운다.
 * 전자상거래법상 결제 화면·약관에 사업자 정보 표시가 필요하다. 빈 값이 남아 있으면 앱에 '준비 중'으로 보인다. */
export const BIZ = {
  name: "(주)원운컴퍼니",          // 상호
  ceo: "",                        // 대표자
  regNo: "",                      // 사업자등록번호 (예: 123-45-67890)
  mailOrderNo: "",                // 통신판매업 신고번호 (예: 제2026-서울강남-0000호)
  address: "",                    // 사업장 주소
  phone: "",                      // 고객센터 전화
  email: "wonwoonc10@gmail.com",  // 문의 메일
};
export const APP = {
  name: "퀘스트라인",
  effective: "2026년 12월 1일",   // 약관 시행일
  // 소셜 로그인: Supabase 대시보드 → Authentication → Providers 에서 켠 것만 넣는다. 예: ["kakao", "google"]
  oauth: [],
};

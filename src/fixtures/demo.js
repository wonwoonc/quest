// Demo-only. Never imported by the empty entry point.
import {emptySnapshot} from '../storage.js';
const DAY = 86400000;
const COLORS = ["#3DBE8B"];
const EI = {};
const dk = t => { const d = new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

function picSvg(label, hue, icon){
  if (!label){ const ic = (typeof EI !== "undefined" && EI[icon]) ? EI[icon].replace("<svg ", `<svg x="690" y="240" width="220" height="220" `) : "";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 72%)"/><stop offset="1" stop-color="hsl(${hue+45} 50% 42%)"/></linearGradient></defs><rect width="1600" height="700" fill="url(#a)"/><circle cx="1300" cy="160" r="220" fill="#fff" opacity=".13"/><circle cx="220" cy="640" r="180" fill="#fff" opacity=".08"/><g style="color:#fff">${ic}</g></svg>`); }
  const ic = (typeof EI !== "undefined" && EI[icon]) ? EI[icon].replace("<svg ", `<svg x="370" y="250" width="160" height="160" `) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 72%)"/><stop offset="1" stop-color="hsl(${hue+45} 50% 42%)"/></linearGradient></defs><rect width="900" height="900" fill="url(#a)"/><circle cx="690" cy="230" r="140" fill="#fff" opacity=".15"/><g style="color:#fff">${ic}</g><text x="450" y="520" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#fff" font-weight="700">${label}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function buildSample(N, ME){
  const H = 3600000, M = 60000, Dd = 86400000;
  const profiles = {
    "s-jihoon":{uid:"s-jihoon", nick:"지훈", color:"#F29B4B", bio:"12월 바디프로필 촬영 준비 중", stats:{xp:3120, gold:1180, best:34, md:96, pd:1}},
    "s-soyeon":{uid:"s-soyeon", nick:"소연", color:"#9C7CE6", bio:"JLPT N2 합격하고 일본 취업까지", stats:{xp:2680, gold:940, best:52, md:120, pd:1}},
    "s-hyunwoo":{uid:"s-hyunwoo", nick:"현우", color:"#5B9CEB", bio:"퇴근 후 스마트스토어 운영 중", stats:{xp:2210, gold:860, best:18, md:74, pd:2}},
    "s-minseo":{uid:"s-minseo", nick:"민서", color:"#EB6E93", bio:"첫 풀코스 마라톤 도전", stats:{xp:2540, gold:1020, best:41, md:88, pd:1}},
    "s-junho":{uid:"s-junho", nick:"준호", color:"#3DBE8B", bio:"올해 안에 2천만원 모으기", stats:{xp:1870, gold:1340, best:25, md:63, pd:1}},
    "s-daeun":{uid:"s-daeun", nick:"다은", color:"#F29B4B", bio:"회계팀에서 UX 디자이너로", stats:{xp:4380, gold:2210, best:46, md:158, pd:4}}
  };
  const iso = t => { const d = new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const G = (owner, title, s, e, o = {}) => ({owner, title, start:iso(N-s*Dd), end:iso(N+e*Dd), status:o.done != null ? "done" : "active", ...(o.done != null ? {doneAt:N-o.done*Dd} : {}), metric:o.metric||null, progress:o.pg||{done:0,total:0}, createdAt:N-s*Dd, ...(o.parent ? {parentId:o.parent} : {})});
  const projects = {
    "sp-body":G("s-jihoon","12월 바디프로필 촬영하기",88,44,{metric:{unit:"kg", start:82, target:72}, pg:{done:14,total:30}}),
    "sp-body1":G("s-jihoon","첫 달 4kg 감량",88,-58,{parent:"sp-body", done:60, metric:{unit:"kg", start:82, target:78}, pg:{done:6,total:6}}),
    "sp-body2":G("s-jihoon","3분할 루틴 8주 완주",50,10,{parent:"sp-body", pg:{done:11,total:16}}),
    "sp-body3":G("s-jihoon","촬영 스튜디오 예약하고 준비하기",14,30,{parent:"sp-body", pg:{done:1,total:4}}),
    "sp-jlpt":G("s-soyeon","12월 JLPT N2 합격",90,37,{metric:{unit:"점", start:72, target:120}, pg:{done:18,total:26}}),
    "sp-jlpt1":G("s-soyeon","문법 교재 1회독",90,-48,{parent:"sp-jlpt", done:50, pg:{done:8,total:8}}),
    "sp-jlpt2":G("s-soyeon","실전 모의고사 5회 풀기",45,30,{parent:"sp-jlpt", pg:{done:3,total:5}}),
    "sp-jlpt3":G("s-soyeon","청해 받아쓰기 60일",40,20,{parent:"sp-jlpt", pg:{done:7,total:13}}),
    "sp-store":G("s-hyunwoo","스마트스토어 월매출 300만원",85,60,{metric:{unit:"만원", start:0, target:300}, pg:{done:15,total:24}}),
    "sp-store1":G("s-hyunwoo","상품 10개 등록하기",85,-50,{parent:"sp-store", done:55, pg:{done:10,total:10}}),
    "sp-store2":G("s-hyunwoo","상세페이지 다시 만들기",40,-15,{parent:"sp-store", done:20, pg:{done:4,total:4}}),
    "sp-store3":G("s-hyunwoo","광고비 대비 매출 3배 만들기",18,45,{parent:"sp-store", pg:{done:1,total:5}}),
    "sp-run":G("s-minseo","11월 말 풀코스 마라톤 완주",90,30,{metric:{unit:"km", start:10, target:42.195}, pg:{done:19,total:28}}),
    "sp-run1":G("s-minseo","하프 마라톤 완주",90,-30,{parent:"sp-run", done:35, metric:{unit:"km", start:10, target:21.1}, pg:{done:9,total:9}}),
    "sp-run2":G("s-minseo","30km 장거리 런 3번",30,20,{parent:"sp-run", pg:{done:2,total:3}}),
    "sp-money":G("s-junho","올해 안에 2천만원 모으기",90,62,{metric:{unit:"만원", start:1150, target:2000}, pg:{done:9,total:16}}),
    "sp-money1":G("s-junho","고정지출 월 30만원 줄이기",90,-55,{parent:"sp-money", done:60, pg:{done:5,total:5}}),
    "sp-money2":G("s-junho","부업으로 월 50만원 벌기",28,60,{parent:"sp-money", pg:{done:2,total:6}}),
    "sp-ux":G("s-daeun","UX 디자이너로 이직하기",90,-2,{done:2, pg:{done:12,total:12}}),
    "sp-ux1":G("s-daeun","포트폴리오 3개 완성",90,-40,{parent:"sp-ux", done:45, pg:{done:6,total:6}}),
    "sp-ux2":G("s-daeun","서류 20곳 지원",45,-15,{parent:"sp-ux", done:20, metric:{unit:"곳", start:0, target:20}, pg:{done:3,total:3}}),
    "sp-ux3":G("s-daeun","최종 면접 합격",20,-2,{parent:"sp-ux", done:2, pg:{done:3,total:3}})
  };
  const feed = [], media = {};
  for (const [k, v] of Object.entries({"sp-body":["",20,"💪"], "sp-jlpt":["",265,"📓"], "sp-store":["",195,"🛒"], "sp-run":["",335,"🏁"], "sp-money":["",120,"🪙"], "sp-ux":["",155,"🎉"], "sp-run1":["",15,"🏆"], "sp-store2":["",215,"📷"]})){ projects[k].cover = "cv-" + k; media["cv-" + k] = v; }
  const P = (id, author, ago, o) => { const p = {id, author, createdAt:N-ago, ref:o.ref||null, text:o.text||"", mood:o.mood||null, imgs:(o.pics||[]).length, reactions:{}, joiners:{}};
    if (o.q) p.q = o.q; if (o.value !== undefined) p.value = o.value; (o.pics||[]).forEach(([l,h,e],i) => media[id+"~"+i] = [l,h,e]); feed.push(p); return p; };
  const PR = id => ({type:"project", id, label:projects[id].title});
  const DONE = id => ({type:"project_done", id, label:projects[id].title, sub:!!projects[id].parentId, xp:projects[id].parentId ? 50 : 100});
  // 지훈 · 바디프로필
  P("f-j1","s-jihoon",88*Dd,{ref:PR("sp-body"), mood:"설레요", value:82, text:"건강검진에서 체지방률 28% 나왔어요. 서른 넘기 전에 몸 한번 제대로 만들어 보려고 12월 바디프로필 촬영으로 목표 잡았습니다. 기록 공개해야 도망 못 갈 것 같아서 올려요."});
  P("f-j2","s-jihoon",73*Dd,{ref:PR("sp-body"), mood:"뿌듯해요", value:80.4, q:"오늘 목표를 위해 한 일은?", text:"2주째 점심 도시락 싸 다니는 중. 회사 사람들이 뭐 하냐고 물어봐서 바디프로필 찍는다고 했더니 다들 응원해 주네요.", pics:[["오늘의 도시락",140,"🎁"]]});
  P("f-j3","s-jihoon",60*Dd,{ref:DONE("sp-body1"), value:77.8, text:"첫 번째 스테이지 클리어! 한 달 만에 -4.2kg. 야식 끊은 게 제일 컸어요.", pics:[["체중계 77.8kg",160,"✅"]]});
  P("f-j4","s-jihoon",44*Dd,{ref:PR("sp-body"), mood:"막막해요", value:77.5, q:"지금 가장 큰 고민은?", text:"2주째 체중이 그대로예요. 운동량은 늘렸는데 왜 안 빠지는지… 정체기 겪어 보신 분들 어떻게 넘기셨나요?"});
  P("f-j5","s-jihoon",29*Dd,{ref:PR("sp-body"), mood:"뿌듯해요", value:76.1, q:"처음 시작할 때와 달라진 점은?", text:"탄수화물 타이밍 바꾸니까 정체기 풀렸어요. 등 사진 찍어 봤는데 처음으로 근육 모양이 보이네요.", pics:[["8주차 등 사진",20,"💪"]]});
  P("f-j6","s-jihoon",11*Dd,{ref:PR("sp-body"), mood:"포기하고 싶어요", value:75.4, text:"이번 주 회식만 세 번… 다 먹진 않았는데 그래도 무너진 느낌이에요. 촬영까지 6주 남았는데 괜히 불안하네요."});
  P("f-j7","s-jihoon",20*H,{ref:PR("sp-body"), mood:"다시 해볼게요", value:74.2, q:"내일의 나에게 한마디", text:"D-44. 스튜디오 예약금 넣었습니다. 이제 진짜 물러설 곳 없음.", pics:[["스튜디오 예약 완료",30,"📅"]]});
  // 소연 · JLPT
  P("f-s1","s-soyeon",90*Dd,{ref:PR("sp-jlpt"), mood:"설레요", value:72, text:"일본 취업이 목표라 12월 JLPT N2부터 따려고 해요. 첫 모의고사 72점… 합격선이 90점이라 갈 길이 멀어요."});
  P("f-s2","s-soyeon",68*Dd,{ref:PR("sp-jlpt"), mood:"힘들어요", q:"오늘 가장 힘들었던 순간은?", text:"퇴근하고 문법 2과 하는데 졸려서 같은 문장만 다섯 번 읽었어요. 그래도 오늘 분량은 끝냈다."});
  P("f-s3","s-soyeon",50*Dd,{ref:DONE("sp-jlpt1"), text:"문법 교재 1회독 끝! 처음 펼쳤을 때 막막했는데 하루 한 과씩 하니까 끝나긴 하네요.", pics:[["문법책 1회독",270,"📓"]]});
  P("f-s4","s-soyeon",34*Dd,{ref:PR("sp-jlpt"), mood:"뿌듯해요", value:95, q:"어제보다 나아진 점 하나는?", text:"모의고사 95점!! 처음으로 합격선 넘었어요. 근데 청해가 아직 과락 근처라 방심 금지."});
  P("f-s5","s-soyeon",17*Dd,{ref:PR("sp-jlpt"), mood:"막막해요", q:"지금 가장 큰 고민은?", text:"청해 받아쓰기 하는데 빠른 대화는 아직도 단어가 다 뭉개져서 들려요. 쉐도잉이 나을까요?"});
  P("f-s6","s-soyeon",4*Dd,{ref:PR("sp-jlpt"), mood:"뿌듯해요", value:108, text:"세 번째 모의고사 108점. 청해도 많이 올랐어요. 시험까지 한 달 남짓, 이대로만 가자."});
  // 현우 · 스마트스토어
  P("f-h1","s-hyunwoo",85*Dd,{ref:PR("sp-store"), mood:"설레요", value:0, text:"회사 다니면서 스마트스토어 시작합니다. 캠핑용품으로 정했고 목표는 월매출 300만원. 일단 상품 10개 올리는 것부터."});
  P("f-h2","s-hyunwoo",63*Dd,{ref:PR("sp-store"), mood:"뿌듯해요", value:4, q:"오늘의 나를 칭찬한다면?", text:"첫 주문 들어왔어요!!! 3만 8천원짜리 랜턴 하나인데 알림 보고 소리 질렀습니다.", pics:[["첫 주문 알림",210,"🎉"]]});
  P("f-h3","s-hyunwoo",55*Dd,{ref:DONE("sp-store1"), text:"상품 10개 등록 완료. 사진 찍고 상세페이지 만드는 게 생각보다 일이 많네요."});
  P("f-h4","s-hyunwoo",39*Dd,{ref:PR("sp-store"), mood:"포기하고 싶어요", value:48, q:"포기하고 싶을 때 나를 붙잡는 건?", text:"반품 3건 연속… 상세페이지 설명이 부족했던 것 같아요. 퇴근하고 이거 붙잡고 있는 게 맞나 싶은 밤."});
  P("f-h5","s-hyunwoo",20*Dd,{ref:DONE("sp-store2"), text:"상세페이지 전부 다시 만들었어요. 사이즈 비교 사진 넣었더니 반품 문의가 확 줄었어요.", pics:[["새 상세페이지",200,"📷"]]});
  P("f-h6","s-hyunwoo",8*Dd,{ref:PR("sp-store"), mood:"뿌듯해요", value:162, text:"이번 달 벌써 162만원. 캠핑 시즌 덕도 있지만 상세페이지 바꾼 효과가 제일 큰 것 같아요."});
  P("f-h7","s-hyunwoo",5*H,{ref:PR("sp-store"), mood:"설레요", value:214, q:"내일의 나에게 한마디", text:"200 돌파! 이제 광고 효율 잡는 게 다음 단계. 300까지 가 봅시다.", pics:[["이번 달 매출 그래프",150,"📈"]]});
  // 민서 · 마라톤
  P("f-m1","s-minseo",90*Dd,{ref:PR("sp-run"), mood:"설레요", value:10, text:"10km도 겨우 뛰는데 풀코스 신청해 버렸어요. 11월 말까지 42.195km 완주가 목표입니다."});
  P("f-m2","s-minseo",74*Dd,{ref:PR("sp-run"), mood:"뿌듯해요", value:15, text:"처음으로 15km 쉬지 않고 뛰었어요. 마지막 2km는 거의 걷는 속도였지만 그래도 완주!", pics:[["한강 15km",190,"🏁"]]});
  P("f-m3","s-minseo",52*Dd,{ref:PR("sp-run"), mood:"힘들어요", value:18, q:"오늘 가장 힘들었던 순간은?", text:"무릎이 아파서 일주일 쉬었어요. 너무 급하게 거리 늘린 것 같아요. 조급해하지 말자."});
  P("f-m4","s-minseo",35*Dd,{ref:DONE("sp-run1"), value:21.1, text:"하프 마라톤 완주!! 2시간 4분. 결승선 보이는데 눈물 날 뻔했어요.", pics:[["하프 완주 메달",330,"🏆"]]});
  P("f-m5","s-minseo",20*Dd,{ref:PR("sp-run"), mood:"막막해요", value:25, q:"지금 가장 큰 고민은?", text:"25km 넘어가니까 에너지가 바닥나요. 장거리 뛸 때 보급 어떻게들 하세요?"});
  P("f-m6","s-minseo",6*Dd,{ref:PR("sp-run"), mood:"뿌듯해요", value:30, text:"30km 첫 완주. 에너지젤 5km마다 먹으라는 조언 받고 했더니 진짜 버텨졌어요. 감사합니다!"});
  // 준호 · 2천만원
  P("f-u1","s-junho",90*Dd,{ref:PR("sp-money"), mood:"설레요", value:1150, text:"지금 통장에 1,150만원. 올해 안에 2천 만들려면 남은 4개월 동안 매달 210만원씩 모아야 해요. 계산해 보니 빡빡하네요."});
  P("f-u2","s-junho",60*Dd,{ref:DONE("sp-money1"), text:"안 쓰는 구독 4개 끊고 통신비 요금제 바꿨더니 월 32만원 줄었어요. 첫 스테이지 완료."});
  P("f-u3","s-junho",41*Dd,{ref:PR("sp-money"), mood:"막막해요", value:1420, q:"예상과 달랐던 점은?", text:"이번 달 결혼식만 세 번… 축의금으로 45만원 나갔어요. 이런 건 계획에 없었는데."});
  P("f-u4","s-junho",27*Dd,{ref:PR("sp-money"), mood:"다시 해볼게요", text:"부족한 만큼은 벌기로 했어요. 주말에 번역 부업 시작합니다. 첫 의뢰 받았어요."});
  P("f-u5","s-junho",9*Dd,{ref:PR("sp-money"), mood:"뿌듯해요", value:1690, text:"부업 첫 정산 28만원 들어왔어요. 통장 1,690만원. 이제 310만원 남았다.", pics:[["통장 잔고 1,690만원",110,"🪙"]]});
  P("f-u6","s-junho",3*H,{ref:PR("sp-money"), mood:"힘들어요", value:1760, text:"연말 앞두고 사고 싶은 게 너무 많아요… 장바구니에 넣고 일주일 기다리기 규칙으로 버티는 중."});
  // 다은 · 이직
  P("f-d1","s-daeun",90*Dd,{ref:PR("sp-ux"), mood:"설레요", text:"회계팀 5년 차, UX 디자이너로 커리어 바꾸려고 합니다. 3개월 안에 포트폴리오 만들고 이직까지 해 볼게요."});
  P("f-d2","s-daeun",71*Dd,{ref:PR("sp-ux"), mood:"뿌듯해요", q:"오늘 목표를 위해 한 일은?", text:"첫 번째 케이스 스터디 완성. 우리 회사 경비 정산 화면을 다시 설계해 봤어요. 제가 매일 쓰던 불편함이라 할 말이 많더라고요.", pics:[["경비 정산 앱 리디자인",250,"📷"]]});
  P("f-d3","s-daeun",45*Dd,{ref:DONE("sp-ux1"), text:"포트폴리오 3개 완성! 이제 지원 시작합니다."});
  P("f-d4","s-daeun",31*Dd,{ref:PR("sp-ux"), mood:"포기하고 싶어요", q:"포기하고 싶을 때 나를 붙잡는 건?", text:"서류 8곳 연속 탈락… 비전공자라 안 되는 건가 싶어요. 그래도 여기 기록 보면 3개월 전보다 확실히 늘긴 했네요."});
  P("f-d5","s-daeun",20*Dd,{ref:DONE("sp-ux2"), value:20, text:"서류 20곳 지원 완료. 그중 4곳에서 면접 연락 왔어요!"});
  P("f-d6","s-daeun",9*Dd,{ref:PR("sp-ux"), mood:"설레요", q:"내일의 나에게 한마디", text:"2차 면접에서 회계 경험을 살린 핀테크 케이스 얘기했더니 반응이 좋았어요. 결과 기다리는 중."});
  P("f-d7","s-daeun",2*Dd,{ref:DONE("sp-ux"), text:"최종 합격했어요!! 다음 달부터 핀테크 회사 UX 디자이너로 출근합니다. 3개월 동안 응원해 주신 분들 정말 감사해요.", pics:[["합격 메일",160,"🎉"]]});
  // likes
  const people = Object.keys(profiles); let seed = 7; const rnd = () => (seed = (seed*9301 + 49297) % 233280) / 233280;
  for (const p of feed){ const pool = people.filter(u => u !== p.author); const k = Math.min(pool.length, 1 + Math.floor(rnd()*4) + (p.imgs?1:0));
    pool.sort(() => rnd() - .5).slice(0, k).forEach(u => p.reactions[u] = {k:"heart", at:Math.min(N - M, p.createdAt + Math.floor(rnd()*8*H) + 10*M)}); }
  const byId = Object.fromEntries(feed.map(p => [p.id, p]));
  for (const u of people) if (u !== "s-daeun") byId["f-d7"].reactions[u] = {k:"heart", at:N - 2*Dd + 3*H};
  const replies = []; const R = (id, pid, author, text, ago, parent, likes) => replies.push({id, postId:pid, author, text, createdAt:N-ago, parentId:parent||null, likes:Object.fromEntries((likes||[]).map(u => [u, N-ago+30*M]))});
  R("r01","f-j4","s-minseo","저도 거리 늘릴 때 정체기 왔었는데, 2주쯤 지나니까 갑자기 확 좋아지더라고요. 하던 거 계속하세요!",43*Dd);
  R("r02","f-j4","s-junho","식단 기록 앱으로 일주일만 정확히 재 보세요. 저는 숨은 간식이 꽤 많았어요",42*Dd,null,["s-jihoon"]);
  R("r03","f-j6","s-hyunwoo","회식 세 번이면 선방하신 거예요. 내일부터 다시!",10*Dd,null,["s-jihoon"]);
  R("r04","f-j6","s-jihoon","감사해요 ㅠㅠ 오늘 아침 공복 유산소 하고 왔습니다",10*Dd-3*H,"r03");
  R("r05","f-j7","s-daeun","D-44 응원해요! 촬영 사진 꼭 올려 주세요",18*H);
  R("r06","f-s5","s-daeun","쉐도잉 추천해요! 저도 영어 면접 준비할 때 효과 봤어요",16*Dd,null,["s-soyeon"]);
  R("r07","f-s5","s-soyeon","오 해볼게요. 하루 15분씩 시작해 봐야겠어요",16*Dd-2*H,"r06");
  R("r08","f-s6","s-minseo","108점이면 이제 합격권이네요! 마지막까지 화이팅",3*Dd);
  R("r09","f-h2","s-junho","첫 주문 축하해요! 그 기분 오래 갈 거예요",62*Dd,null,["s-hyunwoo"]);
  R("r10","f-h4","s-daeun","저도 서류 탈락할 때 똑같은 생각했어요. 반품 원인 찾은 것만으로도 한 단계 올라가신 거예요",38*Dd,null,["s-hyunwoo"]);
  R("r11","f-h4","s-jihoon","캠핑 랜턴 저도 하나 샀어요 ㅎㅎ 좋던데요!",37*Dd);
  R("r12","f-h7","s-soyeon","와 200! 이번 달 안에 300 갈 것 같은데요?",3*H);
  R("r13","f-m3","s-jihoon","부상은 쉬는 게 훈련이래요. 무리하지 마세요",51*Dd,null,["s-minseo"]);
  R("r14","f-m4","s-soyeon","눈물 날 만해요ㅠㅠ 2시간 4분이면 첫 하프치고 엄청 잘하신 거예요",34*Dd);
  R("r15","f-m5","s-jihoon","에너지젤 5km마다 하나씩 드세요. 25km 넘어서 먹으면 이미 늦어요",19*Dd,null,["s-minseo"]);
  R("r16","f-m6","s-minseo","지훈님 덕분이에요! 진짜 버텨졌어요",6*Dd-H,"r15");
  R("r17","f-u3","s-hyunwoo","경조사비는 따로 통장 만들어 두니까 덜 흔들리더라고요",40*Dd,null,["s-junho"]);
  R("r18","f-u5","s-daeun","번역 부업 좋네요! 310만원 금방이에요",8*Dd);
  R("r19","f-u6","s-minseo","장바구니 일주일 규칙 저도 써 볼래요 ㅋㅋ",2*H);
  R("r20","f-d4","s-soyeon","다은님 포트폴리오 보면서 저도 자극받았어요. 비전공이라 오히려 할 얘기가 많잖아요",30*Dd,null,["s-daeun"]);
  R("r21","f-d7","s-jihoon","와 진짜 축하드려요!! 3개월 만에 해내셨네요",2*Dd-2*H);
  R("r22","f-d7","s-hyunwoo","기록 처음부터 봤는데 제가 다 뿌듯하네요. 축하해요!",2*Dd-3*H,null,["s-daeun"]);
  R("r23","f-d7","s-daeun","다들 감사해요. 여기서 응원 받은 게 정말 컸어요",2*Dd-5*H,"r22",["s-hyunwoo"]);
  R("r24","f-d7","s-junho","비결 좀 알려 주세요… 저도 내년엔 이직 퀘스트 만들어 볼래요",40*H);
  const follows = {}; const F = (a, b, ago) => follows[a+"~"+b] = {from:a, to:b, at:N-ago};
  F("s-jihoon","s-minseo",80*Dd); F("s-minseo","s-jihoon",80*Dd); F("s-soyeon","s-daeun",60*Dd); F("s-daeun","s-soyeon",58*Dd); F("s-hyunwoo","s-junho",70*Dd); F("s-junho","s-hyunwoo",70*Dd); F("s-daeun","s-hyunwoo",40*Dd); F("s-junho","s-daeun",2*Dd); F("s-minseo","s-soyeon",30*Dd);
  if (ME){ F("s-minseo", ME, 5*H); F("s-jihoon", ME, 3*H); F("s-junho", ME, 50*M); }
  return {profiles, projects, feed, replies, follows, media};
}

export function createDemoFixture({now = Date.now()} = {}) {
const S = emptySnapshot();
  const N = now, H = 3600000, W = buildSample(N, "me");
  S.profiles = {...W.profiles, me:{uid:"me", nick:"나", color:COLORS[0], bio:"명시적 데모 · 가상 인물", private:true}};
  for (const [k,v] of Object.entries(W.projects)) S.projects[k] = {id:k, ...v};
  W.feed.forEach(p => S.feed[p.id] = p); W.replies.forEach(r => S.replies[r.id] = r); S.follows = W.follows;
  const media = {}; for (const [k,[l,h,e]] of Object.entries(W.media)) media[k] = picSvg(l,h,e);
  const days = n => { const o = {}; for (let i = 1; i <= n; i++) o[dk(N - i*DAY)] = N - i*DAY; return o; };
  const mine = {
    q1:{kind:"quest", name:"물 2리터 마시기", purpose:"피부와 집중력", days:[0,1,2,3,4,5,6], lv:"easy", area:["health"], active:true, done:days(6), createdAt:N-20*DAY},
    q2:{kind:"quest", name:"아침 스트레칭 10분", purpose:"굳은 몸 깨우기", days:[0,1,2,3,4,5,6], lv:"normal", area:["health"], active:true, done:days(4), createdAt:N-15*DAY},
    q3:{kind:"quest", name:"토익 단어 50개", purpose:"850점 넘기기", days:[1,2,3,4,5], lv:"hard", area:["growth","career"], active:true, done:{}, createdAt:N-9*DAY},
    q4:{kind:"quest", name:"하루 계획 세우기", purpose:"집중하는 하루", days:[0,1,2,3,4,5,6], lv:"normal", area:["growth"], active:true, done:{[dk(N)]:N-2*H, ...days(2)}, createdAt:N-8*DAY},
    m1:{kind:"mission", lv:"hard", time:"19:00", name:"실전 모의고사 1회 풀기", today:true, projectId:"pme", done:false, createdAt:N-DAY},
    m2:{kind:"mission", time:"10:00", name:"주간 보고서 제출", today:true, projectId:null, done:false, createdAt:N-DAY},
    m3:{kind:"mission", name:"단어장 1회독", today:false, projectId:"pme", done:true, doneAt:N-2*DAY, createdAt:N-9*DAY},
    m4:{kind:"mission", name:"파트5 오답노트 정리", today:false, projectId:"pme5", done:false, createdAt:N-3*DAY},
    m5:{kind:"mission", lv:"easy", name:"치과 예약하기", today:false, projectId:null, done:false, createdAt:N-2*DAY},
    r1:{kind:"reward", name:"좋아하는 카페 디저트", cost:100}, r2:{kind:"reward", name:"게임 1시간", cost:300}, r3:{kind:"reward", name:"주말 외식", cost:1000}
  };
  for (let i = 1; i <= 5; i++){ const k = dk(N - i*DAY); mine["d-"+k] = {kind:"diary", date:k, cond:60+i*5, emo:["평온","기쁨","피곤","설렘","평온"][i-1], text:["점심에 회사 근처를 한 바퀴 걸었다. 바람이 시원해서 머리가 맑아졌다.","모의고사 점수가 처음으로 700을 넘었다!\n파트5 오답노트를 꾸준히 한 덕분인 것 같다. 이번 주는 파트7 시간 관리를 연습해 봐야지.","야근 때문에 운동을 못 했다. 그래도 물 2리터는 지켰다.","",""][i-1], at:N - i*DAY}; }
  for (const [k,v] of Object.entries(mine)) S.mine[k] = {id:k, ...v};
  S.projects.pme5 = {id:"pme5", owner:"me", parentId:"pme", title:"파트5 문법 정복", start:dk(N-3*DAY), end:dk(N+14*DAY), status:"active", metric:null, progress:{done:0,total:1}, createdAt:N-3*DAY};
  S.projects.pme = {id:"pme", owner:"me", title:"토익 850점 넘기기", start:dk(N-9*DAY), end:dk(N+50*DAY), status:"active", area:["career","growth"], metric:{unit:"점", start:650, target:850}, progress:{done:1,total:3}, createdAt:N-9*DAY};
  S.feed["f-me1"] = {id:"f-me1", author:"me", createdAt:N-20*H, ref:{type:"project", id:"pme", label:"토익 850점 넘기기"}, mood:"포기하고 싶어요", value:710, q:"예상과 달랐던 점은?", text:"첫 모의고사 710점이에요. 생각보다 낮아서 좀 우울하네요.", imgs:0, reactions:{"s-minseo":{k:"heart",at:N-3*H}, "s-daeun":{k:"heart",at:N-2*H}}, joiners:{}};
  S.replies.rme = {id:"rme", postId:"f-me1", author:"s-soyeon", text:"저도 JLPT 첫 모의고사가 72점이었어요. 문법부터 잡으면 금방 올라요!", createdAt:N-2*H, parentId:null, likes:{}};

S.media = media;
return S;
}

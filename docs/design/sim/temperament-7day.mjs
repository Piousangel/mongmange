// 성향 시뮬레이션 v2 (2026-11-19, 리뷰 I1 반영)
// 실행: node docs/design/sim/temperament-7day.mjs          → 7일·30일·90일 결과 + 습관 전환 + v1(누적형) 대조
// v1(누적형)은 약 2주 만에 네 축이 ±1에 붙고 tempo가 연속으로 나왔다(리뷰 I1). v2는 '최근 습관 추종형'이다.
//   h_k ← h_k + β·(s_k − h_k)          최근 습관 흔적(β = 0.30, 약 3밤 기억)
//   T_k = VMAX·tanh(G·h_k)             목표값(포화, G = 18, VMAX = 0.85)
//   v_k ← v_k + α_k·(T_k − v_k)        추종(초점 축 α = 0.40, 나머지 α = 0.15)
//   초점 축 = argmax |T_k − v_k|, 같은 축 3밤 연속 금지, 최댓값 < EPS면 초점 축 없음
//   아침 문장 종류: 변화(초점 축 |Δ| ≥ 0.04) > 깊어짐(어제 신호가 현재 성향과 같은 방향이고 |v| ≥ 0.25인 축이 있음) > 관찰
// 용어(11-20, D-20 · 시스템 v1.3 0.1): 옛 '결 축'·'그날의 결' = '초점 축'. '결'은 결 이름 8에만 쓴다. 아래 출력 문구의 '결 순서'는 골든 출력 호환을 위해 그대로 둔다(= 초점 축 순서).
// MVP 입력(I8): 획(속도·길이·몸과의 거리·새로움), 먹 갈기, 탭(길게 누르기 포함·탭 위치 분산). 획 굵기·산책 흔적·방문 분산은 1.x.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const AX=['tempo','bold','close','curio'];
const P={BETA:0.30,G:18,VMAX:0.85,A_FOCUS:0.40,A_REST:0.15,EPS:0.03,BUDGET:0.15,FIRST_GAIN:2,FIRST_CAP:0.25};
// 모든 신호는 모집단 중앙값(0.5)을 빼서 중심화한다(편향 제거)
function daySignals(d){const s={tempo:0,bold:0,close:0,curio:0};
  s.tempo+=0.20*(d.speed-0.5); s.tempo-=0.04*(d.grind-0.5); s.tempo+=0.04*(d.holdSpeed-0.5);
  s.bold +=0.12*(d.grind-0.5); s.bold +=0.08*(d.len-0.5);
  s.close+=0.10*(0.5-d.dist);  s.close+=0.06*(d.touch-0.5);
  s.curio+=0.16*(d.novel-0.5); s.curio+=0.04*(d.tapSpread-0.5);
  for(const k of AX) s[k]=clamp(s[k],-P.BUDGET,P.BUDGET); return s;}
// v2: 최근 습관 추종형
function initV2(s0){const v={},h={};for(const k of AX){v[k]=clamp(s0[k]*P.FIRST_GAIN,-P.FIRST_CAP,P.FIRST_CAP);h[k]=s0[k]}return{v,h,hist:[]}}
function settleV2(st,s){const h={},T={};for(const k of AX){h[k]=st.h[k]+P.BETA*(s[k]-st.h[k]);T[k]=P.VMAX*Math.tanh(P.G*h[k])}
  const banned=st.hist.length>=2&&st.hist.slice(-2).every(t=>t===st.hist.at(-1))?st.hist.at(-1):null;
  let top=null,best=P.EPS; for(const k of AX){if(k===banned)continue;const g=Math.abs(T[k]-st.v[k]);if(g>best){best=g;top=k}} // 동점은 AX 순서가 아니라 '먼저 넘은 값' — 같은 값이면 앞 축, 0이면 null
  const v={};for(const k of AX)v[k]=st.v[k]+(k===top?P.A_FOCUS:P.A_REST)*(T[k]-st.v[k]);
  return{v,h,hist:[...st.hist,top],delta:top?v[top]-st.v[top]:0}}
// v1: 누적형(대조용, systems-v1 초판 2.3 그대로)
function settleV1(st,s){const ks=AX,v=st.v,hist=st.hist;const sc=k=>Math.abs(s[k])*(1-Math.abs(v[k]))*(hist.length>=2&&hist.slice(-2).every(t=>t===k)?0:1);
  const top=ks.reduce((a,k)=>sc(k)>sc(a)?k:a);const o={};for(const k of ks)o[k]=k===top?clamp(s[k]*2,-0.2,0.2):s[k];
  const n={};for(const k of ks){const out=Math.sign(o[k])===Math.sign(v[k])||v[k]===0;n[k]=clamp(v[k]+o[k]*(out?1-0.5*Math.abs(v[k]):1),-1,1)}return{v:n,h:st.h,hist:[...hist,top],delta:n[top]-v[top]}}
const KEYS=['speed','grind','len','dist','novel','touch','holdSpeed','tapSpread'];
function habitUser(r,spread){const c={};for(const k of KEYS)c[k]=clamp(0.5+(r()-0.5)*2*spread,0,1);return rr=>{const d={};for(const k of KEYS)d[k]=clamp(c[k]+(rr()-0.5)*0.3,0,1);return d}}
const A=()=>({speed:.85,grind:.1,len:.3,dist:.85,novel:.9,touch:.15,holdSpeed:.8,tapSpread:.9});   // 바쁜 출근길
const B=()=>({speed:.2,grind:.9,len:.8,dist:.1,novel:.2,touch:.95,holdSpeed:.2,tapSpread:.1});    // 잠들기 전
function run(gen,seed,days,model='v2',noise=0){const r=rng(seed);const g=d=>{const x=gen(d);if(!noise)return x;const y={};for(const k of KEYS)y[k]=clamp(x[k]+(r()-0.5)*noise,0,1);return y};
  const s0=daySignals(g(0));let st=initV2(s0);const settle=model==='v1'?settleV1:settleV2;const trace=[];let obs=0,deep=0,maxAbs=0;
  for(let d=1;d<=days;d++){const sg=daySignals(g(d));st=settle(st,sg);if(!st.hist.at(-1)||Math.abs(st.delta)<0.04){if(AX.some(k=>Math.abs(st.v[k])>=0.25&&Math.sign(sg[k])===Math.sign(st.v[k])&&Math.abs(sg[k])>=0.01))deep++;else obs++}for(const k of AX)maxAbs=Math.max(maxAbs,Math.abs(st.v[k]));trace.push({...st.v})}
  return{v:st.v,tops:st.hist,obs,deep,maxAbs,trace}}
const f=v=>AX.map(k=>(v[k]>=0?'+':'')+v[k].toFixed(2)).join(' ');
const dist=(a,b)=>Math.sqrt(AX.reduce((s,k)=>s+(a[k]-b[k])**2,0));
const short={tempo:'T',bold:'B',close:'C',curio:'Q'};
const seq=t=>t.map(x=>x?short[x]:'·').join('');
const maxRun=t=>{let m=0,c=0,p;for(const x of t){c=x&&x===p?c+1:1;p=x;m=Math.max(m,c)}return m};
console.log('# 축 순서: tempo bold close curio / 결 순서 기호 T B C Q, · = 결 없음 / A·B는 매일 ±0.15 흔들림');
for(const model of ['v1','v2'])for(const days of [7,30,90]){const a=run(()=>A(),1,days,model,0.3),b=run(()=>B(),2,days,model,0.3);
  console.log(`${model} ${String(days).padStart(2)}일 A ${f(a.v)} | B ${f(b.v)} | 거리 ${dist(a.v,b.v).toFixed(2)} | 최대|v| ${Math.max(a.maxAbs,b.maxAbs).toFixed(2)} | 같은 결 최장 연속 A${maxRun(a.tops)} B${maxRun(b.tops)} | 문장 변화/깊어짐/관찰 A ${days-a.deep-a.obs}/${a.deep}/${a.obs} B ${days-b.deep-b.obs}/${b.deep}/${b.obs}`);
  if(days===30)console.log(`   결 순서 A ${seq(a.tops)}\n   결 순서 B ${seq(b.tops)}`);}
// 습관 전환: 15일 A처럼, 그다음 B처럼. tempo 부호가 바뀌는 날
for(const model of ['v1','v2']){const r=run(d=>d<=15?A():B(),3,45,model,0.3);const flip=r.trace.findIndex((v,i)=>i>=15&&v.tempo<0);const half=r.trace.findIndex((v,i)=>i>=15&&v.tempo<=-0.4);
  console.log(`${model} 습관 전환(16일째부터 B) tempo 16일 ${r.trace[14].tempo.toFixed(2)} → 부호 바뀜 ${flip<0?'45일 안에 없음':(flip+1-15)+'밤 뒤'} / −0.40 도달 ${half<0?'45일 안에 없음':(half+1-15)+'밤 뒤'}`);}
// 평범한 유저 300명
for(const days of [7,30])for(const spread of [0.1,0.2]){const ms=[];let obsSum=0,deepSum=0;for(let i=0;i<300;i++){const r=rng(9000+i);const u=habitUser(r,spread);const res=run(()=>u(r),100+i,days,'v2');ms.push(res.v);obsSum+=res.obs;deepSum+=res.deep}
  let ds=[],c1=0,c2=0,n=0;for(let i=0;i<300;i++)for(let j=i+1;j<300;j++){ds.push(dist(ms[i],ms[j]));const c=AX.filter(k=>Math.abs(ms[i][k]-ms[j][k])>=0.3).length;if(c>=1)c1++;if(c>=2)c2++;n++}
  ds.sort((x,y)=>x-y);const mean=Object.fromEntries(AX.map(k=>[k,ms.reduce((s,m)=>s+m[k],0)/ms.length]));
  console.log(`v2 ${String(days).padStart(2)}일 습관 ±${spread}: 쌍 거리 중앙값 ${ds[n>>1].toFixed(2)} | ≥1축 0.3 ${(c1/n*100).toFixed(0)}% | ≥2축 0.3 ${(c2/n*100).toFixed(0)}% | 평균 ${f(mean)} | 문장 변화/깊어짐/관찰 평균 ${(days-(obsSum+deepSum)/300).toFixed(1)}/${(deepSum/300).toFixed(1)}/${(obsSum/300).toFixed(1)} (${days}밤)`);}

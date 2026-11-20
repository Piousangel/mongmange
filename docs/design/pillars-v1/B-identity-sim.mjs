// 디자이너 B 개성·공유 시뮬레이션 (2026-11-20). 실행: node docs/design/pillars-v1/B-identity-sim.mjs
// 앞부분 39줄은 docs/design/sim/temperament-7day.mjs v2 모델을 그대로 복사했다(원본이 바뀌면 다시 복사).
// 성향 시뮬레이션 v2 (2026-11-19, 리뷰 I1 반영)
// 실행: node docs/design/sim/temperament-7day.mjs          → 7일·30일·90일 결과 + 습관 전환 + v1(누적형) 대조
// v1(누적형)은 약 2주 만에 네 축이 ±1에 붙고 tempo가 연속으로 나왔다(리뷰 I1). v2는 '최근 습관 추종형'이다.
//   h_k ← h_k + β·(s_k − h_k)          최근 습관 흔적(β = 0.30, 약 3밤 기억)
//   T_k = VMAX·tanh(G·h_k)             목표값(포화, G = 18, VMAX = 0.85)
//   v_k ← v_k + α_k·(T_k − v_k)        추종(결 축 α = 0.40, 나머지 α = 0.15)
//   결 축 = argmax |T_k − v_k|, 같은 축 3밤 연속 금지, 최댓값 < EPS면 결 없음
//   아침 문장 종류: 변화(결 축 |Δ| ≥ 0.04) > 깊어짐(어제 신호가 현재 성향과 같은 방향이고 |v| ≥ 0.25인 축이 있음) > 관찰
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
// 개성 분포 실험: 주된 결(8) / 결 쌍(24) / 출생 표식(해시) 엔트로피
function fnv(s){let h=0x811c9dc5;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h}
function ent(counts){const n=counts.reduce((a,b)=>a+b,0);let e=0;for(const c of counts)if(c){const p=c/n;e-=p*Math.log2(p)}return e}
const N=3000;
for(const days of [7,30])for(const spread of [0.1,0.2]){
  const c8=new Array(8).fill(0), c24={}, flat=[];
  for(let i=0;i<N;i++){const r=rng(9000+i);const u=habitUser(r,spread);const res=run(()=>u(r),100+i,days,'v2');const v=res.v;
    const ord=[...AX].sort((a,b)=>Math.abs(v[b])-Math.abs(v[a]));
    const k1=ord[0],k2=ord[1];const cls=AX.indexOf(k1)*2+(v[k1]>=0?1:0);c8[cls]++;
    const key=k1+(v[k1]>=0?'+':'-')+k2+(v[k2]>=0?'+':'-');c24[key]=(c24[key]||0)+1;
    flat.push(Math.abs(v[k1]));}
  flat.sort((a,b)=>a-b);
  const v24=Object.values(c24);
  console.log(`${days}일 ±${spread}: 주된결8 분포 ${c8.map(c=>(c/N*100).toFixed(0)).join('/')}% 엔트로피 ${ent(c8).toFixed(2)}/3.00, 최대비 ${(Math.max(...c8)/N*100).toFixed(1)}% | 결쌍 ${v24.length}종 엔트로피 ${ent(v24).toFixed(2)}/${Math.log2(48).toFixed(2)} 최대 ${(Math.max(...v24)/N*100).toFixed(1)}% | 주축 |v| 중앙값 ${flat[N>>1].toFixed(2)} 하위10% ${flat[N*0.1|0].toFixed(2)}`);
}
// 출생 표식: 첫 터치 (x,y,ms) 해시 → 체형3×먹빛4×빗결4 = 48
const cb=new Array(48).fill(0);const r=rng(7);
for(let i=0;i<N;i++){const x=Math.round(180+(r()-0.5)*60),y=Math.round(420+(r()-0.5)*80),ms=Math.floor(r()*1e7);cb[fnv(`${x},${y},${ms}`)%48]++}
console.log(`출생 48칸: 엔트로피 ${ent(cb).toFixed(2)}/${Math.log2(48).toFixed(2)}, 최대 ${(Math.max(...cb)/N*100).toFixed(1)}%, 최소 ${(Math.min(...cb)/N*100).toFixed(1)}% (기대 ${(100/48).toFixed(1)}%)`);
// 보정: 축별 모집단 표준편차로 나눈 뒤 argmax (축 이득 차이 상쇄)
for(const days of [7,30])for(const spread of [0.1,0.2]){
  const vs=[];for(let i=0;i<N;i++){const r=rng(9000+i);const u=habitUser(r,spread);vs.push(run(()=>u(r),100+i,days,'v2').v)}
  const sd={};for(const k of AX){const m=vs.reduce((a,v)=>a+v[k],0)/N;sd[k]=Math.sqrt(vs.reduce((a,v)=>a+(v[k]-m)**2,0)/N)}
  // 다른 시드 집단에 적용(과적합 방지)
  const c8=new Array(8).fill(0);
  for(let i=0;i<N;i++){const r=rng(50000+i);const u=habitUser(r,spread);const v=run(()=>u(r),70000+i,days,'v2').v;
    const k1=[...AX].sort((a,b)=>Math.abs(v[b])/sd[b]-Math.abs(v[a])/sd[a])[0];c8[AX.indexOf(k1)*2+(v[k1]>=0?1:0)]++}
  console.log(`보정 ${days}일 ±${spread}: sd ${AX.map(k=>sd[k].toFixed(2)).join('/')} | 8분포 ${c8.map(c=>(c/N*100).toFixed(0)).join('/')}% 엔트로피 ${ent(c8).toFixed(2)} 최대 ${(Math.max(...c8)/N*100).toFixed(1)}%`);
}
// 결 전환(정규화 주된 결이 바뀌어 3밤 유지) 빈도: 30일, sd는 7일 ±0.2 집단 값 고정
{const sd={tempo:0.31,bold:0.22,close:0.18,curio:0.25};const cls=v=>{const k=[...AX].sort((a,b)=>Math.abs(v[b])/sd[b]-Math.abs(v[a])/sd[a])[0];return k+(v[k]>=0?'+':'-')};
 for(const spread of [0.1,0.2]){let users=0,total=0,first=[];for(let i=0;i<N;i++){const r=rng(80000+i);const u=habitUser(r,spread);const t=run(()=>u(r),90000+i,30,'v2').trace;
  let cur=cls(t[6]),cnt=0,firstDay=null;for(let d=7;d<30;d++){const c=cls(t[d]);if(c!==cur&&d+2<30&&cls(t[d+1])===c&&cls(t[d+2])===c){cnt++;cur=c;if(firstDay===null)firstDay=d+1}}
  if(cnt)users++;total+=cnt;if(firstDay)first.push(firstDay)}
  first.sort((a,b)=>a-b);
  console.log(`결 전환 8~30일 ±${spread}: 1회 이상 ${(users/N*100).toFixed(0)}%, 1인 평균 ${(total/N).toFixed(2)}회, 첫 전환 중앙 ${first[first.length>>1]}일째`)}
 // 습관을 바꾼 유저(15일째 A형→B형)
 {const t=run(d=>d<15?A():B(),5,30,'v2').trace;console.log('습관 전환 유저 결:',t.map(cls).join(' '))}
}
{const sd={tempo:0.31,bold:0.22,close:0.18,curio:0.25};const sc=(v,k)=>Math.abs(v[k])/sd[k];
 const top=v=>{const k=[...AX].sort((a,b)=>sc(v,b)-sc(v,a))[0];return k};
 for(const M of [1.25,1.5])for(const spread of [0.1,0.2]){let users=0,total=0;for(let i=0;i<N;i++){const r=rng(80000+i);const u=habitUser(r,spread);const t=run(()=>u(r),90000+i,30,'v2').trace;
  let ck=top(t[6]),cs=Math.sign(t[6][ck]),streak=0,cnt=0;
  for(let d=7;d<30;d++){const v=t[d];const k=top(v),s=Math.sign(v[k]);const curScore=Math.sign(v[ck])===cs?sc(v,ck):0;
   if((k!==ck||s!==cs)&&sc(v,k)>=M*curScore){streak++;if(streak>=3){cnt++;ck=k;cs=s;streak=0}}else streak=0}
  if(cnt)users++;total+=cnt}
  console.log(`히스테리시스 ×${M} ±${spread}: 30일 안 전환 1회 이상 ${(users/N*100).toFixed(0)}%, 평균 ${(total/N).toFixed(2)}회`)}}

// ── 먹빛 4종: OKLCH 명도 고정, 채도만 → WCAG 대비 유지 확인
const toLin=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4};
const fromLin=c=>{const v=c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055;return Math.round(Math.max(0,Math.min(1,v))*255)};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const toHex=a=>'#'+a.map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
function rgb2oklab([r,g,b]){[r,g,b]=[r,g,b].map(toLin);const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);return[0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s]}
function oklab2rgb([L,a,b]){const l=(L+0.3963377774*a+0.2158037573*b)**3,m=(L-0.1055613458*a-0.0638541728*b)**3,s=(L-0.0894841775*a-1.2914855480*b)**3;return[4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s].map(fromLin)}
const lum=a=>{const[r,g,b]=a.map(toLin);return 0.2126*r+0.7152*g+0.0722*b};
const cr=(x,y)=>{const a=lum(x),b=lum(y);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
const hues={'송연(청)':250,'유연(갈)':60,'자연(자)':330,'송화(녹)':140};
const sets=[['낮 body','#1B1A18',0.008,'#EFE8DA'],['낮 stroke-ink','#5F5C56',0.018,'#EFE8DA'],['낮 wash','#B9B3A8',0.02,'#EFE8DA'],['밤 body','#7E7973',0.02,'#141A2C'],['밤 stroke-ink','#59585A',0.016,'#141A2C']];
for(const [name,base,C,bg] of sets){const [L]=rgb2oklab(hex(base));const out=[`${name} ${base} (bg ${cr(hex(base),hex(bg)).toFixed(2)})`];
 for(const[hn,h] of Object.entries(hues)){const rad=h*Math.PI/180;let c=oklab2rgb([L,C*Math.cos(rad),C*Math.sin(rad)]);out.push(`${hn} ${toHex(c)} ${cr(c,hex(bg)).toFixed(2)}`)}
 console.log(out.join(' | '))}
// 밤 body vs 밤 stroke 대비 유지 확인

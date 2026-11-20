// C안 v1.1 먹빛 토큰 계산 (2026-11-20). 실행: node docs/design/pillars-v1/C-ink-tokens.mjs
// 명도(OKLab L)는 지금 토큰 그대로, 색상각 4개(송연 250°·유연 70°·자연 340°·송화 150°)에 채도 C만 준다. 낮 몸은 C 0.008 고정.
// 출력: 각 토큰의 hex(바탕 대비, 밤 몸은 /눈 대비)와 네 먹빛끼리 OKLab 거리 최소·최대. 값 끝 ! = sRGB 밖.
const s2l=v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4, l2s=v=>v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055;
const hex2rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
function rgb2oklab([r,g,b]){[r,g,b]=[r,g,b].map(s2l);const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
return[0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s]}
function oklab2rgb([L,a,b]){const l=(L+0.3963377774*a+0.2158037573*b)**3,m=(L-0.1055613458*a-0.0638541728*b)**3,s=(L-0.0894841775*a-1.2914855480*b)**3;
return[4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s]}
const toHex=rgb=>{const out=rgb.map(v=>Math.round(Math.min(1,Math.max(0,l2s(v)))*255));const ing=rgb.every(v=>v>=-1e-4&&v<=1+1e-4);return '#'+out.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()+(ing?'':'!')};
const lum=h=>{const c=hex2rgb(h.slice(0,7)).map(s2l);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const cr=(a,b)=>{const x=lum(a),y=lum(b);return((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};
const H={송연:250,유연:70,자연:340,송화:150};
const toks=[['낮 stroke-ink','#5F5C56','#EFE8DA'],['낮 wash','#B9B3A8','#EFE8DA'],['밤 body','#7E7973','#141A2C'],['밤 stroke-ink','#59585A','#141A2C'],['낮 body','#1B1A18','#EFE8DA']];
for(const C of [0.03,0.035,0.04]){console.log('--- C',C);
for(const [n,h,bg] of toks){const [L]=rgb2oklab(hex2rgb(h));const cc=n==='낮 body'?0.008:C;const res={};
 for(const[k,hu] of Object.entries(H)){const r=hu*Math.PI/180;res[k]=toHex(oklab2rgb([L,cc*Math.cos(r),cc*Math.sin(r)]))}
 const labs=Object.values(res).map(x=>rgb2oklab(hex2rgb(x.slice(0,7))));let mn=9,mx=0;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const d=Math.hypot(...labs[i].map((v,k)=>v-labs[j][k]));mn=Math.min(mn,d);mx=Math.max(mx,d)}
 console.log(n,Object.entries(res).map(([k,v])=>`${k}${v}(${cr(v,bg)}${n==='밤 body'?'/눈'+cr(v,'#E9E2D2'):''})`).join(' '),'OKLab최소',mn.toFixed(3),'최대',mx.toFixed(3))}}

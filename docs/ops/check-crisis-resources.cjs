const path=require('path');const root=process.argv[2]||path.resolve(__dirname,'../..'); // 위기 연락처 정본 스키마 검사(사용: node docs/ops/check-crisis-resources.cjs)
const {createRequire}=require('module');const r=createRequire(path.join(root,'package.json'));
const Ajv2020=r('ajv/dist/2020').default;
const fs=require('fs');
const schema=JSON.parse(fs.readFileSync(path.join(root,'docs/ops/crisis-resources.schema.json')));
const data=JSON.parse(fs.readFileSync(path.join(root,'docs/ops/crisis-resources.v1.json')));
const ajv=new Ajv2020({allErrors:true,strict:false});const v=ajv.compile(schema);
const ok=v(data);console.log('본 데이터:',ok?'통과':'실패',ok?'':JSON.stringify(v.errors,null,1));
// 음성 시험: 망가뜨린 사본은 실패해야 한다
const clone=()=>JSON.parse(JSON.stringify(data));const cases={
 'primary 2개':d=>{d.resources.NZ[2].primary=true},
 'primary 0개':d=>{d.resources.PH[1].primary=false},
 'emergency 없음':d=>{d.resources.CA.shift()},
 'free 형 틀림':d=>{d.resources.KR[1].free=true},
 '링크·안내 둘 다 없음':d=>{d.resources.KR[1].channels[1].displayHint=null},
 'hours 임의 문자열':d=>{d.resources.NZ[2].hours='7am–midnight'},
 'anonymousOk false':d=>{d.resources.NZ[1].anonymousOk=false},
 '채널 type 틀림':d=>{d.resources.PH[1].channels[0].type='sms'},
 '필드 누락(hours)':d=>{delete d.resources._default[0].hours},
 'http 출처':d=>{d.resources.KR[1].sources[0]='http://x.kr'},
 '_default 없음':d=>{delete d.resources._default},
};let bad=0;for(const [k,f] of Object.entries(cases)){const d=clone();f(d);const res=v(d);console.log(res?'놓침 ':'막음 ',k);if(res)bad++}
// 데이터 규칙: 문자열 사전에 긴급 번호 고정 금지는 앱 시험 몫. 여기선 primary 24/7 여부 출력
for(const [c,rs] of Object.entries(data.resources)){const p=rs.find(x=>x.primary);console.log(c,'첫 줄',p.id,'hours',p.hours,'채널',[...new Set(p.channels.map(x=>x.type))].join('+'))}
process.exit(ok&&!bad?0:1);

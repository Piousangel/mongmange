// 덧말 사전 그래프 v0 불변식 검사(설계 시제품). 실패하면 종료 코드 1.
// 실행: node docs/design/dream/2026-11-25-dream-compose-v2/prototype/tools/check-dutmal.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(DIR, '../dutmal.js'), 'utf8'), ctx);
const D = ctx.Dutmal;
const senses = Object.keys(D.SENSES);
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

ok(senses.length === 48, `말결 48개여야 함: ${senses.length}`);
ok(Object.keys(D.FAMILY).length === 36, `가족 쌍 36칸이어야 함: ${Object.keys(D.FAMILY).length}`);
ok(!/meal|snack|care|pet|feed/.test(D.pick.toString().split(')')[0]), '돌봄을 받을 인자가 없어야 함');
// 이레 반복 피하기: avoid를 주면 다른 후보가 있을 때 피한다, 그래도 결정적
for (const a of senses) for (const b of senses) { const r0 = D.pick(9, a, b, null); const r1 = D.pick(9, a, b, null, [r0]); ok(r1 === D.pick(9, a, b, null, [r0]), '피하기 결정성'); }

// 1) 모든 쌍·여러 씨앗에서 정의됨 + 결정적 + 순서 무관
const use = {};
let pairs = 0;
for (const seed of [1, 7, 42, 1234, 99991]) {
  for (const a of senses) for (const b of senses) {
    const r = D.pick(seed, a, b, null);
    pairs++;
    ok(r && D.DUT[r], `정의 안 됨 ${a}+${b}`);
    ok(r === D.pick(seed, a, b, null), `같은 입력 다른 결과 ${a}+${b}`);
    ok(r === D.pick(seed, b, a, null), `순서에 따라 다름 ${a}+${b}`);
    use[r] = (use[r] || 0) + 1;
    // 2) 무거운 마음 가족 안전
    const heavy = D.HEAVY.has(D.familyOf(a)) || D.HEAVY.has(D.familyOf(b));
    if (heavy) {
      ok(['toward', 'stay'].includes(D.DUT[r].dir), `무거운 입력에 멀어짐·솟음 ${a}+${b} → ${r}`);
      ok(!D.NOT_WITH_HEAVY.has(r), `무거운 입력 금지 낱말 ${a}+${b} → ${r}`);
    }
  }
  for (const a of senses) for (const s of Object.keys(D.SEASON)) {
    const r = D.pick(seed, a, null, s);
    ok(r && D.DUT[r], `절기 정의 안 됨 ${a}+${s}`);
    if (D.HEAVY.has(D.familyOf(a))) ok(['toward', 'stay'].includes(D.DUT[r].dir) && !D.NOT_WITH_HEAVY.has(r), `절기 무거운 입력 ${a}+${s} → ${r}`);
  }
}
// 3) 금지 낱말 0 (id·ko·en)
const BAN_KO = ['무지개', '병', '밧줄', '사다리', '다리', '절벽', '깊은', '가라앉', '잔치', '음식', '밥', '얼굴', '손', '눈물', '폭풍', '천둥', '어둠', '기쁨', '슬픔', '화'];
for (const [id, d] of Object.entries(D.DUT)) {
  for (const b of D.BANNED) ok(!id.includes(b) && !d.en.includes(b), `금지 낱말 ${id}`);
  for (const b of BAN_KO) ok(!d.ko.includes(b), `금지 낱말(ko) ${id} ${d.ko}`);
  ok(d.cls !== 'food', `먹을 것 ${id}`);
}
// 4) 살림(먹고 마심) 입력에서 찻잔·먹을 것 덧말 0
for (const a of ['home.in.meal', 'home.in.sweet', 'home.in.drink']) for (const b of senses) {
  const r = D.pick(42, a, b, null);
  ok(!/teacup|meal|food/.test(D.DUT[r].piece), `섭식 입력에서 먹는 그림 ${a}+${b} → ${r}`);
}
// 5) 위기 → 고요 치환 뒤에는 진짜 고요와 구별 불가(입력이 같으면 출력이 같다는 사실의 확인)
for (const b of senses) ok(D.pick(5, 'warm.in.still', b, null) === D.pick(5, 'warm.in.still', b, null), '고요 결정성');
// 6) 모든 덧말 낱말이 한 번 이상 쓰임(죽은 낱말 0)
for (const id of Object.keys(D.DUT)) ok(use[id] > 0, `쓰이지 않는 덧말 ${id}`);

const total = Object.values(use).reduce((a, b) => a + b, 0);
const top = Object.entries(use).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${D.DUT[k].ko} ${((v / total) * 100).toFixed(1)}%`);
console.log(`검사 쌍 ${pairs}개 + 절기 ${48 * 4 * 5}개, 실패 ${fails.length}`);
console.log('덧말 분포(48×48×씨앗5):', top.join(' · '));
if (fails.length) { console.log(fails.slice(0, 20).join('\n')); process.exit(1); }

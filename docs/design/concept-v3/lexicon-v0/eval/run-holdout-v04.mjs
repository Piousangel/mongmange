// 사용: node docs/design/concept-v3/lexicon-v0/eval/run-holdout-v04.mjs [세트 파일] [--json] [--quiet]
// v0.4 평가기(crisis-match-v04.mjs)로 세트를 잰다. 기본 세트 = ../crisis-holdout-v3.json
// 라벨 두 방식을 읽는다: (가) label strong|soft|none (개발 세트·v1·v2) (나) label crisis+severity | none | net (v3)
// net = 위기 아님이지만 '가라앉음' 일상 낱말. soft로 잡혀도 오탐 아님, strong이면 strong 오탐(PM 11-25 관문 개정).
// --quiet: 놓침·오탐 문자열을 찍지 않는다(보류 세트 문자열 비공개, 범주·개수만).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullPipeline, crisisMatch, normalize, sideAnswer, RULES } from './crisis-match-v04.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(here, '..', 'crisis-holdout-v3.json');
const asJson = process.argv.includes('--json'), quiet = process.argv.includes('--quiet');
const set = JSON.parse(fs.readFileSync(file, 'utf8'));
const items = set.items.map((x) => ({
  ...x,
  lang: x.lang ?? (/[가-힣ㄱ-ㅣ]/.test(x.text) ? 'ko' : 'en'),
  category: x.category ?? x.variant ?? x.group ?? '-',
  gold: x.label === 'crisis' ? x.severity : x.label, // strong | soft | none | net
}));
const lim = { ko: RULES.ko.lengthLimit, en: RULES.en.lengthLimit };
const rank = { none: 0, soft: 1, strong: 2 };
const isPos = (r) => r.gold === 'strong' || r.gold === 'soft';
const rows = items.map((x) => {
  const r = fullPipeline(x.text, x.lang);
  const side = sideAnswer(r);
  const fits = [...normalize(x.text)].length <= lim[x.lang];
  let outcome;
  if (x.gold === 'none') outcome = r.level === 'none' ? 'TN' : 'FP';
  else if (x.gold === 'net') outcome = r.level === 'strong' ? 'FP' : 'TN';
  else if (r.level === 'none') outcome = 'MISS';
  else if (rank[r.level] < rank[x.gold]) outcome = 'UNDER';
  else if (rank[r.level] > rank[x.gold]) outcome = 'OVER';
  else outcome = 'HIT';
  return { ...x, got: r.level, by: r.by, stage: r.stage, side, fits, outcome };
});
const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);
const summarize = (rs) => {
  const pos = rs.filter(isPos), neg = rs.filter((r) => !isPos(r)), net = rs.filter((r) => r.gold === 'net');
  const strong = pos.filter((r) => r.gold === 'strong'), soft = pos.filter((r) => r.gold === 'soft');
  const c = (a, o) => a.filter((r) => r.outcome === o).length;
  const strongFp = neg.filter((r) => r.got === 'strong').length;
  return {
    positives: pos.length, strong: strong.length, soft: soft.length,
    strong_missed: c(strong, 'MISS'), strong_downgraded: c(strong, 'UNDER'), soft_missed: c(soft, 'MISS'), soft_upgraded: c(soft, 'OVER'),
    strong_miss_pct: pct(c(strong, 'MISS'), strong.length), total_miss: c(pos, 'MISS'), total_miss_pct: pct(c(pos, 'MISS'), pos.length),
    // 넓은 그물 관점: 위기 말이 감지는 놓쳤어도 가라앉음 말결로 곁 대답을 받는가
    pos_no_side_answer: pos.filter((r) => !r.side).length,
    negatives: neg.length, false_positives: c(neg, 'FP'), fp_pct: pct(c(neg, 'FP'), neg.length),
    strong_fp: strongFp, strong_fp_pct: pct(strongFp, neg.length),
    net: net.length, net_side_answer: net.filter((r) => r.side).length, net_side_pct: pct(net.filter((r) => r.side).length, net.length),
    net_by_crisis: net.filter((r) => r.got !== 'none').length, net_by_sense: net.filter((r) => r.side === 'soft-net').length,
    fp_by_stage: neg.filter((r) => r.outcome === 'FP').reduce((m, r) => ((m[r.stage] = (m[r.stage] ?? 0) + 1), m), {}),
  };
};
const by = (rs) => { const m = {}; for (const r of rs) { const g = (m[`${r.lang}:${r.category}`] ??= { n: 0, MISS: 0, UNDER: 0, FP: 0, noSide: 0 }); g.n++; if (g[r.outcome] !== undefined) g[r.outcome]++; if (!r.side) g.noSide++; } return m; };
const report = {
  set: path.basename(file), rulesVer: RULES.rulesVer, all: summarize(rows), within_length_limit: summarize(rows.filter((r) => r.fits)),
  by_lang: { ko: summarize(rows.filter((r) => r.lang === 'ko')), en: summarize(rows.filter((r) => r.lang === 'en')) },
  by_category_pos: by(rows.filter(isPos)), by_category_neg: by(rows.filter((r) => !isPos(r))),
  by_signal_pos: rows.filter(isPos).reduce((m, r) => { const g = (m[`${r.signal ?? '-'}:${r.gold}`] ??= { n: 0, MISS: 0, UNDER: 0 }); g.n++; if (g[r.outcome] !== undefined) g[r.outcome]++; return m; }, {}),
  misses: rows.filter((r) => r.outcome === 'MISS' || r.outcome === 'UNDER').map((r) => ({ id: r.id, label: r.gold, got: r.got, side: r.side, category: r.category, ...(quiet ? {} : { text: r.text }) })),
  false_positives: rows.filter((r) => r.outcome === 'FP').map((r) => ({ id: r.id, label: r.gold, category: r.category, got: r.got, stage: r.stage, ...(quiet ? {} : { text: r.text, by: r.by }) })),
  net_no_side: rows.filter((r) => r.gold === 'net' && !r.side).map((r) => ({ id: r.id, lang: r.lang, ...(quiet ? {} : { text: r.text, by: r.by }) })),
};
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`세트 ${report.set} · 규칙 ${report.rulesVer}`);
  for (const k of ['all', 'within_length_limit']) console.log(k, JSON.stringify(report[k]));
  console.log('ko', JSON.stringify(report.by_lang.ko)); console.log('en', JSON.stringify(report.by_lang.en));
  console.log('\n범주(위기)', JSON.stringify(report.by_category_pos)); console.log('범주(위기 아님)', JSON.stringify(report.by_category_neg));
  console.log('신호(위기)', JSON.stringify(report.by_signal_pos));
  console.log('\n놓침·낮춤', report.misses.length); for (const m of report.misses) console.log(' ', m.id, m.label, '→', m.got, m.side ?? '-', m.category, quiet ? '' : `| ${m.text}`);
  console.log('\n오탐', report.false_positives.length); for (const f of report.false_positives) console.log(' ', f.id, f.label, '→', f.got, f.stage, f.category, quiet ? '' : `| ${f.text} ${f.by}`);
  console.log('\nnet 곁 대답 없음', report.net_no_side.length); for (const n of report.net_no_side) console.log(' ', n.id, n.lang, quiet ? '' : `| ${n.text} ${n.by}`);
}

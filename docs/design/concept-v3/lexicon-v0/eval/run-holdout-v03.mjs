// 사용: node docs/design/concept-v3/lexicon-v0/eval/run-holdout-v03.mjs [세트 파일] [--json] [--quiet]
// v0.3 평가기(crisis-match-v03.mjs)로 보류 세트를 잰다. 기본 세트 = ../crisis-holdout-v2.json
// --quiet: 놓침·오탐 문자열을 찍지 않는다(보류 세트 문자열 비공개용, 범주·개수만).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullPipeline, crisisMatch, normalize, RULES } from './crisis-match-v03.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(here, '..', 'crisis-holdout-v2.json');
const asJson = process.argv.includes('--json'), quiet = process.argv.includes('--quiet');
const set = JSON.parse(fs.readFileSync(file, 'utf8'));
const items = set.items.map((x) => ({ ...x, lang: x.lang ?? (/[가-힣ㄱ-ㅣ]/.test(x.text) ? 'ko' : 'en'), category: x.category ?? x.variant ?? '-' }));
const lim = { ko: RULES.ko.lengthLimit, en: RULES.en.lengthLimit };
const rank = { none: 0, soft: 1, strong: 2 };
const rows = items.map((x) => {
  const r = fullPipeline(x.text, x.lang);
  const crisisOnly = crisisMatch(x.text).level;
  const fits = [...normalize(x.text)].length <= lim[x.lang];
  let outcome;
  if (x.label === 'none') outcome = r.level === 'none' ? 'TN' : 'FP';
  else if (r.level === 'none') outcome = 'MISS';
  else if (rank[r.level] < rank[x.label]) outcome = 'UNDER';
  else if (rank[r.level] > rank[x.label]) outcome = 'OVER';
  else outcome = 'HIT';
  return { ...x, got: r.level, by: r.by, stage: r.stage, crisisOnly, fits, outcome };
});
const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);
const summarize = (rs) => {
  const pos = rs.filter((r) => r.label !== 'none'), neg = rs.filter((r) => r.label === 'none');
  const strong = pos.filter((r) => r.label === 'strong'), soft = pos.filter((r) => r.label === 'soft');
  const c = (a, o) => a.filter((r) => r.outcome === o).length;
  return {
    positives: pos.length, strong: strong.length, soft: soft.length,
    strong_missed: c(strong, 'MISS'), strong_downgraded: c(strong, 'UNDER'), soft_missed: c(soft, 'MISS'), soft_upgraded: c(soft, 'OVER'),
    strong_miss_pct: pct(c(strong, 'MISS'), strong.length), total_miss: c(pos, 'MISS'), total_miss_pct: pct(c(pos, 'MISS'), pos.length),
    negatives: neg.length, false_positives: c(neg, 'FP'), fp_pct: pct(c(neg, 'FP'), neg.length),
    pos_caught_by_lexicon_or_split: pos.filter((r) => r.outcome !== 'MISS' && r.stage !== 'crisis').length,
    fp_by_stage: neg.filter((r) => r.outcome === 'FP').reduce((m, r) => ((m[r.stage] = (m[r.stage] ?? 0) + 1), m), {}),
  };
};
const by = (rs) => { const m = {}; for (const r of rs) { const g = (m[`${r.lang}:${r.category}`] ??= { n: 0, MISS: 0, UNDER: 0, FP: 0 }); g.n++; if (g[r.outcome] !== undefined) g[r.outcome]++; } return m; };
const report = {
  set: path.basename(file), rulesVer: RULES.rulesVer, all: summarize(rows), within_length_limit: summarize(rows.filter((r) => r.fits)),
  by_lang: { ko: summarize(rows.filter((r) => r.lang === 'ko')), en: summarize(rows.filter((r) => r.lang === 'en')) },
  by_category_pos: by(rows.filter((r) => r.label !== 'none')), by_category_neg: by(rows.filter((r) => r.label === 'none')),
  misses: rows.filter((r) => r.outcome === 'MISS' || r.outcome === 'UNDER').map((r) => ({ id: r.id, label: r.label, got: r.got, category: r.category, ...(quiet ? {} : { text: r.text }) })),
  false_positives: rows.filter((r) => r.outcome === 'FP').map((r) => ({ id: r.id, category: r.category, got: r.got, stage: r.stage, ...(quiet ? {} : { text: r.text, by: r.by }) })),
};
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`세트 ${report.set} · 규칙 ${report.rulesVer}`);
  for (const k of ['all', 'within_length_limit']) console.log(k, JSON.stringify(report[k]));
  console.log('ko', JSON.stringify(report.by_lang.ko)); console.log('en', JSON.stringify(report.by_lang.en));
  console.log('\n범주(위기)', JSON.stringify(report.by_category_pos)); console.log('범주(음성)', JSON.stringify(report.by_category_neg));
  console.log('\n놓침·낮춤', report.misses.length); for (const m of report.misses) console.log(' ', m.id, m.label, '→', m.got, m.category, quiet ? '' : `| ${m.text}`);
  console.log('\n오탐', report.false_positives.length); for (const f of report.false_positives) console.log(' ', f.id, f.got, f.stage, f.category, quiet ? '' : `| ${f.text} ${f.by}`);
}

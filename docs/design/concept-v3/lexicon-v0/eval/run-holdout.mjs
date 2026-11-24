// 사용: node docs/design/concept-v3/lexicon-v0/eval/run-holdout.mjs [세트 파일] [--json]
// 기본 세트 = ../crisis-holdout-v1.json. 개발 세트로 재현 확인: ../crisis-test-v0.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullPipeline, crisisMatch, hasWeakMarker, normalize, RULES } from './crisis-match.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(here, '..', 'crisis-holdout-v1.json');
const asJson = process.argv.includes('--json');
const set = JSON.parse(fs.readFileSync(file, 'utf8'));
const items = set.items.map((x) => ({ ...x, lang: x.lang ?? (/[가-힣ㄱ-ㅣ]/.test(x.text) ? 'ko' : 'en') }));
const lim = { ko: RULES.ko.lengthLimit, en: RULES.en.lengthLimit };
const rank = { none: 0, soft: 1, strong: 2 };

const rows = items.map((x) => {
  const r = fullPipeline(x.text, x.lang);
  const crisisOnly = crisisMatch(x.text).level;
  const fits = [...normalize(x.text)].length <= lim[x.lang];
  let outcome;
  if (x.label === 'none') outcome = r.level === 'none' ? 'TN' : 'FP';
  else if (r.level === 'none') outcome = 'MISS';
  else if (rank[r.level] < rank[x.label]) outcome = 'UNDER'; // strong을 soft로 낮춤
  else if (rank[r.level] > rank[x.label]) outcome = 'OVER';
  else outcome = 'HIT';
  return { ...x, got: r.level, by: r.by, stage: r.stage, crisisOnly, fits, outcome, weak: hasWeakMarker(x.text) };
});

const summarize = (rs) => {
  const pos = rs.filter((r) => r.label !== 'none'), neg = rs.filter((r) => r.label === 'none');
  const strong = pos.filter((r) => r.label === 'strong'), soft = pos.filter((r) => r.label === 'soft');
  const c = (a, o) => a.filter((r) => r.outcome === o).length;
  return {
    positives: pos.length, strong: strong.length, soft: soft.length,
    strong_missed: c(strong, 'MISS'), strong_downgraded: c(strong, 'UNDER'), soft_missed: c(soft, 'MISS'),
    soft_upgraded: c(soft, 'OVER'),
    total_miss_any: c(pos, 'MISS'), strong_failures: c(strong, 'MISS') + c(strong, 'UNDER'),
    negatives: neg.length, false_positives: c(neg, 'FP'), fp_rate: neg.length ? +(c(neg, 'FP') / neg.length * 100).toFixed(1) : null,
    caught_only_by_lexicon_or_split: pos.filter((r) => r.outcome !== 'MISS' && r.stage !== 'crisis').length,
  };
};
const by = (k) => { const m = {}; for (const r of rows.filter((r) => r.label !== 'none')) { const g = (m[r[k]] ??= { n: 0, miss: 0, under: 0 }); g.n++; if (r.outcome === 'MISS') g.miss++; if (r.outcome === 'UNDER') g.under++; } return m; };

const report = {
  set: path.basename(file), rulesVer: RULES.rulesVer,
  all: summarize(rows),
  within_length_limit: summarize(rows.filter((r) => r.fits)),
  by_lang: { ko: summarize(rows.filter((r) => r.lang === 'ko')), en: summarize(rows.filter((r) => r.lang === 'en')) },
  by_variant: by('variant'), by_basis: by('basis'),
  misses: rows.filter((r) => r.outcome === 'MISS' || r.outcome === 'UNDER').map((r) => ({ id: r.id, text: r.text, label: r.label, got: r.got, variant: r.variant, basis: r.basis, fits: r.fits, weakMarker: r.weak })),
  false_positives: rows.filter((r) => r.outcome === 'FP').map((r) => ({ id: r.id, text: r.text, by: r.by, basis: r.basis })),
};
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`세트 ${report.set} · 규칙 ${report.rulesVer}`);
  for (const k of ['all', 'within_length_limit']) console.log(k, JSON.stringify(report[k]));
  console.log('ko', JSON.stringify(report.by_lang.ko)); console.log('en', JSON.stringify(report.by_lang.en));
  console.log('\n변형별', JSON.stringify(report.by_variant)); console.log('근거별', JSON.stringify(report.by_basis));
  console.log('\n놓침·낮춤', report.misses.length); for (const m of report.misses) console.log(' ', m.id, m.label, '→', m.got, m.fits ? '' : '(길이초과)', m.weakMarker ? '[약한표지]' : '', m.basis, m.variant, '|', m.text);
  console.log('\n오탐', report.false_positives.length); for (const f of report.false_positives) console.log(' ', f.id, f.by, f.basis, '|', f.text);
}

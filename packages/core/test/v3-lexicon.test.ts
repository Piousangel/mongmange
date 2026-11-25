// V5d 최소판: 낱말 → 말결 결정적 조회 + 위기 대조 v0.4가 정본 평가기(docs/.../eval/crisis-match-v04.mjs)와 같은 판정을 내는지.
// 대조 세트 = 위기 개발 세트 v1.1(규칙 개발용) + 사전의 모든 표면형 + README 경계 시범. 보류 세트(holdout)는 열지 않는다(heart-grain 8-3).
import { describe, expect, it } from 'vitest';
import { v3 } from '../src/index';
import KO_DOC from '../../../docs/design/concept-v3/lexicon-v0/ko-sample.json';
import EN_DOC from '../../../docs/design/concept-v3/lexicon-v0/en-sample.json';
import RULES_DOC from '../../../docs/design/concept-v3/lexicon-v0/rules-v0.json';
import SENSES_DOC from '../../../docs/design/concept-v3/lexicon-v0/senses.json';
import DEV_SET from '../../../docs/design/concept-v3/lexicon-v0/crisis-dev-v1.json';
import KO_CORE from '../src/v3/data/ko-sample.json';
import EN_CORE from '../src/v3/data/en-sample.json';
import RULES_CORE from '../src/v3/data/rules-v0.json';

interface EvalMod {
  fullPipeline(raw: string, lang: 'ko' | 'en'): { level: 'strong' | 'soft' | 'none'; sense?: string; stage: string };
}
const EVAL_URL = new URL('../../../docs/design/concept-v3/lexicon-v0/eval/crisis-match-v04.mjs', import.meta.url).href;
const loadEval = async () => (await import(/* @vite-ignore */ EVAL_URL)) as EvalMod;

/** 평가기 결과 → 이 구현의 대답 종류로 옮김(곁 대답 / 말결 / 모르는 말) */
function expectSame(ev: EvalMod, raw: string, lang: 'ko' | 'en') {
  const want = ev.fullPipeline(raw, lang);
  const got = v3.interpretWord(raw, lang);
  if (want.level !== 'none') {
    expect(got, `${raw} (${lang})`).toEqual({ kind: 'stay', level: want.level });
  } else if (want.sense) {
    const id = got.kind === 'sense' ? got.sense : got.kind === 'call' ? 'x.call' : got.kind === 'unknown' ? 'x.unknown' : 'x.stay';
    expect(id, `${raw} (${lang})`).toBe(want.sense);
  } else {
    // 평가기에는 이름 부르기 단계가 없다 — 기본 이름은 부르기, 그 밖은 모르는 말
    expect(['unknown', 'call'], `${raw} (${lang})`).toContain(got.kind);
  }
}

describe('V5d 데이터 = 정본 사본', () => {
  it('core에 실은 사전·규칙이 docs 정본과 같다(어긋나면 다시 복사)', () => {
    expect(KO_CORE).toEqual(KO_DOC);
    expect(EN_CORE).toEqual(EN_DOC);
    expect(RULES_CORE).toEqual(RULES_DOC);
  });
  it('말결 48 목록이 senses.json과 같다', () => {
    expect(v3.SENSE_IDS).toEqual((SENSES_DOC as { senses: { id: string }[] }).senses.map((s) => s.id));
    expect(v3.SENSE_IDS).toHaveLength(48);
  });
});

describe('SHA-256(수단어 해시용)', () => {
  it('표준 시험 벡터', () => {
    expect(v3.sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(v3.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(v3.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    // 64바이트 경계를 넘는 UTF-8(한글 3바이트 × 30)
    expect(v3.sha256Hex('가'.repeat(30))).toHaveLength(64);
  });
});

describe('위기 대조·사전 = 평가기 v0.4와 같은 판정', () => {
  it('위기 개발 세트 v1.1 전부(ko·en 두 언어 설정)', async () => {
    const ev = await loadEval();
    const items = (DEV_SET as { items: { text: string }[] }).items;
    expect(items.length).toBeGreaterThan(400);
    for (const it of items) {
      expectSame(ev, it.text, 'ko');
      expectSame(ev, it.text, 'en');
    }
  });
  it('사전의 모든 표면형(자기 일치 — 일상어가 위기로 잡히지 않는 것 포함)', async () => {
    const ev = await loadEval();
    for (const [file, lang] of [
      [KO_DOC, 'ko'],
      [EN_DOC, 'en'],
    ] as const)
      for (const e of (file as { entries: { lemma: string; forms: string[] }[] }).entries) for (const f of [e.lemma, ...e.forms]) expectSame(ev, f, lang);
  });
  it('README 경계 시범', async () => {
    const ev = await loadEval();
    const cases: [string, 'ko' | 'en'][] = [
      ['sooo sad', 'en'], ['loooool', 'en'], ['개짜증나', 'ko'], ['개강', 'ko'], ['겁나배고파', 'ko'], ['ㅈㅅㅈㅅ', 'ko'],
      ['죽겠다배고파', 'ko'], ['배고파죽겠어', 'ko'], ['엄마보고싶어', 'ko'], ['시험때문에죽고파', 'ko'], ['자살골', 'ko'], ['그만살쪄', 'ko'],
      ['', 'ko'], ['   ', 'en'], ['...', 'en'], [':(', 'en'], [':((', 'en'], ['Suicide Squad', 'en'], ['help!', 'en'],
    ]; // prettier-ignore
    for (const [raw, lang] of cases) expectSame(ev, raw, lang);
  });
});

describe('⑦ 수단어 해시 경로(시험 전용 고추가루·해시 — 평문 수단어 없음)', () => {
  // 사전·위기 줄기 어디에도 없는 무의미 낱말로 경로만 친다
  const table = (strong: string[], soft: string[]): v3.MeansTable => ({ pepper: 'test-pepper:', strong: strong.map((w) => v3.meansHash('test-pepper:', w)), soft: soft.map((w) => v3.meansHash('test-pepper:', w)) });
  it('기본 표에서는 무의미 낱말이 걸리지 않는다', () => {
    expect(v3.crisisMatch('qzvx').level).toBe('none');
    expect(v3.crisisMatch('뷁퓌').level).toBe('none');
  });
  it('strong 해시 → strong, 앞뒤에 글자가 붙어도(2~8자 부분 문자열)', () => {
    const t = table(['qzvx'], []);
    expect(v3.crisisMatch('qzvx', t).level).toBe('strong');
    expect(v3.crisisMatch('aaqzvxbb', t).level).toBe('strong');
    expect(v3.interpretWord('qzvx', 'en', [], t)).toEqual({ kind: 'stay', level: 'strong' });
  });
  it('soft 해시 → soft, strong이 soft보다 먼저', () => {
    expect(v3.crisisMatch('뷁퓌', table([], ['뷁퓌'])).level).toBe('soft');
    expect(v3.crisisMatch('뷁퓌qzvx', table(['qzvx'], ['뷁퓌'])).level).toBe('strong');
    expect(v3.crisisMatch('qzvx', table([], [])).level).toBe('none');
  });
});

describe('배고픔 표지(QA-3 R4-3, v3 리뷰 2차 L-a)', () => {
  // 배고픔 낱말만 표지를 단다 — 음식·맛 낱말은 기쁨을 그대로 둔다(좋은/나쁜 음식 구분 강화 방지, care-rituals 2-5)
  it('배고픔 낱말(배고파·꼬르륵·hungry·starving·hangry)은 hunger', () => {
    for (const [w, lang] of [['배고파', 'ko'], ['배고프다', 'ko'], ['꼬르륵', 'ko'], ['hungry', 'en'], ['starving', 'en'], ['hangry', 'en']] as const)
      expect(v3.interpretWord(w, lang), w).toMatchObject({ kind: 'sense', sense: 'home.in.meal', hunger: true });
  });
  it('과장(배고파죽겠다)도 배고픔 표지를 지닌다', () => {
    expect(v3.interpretWord('배고파죽겠다', 'ko')).toMatchObject({ kind: 'sense', sense: 'home.in.meal', intensity: 3, hunger: true });
  });
  it('음식·맛 낱말(밥·치킨·맛있어·yummy·pizza)에는 표지가 없다', () => {
    for (const [w, lang] of [['밥', 'ko'], ['치킨', 'ko'], ['맛있어', 'ko'], ['맛있어죽겠다', 'ko'], ['yummy', 'en'], ['pizza', 'en'], ['food', 'en']] as const) {
      const a = v3.interpretWord(w, lang);
      expect(a, w).toMatchObject({ kind: 'sense', sense: 'home.in.meal' });
      expect(a, w).not.toHaveProperty('hunger');
    }
  });
  it('사전에서 hunger 표지는 home.in.meal 항목에만, 저장값에는 들어가지 않는다', () => {
    const tagged = [KO_DOC, EN_DOC].flatMap((f) => (f as { entries: { id: string; sense: string; flags: string[] }[] }).entries.filter((e) => e.flags.includes('hunger')));
    expect(tagged.map((e) => e.id).sort()).toEqual(['en.0121', 'ko.0172']);
    for (const e of tagged) expect(e.sense).toBe('home.in.meal');
    expect(v3.storedWordOf(v3.interpretWord('배고파', 'ko'))).toEqual({ sense: 'home.in.meal', intensity: 2 });
  });
});

describe('대답 종류와 저장값', () => {
  it('낱말 → 말결(같은 말 = 같은 결)', () => {
    const a = v3.interpretWord('행복해', 'ko');
    expect(a).toEqual({ kind: 'sense', sense: 'bright.in.joy', intensity: 3, net: false });
    expect(v3.interpretWord('행복해', 'ko')).toEqual(a);
    expect(v3.interpretWord('슬퍼', 'ko')).toMatchObject({ kind: 'sense', sense: 'low.in.sad', net: true });
  });
  it('강조 접두는 강도 +1(상한 3), 욕설은 상한 2', () => {
    const plain = v3.interpretWord('짜증나', 'ko');
    const boosted = v3.interpretWord('개짜증나', 'ko');
    expect(plain.kind === 'sense' && boosted.kind === 'sense' && boosted.intensity >= plain.intensity).toBe(true);
  });
  it('빈 입력·문장부호만 = 모르는 말(빈 키로 사전 조회 금지, QA-3 R4-0)', () => {
    for (const raw of ['', ' ', '...', '!!', '그만살쪄']) expect(v3.interpretWord(raw, 'ko').kind).toBe('unknown');
  });
  it('이름 = 부르기', () => {
    expect(v3.interpretWord('몽망이', 'ko').kind).toBe('call');
    expect(v3.interpretWord('콩이', 'ko', ['콩이']).kind).toBe('call');
  });
  it('곁 대답은 런타임 전용 — 저장은 고요·강도 1(heart-grain 9-1)', () => {
    expect(v3.storedWordOf({ kind: 'stay', level: 'strong' })).toEqual({ sense: 'warm.in.still', intensity: 1 });
    expect(v3.storedWordOf({ kind: 'stay', level: 'soft' })).toEqual({ sense: 'warm.in.still', intensity: 1 });
    expect(v3.STORED_SENSES).not.toContain('x.stay');
  });
  it('글자 수(공백 제외)', () => {
    expect(v3.wordChars('행복')).toBe(2);
    expect(v3.wordChars(' 비 와 ')).toBe(2);
    expect(v3.wordChars('happy')).toBe(5);
  });
});

// C11c: 통계 켜기 화면의 동의 고지 네 가지(개인정보 보호법 제15조 제2항 — 목적·항목·보유 기간·거부해도 불이익 없음, K38).
// ① 화면: MetricsSheet가 네 키를 토글(metrics-toggle-row)보다 먼저, 연령 확인 갈래 밖에서 그린다.
// ② 사실: ko·en 문구가 처리방침 3-1·6절의 같은 사실을 말한다(방침 쪽 문장도 함께 확인해 한쪽만 바뀌면 깨진다).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tIn } from '../src/i18n';

const ROOT = path.resolve(__dirname, '../../..');
const sheet = readFileSync(path.resolve(__dirname, '../src/screens/MetricsSheet.tsx'), 'utf8');
const policy = {
  ko: readFileSync(path.join(ROOT, 'docs/release/privacy-policy.ko.md'), 'utf8'),
  en: readFileSync(path.join(ROOT, 'docs/release/privacy-policy.en.md'), 'utf8'),
};
/** 처리방침의 한 절(머리 줄부터 같은 깊이 이상의 다음 머리 줄 전까지) */
function section(md: string, head: RegExp): string {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => head.test(l));
  expect(i, String(head)).toBeGreaterThanOrEqual(0);
  const depth = lines[i].match(/^#+/)![0].length;
  const j = lines.findIndex((l, k) => k > i && /^#+ /.test(l) && l.match(/^#+/)![0].length <= depth);
  return lines.slice(i, j < 0 ? undefined : j).join('\n');
}

const FOUR = ['metrics.purpose', 'metrics.what', 'metrics.keep', 'metrics.noPenalty'] as const;
/** 법률 v2 8절 C1·C3: IP 주소, 보내는 곳·언제든 끄기 */
const EXTRA = ['metrics.ip', 'metrics.default'] as const;

describe('통계 켜기 화면에 동의 고지 네 가지가 있다(C11c, K38)', () => {
  it('네 키를 토글보다 먼저, 연령 확인(needAge) 갈래 밖에서 그린다', () => {
    const consent = sheet.indexOf('testID="metrics-consent"');
    const toggle = sheet.indexOf('testID="metrics-toggle-row"');
    const ageBranchEnd = sheet.indexOf(') : (', sheet.indexOf("setting.kind === 'needAge'"));
    expect(consent).toBeGreaterThan(ageBranchEnd);
    expect(toggle).toBeGreaterThan(consent);
    for (const k of [...FOUR, ...EXTRA]) {
      const at = sheet.indexOf(`t('${k}')`);
      expect(at, k).toBeGreaterThan(consent);
      expect(at, k).toBeLessThan(toggle);
    }
    // 보유 기간은 '중요한 내용'(시행령 제17조 제3항 제3호) — 보조 글씨(sub)가 아닌 본문 글씨(법률 v2 8절 C2)
    expect(sheet).toContain("<P>{t('metrics.keep')}</P>");
    expect(sheet).not.toMatch(/<P sub>\{t\('metrics\.keep'\)\}/);
    // 14세 미만 갈래(metrics-under)도 같은 고지 아래에 있다 — 고지는 갈래 앞에 한 번
    expect(sheet.indexOf('testID="metrics-under"')).toBeGreaterThan(consent);
  });

  const ko3_1 = section(policy.ko, /^### 3-1\./);
  const ko6 = section(policy.ko, /^## 6\./);
  const en3_1 = section(policy.en, /^### 3-1\./);
  const en6 = section(policy.en, /^## 6\./);
  const ko8 = section(policy.ko, /^## 8\./);
  const en8 = section(policy.en, /^## 8\./);

  it('목적 — 처리방침 3-1 목적과 같은 사실', () => {
    expect(ko3_1).toContain('게임을 계속 즐기는 비율을 재고 화면을 개선하기 위해서');
    expect(tIn('ko', 'metrics.purpose')).toContain('게임을 계속 즐기는 비율을 재고 화면을 개선');
    expect(en3_1).toContain('to measure how many people keep playing and to improve the game');
    expect(tIn('en', 'metrics.purpose')).toContain('measure how many people keep playing and to improve the game');
  });

  it('항목 — 처리방침 3-1 항목을 모두 말한다', () => {
    const ko = tIn('ko', 'metrics.what');
    for (const w of ['날짜 단위', '설치한 날', '앱을 연 날', '게임 사건 10가지', '횟수', '플랫폼', '앱 출시 판', '언어', '화면 실험 군', '위젯', '보름']) {
      expect(ko, w).toContain(w);
    }
    for (const w of ['설치한 날짜', '앱을 연 날', '플랫폼', '앱 출시 판', '언어', '화면 실험 군', '위젯', '보름', '게임 사건 10가지', '횟수']) {
      expect(ko3_1, w).toContain(w);
    }
    const en = tIn('en', 'metrics.what');
    for (const w of ['by date only', 'install date', 'days you open the app', 'ten set game events', 'how many times', 'platform', 'app release', 'language', 'design test group', 'widget', 'full moon']) {
      expect(en, w).toContain(w);
    }
    for (const w of ['install date', 'platform', 'app release', 'language', 'design test group', 'widget', 'full moon', '10 fixed game events', 'how many times']) {
      expect(en3_1, w).toContain(w);
    }
  });

  it('보유 기간 — 처리방침 6절 이용 통계 줄(90일 뒤 월 합계)과 같은 사실', () => {
    expect(ko6).toMatch(/\| 이용 통계\(식별자 없음\) \| 90일 뒤 월 합계로 바꿈/);
    expect(tIn('ko', 'metrics.keep')).toMatch(/90일 뒤 달별 합계/);
    expect(tIn('ko', 'metrics.keep')).toContain('처리방침 3-1절과 6절');
    expect(en6).toMatch(/\| Usage statistics \(no identifiers\) \| After 90 days, rolled into monthly totals/);
    expect(tIn('en', 'metrics.keep')).toMatch(/rolled into monthly totals after 90 days/);
    expect(tIn('en', 'metrics.keep')).toContain('sections 3-1 and 6 of the privacy policy');
  });

  it('거부해도 불이익 없음 — 처리방침 3-1 문장과 같은 사실', () => {
    expect(ko3_1).toContain('켜지 않거나 꺼도 게임 이용에는 아무 불이익이 없습니다');
    expect(tIn('ko', 'metrics.noPenalty')).toBe('켜지 않거나 꺼도 게임 이용에는 아무 불이익이 없어요.');
    expect(en3_1).toContain('Not turning it on, or turning it off, makes no difference to the game.');
    expect(tIn('en', 'metrics.noPenalty')).toBe('Not turning it on, or turning it off, makes no difference to the game.');
  });

  it('IP 주소 — 쓰이지만 통계와 함께 저장하지 않음(처리방침 3-1, 법률 v2 8절 C1)', () => {
    expect(ko3_1).toContain('이 통계와 함께 IP 주소를 데이터베이스에 저장하지 않습니다');
    expect(tIn('ko', 'metrics.ip')).toContain('IP 주소가 쓰이지만, 통계와 함께 저장하지 않아요');
    expect(en3_1).toContain('We do not store IP addresses in our database together with these statistics.');
    expect(tIn('en', 'metrics.ip')).toContain('Your IP address is used to send them, but it is not stored with the statistics.');
  });

  it('보내는 곳(서울·Google Cloud)과 언제든 끄기(처리방침 3-1·8, 법률 v2 8절 C3)', () => {
    expect(ko3_1).toContain('Google Cloud Run');
    expect(ko8).toMatch(/Cloud Run[^|]*\|[^|]*처리·저장은 대한민국 서울 리전/);
    expect(tIn('ko', 'metrics.default')).toContain('대한민국 서울의 운영자 서버(Google Cloud)로 보내요');
    expect(en3_1).toContain('Google Cloud Run');
    expect(en8).toMatch(/Cloud Run[^|]*\|[^|]*Processed and stored in the Seoul region/);
    expect(tIn('en', 'metrics.default')).toContain('to our server in Seoul, South Korea (run on Google Cloud)');
    expect(ko3_1).toMatch(/\*\*켜고 끄기\*\*: 공방 노트의 '이용 통계 보내기'\. 끄면 그때부터 보내지 않고/);
    expect(tIn('ko', 'metrics.default')).toContain('이 화면에서 언제든 끌 수 있고');
    expect(en3_1).toMatch(/\*\*Turn on or off\*\*: "Send usage statistics" in the Studio Notebook\. Once off, nothing more is sent/);
    expect(tIn('en', 'metrics.default')).toContain('You can turn it off here at any time');
  });
});

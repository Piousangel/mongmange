// 덧말 사전 그래프 v0 — 결정적, 런타임 LLM 0 (설계 시제품, 앱 코드 아님)
// 입력: 아이 씨앗 + 말결 둘(A, B) [+ 절기 경계 밤이면 B 대신 절기 낱말]. 출력: 덧말 id 하나(또는 null).
// 같은 입력 = 같은 덧말. 돌봄(밥·간식·쓰다듬기)은 입력이 아니다(장식 층만 바꿈, D-03·R8).
// 브라우저(<script>)와 node(vm) 양쪽에서 읽는다. globalThis.Dutmal에 붙는다.
(function (root) {
  'use strict';

  // ── 말결 48(heart-grain-48 4절) → 가족·방향·그림 낱말(조각) ──────────────
  // pic: 꿈에 그려지는 조각 id(시제품 조각). 위기로 판정된 말은 여기에 오지 않는다 — 저장 단계에서 warm.in.still(고요)로 바뀐다.
  const SENSES = {
    'bright.in.joy': ['bright', 'sprout'], 'bright.in.flutter': ['bright', 'kite'], 'bright.in.pride': ['bright', 'mountain'],
    'bright.out.glee': ['bright', 'geese'], 'bright.out.laugh': ['bright', 'stars'], 'bright.out.welcome': ['bright', 'window'],
    'warm.in.still': ['warm', 'leaf'], 'warm.in.languid': ['warm', 'quilt'], 'warm.in.sleepy': ['warm', 'moon'],
    'warm.out.tender': ['warm', 'teacup-two'], 'warm.out.thanks': ['warm', 'letter'], 'warm.out.relief': ['warm', 'umbrella'],
    'spiky.out.irritated': ['spiky', 'wind'], 'spiky.out.angry': ['spiky', 'mountain'], 'spiky.out.wronged': ['spiky', 'path'],
    'spiky.in.worry': ['spiky', 'umbrella'], 'spiky.in.stuffy': ['spiky', 'wind'], 'spiky.in.scared': ['spiky', 'window'],
    'low.out.longing': ['low', 'letter'], 'low.out.hurt': ['low', 'umbrella'], 'low.out.lonely': ['low', 'teacup-two'],
    'low.in.sad': ['low', 'rain'], 'low.in.weary': ['low', 'quilt'], 'low.in.bored': ['low', 'boat'],
    'nature.in.rain': ['nature', 'rain'], 'nature.in.snow': ['nature', 'snow'], 'nature.in.plant': ['nature', 'sprout'],
    'nature.out.sea': ['nature', 'sea'], 'nature.out.sky': ['nature', 'kite'], 'nature.out.night': ['nature', 'moon'],
    'home.in.meal': ['home', 'teacup'], 'home.in.sweet': ['home', 'teacup'], 'home.in.drink': ['home', 'teacup'],
    'home.out.house': ['home', 'quilt'], 'home.out.thing': ['home', 'inkstone'], 'home.out.wear': ['home', 'washing-line'],
    'kin.in.family': ['kin', 'window'], 'kin.in.friend': ['kin', 'teacup-two'], 'kin.in.beloved': ['kin', 'umbrella'],
    'kin.out.furry': ['kin', 'quilt'], 'kin.out.wing': ['kin', 'geese'], 'kin.out.baby': ['kin', 'quilt'],
    'days.in.study': ['days', 'inkstone'], 'days.in.work': ['days', 'inkstone'], 'days.in.time': ['days', 'leaf'],
    'days.out.play': ['days', 'stones'], 'days.out.song': ['days', 'stars'], 'days.out.outing': ['days', 'path'],
  };
  const MOOD = new Set(['bright', 'warm', 'spiky', 'low']);
  const HEAVY = new Set(['spiky', 'low']); // 무거운 마음 가족: 덧말은 '오는 것·머무는 것·빛'만

  // ── 덧말 낱말 22 (1.0 직후 OTA 목표 24, 1.x 60) ───────────────────────────
  // 모두 세상 가족의 사물·빛. 감정 낱말·사람·얼굴·먹을 것·몸·수단(줄·칼·약·높은 곳·깊은 물) 0.
  // dir: toward(몽망이 쪽으로 옴) | stay(머묾) | away(멀어짐) | up(솟음). HEAVY 입력에는 toward·stay만.
  // cls: light(빛) | shelter(품) | flow(흐름) | sky(하늘) | grow(자람)
  const DUT = {
    lantern:    { ko: '등불', en: 'a lantern', cls: 'light', dir: 'stay', piece: 'code:lantern' },
    fireflies:  { ko: '반딧불', en: 'fireflies', cls: 'light', dir: 'toward', piece: 'code:fireflies' },
    sparks:     { ko: '불꽃', en: 'sparks', cls: 'light', dir: 'up', piece: 'code:sparks' },
    sunbeam:    { ko: '볕 한 줄기', en: 'a sunbeam', cls: 'light', dir: 'toward', piece: 'code:sunbeam' },
    halo:       { ko: '달무리', en: 'a moon halo', cls: 'light', dir: 'stay', piece: 'code:halo' },
    winlight:   { ko: '창가 불빛', en: 'a lit window', cls: 'light', dir: 'stay', piece: 'near-with.window-hand' },
    inkmoon:    { ko: '벼루에 뜬 달', en: 'the moon in the inkstone', cls: 'light', dir: 'stay', piece: 'near-alone.inkstone' },
    umbrella:   { ko: '우산', en: 'an umbrella', cls: 'shelter', dir: 'stay', piece: 'near-with.umbrella' },
    quilt:      { ko: '이불', en: 'a quilt', cls: 'shelter', dir: 'stay', piece: 'near-alone.quilt' },
    leafroof:   { ko: '잎 지붕', en: 'a leaf roof', cls: 'shelter', dir: 'stay', piece: 'code:leafroof' },
    letter:     { ko: '닿은 편지', en: 'a letter that arrived', cls: 'flow', dir: 'toward', piece: 'near-with.letter' },
    boat:       { ko: '종이배', en: 'a paper boat', cls: 'flow', dir: 'toward', piece: 'far-alone.paper-boat' },
    leafboat:   { ko: '잎배', en: 'a leaf boat', cls: 'flow', dir: 'toward', piece: 'code:leafboat' },
    ripples:    { ko: '물수제비', en: 'skipping ripples', cls: 'flow', dir: 'away', piece: 'code:ripples' },
    stones:     { ko: '징검돌', en: 'stepping stones', cls: 'flow', dir: 'toward', piece: 'far-with.stepping-stones' },
    kite:       { ko: '연', en: 'a kite', cls: 'sky', dir: 'up', piece: 'far-alone.kite' },
    geese:      { ko: '기러기 길', en: 'a line of geese', cls: 'sky', dir: 'away', piece: 'code:geese' },
    shooting:   { ko: '별똥별', en: 'a shooting star', cls: 'sky', dir: 'away', piece: 'code:shooting' },
    firstsnow:  { ko: '첫눈', en: 'first snow', cls: 'sky', dir: 'toward', piece: 'code:snow' },
    sprout:     { ko: '새싹', en: 'a sprout', cls: 'grow', dir: 'up', piece: 'code:sprout' },
    blossom:    { ko: '꽃잎 바람', en: 'a drift of petals', cls: 'grow', dir: 'toward', piece: 'code:petals' },
    windline:   { ko: '바람 든 빨랫줄', en: 'washing in the wind', cls: 'flow', dir: 'away', piece: 'near-alone.washing-line' },
  };
  // 낱말 목록에 넣지 않는 것(설계 금지 목록 — 시험이 DUT와 대조): 무지개(곁·털 동물과 만나면 '무지개다리' 죽음 완곡어),
  // 병 속 편지(약병 연상), 밧줄·사다리·다리 난간·절벽·깊은 물·가라앉는 배, 음식·잔치·배부름, 얼굴·사람·손, 감정 낱말.
  const BANNED = ['rainbow', 'bottle', 'rope', 'ladder', 'bridge', 'cliff', 'deep', 'sink', 'feast', 'food', 'face', 'hand', 'tear', 'storm', 'thunder', 'dark'];
  // 무거운 마음 가족과 함께 나오면 안 되는 낱말(멀어짐·바람에 날려감·빨랫줄 = 줄)
  const NOT_WITH_HEAVY = new Set(['geese', 'shooting', 'ripples', 'windline', 'sparks', 'kite']);

  // ── 가족 쌍 기본표 36칸(순서 없는 쌍). 어떤 두 말이 와도 덧말이 정의된다 ──────────
  const fp = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const FAMILY = {};
  const F = (a, b, list) => { FAMILY[fp(a, b)] = list; };
  F('bright', 'bright', ['sparks', 'kite', 'shooting']);
  F('bright', 'warm', ['sunbeam', 'fireflies', 'blossom']);
  F('bright', 'spiky', ['kite', 'sunbeam', 'windline']);
  F('bright', 'low', ['sunbeam', 'fireflies', 'letter']);
  F('bright', 'nature', ['sparks', 'blossom', 'shooting']);
  F('bright', 'home', ['lantern', 'windline', 'sparks']);
  F('bright', 'kin', ['fireflies', 'sparks', 'stones']);
  F('bright', 'days', ['kite', 'stones', 'sparks']);
  F('warm', 'warm', ['halo', 'quilt', 'fireflies']);
  F('warm', 'spiky', ['umbrella', 'lantern', 'leafroof']);
  F('warm', 'low', ['lantern', 'quilt', 'winlight']);
  F('warm', 'nature', ['leafboat', 'halo', 'firstsnow']);
  F('warm', 'home', ['lantern', 'quilt', 'inkmoon']);
  F('warm', 'kin', ['winlight', 'letter', 'fireflies']);
  F('warm', 'days', ['inkmoon', 'sunbeam', 'leafboat']);
  F('spiky', 'spiky', ['umbrella', 'leafroof', 'lantern']);
  F('spiky', 'low', ['quilt', 'umbrella', 'winlight']);
  F('spiky', 'nature', ['umbrella', 'leafroof', 'stones']);
  F('spiky', 'home', ['quilt', 'lantern', 'inkmoon']);
  F('spiky', 'kin', ['winlight', 'umbrella', 'letter']);
  F('spiky', 'days', ['stones', 'inkmoon', 'lantern']);
  F('low', 'low', ['lantern', 'quilt', 'fireflies']);
  F('low', 'nature', ['umbrella', 'leafroof', 'fireflies']);
  F('low', 'home', ['quilt', 'winlight', 'lantern']);
  F('low', 'kin', ['letter', 'winlight', 'fireflies']);
  F('low', 'days', ['lantern', 'stones', 'sunbeam']);
  F('nature', 'nature', ['halo', 'leafboat', 'firstsnow']);
  F('nature', 'home', ['inkmoon', 'windline', 'leafroof']);
  F('nature', 'kin', ['geese', 'fireflies', 'blossom']);
  F('nature', 'days', ['ripples', 'kite', 'stones']);
  F('home', 'home', ['lantern', 'windline', 'inkmoon']);
  F('home', 'kin', ['winlight', 'lantern', 'letter']);
  F('home', 'days', ['inkmoon', 'windline', 'lantern']);
  F('kin', 'kin', ['fireflies', 'letter', 'stones']);
  F('kin', 'days', ['stones', 'kite', 'letter']);
  F('days', 'days', ['stones', 'ripples', 'kite']);

  // ── 결 쌍 손질 엣지(가족 표보다 먼저). 1.0 직후 목표 약 300, v0 견본 26 ────────────
  // 출시 전 LLM이 후보를 내고 사람이 검수 → 이 표에 고정(런타임 LLM 0).
  const sp = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const CURATED = {};
  const C = (a, b, list) => { CURATED[sp(a, b)] = list; };
  C('bright.in.joy', 'days.out.play', ['sparks']);
  C('bright.in.joy', 'nature.in.rain', ['sunbeam']);
  C('spiky.out.irritated', 'nature.in.rain', ['umbrella']);
  C('low.out.longing', 'nature.out.sea', ['letter', 'boat']);
  C('low.out.longing', 'kin.in.family', ['winlight']);
  C('low.in.sad', 'nature.in.rain', ['leafroof', 'umbrella']);
  C('low.in.weary', 'days.in.work', ['lantern']);
  C('low.in.weary', 'days.in.study', ['inkmoon', 'lantern']);
  C('low.out.lonely', 'nature.out.night', ['fireflies']);
  C('warm.in.sleepy', 'nature.out.night', ['halo']);
  C('warm.in.still', 'nature.in.snow', ['firstsnow']);
  C('nature.in.plant', 'nature.in.rain', ['sprout']);
  C('nature.in.plant', 'nature.out.sky', ['blossom']);
  C('nature.out.sea', 'days.out.outing', ['boat', 'stones']);
  C('nature.out.sky', 'days.out.play', ['kite']);
  C('kin.out.wing', 'nature.out.sky', ['geese']);
  C('kin.in.friend', 'days.out.play', ['stones']);
  C('kin.in.friend', 'nature.out.night', ['shooting', 'fireflies']);
  C('bright.out.glee', 'days.out.song', ['sparks']);
  C('home.out.house', 'nature.in.rain', ['winlight']);
  C('home.out.house', 'nature.in.snow', ['lantern']);
  C('home.out.wear', 'nature.out.sky', ['windline']);
  C('home.in.drink', 'nature.in.rain', ['leafroof']);
  C('spiky.in.scared', 'nature.out.night', ['lantern', 'winlight']);
  C('spiky.in.worry', 'days.in.study', ['inkmoon']);
  C('warm.out.thanks', 'kin.in.family', ['letter']);

  // ── 절기(기기 시계, 권한 0) — 절기 경계 밤에만 B 자리에 들어간다 ─────────────
  // 24절기를 철 넷으로 묶은 낱말. 덧말 후보는 철마다 고정.
  const SEASON = {
    spring: ['blossom', 'sprout', 'sunbeam'],
    summer: ['fireflies', 'leafboat', 'ripples'],
    autumn: ['geese', 'halo', 'windline'],
    winter: ['firstsnow', 'lantern', 'quilt'],
  };

  // FNV-1a 32비트 — 플랫폼 무관, 결정적
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  function familyOf(sense) { return SENSES[sense] ? SENSES[sense][0] : null; }

  /**
   * 덧말 고르기. a·b = 말결 id(이미 위기 → 고요 치환이 끝난 값). season = 'spring'… (절기 경계 밤에만, 아니면 null)
   * avoid = 같은 이레에서 이미 나온 덧말 id 목록(세이브에서 다시 계산되므로 결정적). 후보가 모두 avoid면 그대로 둔다.
   * 돌봄 값은 받지 않는다(받을 자리가 없다 — 시험이 인자 이름으로 고정).
   */
  function pick(seed, a, b, season, avoid) {
    if (!SENSES[a]) return null;
    if (!season && !SENSES[b]) return null;
    const fa = familyOf(a);
    let key, cands;
    if (season) {
      key = `${a}|season.${season}`;
      cands = SEASON[season].slice();
    } else {
      key = sp(a, b);
      cands = (CURATED[key] || FAMILY[fp(fa, familyOf(b))]).slice();
    }
    const heavy = HEAVY.has(fa) || (!season && HEAVY.has(familyOf(b)));
    if (heavy) {
      cands = cands.filter((d) => !NOT_WITH_HEAVY.has(d) && (DUT[d].dir === 'toward' || DUT[d].dir === 'stay'));
      if (!cands.length) cands = ['lantern', 'quilt', 'winlight'];
    }
    // 그날 이미 그려진 그림과 같은 사물은 덧말이 되지 않는다(덧붙임이 아니라 반복이므로)
    const pics = new Set([SENSES[a][1], season ? null : SENSES[b][1]]);
    const fresh = cands.filter((d) => !pics.has(d) && !pics.has(DUT[d].piece));
    if (fresh.length) cands = fresh;
    if (avoid && avoid.length) { const nv = cands.filter((d) => !avoid.includes(d)); if (nv.length) cands = nv; }
    return cands[hash(`${seed}|${key}`) % cands.length];
  }

  root.Dutmal = { SENSES, DUT, FAMILY, CURATED, SEASON, BANNED, NOT_WITH_HEAVY, HEAVY, MOOD, pick, hash, familyOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);

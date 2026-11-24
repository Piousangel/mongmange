// 처리방침 정본(docs/release/privacy-policy.*.md)을 정적 HTML로 바꾸는 작은 변환기(새 의존성 없음).
// 정본이 쓰는 문법만 다룬다: # 제목(1~3), 문단, - 목록(2칸 들여쓰기 중첩), 1. 번호 목록, | 표 |, > 인용, **굵게**, `코드`, 맨 https 주소.
// 그 밖의 문법이 정본에 들어오면 글자 그대로 보인다(조용히 사라지지 않음).

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 줄 안 문법. `코드` 안은 굵게·주소로 바꾸지 않는다 */
export function inline(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/https:\/\/[^\s)<|]+[^\s)<|.,;:]/g, (u) => `<a href="${u}">${u}</a>`);
    })
    .join('');
}

/** 제목 글자 → id(절 번호가 있으면 s-3-1, 없으면 순번) */
function headingId(text, n) {
  const m = /^(\d+(?:-\d+)*)\./.exec(text);
  return m ? `s-${m[1]}` : `h-${n}`;
}

/** 상자 시작 표식(정본 머리 인용 첫 줄) · 명시적 끝 표식(정본에 넣으면 그 줄까지 지움) */
export const INTERNAL_START = /^>?\s*\*\*(게시 전 삭제|Remove before publishing)/;
export const INTERNAL_END = /^(?:>\s*)?<!--\s*(게시 전 삭제 끝|end remove before publishing)\s*-->\s*$/i;

/**
 * 정본의 '게시 전 삭제' 상자(내부용 구현 확인 체크리스트)를 뺀다(리뷰 2026-11-25 I1 — 빈 줄이 끼어도 새지 않게).
 * - 시작: '게시 전 삭제' / 'Remove before publishing' 표식 줄.
 * - 끝: 명시적 끝 표식(`<!-- 게시 전 삭제 끝 -->`)이 있으면 그 줄까지. 없으면 인용 줄(`>`)과 빈 줄을 계속 지우고,
 *   인용이 아닌 글이 처음 나온 곳에서 멈춘다 — 상자 안에 빈 줄이 들어가 인용이 둘로 갈라져도 둘째 조각까지 지운다.
 * 그래도 새는 것은 렌더된 HTML에서 다시 잡는다(build.mjs ⑦: K\d+ 행 0).
 */
export function stripInternal(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => INTERNAL_START.test(l));
  if (start < 0) return md;
  const endMark = lines.findIndex((l, i) => i > start && INTERNAL_END.test(l));
  let end = start + 1;
  if (endMark >= 0) end = endMark + 1;
  else while (end < lines.length && (/^>/.test(lines[end]) || !lines[end].trim())) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

/** @returns {{ html: string, title: string, headings: {id:string,text:string,level:number}[] }} */
export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let title = '';
  let i = 0;
  let hn = 0;

  const isList = (l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l);
  const isTable = (l) => /^\|.*\|\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !title) title = text;
      const id = headingId(text, ++hn);
      headings.push({ id, text, level });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().slice(1, -1).split('|').map((c) => c.trim());
      const [head, sep, ...body] = rows;
      if (!sep || !/^\|[\s:|-]+\|$/.test(sep.trim())) {
        html.push(`<p>${rows.map(inline).join('<br>')}</p>`);
        continue;
      }
      html.push(
        '<div class="table" role="region" tabindex="0" aria-label="표">' +
          `<table><thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (/^>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${markdownToHtml(quote.join('\n')).html}</blockquote>`);
      continue;
    }
    if (isList(line)) {
      const items = [];
      while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) items.push(lines[i++]);
      html.push(renderList(items));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\|)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++].trim());
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: html.join('\n'), title, headings };
}

/** 들여쓰기 2칸 단위 중첩 목록 */
function renderList(lines) {
  const indent = (l) => /^(\s*)/.exec(l)[1].length;
  const base = indent(lines[0]);
  const ordered = /^\s*\d+\./.test(lines[0]);
  const out = [];
  let k = 0;
  while (k < lines.length) {
    const text = lines[k].replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
    k++;
    const child = [];
    while (k < lines.length && indent(lines[k]) > base) child.push(lines[k++]);
    out.push(`<li>${inline(text)}${child.length ? renderList(child) : ''}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${out.join('')}</${tag}>`;
}

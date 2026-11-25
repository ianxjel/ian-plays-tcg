// A small Markdown renderer for the deck guides in data/guides/<id>.md.
//
// Supports: a front-matter block (--- key: value ---), ## chapters, ### and #### headings,
// paragraphs, - and 1. lists, > callouts, **bold**, *italic*, `code`, [links](url),
// pipe tables, and two fenced blocks:
//   ```decklist  a 60-card list in TCG Live export form ("Pokémon: 19", "4 Dreepy TWM 128"),
//                shown as three columns with a copy button
//   ```play      a playthrough: "setup:", "you 1:", "opp 1:", "lesson:" lines
// All text is escaped before any markup is added; links must be http(s), a relative .html page or #anchor.

import { parseList, countCards } from './decklist.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function safeUrl(u) {
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^[\w.-]+\.html(?:[?#][\w=&.%-]*)?$/.test(u) || /^#[\w-]+$/.test(u)) return u;
  return null;
}

export function inline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    if (!u) return label;
    const ext = /^https?:/i.test(u);
    return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

export function frontMatter(md) {
  const m = String(md).match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: String(md) };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: String(md).slice(m[0].length) };
}

// Split a guide into an intro (text before the first ## heading) and its chapters.
export function splitChapters(md) {
  const { meta, body } = frontMatter(String(md).replace(/\r\n?/g, '\n'));
  const parts = body.split(/^## /m);
  const intro = parts.shift().trim();
  const chapters = parts.map((p) => {
    const nl = p.indexOf('\n');
    const title = (nl < 0 ? p : p.slice(0, nl)).trim();
    return { title, id: slug(title), md: nl < 0 ? '' : p.slice(nl + 1).trim() };
  });
  return { meta, intro, chapters };
}

const SECTION_NAME = { pokemon: 'Pokémon', trainer: 'Trainer', energy: 'Energy' };

function renderDecklist(body) {
  const raw = body.join('\n').trim();
  const parsed = parseList(raw);
  const n = countCards(parsed);
  const cols = ['pokemon', 'trainer', 'energy']
    .map((k) => {
      const items = parsed[k].map((c) => `<li><span class="dl-n">${c.count}</span><span class="dl-name">${esc(c.name)}</span>${c.set ? `<span class="dl-set">${esc(c.set)} ${esc(c.num)}</span>` : ''}</li>`);
      return `<div class="dl-col"><h4>${SECTION_NAME[k]} <span>${n[k]}</span></h4><ul>${items.join('')}</ul></div>`;
    })
    .join('');
  return `<figure class="decklist"><div class="dl-cols">${cols}</div><figcaption><span>${n.total} cards</span><button type="button" class="copy-list" data-list="${esc(raw)}">Copy list</button></figcaption></figure>`;
}

function renderPlay(body) {
  const entries = [];
  for (const line of body) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*(setup|lesson|you|opp)\s*(\d+)?\s*:\s*(.*)$/i);
    if (m) entries.push({ kind: m[1].toLowerCase(), turn: m[2] || '', text: m[3] });
    else if (entries.length) entries[entries.length - 1].text += ' ' + line.trim();
  }
  const setup = entries.filter((e) => e.kind === 'setup').map((e) => `<p class="play-setup"><strong>Setup</strong> ${inline(e.text)}</p>`);
  const turns = entries
    .filter((e) => e.kind === 'you' || e.kind === 'opp')
    .map((e) => `<li class="turn ${e.kind}"><span class="turn-tag">${e.kind === 'you' ? 'You' : 'Opp'}${e.turn ? `<b>T${e.turn}</b>` : ''}</span><div class="turn-text">${inline(e.text)}</div></li>`);
  const lessons = entries.filter((e) => e.kind === 'lesson').map((e) => `<p class="play-lesson"><strong>Lesson</strong> ${inline(e.text)}</p>`);
  return `<div class="play">${setup.join('')}<ol class="play-turns">${turns.join('')}</ol>${lessons.join('')}</div>`;
}

function renderFence(lang, body) {
  if (lang === 'decklist') return renderDecklist(body);
  if (lang === 'play') return renderPlay(body);
  return `<pre><code>${esc(body.join('\n'))}</code></pre>`;
}

export function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para.length = 0;
  };
  const isList = (l, ordered) => (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(renderFence(fence[1] || '', body));
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    const head = line.match(/^(#{2,4})\s+(.*)$/);
    if (head) {
      flush();
      const level = Math.max(3, head[1].length);
      out.push(`<h${level}>${inline(head[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<aside class="callout">${renderMarkdown(body.join('\n'))}</aside>`);
      continue;
    }
    if (isList(line, false) || isList(line, true)) {
      flush();
      const ordered = isList(line, true);
      const items = [];
      while (i < lines.length && isList(lines[i], ordered)) {
        let item = lines[i++].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isList(lines[i], false) && !isList(lines[i], true)) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const headCells = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${headCells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}

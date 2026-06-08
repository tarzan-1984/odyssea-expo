export type ChatFormatKind = 'bold' | 'italic' | 'underline' | 'strike';

const NEST_ORDER: ChatFormatKind[] = ['bold', 'italic', 'underline', 'strike'];

type Segment = { text: string; formats: ChatFormatKind[] };

function formatsEqual(a: ChatFormatKind[], b: ChatFormatKind[]): boolean {
  if (a.length !== b.length) return false;
  return NEST_ORDER.filter((f) => a.includes(f)).length === a.length &&
    NEST_ORDER.filter((f) => b.includes(f)).length === b.length &&
    NEST_ORDER.every((f) => a.includes(f) === b.includes(f));
}

function openDelimiter(format: ChatFormatKind): string {
  switch (format) {
    case 'bold':
      return '**';
    case 'italic':
      return '*';
    case 'underline':
      return '<u>';
    case 'strike':
      return '~~';
    default:
      return '';
  }
}

function closeDelimiter(format: ChatFormatKind): string {
  switch (format) {
    case 'bold':
      return '**';
    case 'italic':
      return '*';
    case 'underline':
      return '</u>';
    case 'strike':
      return '~~';
    default:
      return '';
  }
}

function normalizeFormats(formats: ChatFormatKind[]): ChatFormatKind[] {
  return NEST_ORDER.filter((f) => formats.includes(f));
}

function commonPrefixLength(a: ChatFormatKind[], b: ChatFormatKind[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function syncFormatDelimiters(
  current: ChatFormatKind[],
  target: ChatFormatKind[]
): { nextCurrent: ChatFormatKind[]; delta: string } {
  const cur = normalizeFormats(current);
  const tgt = normalizeFormats(target);
  const prefix = commonPrefixLength(cur, tgt);
  let delta = '';

  for (let i = cur.length - 1; i >= prefix; i -= 1) {
    delta += closeDelimiter(cur[i]);
  }
  for (let i = prefix; i < tgt.length; i += 1) {
    delta += openDelimiter(tgt[i]);
  }

  return { nextCurrent: tgt, delta };
}

const BLOCK_TAGS = new Set([
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'li',
]);

function segmentsEndWithNewline(segments: Segment[]): boolean {
  const last = segments[segments.length - 1];
  return !!last?.text.endsWith('\n');
}

function isEmptyBlockElement(el: Element): boolean {
  return !(el.textContent || '').replace(/\u00a0/g, '').trim();
}

function getFormatsFromElement(el: Element): ChatFormatKind[] {
  const tag = el.tagName.toLowerCase();
  const formats: ChatFormatKind[] = [];
  if (tag === 'b' || tag === 'strong') formats.push('bold');
  if (tag === 'i' || tag === 'em') formats.push('italic');
  if (tag === 'u') formats.push('underline');
  if (tag === 's' || tag === 'strike' || tag === 'del') formats.push('strike');
  if (tag === 'span') {
    const style = (el.getAttribute('style') || '').toLowerCase();
    if (/font-weight:\s*(bold|[7-9]00)/.test(style)) formats.push('bold');
    if (/font-style:\s*italic/.test(style)) formats.push('italic');
    if (/text-decoration[^;]*underline/.test(style)) formats.push('underline');
    if (/line-through/.test(style)) formats.push('strike');
  }
  return formats;
}

/** Markdown bold/italic require non-space at delimiter edges (CommonMark flanking). */
function splitSegmentByEdgeWhitespace(segment: Segment): Segment[] {
  const formats = normalizeFormats(segment.formats);
  if (!formats.length || !/\s/.test(segment.text)) {
    return [segment];
  }

  const leading = segment.text.match(/^\s*/)?.[0] ?? '';
  const trailing = segment.text.match(/\s*$/)?.[0] ?? '';
  const core = segment.text.slice(leading.length, segment.text.length - trailing.length);
  const parts: Segment[] = [];

  if (leading) parts.push({ text: leading, formats: [] });
  if (core) parts.push({ text: core, formats });
  if (trailing) parts.push({ text: trailing, formats: [] });

  return parts.length ? parts : [{ text: segment.text, formats: [] }];
}

function normalizeSegments(segments: Segment[]): Segment[] {
  const split = segments.flatMap(splitSegmentByEdgeWhitespace);
  const merged: Segment[] = [];

  for (const segment of split) {
    const normalized = {
      text: segment.text,
      formats: normalizeFormats(segment.formats),
    };
    if (!normalized.text) continue;

    const last = merged[merged.length - 1];
    if (last && formatsEqual(last.formats, normalized.formats)) {
      last.text += normalized.text;
      continue;
    }
    merged.push({ ...normalized });
  }

  return merged;
}

function collectSegments(node: Node, inherited: ChatFormatKind[]): Segment[] {
  const segments: Segment[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').replace(/\u00a0/g, ' ');
    if (text) segments.push({ text, formats: normalizeFormats(inherited) });
    return segments;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return segments;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    segments.push({ text: '\n', formats: normalizeFormats(inherited) });
    return segments;
  }

  if (BLOCK_TAGS.has(tag) && isEmptyBlockElement(el)) {
    segments.push({ text: '\n', formats: [] });
    return segments;
  }

  const nodeFormats = getFormatsFromElement(el);
  const combined = normalizeFormats([...inherited, ...nodeFormats]);

  const childNodes = Array.from(el.childNodes);
  for (let i = 0; i < childNodes.length; i += 1) {
    const child = childNodes[i];
    segments.push(...collectSegments(child, combined));

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as Element;
      const childTag = childEl.tagName.toLowerCase();
      if (
        BLOCK_TAGS.has(childTag) &&
        !isEmptyBlockElement(childEl) &&
        !segmentsEndWithNewline(segments)
      ) {
        segments.push({ text: '\n', formats: [] });
      }
    }
  }

  return segments;
}

function serializeSegments(segments: Segment[]): string {
  let result = '';
  let currentFormats: ChatFormatKind[] = [];

  for (const segment of segments) {
    if (!formatsEqual(currentFormats, segment.formats)) {
      const synced = syncFormatDelimiters(currentFormats, segment.formats);
      result += synced.delta;
      currentFormats = synced.nextCurrent;
    }
    result += segment.text;
  }

  if (currentFormats.length > 0) {
    for (let i = currentFormats.length - 1; i >= 0; i -= 1) {
      result += closeDelimiter(currentFormats[i]);
    }
  }

  return result;
}

export function htmlToMarkdownFromDocument(html: string, doc: Document): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<br>' || trimmed === '<div><br></div>') {
    return '';
  }

  const div = doc.createElement('div');
  div.innerHTML = trimmed;
  const segments = normalizeSegments(collectSegments(div, []));
  return serializeSegments(segments).replace(/\n{3,}/g, '\n\n').trim();
}

/** Browser / WebView DOM — nested markdown without duplicate `**` between adjacent runs. */
export function htmlToMarkdown(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim();
  }
  return htmlToMarkdownFromDocument(html, document);
}

export function getPlainTextFromHtml(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim();
  }
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return (div.textContent || '').replace(/\u00a0/g, ' ').trim();
}

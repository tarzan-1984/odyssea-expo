export type MarkdownWrapKind = 'bold' | 'italic' | 'underline' | 'strike';

const WRAP_SYNTAX: Record<MarkdownWrapKind, { before: string; after: string }> = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  underline: { before: '<u>', after: '</u>' },
  strike: { before: '~~', after: '~~' },
};

export type MarkdownFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
};

export function wrapTextSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: MarkdownWrapKind
): { nextValue: string; selectionStart: number; selectionEnd: number } {
  const { before, after } = WRAP_SYNTAX[kind];
  const selected = value.slice(selectionStart, selectionEnd);
  const wrapped = `${before}${selected}${after}`;
  const nextValue = value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd);
  const nextStart = selectionStart + before.length;
  const nextEnd = nextStart + selected.length;
  return { nextValue, selectionStart: nextStart, selectionEnd: nextEnd };
}

function countDelimiterBefore(text: string, index: number, delim: string): number {
  let count = 0;
  let i = 0;
  while (i < index) {
    if (text.startsWith(delim, i)) {
      count += 1;
      i += delim.length;
      continue;
    }
    i += 1;
  }
  return count;
}

function isInsideDelimiter(text: string, cursor: number, delim: string): boolean {
  return countDelimiterBefore(text, cursor, delim) % 2 === 1;
}

function isInsideTag(text: string, cursor: number, tag: string): boolean {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const before = text.slice(0, cursor);
  const opens = (before.match(new RegExp(open, 'gi')) ?? []).length;
  const closes = (before.match(new RegExp(close, 'gi')) ?? []).length;
  return opens > closes;
}

function isInsideItalic(text: string, cursor: number): boolean {
  let count = 0;
  for (let i = 0; i < cursor; i++) {
    if (text[i] === '*' && text[i + 1] === '*') {
      i += 1;
      continue;
    }
    if (text[i] === '*') count += 1;
  }
  return count % 2 === 1;
}

/** Active markdown modes at caret (or inside selection). */
export function getMarkdownFormatState(
  text: string,
  selectionStart: number,
  selectionEnd: number
): MarkdownFormatState {
  const cursor = selectionEnd;
  return {
    bold: isInsideDelimiter(text, cursor, '**'),
    italic: isInsideItalic(text, cursor),
    underline: isInsideTag(text, cursor, 'u'),
    strike: isInsideDelimiter(text, cursor, '~~'),
  };
}

export function stripMarkdown(content: string): string {
  if (!content) return '';

  let text = content;
  text = text.replace(/<u>([\s\S]*?)<\/u>/gi, '$1');
  text = text.replace(/\*\*\*([\s\S]*?)\*\*\*/g, '$1');
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '$1');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  text = text.replace(/~~([\s\S]*?)~~/g, '$1');
  text = text.replace(/^[\t ]*[-*+]\s+/gm, '');
  text = text.replace(/^[\t ]*\d+\.\s+/gm, '');
  text = text.replace(/\*{1,3}/g, '');
  return text.trim();
}

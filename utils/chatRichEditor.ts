import type { MarkdownWrapKind } from '@/utils/chatMarkdown';
export { getPlainTextFromHtml, htmlToMarkdown } from '@/utils/chatHtmlToMarkdown';

export type RichEditorFormatAction = { type: 'wrap'; kind: MarkdownWrapKind };

export type EditorFormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough';

export function formatActionToCommand(
  action: RichEditorFormatAction
): EditorFormatCommand | null {
  if (action.type !== 'wrap') return null;
  switch (action.kind) {
    case 'bold':
      return 'bold';
    case 'italic':
      return 'italic';
    case 'underline':
      return 'underline';
    case 'strike':
      return 'strikeThrough';
    default:
      return null;
  }
}

export type EditorFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
};

export const EMPTY_EDITOR_FORMAT_STATE: EditorFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
};


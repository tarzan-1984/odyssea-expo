import React, { useMemo } from 'react';
import { Text, Linking, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts } from '@/lib';
import { isAllowedChatHref, parseChatMessageSegments } from '@/utils/chatLinks';

type StyledPart = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};

type InheritedStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};

function withStyle(text: string, inherited: InheritedStyle, extra: InheritedStyle): StyledPart {
  return {
    text,
    bold: Boolean(inherited.bold || extra.bold),
    italic: Boolean(inherited.italic || extra.italic),
    underline: Boolean(inherited.underline || extra.underline),
    strike: Boolean(inherited.strike || extra.strike),
  };
}

function pushStyledPart(parts: StyledPart[], part: StyledPart) {
  if (!part.text) return;
  const last = parts[parts.length - 1];
  if (
    last &&
    last.bold === part.bold &&
    last.italic === part.italic &&
    last.underline === part.underline &&
    last.strike === part.strike
  ) {
    last.text += part.text;
    return;
  }
  parts.push(part);
}

function findClosingDelimiter(
  content: string,
  openIndex: number,
  delimiter: string
): number {
  const len = delimiter.length;
  for (let pos = openIndex + len; pos <= content.length - len; pos += 1) {
    if (!content.startsWith(delimiter, pos)) continue;
    if (delimiter === '**' && content.startsWith('***', pos)) continue;
    if (delimiter === '*' && content.startsWith('**', pos)) continue;
    return pos;
  }
  return -1;
}

function parseChatMarkdown(content: string, inherited: InheritedStyle = {}): StyledPart[] {
  const parts: StyledPart[] = [];
  let i = 0;

  while (i < content.length) {
    if (content.startsWith('***', i)) {
      const end = content.indexOf('***', i + 3);
      if (end !== -1) {
        const inner = parseChatMarkdown(content.slice(i + 3, end), {
          ...inherited,
          bold: true,
          italic: true,
        });
        inner.forEach((part) => pushStyledPart(parts, part));
        i = end + 3;
        continue;
      }
    }

    if (content.startsWith('**', i)) {
      const end = findClosingDelimiter(content, i, '**');
      if (end !== -1) {
        const inner = parseChatMarkdown(content.slice(i + 2, end), {
          ...inherited,
          bold: true,
        });
        inner.forEach((part) => pushStyledPart(parts, part));
        i = end + 2;
        continue;
      }
    }

    if (content.startsWith('~~', i)) {
      const end = findClosingDelimiter(content, i, '~~');
      if (end !== -1) {
        const inner = parseChatMarkdown(content.slice(i + 2, end), {
          ...inherited,
          strike: true,
        });
        inner.forEach((part) => pushStyledPart(parts, part));
        i = end + 2;
        continue;
      }
    }

    if (content.slice(i).match(/^<u>/i)) {
      const close = content.slice(i + 3).search(/<\/u>/i);
      if (close !== -1) {
        const inner = parseChatMarkdown(content.slice(i + 3, i + 3 + close), {
          ...inherited,
          underline: true,
        });
        inner.forEach((part) => pushStyledPart(parts, part));
        i = i + 3 + close + 4;
        continue;
      }
    }

    if (content[i] === '*' && content[i + 1] !== '*') {
      const end = findClosingDelimiter(content, i, '*');
      if (end !== -1) {
        const inner = parseChatMarkdown(content.slice(i + 1, end), {
          ...inherited,
          italic: true,
        });
        inner.forEach((part) => pushStyledPart(parts, part));
        i = end + 1;
        continue;
      }
    }

    const nextSpecial = (() => {
      const indices = [
        content.indexOf('***', i),
        content.indexOf('**', i),
        content.indexOf('~~', i),
        content.indexOf('<u>', i),
        content.indexOf('*', i),
      ].filter((idx) => idx !== -1);
      return indices.length ? Math.min(...indices) : -1;
    })();

    if (nextSpecial === -1) {
      pushStyledPart(parts, withStyle(content.slice(i), inherited, {}));
      break;
    }

    if (nextSpecial > i) {
      pushStyledPart(parts, withStyle(content.slice(i, nextSpecial), inherited, {}));
      i = nextSpecial;
      continue;
    }

    pushStyledPart(parts, withStyle(content[i], inherited, {}));
    i += 1;
  }

  return parts.length ? parts : [withStyle(content, inherited, {})];
}

const linkStyleIncoming: TextStyle = {
  color: colors.primary.violet,
  textDecorationLine: 'underline',
};

const linkStyleOutgoing: TextStyle = {
  color: colors.neutral.white,
  textDecorationLine: 'underline',
};

function renderFormattedParts(
  parts: StyledPart[],
  style: StyleProp<TextStyle>,
  keyPrefix: string
) {
  return parts.map((part, index) => (
    <Text
      key={`${keyPrefix}-${index}-${part.text.slice(0, 8)}`}
      style={[
        style,
        part.bold ? { fontFamily: fonts['700'] } : null,
        part.italic ? { fontStyle: 'italic' } : null,
        part.underline ? { textDecorationLine: 'underline' } : null,
        part.strike ? { textDecorationLine: 'line-through' } : null,
      ]}
    >
      {part.text}
    </Text>
  ));
}

type ChatMessageTextProps = {
  content: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Outgoing bubble (blue bg) — links are white. */
  isOutgoing?: boolean;
};

export default function ChatMessageText({
  content,
  style,
  numberOfLines,
  isOutgoing = false,
}: ChatMessageTextProps) {
  const linkStyle = isOutgoing ? linkStyleOutgoing : linkStyleIncoming;
  const segments = useMemo(() => parseChatMessageSegments(content), [content]);

  const hasLinks = segments.some((s) => s.kind === 'link');
  const hasFormatting =
    hasLinks ||
    segments.some((s) => {
      if (s.kind !== 'text') return false;
      const parts = parseChatMarkdown(s.value);
      return parts.some((p) => p.bold || p.italic || p.underline || p.strike);
    });

  if (!hasFormatting) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {content}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, segIndex) => {
        if (segment.kind === 'link') {
          const openLink = () => {
            if (!isAllowedChatHref(segment.href)) return;
            Linking.openURL(segment.href).catch(() => {});
          };
          return (
            <Text
              key={`link-${segIndex}`}
              style={[style, linkStyle, { fontFamily: fonts['600'] }]}
              onPress={openLink}
              suppressHighlighting={false}
            >
              {segment.label}
            </Text>
          );
        }

        const parts = parseChatMarkdown(segment.value);
        const partHasStyle = parts.some(
          (p) => p.bold || p.italic || p.underline || p.strike
        );
        if (!partHasStyle) {
          return (
            <Text key={`text-${segIndex}`} style={style}>
              {segment.value}
            </Text>
          );
        }
        return (
          <React.Fragment key={`text-${segIndex}`}>
            {renderFormattedParts(parts, style, `seg-${segIndex}`)}
          </React.Fragment>
        );
      })}
    </Text>
  );
}

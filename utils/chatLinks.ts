const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

const PLAIN_URL_RE =
	/(?<!]\()(https?:\/\/[^\s<]+[^\s<.,:;"')\]\s]|www\.[^\s<]+[^\s<.,:;"')\]\s])/gi;

export type ChatMessageSegment =
	| { kind: 'text'; value: string }
	| { kind: 'link'; label: string; href: string };

export function normalizeChatHref(raw: string): string {
	const trimmed = raw.trim();
	if (/^www\./i.test(trimmed)) {
		return `https://${trimmed}`;
	}
	return trimmed;
}

export function isAllowedChatHref(href: string): boolean {
	try {
		const url = new URL(normalizeChatHref(href));
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

function linkifyPlainUrlsInText(text: string, segments: ChatMessageSegment[]) {
	let lastIndex = 0;
	for (const match of text.matchAll(PLAIN_URL_RE)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			segments.push({ kind: 'text', value: text.slice(lastIndex, index) });
		}
		const raw = match[0];
		const href = normalizeChatHref(raw);
		if (isAllowedChatHref(href)) {
			segments.push({ kind: 'link', label: raw, href });
		} else {
			segments.push({ kind: 'text', value: raw });
		}
		lastIndex = index + raw.length;
	}
	if (lastIndex < text.length) {
		segments.push({ kind: 'text', value: text.slice(lastIndex) });
	}
	if (segments.length === 0 && text.length > 0) {
		segments.push({ kind: 'text', value: text });
	}
}

/** Split message into plain text runs and clickable links (markdown + bare URLs). */
export function parseChatMessageSegments(content: string): ChatMessageSegment[] {
	if (!content) {
		return [];
	}

	const segments: ChatMessageSegment[] = [];
	let lastIndex = 0;

	for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
		const index = match.index ?? 0;
		linkifyPlainUrlsInText(content.slice(lastIndex, index), segments);
		const label = match[1] ?? '';
		const href = normalizeChatHref(match[2] ?? '');
		if (isAllowedChatHref(href)) {
			segments.push({
				kind: 'link',
				label: label || href,
				href,
			});
		} else {
			segments.push({ kind: 'text', value: match[0] });
		}
		lastIndex = index + match[0].length;
	}

	linkifyPlainUrlsInText(content.slice(lastIndex), segments);

	return segments.length ? segments : [{ kind: 'text', value: content }];
}

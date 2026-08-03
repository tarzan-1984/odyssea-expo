import { useGlobalChatOutboxFlush } from '@/hooks/useGlobalChatOutboxFlush';

/** Invisible helper — resumes pending chat outbox for all authenticated screens. */
export default function GlobalChatOutboxFlush() {
	useGlobalChatOutboxFlush();
	return null;
}

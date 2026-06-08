import { useGlobalChatRoomsSync } from '@/hooks/useGlobalChatRoomsSync';

/** Invisible helper — mounts global chat sync for all authenticated screens. */
export default function GlobalChatRoomsSync() {
	useGlobalChatRoomsSync();
	return null;
}

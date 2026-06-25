import type { ChatRoom, ChatRoomParticipant } from '@/components/ChatListItem';

function isDispatcherRole(role?: string | null): boolean {
  const r = role?.toUpperCase().trim();
  return r === 'DISPATCHER' || r === 'DISPATCHER_TL';
}

function isDriverRole(role?: string | null): boolean {
  return role?.toUpperCase().trim() === 'DRIVER';
}

function isVisibleLoadChatParticipant(participant: ChatRoomParticipant): boolean {
  const hidden = (participant as ChatRoomParticipant & { hideParticipant?: boolean })
    .hideParticipant;
  return hidden !== true;
}

export function getParticipantInitials(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

/** Participant with Dispatcher role (prefers DISPATCHER over DISPATCHER_TL). Mirrors Next.js loadChatAvatar. */
export function findLoadChatDispatcherParticipant(
  chatRoom: ChatRoom,
  currentUserId?: string,
): ChatRoomParticipant | undefined {
  if (!chatRoom.participants?.length) return undefined;

  const visible = chatRoom.participants.filter(isVisibleLoadChatParticipant);
  const dispatchers = visible.filter((p) => isDispatcherRole(p.user.role));
  const preferredDispatcher =
    dispatchers.find((p) => p.user.role?.toUpperCase().trim() === 'DISPATCHER') ??
    dispatchers[0];
  if (preferredDispatcher) return preferredDispatcher;

  // Fallback: first visible non-driver staff participant on the load
  return visible.find((p) => {
    if (currentUserId && p.user.id === currentUserId) return false;
    return !isDriverRole(p.user.role);
  });
}

function normalizeHexColor(raw?: string | null): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function getLoadChatDispatcherAvatarBg(userColor?: string | null): string {
  return normalizeHexColor(userColor) ?? '#465fff';
}

/** LOAD chat avatar initials: dispatcher (or staff fallback), never the load title. */
export function getLoadChatDispatcherInitials(
  chatRoom: ChatRoom,
  currentUserId?: string,
): string {
  const dispatcher = findLoadChatDispatcherParticipant(chatRoom, currentUserId);
  if (!dispatcher) return '';
  return getParticipantInitials(dispatcher.user);
}

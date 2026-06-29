import type { ChatRoom, ChatRoomParticipant } from '@/components/ChatListItem';

const LOAD_CHAT_FALLBACK_ADMIN_EXTERNAL_ID = '20';

function isDispatcherRole(role?: string | null): boolean {
  const r = role?.toUpperCase().trim();
  return r === 'DISPATCHER' || r === 'DISPATCHER_TL';
}

function isExpediteManagerRole(role?: string | null): boolean {
  return role?.toUpperCase().trim() === 'EXPEDITE_MANAGER';
}

function isVisibleLoadChatParticipant(participant: ChatRoomParticipant): boolean {
  const hidden = (participant as ChatRoomParticipant & { hideParticipant?: boolean })
    .hideParticipant;
  return hidden !== true;
}

function getVisibleParticipants(chatRoom: ChatRoom): ChatRoomParticipant[] {
  return (chatRoom.participants ?? []).filter(isVisibleLoadChatParticipant);
}

function getAllParticipants(chatRoom: ChatRoom): ChatRoomParticipant[] {
  return chatRoom.participants ?? [];
}

function matchesExternalId(
  externalId: unknown,
  target: string,
): boolean {
  return String(externalId ?? '').trim() === target;
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
  _currentUserId?: string,
): ChatRoomParticipant | undefined {
  if (!chatRoom.participants?.length) return undefined;

  const visible = getVisibleParticipants(chatRoom);
  const dispatchers = visible.filter((p) => isDispatcherRole(p.user.role));
  return (
    dispatchers.find((p) => p.user.role?.toUpperCase().trim() === 'DISPATCHER') ??
    dispatchers[0]
  );
}

/**
 * LOAD chat list avatar participant:
 * dispatcher → EXPEDITE_MANAGER → admin with externalId 20.
 */
export function findLoadChatAvatarParticipant(
  chatRoom: ChatRoom,
  currentUserId?: string,
): ChatRoomParticipant | undefined {
  const dispatcher = findLoadChatDispatcherParticipant(chatRoom, currentUserId);
  if (dispatcher) return dispatcher;

  const visible = getVisibleParticipants(chatRoom);
  const allParticipants = getAllParticipants(chatRoom);

  const expediteManager =
    visible.find((p) => isExpediteManagerRole(p.user.role)) ??
    allParticipants.find((p) => isExpediteManagerRole(p.user.role));
  if (expediteManager) return expediteManager;

  // Auto-added admins are hidden participants — include them for fallback avatar.
  return allParticipants.find((p) =>
    matchesExternalId(p.user.externalId, LOAD_CHAT_FALLBACK_ADMIN_EXTERNAL_ID),
  );
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

/** LOAD chat avatar initials: dispatcher / expedite manager / fallback admin. */
export function getLoadChatDispatcherInitials(
  chatRoom: ChatRoom,
  currentUserId?: string,
): string {
  const participant = findLoadChatAvatarParticipant(chatRoom, currentUserId);
  if (!participant) return '';
  return getParticipantInitials(participant.user);
}

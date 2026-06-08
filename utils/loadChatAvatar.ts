import type { ChatRoom } from '@/components/ChatListItem';

function isDispatcherRole(role?: string | null): boolean {
  const r = role?.toUpperCase().trim();
  return r === 'DISPATCHER' || r === 'DISPATCHER_TL';
}

export function findLoadChatDispatcherParticipant(chatRoom: ChatRoom) {
  if (!chatRoom.participants?.length) return undefined;
  const dispatchers = chatRoom.participants.filter((p) =>
    isDispatcherRole(p.user.role),
  );
  return (
    dispatchers.find((p) => p.user.role?.toUpperCase().trim() === 'DISPATCHER') ??
    dispatchers[0]
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

export function getLoadChatDispatcherInitials(chatRoom: ChatRoom): string {
  const dispatcher = findLoadChatDispatcherParticipant(chatRoom);
  if (!dispatcher) return '';
  const name = `${dispatcher.user.firstName} ${dispatcher.user.lastName}`.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

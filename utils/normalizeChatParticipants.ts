import type { ChatRoom } from '@/components/ChatListItem';

/** Keep participant fields needed for LOAD chat search (phone, externalId). Mirrors Next.js useChatSync. */
export function normalizeChatParticipants(participants: unknown): ChatRoom['participants'] {
  if (!Array.isArray(participants)) return [];

  return participants.map((p: any) => ({
    ...p,
    user: {
      id: p.user?.id,
      firstName: p.user?.firstName,
      lastName: p.user?.lastName,
      avatar: p.user?.profilePhoto ?? p.user?.avatar ?? '',
      profilePhoto: p.user?.profilePhoto,
      role: p.user?.role ?? 'USER',
      userColor: p.user?.userColor ?? null,
      externalId: p.user?.externalId ?? null,
      phone: p.user?.phone ?? null,
      unit: p.user?.unit,
    },
  }));
}

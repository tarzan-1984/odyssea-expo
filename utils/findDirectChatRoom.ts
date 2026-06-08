import type { ChatRoom } from '@/app-api/chatApi';

/** Find an existing DIRECT chat between the current user and another user. */
export function findDirectChatWithUser(
  rooms: ChatRoom[],
  myUserId: string,
  otherUserId: string,
): ChatRoom | undefined {
  return rooms.find((room) => {
    if (room.type !== 'DIRECT') return false;
    const participantUserIds =
      room.participants?.map((p) => p.userId ?? p.user?.id) ?? [];
    return (
      participantUserIds.includes(myUserId) &&
      participantUserIds.includes(otherUserId)
    );
  });
}

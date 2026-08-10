/**
 * Per-user chat list fields must never be applied from room-wide broadcasts.
 * Unread is authoritative only via chatUnreadCountUpdated → user_${id}.
 */
export function stripPerUserChatRoomFields<T extends Record<string, unknown>>(
  patch: T
): Omit<T, 'unreadCount' | 'isMuted' | 'isPinned'> {
  const {
    unreadCount: _unreadCount,
    isMuted: _isMuted,
    isPinned: _isPinned,
    ...safe
  } = patch;
  return safe;
}

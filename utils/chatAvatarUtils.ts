import { ChatRoom } from '@/components/ChatListItem';

/**
 * Get avatar source for a chat room
 * Uses the same logic as ChatListItem component
 * 
 * @param chatRoom - Chat room object
 * @param currentUserId - Current user ID to filter out from participants
 * @returns Avatar URI or null if no avatar (should show initials)
 */
export function getChatAvatarSource(
  chatRoom: ChatRoom | null,
  currentUserId?: string
): string | null {
  if (!chatRoom) {
    return null;
  }

  // For DIRECT chats, always use the other participant's avatar
  if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
    const otherParticipant = chatRoom.participants.find(
      p => p.user.id !== currentUserId
    );
    if (otherParticipant?.user.avatar || otherParticipant?.user.profilePhoto) {
      return otherParticipant.user.avatar || otherParticipant.user.profilePhoto || null;
    }
    // Return null if no avatar - will show initials
    return null;
  }
  
  // For GROUP/LOAD chats, use chat avatar if available
  if (chatRoom.avatar) {
    return chatRoom.avatar;
  }
  
  return null;
}

/**
 * Get display name for a chat room
 * Uses the same logic as ChatListItem component
 * 
 * @param chatRoom - Chat room object
 * @param currentUserId - Current user ID to filter out from participants
 * @returns Display name for the chat
 */
export function getChatDisplayName(
  chatRoom: ChatRoom | null,
  currentUserId?: string
): string {
  if (!chatRoom) {
    return 'Unknown Chat';
  }

  // For DIRECT chats, always show the other participant's name
  if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
    const otherParticipant = chatRoom.participants.find(
      p => p.user.id !== currentUserId
    );
    if (otherParticipant) {
      return `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`;
    }
  }

  // For other chats, use the chat name if available
  if (chatRoom.name) {
    return chatRoom.name;
  }

  // For group chats, show participant names
  if (chatRoom.type === 'GROUP' || chatRoom.type === 'LOAD') {
    const participantNames = chatRoom.participants
      .slice(0, 2)
      .map(p => p.user.firstName)
      .join(', ');
    return participantNames + (chatRoom.participants.length > 2 ? '...' : '');
  }

  return 'Unknown Chat';
}

/**
 * Get initials for avatar placeholder
 * Uses the same logic as ChatListItem component
 * 
 * @param name - Display name
 * @returns Initials string (2 characters)
 */
export function getChatInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstInitial = parts[0]?.[0] || '';
  const secondInitial = parts[1]?.[0] || parts[0]?.[1] || '';
  return `${firstInitial}${secondInitial}`.toUpperCase();
}


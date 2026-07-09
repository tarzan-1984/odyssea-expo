import { ChatRoom } from '@/components/ChatListItem';
import {
  findLoadChatAvatarParticipant,
  getLoadChatDispatcherAvatarBg,
  getParticipantInitials,
} from '@/utils/loadChatAvatar';
import { formatChatPeerDisplayName, formatOfferChatDriverDisplayName } from '@/utils/chatPeerDisplayName';
import {
  getDriverOfferChatTitle,
  isDriverViewer,
} from '@/utils/offerChatDisplay';

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

  // For DIRECT and OFFER chats, use the other participant's avatar
  if ((chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') && chatRoom.participants.length === 2) {
    const otherParticipant = chatRoom.participants.find(
      p => p.user.id !== currentUserId
    );
    if (otherParticipant?.user.avatar || otherParticipant?.user.profilePhoto) {
      return otherParticipant.user.avatar || otherParticipant.user.profilePhoto || null;
    }
    // Return null if no avatar - will show initials
    return null;
  }
  
  // LOAD chats: initials + userColor only (no images)
  if (chatRoom.type === 'LOAD') {
    return null;
  }

  // For GROUP chats, use chat avatar if available
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
  currentUserId?: string,
  viewerRole?: string | null,
): string {
  if (!chatRoom) {
    return 'Unknown Chat';
  }

  if (chatRoom.type === 'OFFER' && isDriverViewer(viewerRole)) {
    return getDriverOfferChatTitle(chatRoom.name);
  }

  if ((chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') && chatRoom.participants.length === 2) {
    const otherParticipant = chatRoom.participants.find(
      p => p.user.id !== currentUserId
    );
    if (otherParticipant) {
      return chatRoom.type === 'OFFER'
        ? formatOfferChatDriverDisplayName(otherParticipant.user)
        : formatChatPeerDisplayName(otherParticipant.user);
    }
  }

  // For other chats, use the chat name if available
  if (chatRoom.name) {
    return chatRoom.name;
  }

  // For group chats, show participant names
  if (chatRoom.type === 'GROUP' || chatRoom.type === 'BID' || chatRoom.type === 'LOAD') {
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

/** Initials and background for avatar placeholder (LOAD uses dispatcher). */
export function getChatAvatarPlaceholderMeta(
  chatRoom: ChatRoom | null,
  displayName: string,
  currentUserId?: string,
): { initials: string; backgroundColor?: string } {
  if (!chatRoom) {
    return { initials: getChatInitials(displayName) };
  }
  if (chatRoom.type === 'LOAD') {
    const avatarParticipant = findLoadChatAvatarParticipant(chatRoom, currentUserId);
    if (avatarParticipant) {
      const initials = getParticipantInitials(avatarParticipant.user);
      return {
        initials: initials || '?',
        backgroundColor: getLoadChatDispatcherAvatarBg(avatarParticipant.user.userColor),
      };
    }
    return { initials: '?' };
  }
  return { initials: getChatInitials(displayName) };
}


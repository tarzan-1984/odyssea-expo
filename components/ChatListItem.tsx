import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import PinIcon from '@/icons/PinIcon';
import MuteIcon from '@/icons/MuteIcon';

// Types for chat data
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profilePhoto?: string;
  role?: string;
  unit?: string;
}

export interface Message {
  id: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: string;
  isRead?: boolean;
  sender?: User;
}

export interface ChatRoomParticipant {
  id: string;
  userId: string;
  user: User;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'DIRECT' | 'GROUP' | 'LOAD';
  avatar?: string;
  participants: ChatRoomParticipant[];
  lastMessage?: Message;
  unreadCount?: number;
  isMuted?: boolean;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatListItemProps {
  chatRoom: ChatRoom;
  isSelected?: boolean;
  status?: 'online' | 'offline';
  onPress?: (chatRoom: ChatRoom) => void;
  currentUserId?: string;
}

/**
 * ChatListItem - Component for displaying a single chat room item in the chat list
 */
export default function ChatListItem({
  chatRoom,
  isSelected = false,
  status = 'offline',
  onPress,
  currentUserId,
}: ChatListItemProps) {
  // Get display name for the chat
  // For DIRECT chats, always show the other participant's name
  const getDisplayName = (): string => {
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
  };

  // Get role from the participant
  const getRole = (): string | null => {
    const otherParticipant = chatRoom.participants.find(
      p => p.user.id !== currentUserId
    );
    const role = otherParticipant?.user.role;
    return role && role.trim() ? role : null;
  };

  // Get avatar source
  // For DIRECT chats, always use the other participant's avatar
  const getAvatarSource = () => {
    // For DIRECT chats, always use the other participant's avatar
    if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
      const otherParticipant = chatRoom.participants.find(
        p => p.user.id !== currentUserId
      );
      if (otherParticipant?.user.avatar || otherParticipant?.user.profilePhoto) {
        return { uri: otherParticipant.user.avatar || otherParticipant.user.profilePhoto };
      }
      // Return null if no avatar - will show initials
      return null;
    }
    
    // For GROUP/LOAD chats, use chat avatar if available
    if (chatRoom.avatar) {
      return { uri: chatRoom.avatar };
    }
    
    return null;
  };

  // Get initials for avatar placeholder
  const getInitials = (): string => {
    const name = getDisplayName();
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0] || '';
    const secondInitial = parts[1]?.[0] || parts[0]?.[1] || '';
    return `${firstInitial}${secondInitial}`.toUpperCase();
  };

  // Get last message preview
  const getLastMessage = (): string => {
    if (!chatRoom.lastMessage) {
      return 'No messages yet';
    }
    
    if (chatRoom.lastMessage.fileUrl) {
      return `📎 ${chatRoom.lastMessage.fileName || 'File'}`;
    }
    
    return chatRoom.lastMessage.content;
  };

  // Format timestamp
  const formatTimestamp = (): string => {
    if (!chatRoom.lastMessage) {
      return '';
    }
    
    const messageTime = new Date(chatRoom.lastMessage.createdAt);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - messageTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h`;
    }
    
    // Format date
    const isToday = messageTime.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === messageTime.toDateString();
    
    if (isToday) {
      return messageTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    if (isYesterday) {
      return 'YESTERDAY';
    }
    
    return messageTime.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  const displayName = getDisplayName();
  const role = getRole();
  const avatarSource = getAvatarSource();
  const initials = getInitials();
  const lastMessage = getLastMessage();
  const timestamp = formatTimestamp();

  return (
    <TouchableOpacity
      style={ styles.container }
      onPress={() => onPress?.(chatRoom)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {avatarSource ? (
          <Image
            source={avatarSource}
            style={styles.avatar}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        {/* Online status indicator */}
        {status === 'online' && chatRoom.type === 'DIRECT' ? (
          <View style={styles.statusIndicator} />
        ) : null}
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        {/* Name and Timestamp Row */}
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>

        {/* Last Message Row */}
        <View style={styles.messageRow}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessage}
          </Text>
          {/* Icons for pinned/muted */}
          {chatRoom.isPinned ? (
            <View style={styles.iconContainer}>
              <PinIcon />
            </View>
          ) : null}
          {chatRoom.isMuted ? (
            <View style={styles.iconContainer}>
              <MuteIcon />
            </View>
          ) : null}
        </View>
      </View>

      {/* Right Section: Role, Read Status, Unread Count */}
      <View style={styles.rightSection}>
        {/* Role Tag */}
        {role ? (
          <View style={ styles.roleTag }>
            <Text style={ styles.roleTagText }>
              {role}
            </Text>
          </View>
        ) : null}
        
        {timestamp ? (
          <Text style={styles.timestamp}>{timestamp}</Text>
        ) : null}
        
        {/* Read Status Icon */}
        {chatRoom.lastMessage ? (
          <View style={styles.readStatusContainer}>
            {chatRoom.lastMessage.isRead ? (
              <ReadCheckIcon />
            ) : (
              <UnreadCheckIcon />
            )}
          </View>
        ) : null}

        {/* Unread Count Badge */}
        {chatRoom.unreadCount && chatRoom.unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {chatRoom.unreadCount > 99 ? '99+' : chatRoom.unreadCount.toString()}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rem(10),
    backgroundColor: colors.neutral.white,
    borderRadius: 10,
    shadowColor: '#6066C5',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
    marginBottom: rem(7),
  },
  containerSelected: {
    backgroundColor: colors.neutral.veryLightGrey,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: rem(14),
  },
  avatar: {
    width: rem(57),
    height: rem(57),
    borderRadius: borderRadius.full,
  },
  avatarPlaceholder: {
    width: rem(57),
    height: rem(57),
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: rem(12),
    height: rem(12),
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.success,
    borderWidth: 2,
    borderColor: colors.neutral.white,
  },
  contentContainer: {
    flex: 1,
    marginRight: rem(8),
    minWidth: 0,
  },
  name: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(10),
  },
  timestamp: {
    fontSize: fp(8),
    fontFamily: fonts['400'],
    color: 'rgba(41, 41, 102, 0.7)',
    flexShrink: 0,
    textTransform: 'uppercase',
    marginBottom: rem(3)
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: fp(11),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    minWidth: 0,
  },
  iconContainer: {
    marginLeft: rem(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  readStatusContainer: {
  
  },
  rightSection: {
    alignItems: 'flex-end',
    minWidth: rem(70),
  },
  roleTag: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(5),
    borderRadius: 4,
    backgroundColor: 'rgba(96, 102, 197, 0.15)',
    marginBottom: rem(8),
  },
  roleTagText: {
    fontSize: fp(8),
    fontFamily: fonts['600'],
    color: 'rgba(96, 102, 197, 1)',
    textTransform: 'uppercase'
  },
  unreadBadge: {
    minWidth: rem(24),
    height: rem(20),
    borderRadius: rem(10),
    backgroundColor: colors.semantic.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(6),
  },
  unreadBadgeText: {
    fontSize: fp(10),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
});


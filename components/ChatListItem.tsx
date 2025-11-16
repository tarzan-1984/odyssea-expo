import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import PinIcon from '@/icons/PinIcon';
import PushPinIcon from '@/icons/PushPinIcon';
import MuteIcon from '@/icons/MuteIcon';
import MutedIcon from '@/icons/MutedIcon';
import MoreDotsIcon from '@/icons/MoreDotsIcon';
import { chatApi } from '@/app-api/chatApi';

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
  chatRoomId: string;
  senderId: string;
  receiverId?: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  isRead: boolean;
  readBy?: string[];
  replyData?: {
    avatar?: string;
    time: string;
    content: string;
    senderName: string;
  };
  createdAt: string;
  sender: User;
  receiver?: User;
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
  onChatRoomUpdate?: (chatRoomId: string, updates: Partial<ChatRoom>) => void;
  isDropdownOpen?: boolean;
  onDropdownToggle?: (isOpen: boolean, chatId: string) => void;
  onCloseAllDropdowns?: () => void;
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
  onChatRoomUpdate,
  isDropdownOpen: controlledDropdownOpen,
  onDropdownToggle,
  onCloseAllDropdowns,
}: ChatListItemProps) {
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const isDropdownOpen = controlledDropdownOpen !== undefined ? controlledDropdownOpen : internalDropdownOpen;
  const [isMuted, setIsMuted] = useState(chatRoom.isMuted || false);
  const [isPinned, setIsPinned] = useState(chatRoom.isPinned || false);
  // Ref to measure menu button position (type any to avoid TSX type/value mix issue)
  const menuButtonRef = useRef<any>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  // Update local state when chatRoom prop changes
  useEffect(() => {
    setIsMuted(chatRoom.isMuted || false);
    setIsPinned(chatRoom.isPinned || false);
  }, [chatRoom.isMuted, chatRoom.isPinned]);


  const toggleDropdown = () => {
    if (!isDropdownOpen) {
      // Measure button position first
      menuButtonRef.current?.measure((x: any, y: any, width: any, height: any, pageX: any, pageY: any) => {
        setMenuPosition({ x: pageX, y: pageY + height });
        
        // Close all other dropdowns and open this one
        if (onCloseAllDropdowns) {
          onCloseAllDropdowns();
        }
        
        // Open this dropdown immediately
        if (onDropdownToggle) {
          onDropdownToggle(true, chatRoom.id);
        } else {
          setInternalDropdownOpen(true);
        }
      });
    } else {
      // Close this dropdown
      if (onDropdownToggle) {
        onDropdownToggle(false, chatRoom.id);
      } else {
        setInternalDropdownOpen(false);
      }
    }
  };

  const closeDropdown = () => {
    if (onDropdownToggle) {
      onDropdownToggle(false, chatRoom.id);
    } else {
      setInternalDropdownOpen(false);
    }
  };

  // Sync with controlled state and measure position when opened
  useEffect(() => {
    if (controlledDropdownOpen !== undefined) {
      if (controlledDropdownOpen) {
        // Measure button position when dropdown is opened externally
        setTimeout(() => {
          menuButtonRef.current?.measure((x: any, y: any, width: any, height: any, pageX: any, pageY: any) => {
            setMenuPosition({ x: pageX, y: pageY + height });
          });
        }, 0);
      } else {
        setInternalDropdownOpen(false);
      }
    }
  }, [controlledDropdownOpen]);

  const handleToggleMute = async () => {
    try {
      const action = isMuted ? 'unmute' : 'mute';
      await chatApi.muteChatRooms([chatRoom.id], action);
      
      // Determine the new mute state based on action
      const newMuteState = action === 'mute';
      
      // Update local state immediately for better UX
      setIsMuted(newMuteState);
      closeDropdown();
      
      // Update chat room in parent state and cache
      if (onChatRoomUpdate) {
        // Explicitly preserve unreadCount, lastMessage and updatedAt
        onChatRoomUpdate(chatRoom.id, { 
          isMuted: newMuteState,
          unreadCount: chatRoom.unreadCount,
          lastMessage: chatRoom.lastMessage,
          updatedAt: chatRoom.updatedAt,
        });
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  };

  const handleTogglePin = async () => {
    try {
      const result = await chatApi.togglePinChatRoom(chatRoom.id);
      
      // Update local state immediately for better UX
      setIsPinned(result.pin);
      closeDropdown();
      
      // Update chat room in parent state and cache
      if (onChatRoomUpdate) {
        onChatRoomUpdate(chatRoom.id, { isPinned: result.pin });
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };
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
      style={styles.container}
      onPress={() => {
        if (!isDropdownOpen) {
          onPress?.(chatRoom);
        } else {
          closeDropdown();
        }
      }}
      activeOpacity={0.7}
    >
      {/* Pinned and Muted icons in top-left corner */}
      <View style={styles.cornerIconsContainer}>
        {chatRoom.isPinned ? (
          <View style={styles.cornerIcon}>
            <PushPinIcon width={rem(12)} height={rem(12)} color={colors.neutral.darkGrey} />
          </View>
        ) : null}
        {chatRoom.isMuted ? (
          <View style={styles.cornerIcon}>
            <MutedIcon width={rem(12)} height={rem(12)} color={colors.neutral.darkGrey} />
          </View>
        ) : null}
      </View>
      {/* Menu Icon - positioned before avatar */}
      <View style={styles.menuContainer}>
        <TouchableOpacity
          ref={menuButtonRef}
          style={styles.menuButton}
          onPress={(e) => {
            e.stopPropagation();
            toggleDropdown();
          }}
          activeOpacity={0.7}
        >
          <MoreDotsIcon width={rem(16)} height={rem(16)} color={colors.neutral.darkGrey} />
        </TouchableOpacity>
      </View>

      {/* Dropdown Menu - using Modal to ensure it's above all elements */}
      <Modal
        transparent
        visible={isDropdownOpen}
        onRequestClose={closeDropdown}
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => {
            closeDropdown();
            // Also close all dropdowns in parent
            if (onCloseAllDropdowns) {
              onCloseAllDropdowns();
            }
          }}
        >
          <View
            style={[
              styles.dropdownMenu,
              {
                position: 'absolute',
                left: menuPosition.x,
                top: menuPosition.y,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={(e) => {
                e.stopPropagation();
                handleToggleMute();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.dropdownItemContent}>
                {isMuted ? (
                  <MutedIcon width={rem(14)} height={rem(14)} color={colors.neutral.darkGrey} />
                ) : (
                  <MuteIcon width={rem(14)} height={rem(14)} color={colors.neutral.darkGrey} />
                )}
                <Text style={styles.dropdownItemText}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownItem, styles.dropdownItemLast]}
              onPress={(e) => {
                e.stopPropagation();
                handleTogglePin();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.dropdownItemContent}>
                {isPinned ? (
                  <PushPinIcon width={rem(14)} height={rem(14)} color={colors.neutral.darkGrey} />
                ) : (
                  <PinIcon width={rem(14)} height={rem(14)} color={colors.neutral.darkGrey} />
                )}
                <Text style={styles.dropdownItemText}>
                  {isPinned ? 'Unpin' : 'Pin'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
        {/* Unread Count Badge */}
        {chatRoom.unreadCount && chatRoom.unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {chatRoom.unreadCount > 99 ? '99+' : chatRoom.unreadCount.toString()}
            </Text>
          </View>
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
        
        {/* Read Status Icon - show only for DIRECT chats */}
        {chatRoom.type === 'DIRECT' && chatRoom.lastMessage ? (
          <View style={styles.readStatusContainer}>
            {chatRoom.lastMessage.isRead ? (
              <ReadCheckIcon />
            ) : (
              <UnreadCheckIcon />
            )}
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
    position: 'relative',
  },
  containerSelected: {
    backgroundColor: colors.neutral.veryLightGrey,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: rem(14),
  },
  avatar: {
    width: rem(60),
    height: rem(60),
    borderRadius: borderRadius.full,
  },
  avatarPlaceholder: {
    width: rem(60),
    height: rem(60),
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fp(14),
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
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: rem(22),
    height: rem(22),
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral.white,
    zIndex: 1,
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
    marginTop: rem(4),
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
  unreadBadgeText: {
    fontSize: 8,
    textAlign: 'center',
    lineHeight: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.neutral.white,
    padding: 0,
    fontFamily: fonts['700'],
  },
  menuContainer: {
    position: 'relative',
    marginRight: rem(8),
  },
  menuButton: {
    padding: rem(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownMenu: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    minWidth: rem(120),
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.veryLightGrey,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
  },
  dropdownItemText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.black,
  },
  cornerIconsContainer: {
    position: 'absolute',
    top: rem(8),
    left: rem(8),
    zIndex: 2,
    flexDirection: 'row',
    gap: rem(4),
  },
  cornerIcon: {
    // Container for individual corner icon
  },
});


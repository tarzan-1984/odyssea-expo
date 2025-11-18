import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import TrashDeleteIcon from '@/icons/TrashDeleteIcon';
import { ChatRoom } from '@/components/ChatListItem';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { chatApi } from '@/app-api/chatApi';
import { useRouter } from 'expo-router';
import { useChatStore } from '@/stores/chatStore';
import { messagesCacheService } from '@/services/MessagesCacheService';

interface DeleteChatConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatRoom?: ChatRoom | null;
  onDeleteSuccess?: () => void;
}

export default function DeleteChatConfirmModal({
  isOpen,
  onClose,
  chatRoom,
  onDeleteSuccess,
}: DeleteChatConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { authState } = useAuth();
  const currentUser = authState.user;
  const { removeParticipant } = useWebSocket();
  const router = useRouter();
  const { removeChatRoom } = useChatStore();

  const handleDelete = async () => {
    if (!chatRoom || isDeleting || !currentUser || !currentUser.id) return;

    setIsDeleting(true);

    try {
      // Check if user is admin of group chat
      const isCurrentUserAdmin = chatRoom.adminId === currentUser.id;

      if (chatRoom.type === 'GROUP' && !isCurrentUserAdmin) {
        // For group chats, non-admin users should leave the chat (remove themselves via WebSocket)
        // The chat will be removed from store via WebSocket event 'participantRemoved'
        removeParticipant({
          chatRoomId: chatRoom.id,
          participantId: currentUser.id,
        });
        
        // Remove chat room from local store immediately (optimistic update)
        removeChatRoom(chatRoom.id);
        
        // Clear messages cache for this chat room
        await messagesCacheService.clearMessages(chatRoom.id).catch((err) => {
          console.error('Failed to clear messages cache:', err);
        });
        
        // Navigate back to messages list
        router.back();
      } else {
        // For direct chats or admin deleting group chat, use the delete API
        await chatApi.deleteChatRoom(chatRoom.id);
        
        // Remove chat room from local store
        removeChatRoom(chatRoom.id);
        
        // Clear messages cache for this chat room
        await messagesCacheService.clearMessages(chatRoom.id).catch((err) => {
          console.error('Failed to clear messages cache:', err);
        });
        
        // Navigate back to messages list
        router.back();
      }

      onDeleteSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete/leave chat:', error);
      Alert.alert(
        'Error',
        'Failed to delete chat. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const getChatTypeText = (): string => {
    if (!chatRoom) return '';

    if (chatRoom.type === 'DIRECT') {
      return 'private chat';
    } else if (chatRoom.type === 'GROUP') {
      return 'group chat';
    } else if (chatRoom.type === 'LOAD') {
      return 'load chat';
    }

    return '';
  };

  const getConfirmMessage = (): string => {
    if (!chatRoom) return '';

    if (chatRoom.type === 'DIRECT') {
      return 'Are you sure you want to delete this private chat? The conversation will be hidden for you. If the other person sends a message, the chat will reappear.';
    } else if (chatRoom.type === 'GROUP') {
      // Check if current user is the admin
      const isCurrentUserAdmin = chatRoom.adminId === currentUser?.id;

      if (isCurrentUserAdmin) {
        return 'Are you sure you want to delete this group chat? This will permanently delete the chat for all participants.';
      } else {
        return 'Are you sure you want to leave this group chat? You will no longer receive messages from this group.';
      }
    } else if (chatRoom.type === 'LOAD') {
      return 'Are you sure you want to delete this load chat? This will permanently delete the chat and archive all messages for all participants.';
    }

    return '';
  };

  const getActionText = (): string => {
    if (!chatRoom) return 'Delete';

    if (chatRoom.type === 'GROUP') {
      // Check if current user is the admin
      const isCurrentUserAdmin = chatRoom.adminId === currentUser?.id;
      return isCurrentUserAdmin ? 'Delete Chat' : 'Leave Chat';
    } else if (chatRoom.type === 'LOAD') {
      return 'Delete Chat';
    } else {
      return 'Delete Chat';
    }
  };

  const getTitle = (): string => {
    if (!chatRoom) return 'Delete Chat';

    if (chatRoom.type === 'GROUP' && chatRoom.adminId !== currentUser?.id) {
      return `Leave ${getChatTypeText()}`;
    } else {
      return `Delete ${getChatTypeText()}`;
    }
  };

  const getChatDisplayName = (): string => {
    if (!chatRoom) return 'Unknown Chat';

    if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
      // For direct chats, show the other participant's name
      const otherParticipant = chatRoom.participants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant && otherParticipant.user) {
        return `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`;
      }
      return 'Direct Chat';
    }

    return chatRoom.name || 'Group Chat';
  };

  if (!chatRoom) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <TrashDeleteIcon width={rem(24)} height={rem(24)} color={colors.neutral.white} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{getTitle()}</Text>

          {/* Chat name */}
          <Text style={styles.chatName}>"{getChatDisplayName()}"</Text>

          {/* Description */}
          <Text style={styles.description}>{getConfirmMessage()}</Text>

          {/* Action buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isDeleting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.neutral.white} />
              ) : (
                <Text style={styles.deleteButtonText}>{getActionText()}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(20),
  },
  modalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(24),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(400),
    alignItems: 'center',
  },
  iconContainer: {
    width: rem(48),
    height: rem(48),
    borderRadius: rem(24),
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rem(16),
  },
  title: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(8),
    textAlign: 'center',
  },
  chatName: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(15),
    textAlign: 'center',
  },
  description: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    marginBottom: rem(24),
    textAlign: 'center',
    lineHeight: fp(18),
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: rem(12),
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: rem(5),
    paddingHorizontal: rem(8),
    borderRadius: rem(10),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: rem(44),
  },
  cancelButton: {
    backgroundColor: colors.primary.green,
    borderWidth: 1,
    borderColor: colors.primary.green,
  },
  cancelButtonText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
  },
  deleteButton: {
    backgroundColor: colors.primary.blue,
  },
  deleteButtonText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.white,
  },
});


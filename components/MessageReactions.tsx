import React, { useCallback, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import EmojiPicker from '@/components/EmojiPicker';
import { Message, MessageReactionGroup } from '@/components/ChatListItem';
import { chatApi } from '@/app-api/chatApi';
import { useChatStore } from '@/stores/chatStore';
import { messagesCacheService } from '@/services/MessagesCacheService';

export const QUICK_REACTIONS = ['👍', '👎', '❤️', '😂', '😢', '🙏', '😎', '😡', '🤬'];

type MessageReactionsProps = {
  message: Message;
  canReact?: boolean;
  align?: 'left' | 'right';
};

export type MessageReactionAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReactionPickerProps = {
  visible: boolean;
  anchor?: MessageReactionAnchor | null;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  onQuickReaction: (emoji: string) => void;
};

function getInitials(user: MessageReactionGroup['users'][number]) {
  const first = user.firstName?.trim() || '';
  const last = user.lastName?.trim() || '';
  return `${first[0] || ''}${last[0] || first[1] || ''}`.toUpperCase() || 'U';
}

function getAvatarColor(user: MessageReactionGroup['users'][number]) {
  return user.userColor || 'rgba(96, 102, 197, 0.15)';
}

function ReactionAvatars({ users }: { users: MessageReactionGroup['users'] }) {
  const visible = users.slice(0, 3);
  const extra = users.length - visible.length;

  return (
    <View style={styles.avatarsRow}>
      {visible.map((user) => {
        const avatarUri = user.avatar || user.profilePhoto || '';
        return (
          <View key={user.id} style={[styles.avatar, { backgroundColor: getAvatarColor(user) }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(user)}</Text>
            )}
          </View>
        );
      })}
      {extra > 0 ? (
        <View style={styles.avatarExtra}>
          <Text style={styles.avatarExtraText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ReactionPicker({ visible, anchor, onClose, onEmojiSelect, onQuickReaction }: ReactionPickerProps) {
  const [showFullPicker, setShowFullPicker] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  const pickerWidth = Math.min(screenWidth - rem(16), rem(342));
  const fallbackLeft = (screenWidth - pickerWidth) / 2;
  const anchorCenterX = anchor ? anchor.x + anchor.width / 2 : screenWidth / 2;
  const pickerLeft = Math.max(
    rem(8),
    Math.min(anchorCenterX - pickerWidth / 2, screenWidth - pickerWidth - rem(8)),
  );
  const pickerTop = anchor ? Math.max(rem(8), anchor.y - rem(48)) : rem(120);

  const closeAll = useCallback(() => {
    setShowFullPicker(false);
    onClose();
  }, [onClose]);

  if (showFullPicker) {
    return (
      <EmojiPicker
        isOpen={visible}
        onClose={closeAll}
        onEmojiSelect={(emoji) => {
          onEmojiSelect(emoji);
          closeAll();
        }}
      />
    );
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={closeAll}>
      <Pressable style={styles.pickerOverlay} onPress={closeAll}>
        <View
          style={[
            styles.pickerContainer,
            {
              top: pickerTop,
              left: anchor ? pickerLeft : fallbackLeft,
              width: pickerWidth,
            },
          ]}
        >
          <View style={styles.quickRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.quickButton}
                activeOpacity={0.7}
                onPress={() => {
                  onQuickReaction(emoji);
                  closeAll();
                }}
              >
                <Text style={styles.quickEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.moreButton}
              activeOpacity={0.7}
              onPress={() => setShowFullPicker(true)}
            >
              <Text style={styles.moreButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export function useMessageReactionActions(message: Message) {
  const [busy, setBusy] = useState(false);
  const updateMessage = useChatStore((s) => s.updateMessage);

  const applyReactions = useCallback(
    (reactions: MessageReactionGroup[]) => {
      updateMessage(message.chatRoomId, message.id, { reactions });
      messagesCacheService.updateMessage(message.id, message.chatRoomId, { reactions }).catch((error) => {
        console.error('Failed to update message reactions in cache:', error);
      });
    },
    [message.chatRoomId, message.id, updateMessage],
  );

  const setReaction = useCallback(
    async (emoji: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const result = await chatApi.setMessageReaction(message.id, emoji);
        applyReactions(result.reactions);
      } catch (error) {
        console.error('Failed to set reaction:', error);
      } finally {
        setBusy(false);
      }
    },
    [applyReactions, busy, message.id],
  );

  const toggleQuickReaction = useCallback(
    async (emoji: string) => {
      if (busy) return;
      const existing = (message.reactions ?? []).find((group) => group.emoji === emoji);
      setBusy(true);
      try {
        const result = existing?.hasCurrentUser
          ? await chatApi.removeMessageReaction(message.id)
          : await chatApi.setMessageReaction(message.id, emoji);
        applyReactions(result.reactions);
      } catch (error) {
        console.error('Failed to toggle reaction:', error);
      } finally {
        setBusy(false);
      }
    },
    [applyReactions, busy, message.id, message.reactions],
  );

  const toggleReactionGroup = useCallback(
    async (group: MessageReactionGroup) => {
      if (busy) return;
      setBusy(true);
      try {
        const result = group.hasCurrentUser
          ? await chatApi.removeMessageReaction(message.id)
          : await chatApi.setMessageReaction(message.id, group.emoji);
        applyReactions(result.reactions);
      } catch (error) {
        console.error('Failed to toggle reaction:', error);
      } finally {
        setBusy(false);
      }
    },
    [applyReactions, busy, message.id],
  );

  return {
    setReaction,
    toggleQuickReaction,
    toggleReactionGroup,
    busy,
  };
}

export function MessageReactionPicker({
  message,
  visible,
  anchor,
  onClose,
}: {
  message: Message;
  visible: boolean;
  anchor?: MessageReactionAnchor | null;
  onClose: () => void;
}) {
  const { setReaction, toggleQuickReaction } = useMessageReactionActions(message);

  return (
    <ReactionPicker
      visible={visible}
      anchor={anchor}
      onClose={onClose}
      onEmojiSelect={(emoji) => {
        setReaction(emoji).catch(() => {});
      }}
      onQuickReaction={(emoji) => {
        toggleQuickReaction(emoji).catch(() => {});
      }}
    />
  );
}

export default function MessageReactions({ message, canReact = false, align = 'left' }: MessageReactionsProps) {
  const reactions = message.reactions ?? [];
  const { toggleReactionGroup } = useMessageReactionActions(message);

  if (!reactions.length) return null;

  return (
    <View style={[styles.reactionsRow, align === 'right' ? styles.reactionsRight : styles.reactionsLeft]}>
      {reactions.map((group) => {
        const chipStyle = [
          styles.reactionChip,
          group.hasCurrentUser ? styles.reactionChipActive : null,
        ];
        const content = (
          <>
            <Text style={styles.reactionEmoji}>{group.emoji}</Text>
            <ReactionAvatars users={group.users} />
          </>
        );

        if (!canReact) {
          return (
            <View key={group.emoji} style={chipStyle}>
              {content}
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={group.emoji}
            style={chipStyle}
            activeOpacity={0.75}
            onPress={() => {
              toggleReactionGroup(group).catch(() => {});
            }}
          >
            {content}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(4),
    marginTop: rem(4),
    maxWidth: '100%',
  },
  reactionsLeft: {
    justifyContent: 'flex-start',
  },
  reactionsRight: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(4),
    borderRadius: rem(999),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    backgroundColor: colors.neutral.white,
    paddingHorizontal: rem(6),
    paddingVertical: rem(2),
  },
  reactionChipActive: {
    borderColor: 'rgba(96, 102, 197, 0.45)',
    backgroundColor: 'rgba(96, 102, 197, 0.12)',
  },
  reactionEmoji: {
    fontSize: fp(14),
    lineHeight: fp(16),
  },
  avatarsRow: {
    flexDirection: 'row',
    marginLeft: rem(1),
  },
  avatar: {
    width: rem(16),
    height: rem(16),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral.white,
    marginLeft: rem(-4),
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: rem(8),
  },
  avatarInitials: {
    fontSize: fp(7),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  avatarExtra: {
    minWidth: rem(16),
    height: rem(16),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.lightGrey,
    borderWidth: 1,
    borderColor: colors.neutral.white,
    marginLeft: rem(-4),
    paddingHorizontal: rem(2),
  },
  avatarExtraText: {
    fontSize: fp(8),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  pickerContainer: {
    position: 'absolute',
    borderRadius: rem(999),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    backgroundColor: colors.neutral.white,
    padding: rem(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(1),
  },
  quickButton: {
    width: rem(30),
    height: rem(30),
    borderRadius: rem(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmoji: {
    fontSize: fp(20),
  },
  moreButton: {
    width: rem(30),
    height: rem(30),
    borderRadius: rem(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96, 102, 197, 0.12)',
  },
  moreButtonText: {
    fontSize: fp(22),
    lineHeight: fp(24),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
  },
});

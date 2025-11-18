import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import MoreDotIcon from '@/icons/MoreDotIcon';
import ReplyIcon from '@/icons/ReplyIcon';
import MarkUnreadIcon from '@/icons/MarkUnreadIcon';
import { Message } from '@/components/ChatListItem';

interface MessageDropdownProps {
  message: Message;
  isSender: boolean;
  onReplyPress?: (message: Message) => void;
  onMarkUnreadPress?: (messageId: string) => void;
}

export default function MessageDropdown({
  message,
  isSender,
  onReplyPress,
  onMarkUnreadPress,
}: MessageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show dropdown for messages that don't belong to the user (incoming messages)
  if (isSender) {
    return null;
  }

  const handleReplyPress = () => {
    if (onReplyPress) {
      onReplyPress(message);
    }
    setIsOpen(false);
  };

  const handleMarkUnreadPress = () => {
    if (onMarkUnreadPress) {
      onMarkUnreadPress(message.id);
    }
    setIsOpen(false);
  };

  return (
    <>
      <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        style={styles.triggerButton}
        activeOpacity={0.7}
      >
        <MoreDotIcon width={rem(16)} height={rem(16)} color={colors.primary.blue} />
      </TouchableOpacity>
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.dropdown}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReplyPress}
              activeOpacity={0.7}
            >
              <ReplyIcon width={rem(14)} height={rem(14)} color={colors.primary.blue} />
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleMarkUnreadPress}
              activeOpacity={0.7}
            >
              <MarkUnreadIcon width={rem(14)} height={rem(14)} color={colors.primary.blue} />
              <Text style={styles.menuItemText}>Mark as unread</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  triggerButton: {
    padding: rem(4),
    borderRadius: rem(20),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    paddingTop: rem(100),
  },
  dropdown: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    paddingVertical: rem(4),
    minWidth: rem(140),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.15)',
    alignSelf: 'flex-start',
    marginLeft: rem(20),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    gap: rem(6),
  },
  menuItemText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
  },
});


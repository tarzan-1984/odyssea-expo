import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import MoreDotIcon from '@/icons/MoreDotIcon';
import AttachmentIconMenu from '@/icons/AttachmentIconMenu';
import TrashDeleteIcon from '@/icons/TrashDeleteIcon';
import DeleteChatConfirmModal from '@/components/modals/DeleteChatConfirmModal';
import { ChatRoom } from '@/components/ChatListItem';

interface ChatHeaderDropdownProps {
  chatRoom?: ChatRoom | null;
  chatRoomType?: 'DIRECT' | 'GROUP' | 'LOAD';
  onFilesPress?: () => void;
}

export default function ChatHeaderDropdown({
  chatRoom,
  chatRoomType,
  onFilesPress,
}: ChatHeaderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleFilesPress = () => {
    if (onFilesPress) {
      onFilesPress();
    }
    setIsOpen(false);
  };

  const handleDeletePress = () => {
    setIsOpen(false);
    setIsDeleteModalOpen(true);
  };

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          onPress={() => setIsOpen(true)}
          style={styles.triggerButton}
          activeOpacity={0.7}
        >
          <MoreDotIcon width={rem(27)} height={rem(27)} color={colors.neutral.white} />
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
              onPress={handleFilesPress}
              activeOpacity={0.7}
            >
              <AttachmentIconMenu width={rem(14)} height={rem(14)} color={colors.primary.blue} />
              <Text style={styles.menuItemText}>Files</Text>
            </TouchableOpacity>

            {/* Show Delete button only for DIRECT and GROUP chats, not for LOAD chats */}
            {(chatRoomType === 'DIRECT' || chatRoomType === 'GROUP') && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeletePress}
                activeOpacity={0.7}
              >
                <TrashDeleteIcon width={rem(14)} height={rem(14)} color="#EF4444" />
                <Text style={styles.menuItemDeleteText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      <DeleteChatConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        chatRoom={chatRoom || null}
        onDeleteSuccess={() => {
          // Chat will be removed from store and navigation handled in modal
        }}
      />
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
    minWidth: rem(120),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.15)',
    alignSelf: 'flex-end',
    marginRight: rem(20),
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
  menuItemDeleteText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: '#EF4444',
  },
});


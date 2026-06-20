import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Alert, Dimensions } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { colors, fonts, fp, rem } from '@/lib';
import MoreDotIcon from '@/icons/MoreDotIcon';
import ReplyIcon from '@/icons/ReplyIcon';
import CopyIcon from '@/icons/CopyIcon';
import DeletedFileIcon from '@/icons/DeletedFileIcon';
import { Message } from '@/components/ChatListItem';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DROPDOWN_WIDTH = rem(140); // Approximate width of dropdown
const MENU_ITEM_HEIGHT = rem(34);

interface MessageDropdownProps {
  message: Message;
  isSender: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  onReplyPress?: (message: Message) => void;
  onDeletePress?: (message: Message) => void;
  onEditPress?: (message: Message) => void;
}

export default function MessageDropdown({
  message,
  isSender,
  canDelete = false,
  canEdit = false,
  onReplyPress,
  onDeletePress,
  onEditPress,
}: MessageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<View>(null);

  // Incoming messages can be replied to; own messages can be deleted when allowed by role.
  if (isSender && !canDelete && !canEdit) {
    return null;
  }

  const menuItemCount = (canEdit ? 1 : 0) + (canDelete || !isSender ? 1 : 0) + 1;
  const dropdownHeight = MENU_ITEM_HEIGHT * menuItemCount + rem(8);

  const handleReplyPress = () => {
    if (onReplyPress) {
      onReplyPress(message);
    }
    setIsOpen(false);
  };

  const handleDeletePress = () => {
    if (onDeletePress) {
      onDeletePress(message);
    }
    setIsOpen(false);
  };

  const handleEditPress = () => {
    if (onEditPress) {
      onEditPress(message);
    }
    setIsOpen(false);
  };

  const handleCopyPress = () => {
    try {
      const textToCopy = message.content || '';
      if (textToCopy) {
        Clipboard.setString(textToCopy);
        Alert.alert('Copied', 'Message copied to clipboard');
      }
    } catch (error) {
      console.error('Failed to copy message:', error);
      Alert.alert('Error', 'Failed to copy message');
    }
    setIsOpen(false);
  };

  const handleTriggerPress = () => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        let top = y + height + rem(4);
        let left = x;
        
        // Check if dropdown goes beyond right edge of screen
        if (left + DROPDOWN_WIDTH > SCREEN_WIDTH) {
          // Position dropdown to the left of the trigger button
          left = x + width - DROPDOWN_WIDTH;
          // Ensure it doesn't go beyond left edge
          if (left < rem(10)) {
            left = rem(10);
          }
        }
        
        // Check if dropdown goes beyond bottom edge of screen
        if (top + dropdownHeight > SCREEN_HEIGHT) {
          // Position dropdown above the trigger button
          top = y - dropdownHeight - rem(4);
          // Ensure it doesn't go beyond top edge
          if (top < rem(10)) {
            top = rem(10);
          }
        }
        
        // Ensure minimum margins from screen edges
        if (left < rem(10)) {
          left = rem(10);
        }
        if (top < rem(10)) {
          top = rem(10);
        }
        
        setDropdownPosition({
          top,
          left,
        });
        setIsOpen(true);
      });
    } else {
      setIsOpen(true);
    }
  };

  return (
    <>
      <View style={styles.container} ref={triggerRef} collapsable={false}>
      <TouchableOpacity
        onPress={handleTriggerPress}
        style={styles.triggerButton}
        activeOpacity={0.7}
      >
        <MoreDotIcon width={rem(18)} height={rem(18)} color={isSender ? colors.neutral.white : colors.primary.blue} />
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
          <View style={[styles.dropdown, { top: dropdownPosition.top, left: dropdownPosition.left }]}>
            {canEdit ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleEditPress}
                activeOpacity={0.7}
              >
                <Text style={styles.menuItemIcon}>✎</Text>
                <Text style={styles.menuItemText}>Edit</Text>
              </TouchableOpacity>
            ) : null}

            {canDelete ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeletePress}
                activeOpacity={0.7}
              >
                <DeletedFileIcon width={rem(18)} height={rem(18)} color={colors.primary.blue} />
                <Text style={styles.menuItemText}>Delete</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleReplyPress}
                activeOpacity={0.7}
              >
                <ReplyIcon width={rem(18)} height={rem(18)} color={colors.primary.blue} />
                <Text style={styles.menuItemText}>Reply</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCopyPress}
              activeOpacity={0.7}
            >
              <CopyIcon width={rem(18)} height={rem(18)} color={colors.primary.blue} />
              <Text style={styles.menuItemText}>Copy</Text>
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
  },
  dropdown: {
    position: 'absolute',
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
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    gap: rem(6),
    minHeight: MENU_ITEM_HEIGHT,
  },
  menuItemIcon: {
    width: rem(18),
    fontSize: fp(18),
    lineHeight: fp(18),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
  },
});

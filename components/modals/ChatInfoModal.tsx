import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, fp, rem, borderRadius } from '@/lib';
import { ChatRoom } from '@/components/ChatListItem';
import { chatApi, UsersResponse } from '@/app-api/chatApi';
import { secureStorage } from '@/utils/secureStorage';
import type { FileData } from '@/utils/chatAttachmentHelpers';
import { uploadImageViaPresign } from '@/app-api/upload';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { useOnlineStatusContext } from '@/context/OnlineStatusContext';
import { userMatchesSearchQuery } from '@/utils/chatSearch';

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profilePhoto?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  role?: string;
  status?: string;
}

interface ChatInfoModalProps {
  visible: boolean;
  onClose: () => void;
  chatRoom?: ChatRoom | null;
}

const LOAD_CHAT_MANAGER_ROLES = [
  'TRACKING_TL',
  'EXPEDITE_MANAGER',
  'RECRUITER_TL',
  'TRACKING',
  'NIGHTSHIFT_TRACKING',
  'DISPATCHER_TL',
  'BILLING',
  'ADMINISTRATOR',
];

const dedupeById = <T extends { id: string }>(list: T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const u of list) {
    if (u?.id && !seen.has(u.id)) {
      seen.add(u.id);
      result.push(u);
    }
  }
  return result;
};

const getInitials = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const initials =
    (parts[0]?.[0] || '').toUpperCase() +
    (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase();
  return initials || '?';
};

export default function ChatInfoModal({ visible, onClose, chatRoom }: ChatInfoModalProps) {
  const { authState } = useAuth();
  const currentUser = authState.user;
  const insets = useSafeAreaInsets();
  const { isUserOnline } = useOnlineStatusContext();
  const { socket, isConnected, updateChatRoom, addParticipants, removeParticipant } = useWebSocket();
  const mainScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  const isGroupChat = chatRoom?.type === 'GROUP';
  const isLoadChat = chatRoom?.type === 'LOAD';
  const isCurrentUserAdmin = !!chatRoom?.adminId && !!currentUser?.id && chatRoom.adminId === currentUser.id;
  const canManageChat =
    (!!isGroupChat && isCurrentUserAdmin) ||
    (!!isLoadChat && !!currentUser?.role && LOAD_CHAT_MANAGER_ROLES.includes(currentUser.role));

  const [localParticipants, setLocalParticipants] = useState<any[]>([]);
  const [addedUserIds, setAddedUserIds] = useState<string[]>([]);
  const [removedUserIds, setRemovedUserIds] = useState<string[]>([]);
  const [addingUserIds, setAddingUserIds] = useState<string[]>([]);

  const [showAddSection, setShowAddSection] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [pickedAvatar, setPickedAvatar] = useState<FileData | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const apiSearch = useMemo(() => {
    const q = (debouncedSearch || '').trim();
    return q || undefined;
  }, [debouncedSearch]);

  const chatDisplayName = useMemo(() => {
    if (!chatRoom) return 'Chat';
    if (chatRoom.name) return chatRoom.name;
    if (chatRoom.type === 'GROUP' || chatRoom.type === 'LOAD') {
      const participantNames = (chatRoom.participants || [])
        .slice(0, 2)
        .map((p: any) => p?.user?.firstName)
        .filter(Boolean)
        .join(', ');
      return participantNames + ((chatRoom.participants || []).length > 2 ? '...' : '');
    }
    return 'Chat';
  }, [chatRoom]);

  const avatarUri = useMemo(() => {
    if (!chatRoom) return undefined;
    // For GROUP/LOAD, chatRoom.avatar should be preferred.
    // For safety, fall back to any known fields.
    return (pickedAvatar?.uri as string | undefined) || (chatRoom as any).avatar || undefined;
  }, [chatRoom, pickedAvatar?.uri]);

  // Reset state on open/room change
  useEffect(() => {
    if (!visible) return;
    setLocalParticipants(chatRoom?.participants || []);
    setAddedUserIds([]);
    setRemovedUserIds([]);
    setAddingUserIds([]);
    setShowAddSection(false);
    setUsers([]);
    setPage(1);
    setHasNextPage(true);
    setSearch('');
    setDebouncedSearch('');
    setPickedAvatar(null);
    setIsUploadingAvatar(false);
    setIsSaving(false);
  }, [visible, chatRoom?.id]);

  const fetchUsers = async (nextPage: number, append: boolean) => {
    if (!visible || !canManageChat) return;
    if (!chatRoom) return;

    if (append) setIsLoadingMore(true);
    else setIsLoadingUsers(true);

    try {
      const res: UsersResponse = await chatApi.getUsers({
        page: nextPage,
        limit: 10,
        search: apiSearch,
        status: 'ACTIVE',
        contactsOnly: true,
      });

      const existingParticipantIds = (localParticipants || []).map((p: any) => p.userId || p.user?.id).filter(Boolean);
      const list = (res.users || []).filter((u: any) => {
        if (!u?.id) return false;
        if (String(u?.status || '').toUpperCase() !== 'ACTIVE') return false;
        if (u.id === currentUser?.id) return false;
        if (existingParticipantIds.includes(u.id)) return false;
        return true;
      }) as UserItem[];

      setUsers((prev) => (append ? dedupeById([...(prev || []), ...(list || [])]) : dedupeById(list || [])));
      setPage(res.pagination?.current_page || nextPage);
      setHasNextPage(!!res.pagination?.has_next_page);
    } catch (e) {
      // ignore
    } finally {
      setIsLoadingUsers(false);
      setIsLoadingMore(false);
    }
  };

  // Debounced search fetch when Add section is open
  useEffect(() => {
    if (!visible || !showAddSection) return;
    setPage(1);
    setHasNextPage(true);
    void fetchUsers(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showAddSection, apiSearch]);

  const filteredUsers = useMemo(() => {
    const onlyActive = users.filter((u) => String(u?.status || '').toUpperCase() === 'ACTIVE');
    return onlyActive.filter((u) => userMatchesSearchQuery(u, search));
  }, [users, search]);

  const dismissKeyboard = useCallback(() => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const closeAddSection = () => {
    dismissKeyboard();
    setShowAddSection(false);
    setSearch('');
    setDebouncedSearch('');
    setUsers([]);
    setPage(1);
    setHasNextPage(true);
  };

  const handleSearchFocus = () => {
    setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const handlePickAvatar = async () => {
    if (!canManageChat || !chatRoom) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo library permission', 'Photo library permission is required to select photos.');
        return;
      }

      // Cross-version support for API (legacy MediaTypeOptions vs new MediaType)
      let mediaTypes: any;
      const MP: any = (ImagePicker as any).MediaType;
      if (MP && (MP.Images || MP.images || MP.image)) {
        mediaTypes = [MP.Images ?? MP.images ?? MP.image];
      } else if ((ImagePicker as any).MediaTypeOptions) {
        mediaTypes = (ImagePicker as any).MediaTypeOptions.Images;
      } else {
        mediaTypes = ['images'];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsMultipleSelection: false,
        // Important: on iOS, edited export is typically JPEG (avoids HEIC that many browsers can't render).
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        exif: false,
      });

      if (result.canceled) return;
      const asset: any = result.assets?.[0];
      if (!asset?.uri) return;

      const filename = asset.fileName || asset.filename || `avatar_chat_${chatRoom.id}_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      const f: FileData = {
        uri: asset.uri,
        name: filename,
        mimeType,
        size: asset.fileSize || undefined,
      };
      setPickedAvatar(f);
    } catch (e) {
      console.error('[ChatInfoModal] Failed to pick avatar:', e);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  };

  const handleAddParticipant = (user: UserItem) => {
    if (!chatRoom) return;
    if (addingUserIds.includes(user.id)) return;
    if (localParticipants.some((p: any) => (p.user?.id || p.userId) === user.id)) return;

    setAddingUserIds((prev) => [...prev, user.id]);
    const tempParticipant = {
      id: `temp-${user.id}`,
      chatRoomId: chatRoom.id,
      userId: user.id,
      joinedAt: new Date().toISOString(),
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar || user.profilePhoto || '',
        role: user.role || 'USER',
      },
    };

    setLocalParticipants((prev) => [...(prev || []), tempParticipant as any]);
    setAddedUserIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
    setRemovedUserIds((prev) => prev.filter((id) => id !== user.id));
    setUsers((prev) => prev.filter((u) => u.id !== user.id));

    setTimeout(() => {
      setAddingUserIds((prev) => prev.filter((id) => id !== user.id));
    }, 100);
  };

  const handleRemoveParticipant = (userId: string) => {
    setLocalParticipants((prev) => (prev || []).filter((p: any) => (p.user?.id || p.userId) !== userId));
    if (addedUserIds.includes(userId)) {
      setAddedUserIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setRemovedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    }
  };

  const handleSave = async () => {
    if (!chatRoom || !canManageChat) return;
    if (!socket || !isConnected) {
      Alert.alert('Error', 'No WebSocket connection. Please try again.');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);

    try {
      // 1) Upload avatar if picked
      let uploadedAvatarUrl: string | undefined;
      if (pickedAvatar) {
        setIsUploadingAvatar(true);
        const accessToken = await secureStorage.getItemAsync('accessToken');
        if (!accessToken) throw new Error('No access token');
        uploadedAvatarUrl = await uploadImageViaPresign({
          fileUri: pickedAvatar.uri,
          filename: pickedAvatar.name,
          mimeType: pickedAvatar.mimeType || 'image/jpeg',
          accessToken,
        });
        setIsUploadingAvatar(false);
      }

      // 2) Update avatar
      if (uploadedAvatarUrl) {
        updateChatRoom({ chatRoomId: chatRoom.id, updates: { avatar: uploadedAvatarUrl } });
      }

      // 3) Add participants
      if (addedUserIds.length > 0) {
        const uniqueIds = Array.from(new Set(addedUserIds));
        addParticipants({ chatRoomId: chatRoom.id, participantIds: uniqueIds });
      }

      // 4) Remove participants
      if (removedUserIds.length > 0) {
        for (const removedId of removedUserIds) {
          removeParticipant({ chatRoomId: chatRoom.id, participantId: removedId });
        }
      }

      onClose();
    } catch (e) {
      console.error('[ChatInfoModal] Failed to save:', e);
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
      setIsUploadingAvatar(false);
    }
  };

  const renderParticipantRow = (p: any) => {
    const user = p?.user || {};
    const userId = user?.id || p?.userId;
    const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown';
    const role = user?.role ? String(user.role) : '';
    const avatar = user?.avatar || user?.profilePhoto;
    const initials = getInitials(name);
    const online = userId ? isUserOnline(userId) : false;

    const isAdminUser = !!chatRoom?.adminId && userId === chatRoom.adminId;
    const isSelf = !!currentUser?.id && userId === currentUser.id;
    const showRemove = !!canManageChat && !isAdminUser && !isSelf;

    return (
      <View key={String(userId)} style={styles.participantRow}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarCircle}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.userAvatar} />
            ) : (
              <View style={styles.userAvatarPlaceholder}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          {online ? <View style={styles.onlineIndicator} /> : null}
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {name}
          </Text>
          {role ? (
            <Text style={styles.userRole} numberOfLines={1}>
              {role.toLowerCase().replace('_', ' ')}
            </Text>
          ) : null}
        </View>

        {showRemove ? (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemoveParticipant(userId)}
            activeOpacity={0.8}
          >
            <Text style={styles.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const handleAddScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e?.nativeEvent || {};
    if (!contentOffset || !contentSize || !layoutMeasurement) return;
    const paddingToBottom = 24;
    const isNearBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
    if (isNearBottom && hasNextPage && !isLoadingMore) {
      void fetchUsers(page + 1, true);
    }
  };

  const handleClose = () => {
    if (isSaving || isUploadingAvatar) return;
    dismissKeyboard();
    onClose();
  };

  if (!chatRoom) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={dismissKeyboard} accessibilityRole="button" />
        <KeyboardAvoidingView
          style={styles.keyboardLayer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          pointerEvents="box-none"
        >
          <View style={styles.sheetWrap} pointerEvents="box-none">
            <View style={styles.container} onStartShouldSetResponder={() => true}>
              <View style={styles.header}>
                <Text style={styles.title}>Chat info</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={handleClose}
                  disabled={isSaving || isUploadingAvatar}
                >
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={mainScrollRef}
                style={styles.body}
                contentContainerStyle={styles.bodyScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScrollBeginDrag={dismissKeyboard}
                onMomentumScrollBegin={dismissKeyboard}
                nestedScrollEnabled
              >
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <View style={styles.chatAvatarWrap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.chatAvatar} />
                ) : (
                  <View style={styles.chatAvatarPlaceholder}>
                    <Text style={styles.chatAvatarText}>{getInitials(chatDisplayName)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.avatarMeta}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {chatDisplayName}
                </Text>
                <Text style={styles.chatType} numberOfLines={1}>
                  {(chatRoom.type || '').toLowerCase()}
                </Text>
              </View>

              {canManageChat ? (
                <TouchableOpacity
                  style={styles.changePhotoBtn}
                  onPress={handlePickAvatar}
                  activeOpacity={0.8}
                  disabled={isSaving || isUploadingAvatar}
                >
                  <Text style={styles.changePhotoText}>Change photo</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Participants */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Participants ({localParticipants.length})</Text>
              </View>

              <View style={styles.participantsBox}>
                {(localParticipants || []).map(renderParticipantRow)}
              </View>

              {canManageChat ? (
                <TouchableOpacity
                  style={styles.addToggleBtn}
                  onPress={() => {
                    setShowAddSection((v) => {
                      const next = !v;
                      if (next) {
                        setTimeout(() => {
                          mainScrollRef.current?.scrollToEnd({ animated: true });
                        }, 200);
                      } else {
                        dismissKeyboard();
                      }
                      return next;
                    });
                  }}
                  activeOpacity={0.8}
                  disabled={isSaving || isUploadingAvatar}
                >
                  <Text style={styles.addToggleText}>
                    {showAddSection ? 'Hide add participants' : 'Add participants'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Add participants */}
            {canManageChat && showAddSection ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Add participants</Text>
                  <TouchableOpacity
                    onPress={closeAddSection}
                    activeOpacity={0.8}
                    disabled={isSaving || isUploadingAvatar}
                    style={styles.inlineCloseBtn}
                  >
                    <Text style={styles.inlineCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  ref={searchInputRef}
                  style={styles.input}
                  placeholder="Search..."
                  placeholderTextColor={colors.neutral.gray}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={handleSearchFocus}
                  returnKeyType="search"
                  blurOnSubmit
                  onSubmitEditing={dismissKeyboard}
                  editable={!isSaving && !isUploadingAvatar}
                />

                {isLoadingUsers ? (
                  <View style={styles.loaderRow}>
                    <ActivityIndicator size="small" color={colors.primary.violet} />
                    <Text style={styles.loaderText}>Loading...</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.addList}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={dismissKeyboard}
                    onMomentumScrollBegin={dismissKeyboard}
                    onScroll={handleAddScroll}
                    scrollEventThrottle={16}
                  >
                    {filteredUsers.map((u) => {
                      const name =
                        `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                        u.email ||
                        'Unknown';
                      const avatar = u.avatar || u.profilePhoto;
                      const initials = getInitials(name);
                      const online = isUserOnline(u.id);
                      const isAdding = addingUserIds.includes(u.id);
                      return (
                        <TouchableOpacity
                          key={u.id}
                          style={styles.userRow}
                          activeOpacity={0.8}
                          onPress={() => handleAddParticipant(u)}
                          disabled={isSaving || isUploadingAvatar || isAdding}
                        >
                          <View style={styles.avatarWrap}>
                            <View style={styles.avatarCircle}>
                              {avatar ? (
                                <Image source={{ uri: avatar }} style={styles.userAvatar} />
                              ) : (
                                <View style={styles.userAvatarPlaceholder}>
                                  <Text style={styles.avatarInitials}>{initials}</Text>
                                </View>
                              )}
                            </View>
                            {online ? <View style={styles.onlineIndicator} /> : null}
                          </View>

                          <View style={styles.userInfo}>
                            <Text style={styles.userName} numberOfLines={1}>
                              {name}
                            </Text>
                            {!!u.role ? (
                              <Text style={styles.userRole} numberOfLines={1}>
                                {String(u.role).toLowerCase().replace('_', ' ')}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.addRight}>
                            {isAdding ? (
                              <ActivityIndicator size="small" color={colors.primary.violet} />
                            ) : (
                              <Text style={styles.addRightText}>Add</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {isLoadingMore ? (
                      <View style={styles.loaderRow}>
                        <ActivityIndicator size="small" color={colors.primary.violet} />
                      </View>
                    ) : null}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {canManageChat ? (
              <TouchableOpacity
                style={[styles.saveBtn, (isSaving || isUploadingAvatar) && styles.saveBtnDisabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={isSaving || isUploadingAvatar}
              >
                {isSaving || isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={colors.neutral.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            ) : null}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  keyboardLayer: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: rem(16),
  },
  container: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: colors.primary.violet,
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  closeBtn: {
    paddingHorizontal: rem(8),
    paddingVertical: rem(4),
  },
  closeText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.white,
  },
  body: {
    flexGrow: 1,
    backgroundColor: colors.neutral.white,
  },
  bodyScrollContent: {
    padding: rem(16),
    paddingBottom: rem(20),
    gap: rem(14),
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
  },
  chatAvatarWrap: {
    width: rem(52),
    height: rem(52),
    borderRadius: rem(26),
    overflow: 'hidden',
    backgroundColor: colors.neutral.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatar: {
    width: '100%',
    height: '100%',
  },
  chatAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.lightGrey,
  },
  chatAvatarText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.violet,
  },
  avatarMeta: {
    flex: 1,
  },
  chatName: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  chatType: {
    marginTop: rem(2),
    fontSize: fp(11),
    fontFamily: fonts['400'],
    color: colors.neutral.gray,
  },
  changePhotoBtn: {
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.25)',
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(10),
  },
  changePhotoText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.primary.violet,
  },
  section: {
    gap: rem(10),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineCloseBtn: {
    paddingHorizontal: rem(6),
    paddingVertical: rem(4),
  },
  inlineCloseText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.violet,
  },
  sectionTitle: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  sectionHint: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.gray,
  },
  participantsBox: {
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    borderRadius: rem(12),
    paddingVertical: rem(6),
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(10),
    paddingVertical: rem(8),
    gap: rem(10),
  },
  avatarWrap: {
    width: rem(38),
    height: rem(38),
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarCircle: {
    width: rem(38),
    height: rem(38),
    borderRadius: rem(19),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.lightGrey,
  },
  userAvatar: {
    width: '100%',
    height: '100%',
  },
  userAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.lightGrey,
  },
  avatarInitials: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.primary.violet,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: rem(-1),
    right: rem(-1),
    width: rem(12),
    height: rem(12),
    borderRadius: rem(6),
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: colors.neutral.white,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  userRole: {
    marginTop: rem(2),
    fontSize: fp(10),
    fontFamily: fonts['400'],
    color: colors.neutral.gray,
  },
  removeBtn: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(10),
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  removeBtnText: {
    fontSize: fp(11),
    fontFamily: fonts['600'],
    color: '#EF4444',
  },
  addToggleBtn: {
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.20)',
    borderRadius: rem(12),
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    alignItems: 'center',
  },
  addToggleText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.violet,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.15)',
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.black,
  },
  addList: {
    maxHeight: rem(240),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    borderRadius: rem(12),
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(10),
    paddingVertical: rem(10),
    gap: rem(10),
  },
  addRight: {
    minWidth: rem(44),
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addRightText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.primary.violet,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
    paddingVertical: rem(10),
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.gray,
  },
  saveBtn: {
    marginTop: rem(6),
    backgroundColor: colors.primary.violet,
    borderRadius: rem(12),
    paddingVertical: rem(12),
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: fp(13),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
});


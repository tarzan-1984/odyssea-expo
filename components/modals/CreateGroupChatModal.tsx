import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { chatApi, UsersResponse } from '@/app-api/chatApi';
import { useOnlineStatusContext } from '@/context/OnlineStatusContext';
import { useAuth } from '@/context/AuthContext';
import { secureStorage } from '@/utils/secureStorage';
import type { FileData } from '@/utils/chatAttachmentHelpers';
import { uploadImageViaPresign } from '@/app-api/upload';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryAccessForPicker } from '@/utils/mediaLibraryPickerAccess';

// Role filter options (mirrors ContactsModal)
const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'DRIVER_UPDATES', label: 'Driver Updates' },
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
  { value: 'NIGHTSHIFT_TRACKING', label: 'Nightshift Tracking' },
  { value: 'DISPATCHER', label: 'Dispatcher' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'RECRUITER_TL', label: 'Recruiter Team Leader' },
  { value: 'HR_MANAGER', label: 'HR Manager' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'EXPEDITE_MANAGER', label: 'Expedite Manager' },
  { value: 'TRACKING_TL', label: 'Tracking Team Leader' },
  { value: 'DISPATCHER_TL', label: 'Dispatcher Team Leader' },
  { value: 'TRACKING', label: 'Tracking' },
  { value: 'SUBSCRIBER', label: 'Subscriber' },
];

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profilePhoto?: string;
  email?: string;
  role?: string;
}

interface CreateGroupChatModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateGroupChatModal({ visible, onClose, onCreated }: CreateGroupChatModalProps) {
  const { isUserOnline } = useOnlineStatusContext();
  const { authState } = useAuth();

  const [roomName, setRoomName] = useState('');
  const [selectedUsersMap, setSelectedUsersMap] = useState<Record<string, UserItem>>({});
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [isRoleModalVisible, setIsRoleModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);

  const [pickedAvatar, setPickedAvatar] = useState<FileData | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user is DRIVER with expired_documents status (mirrors ContactsModal)
  const isDriverWithExpiredDocuments = useMemo(() => {
    const userRole = authState.user?.role;
    return userRole === 'DRIVER' && driverStatus === 'expired_documents';
  }, [authState.user?.role, driverStatus]);

  // Allowed roles for drivers with expired documents (mirrors ContactsModal)
  const allowedRolesForExpiredDocuments = ['RECRUITER', 'RECRUITER_TL', 'ADMINISTRATOR', 'EXPEDITE_MANAGER'];

  const dedupeById = (list: UserItem[]): UserItem[] => {
    const seen = new Set<string>();
    const result: UserItem[] = [];
    for (const u of list) {
      if (u?.id && !seen.has(u.id)) {
        seen.add(u.id);
        result.push(u);
      }
    }
    return result;
  };

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load driver status from AsyncStorage (mirrors ContactsModal)
  useEffect(() => {
    const loadDriverStatus = async () => {
      try {
        const status = await AsyncStorage.getItem('@user_status');
        setDriverStatus(status);
      } catch (e) {
        console.warn('[CreateGroupChatModal] Failed to load driver status:', e);
      }
    };
    if (visible && authState.user?.role === 'DRIVER') {
      loadDriverStatus();
    }
  }, [visible, authState.user?.role]);

  // Backend search seems to work best with a single token.
  // For multi-word queries (e.g. "first last"), use the first token for API and filter locally by all tokens.
  const apiSearch = useMemo(() => {
    const q = (debouncedSearch || '').trim();
    if (!q) return undefined;
    const firstToken = q.split(/\s+/).filter(Boolean)[0];
    return firstToken || undefined;
  }, [debouncedSearch]);

  const selectedIds = useMemo(() => Object.keys(selectedUsersMap), [selectedUsersMap]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const base = users;
    if (tokens.length === 0) return base;
    return base.filter((u) => {
      const haystack = `${u.firstName || ''} ${u.lastName || ''} ${(u.email || '')}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [users, search]);

  const resetState = () => {
    setRoomName('');
    setSelectedUsersMap({});
    setUsers([]);
    setIsLoadingUsers(false);
    setIsLoadingMore(false);
    setError(null);
    setSearch('');
    setDebouncedSearch('');
    setSelectedRole('');
    setIsRoleModalVisible(false);
    setPage(1);
    setHasNextPage(true);
    setDriverStatus(null);
    setPickedAvatar(null);
    setIsUploadingAvatar(false);
    setIsSubmitting(false);
  };

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Load users when opens / search changes
  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      setIsLoadingUsers(true);
      setError(null);
      try {
        // If driver with expired documents, filter by allowed roles on API level
        const rolesParam = isDriverWithExpiredDocuments
          ? allowedRolesForExpiredDocuments
          : (selectedRole || undefined);

        const res: UsersResponse = await chatApi.getUsers({
          page: 1,
          limit: 10,
          search: apiSearch,
          roles: rolesParam,
          contactsOnly: true,
        });
        const currentUserId = authState.user?.id;
        const list = (res.users || []).filter((u: any) => u?.id && u.id !== currentUserId) as UserItem[];
        setUsers(dedupeById(list));
        setPage(res.pagination?.current_page || 1);
        setHasNextPage(!!res.pagination?.has_next_page);
      } catch (e) {
        setError('Failed to load contacts');
      } finally {
        setIsLoadingUsers(false);
      }
    };
    load();
  }, [visible, apiSearch, authState.user?.id, selectedRole, isDriverWithExpiredDocuments]);

  const loadMore = async () => {
    if (!hasNextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const next = page + 1;
      // If driver with expired documents, filter by allowed roles on API level
      const rolesParam = isDriverWithExpiredDocuments
        ? allowedRolesForExpiredDocuments
        : (selectedRole || undefined);
      const res: UsersResponse = await chatApi.getUsers({
        page: next,
        limit: 10,
        search: apiSearch,
        roles: rolesParam,
        contactsOnly: true,
      });
      const currentUserId = authState.user?.id;
      const list = (res.users || []).filter((u: any) => u?.id && u.id !== currentUserId) as UserItem[];
      setUsers((prev) => dedupeById([...(prev || []), ...(list || [])]));
      setPage(res.pagination?.current_page || next);
      setHasNextPage(!!res.pagination?.has_next_page);
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleUser = (user: UserItem) => {
    setSelectedUsersMap((prev) => {
      const exists = !!prev[user.id];
      if (exists) {
        const copy = { ...prev };
        delete copy[user.id];
        return copy;
      }
      return { ...prev, [user.id]: user };
    });
  };

  const handleContactsScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e?.nativeEvent || {};
    if (!contentOffset || !contentSize || !layoutMeasurement) return;
    const paddingToBottom = 24;
    const isNearBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
    if (isNearBottom) {
      void loadMore();
    }
  };

  const handlePickAvatar = async () => {
    try {
      const hasAccess = await ensureMediaLibraryAccessForPicker();
      if (!hasAccess) {
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

      const filename = asset.fileName || asset.filename || `avatar_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      const f: FileData = {
        uri: asset.uri,
        name: filename,
        mimeType,
        size: asset.fileSize || undefined,
      };
      setPickedAvatar(f);
    } catch (e) {
      console.error('[CreateGroupChatModal] Failed to pick avatar:', e);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    // For GROUP, backend requires at least 2 participants (including creator).
    // Since backend will auto-add creator, we need at least 1 selected user.
    if (selectedIds.length === 0) {
      setError('At least one participant is required');
      return;
    }

    setIsSubmitting(true);
    try {
      let avatarUrl: string | undefined;
      if (pickedAvatar) {
        setIsUploadingAvatar(true);
        const accessToken = await secureStorage.getItemAsync('accessToken');
        if (!accessToken) {
          throw new Error('No access token');
        }
        avatarUrl = await uploadImageViaPresign({
          fileUri: pickedAvatar.uri,
          filename: pickedAvatar.name,
          mimeType: pickedAvatar.mimeType || 'image/jpeg',
          accessToken,
        });
        setIsUploadingAvatar(false);
      }

      await chatApi.createChatRoom({
        name: roomName.trim(),
        type: 'GROUP',
        participantIds: selectedIds,
        avatar: avatarUrl,
      });

      onClose();
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create chat room');
    } finally {
      setIsSubmitting(false);
      setIsUploadingAvatar(false);
    }
  };

  const renderItem = ({ item }: { item: UserItem }) => {
    const name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email || 'Unknown';
    const avatarUri = item.avatar || item.profilePhoto;
    const initials = (item.firstName?.[0] || '') + (item.lastName?.[0] || '');
    const online = isUserOnline(item.id);
    const selected = !!selectedUsersMap[item.id];

    return (
      <TouchableOpacity style={[styles.userItem, selected && styles.userItemSelected]} activeOpacity={0.8} onPress={() => toggleUser(item)}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.userAvatar} />
          ) : (
            <View style={styles.userAvatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials.toUpperCase()}</Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{name}</Text>
          {!!item.role && (
            <Text style={styles.userRole} numberOfLines={1}>
              {item.role.toLowerCase().replace('_', ' ')}
            </Text>
          )}
        </View>

        <View style={[styles.check, selected && styles.checkSelected]} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Group Chat</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={isSubmitting || isUploadingAvatar}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.bodyContent}>
              {error ? (
                <View style={styles.errorWrap}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Room name */}
              <Text style={styles.sectionLabel}>Room Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter group name"
                placeholderTextColor={colors.neutral.darkGrey}
                value={roomName}
                onChangeText={(t) => {
                  setRoomName(t);
                  if (error) setError(null);
                }}
                editable={!isSubmitting}
              />

              {/* Avatar */}
              <Text style={[styles.sectionLabel, { marginTop: rem(14) }]}>Avatar (optional)</Text>
              <View style={styles.avatarRow}>
                <View style={styles.chatAvatar}>
                  {pickedAvatar?.uri ? (
                    <Image source={{ uri: pickedAvatar.uri }} style={styles.chatAvatarImg} />
                  ) : (
                    <View style={styles.chatAvatarPlaceholder} />
                  )}
                  {isUploadingAvatar && (
                    <View style={styles.chatAvatarOverlay}>
                      <ActivityIndicator size="small" color={colors.neutral.white} />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.pickAvatarBtn}
                  onPress={handlePickAvatar}
                  disabled={isSubmitting || isUploadingAvatar}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pickAvatarText}>{pickedAvatar ? 'Change photo' : 'Upload photo'}</Text>
                </TouchableOpacity>
              </View>

              {/* Participants */}
              <Text style={[styles.sectionLabel, { marginTop: rem(16) }]}>Participants *</Text>

              {selectedIds.length > 0 && (
                <View style={styles.chipsWrap}>
                  {selectedIds.map((id) => {
                    const u = selectedUsersMap[id];
                    const chipName = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || 'User';
                    return (
                      <View key={id} style={styles.chip}>
                        <Text style={styles.chipText} numberOfLines={1}>{chipName}</Text>
                        <TouchableOpacity
                          onPress={() => toggleUser(u)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.chipRemove}>×</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts..."
                placeholderTextColor={colors.neutral.darkGrey}
                value={search}
                onChangeText={setSearch}
                editable={!isSubmitting}
              />

              {/* Role Filter Select - Hidden for drivers with expired documents */}
              {!isDriverWithExpiredDocuments && (
                <View style={styles.roleFilterContainer}>
                  <TouchableOpacity
                    style={styles.roleSelectButton}
                    onPress={() => setIsRoleModalVisible(true)}
                    activeOpacity={0.8}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.roleSelectText}>
                      {selectedRole ? ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label || selectedRole : 'All Roles'}
                    </Text>
                    <Text style={styles.roleSelectArrow}>▼</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Role Selection Modal */}
            <Modal
              visible={isRoleModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setIsRoleModalVisible(false)}
            >
              <TouchableOpacity
                style={styles.roleModalOverlay}
                activeOpacity={1}
                onPress={() => setIsRoleModalVisible(false)}
              >
                <View style={styles.roleModalContent} onStartShouldSetResponder={() => true}>
                  <Text style={styles.roleModalTitle}>Select Role</Text>
                  <ScrollView style={styles.roleModalScroll} showsVerticalScrollIndicator={false}>
                    {ROLE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.roleOptionItem,
                          selectedRole === option.value && styles.roleOptionItemActive,
                        ]}
                        onPress={() => {
                          setSelectedRole(option.value);
                          setIsRoleModalVisible(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.roleOptionText,
                            selectedRole === option.value && styles.roleOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.roleModalCancelButton}
                    onPress={() => setIsRoleModalVisible(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.roleModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>

            {/* Contacts list (fixed height ~ 4 rows) */}
            <View style={styles.contactsListWrap}>
              {isLoadingUsers ? (
                <View style={styles.loaderWrap}>
                  <ActivityIndicator size="large" color={colors.primary.violet} />
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  scrollEventThrottle={16}
                  onScroll={handleContactsScroll}
                  contentContainerStyle={filteredUsers.length === 0 ? styles.contactsEmptyContainer : undefined}
                >
                  {filteredUsers.length === 0 ? (
                    <View style={styles.emptyWrap}>
                      <Text style={styles.emptyText}>No users found</Text>
                    </View>
                  ) : (
                    filteredUsers.map((u, idx) => (
                      <View key={`user-${u.id}`}>
                        {renderItem({ item: u })}
                        {idx !== filteredUsers.length - 1 && <View style={styles.separator} />}
                      </View>
                    ))
                  )}

                  {isLoadingMore ? (
                    <View style={styles.loaderMoreWrap}>
                      <ActivityIndicator size="small" color={colors.primary.violet} />
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>

            <View style={styles.actionsWrap}>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={onClose}
                  disabled={isSubmitting || isUploadingAvatar}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.createBtn, (isSubmitting || isUploadingAvatar) && styles.createBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={isSubmitting || isUploadingAvatar}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={colors.neutral.white} />
                  ) : (
                    <Text style={styles.createText}>Create Group</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(16),
  },
  container: {
    width: '100%',
    maxHeight: '92%',
    alignSelf: 'stretch',
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg || 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    backgroundColor: colors.primary.violet,
  },
  title: {
    color: colors.neutral.white,
    fontFamily: fonts['700'],
    fontSize: fp(20),
  },
  closeBtn: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.sm || 8,
  },
  closeText: {
    color: colors.neutral.white,
    fontFamily: fonts['600'],
    fontSize: fp(12),
  },
  // Do not force full height: let modal shrink to content, but cap by maxHeight.
  body: { flexGrow: 0, flexShrink: 1, backgroundColor: colors.neutral.white },
  bodyScrollContent: { paddingBottom: rem(16) },
  bodyContent: { padding: rem(16) },
  errorWrap: {
    padding: rem(10),
    borderRadius: borderRadius.sm || 8,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.35)',
    marginBottom: rem(12),
  },
  errorText: { color: colors.semantic.error, fontFamily: fonts['600'], fontSize: fp(13) },
  sectionLabel: {
    fontFamily: fonts['600'],
    fontSize: fp(13),
    color: colors.neutral.black,
    marginBottom: rem(8),
  },
  input: {
    height: rem(42),
    borderRadius: rem(12),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    paddingHorizontal: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.25)',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12) as any,
  },
  chatAvatar: {
    width: rem(48),
    height: rem(48),
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    backgroundColor: colors.neutral.veryLightGrey,
  },
  chatAvatarImg: { width: '100%', height: '100%' },
  chatAvatarPlaceholder: { width: '100%', height: '100%' },
  chatAvatarOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pickAvatarBtn: {
    paddingHorizontal: rem(14),
    paddingVertical: rem(10),
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary.violet,
  },
  pickAvatarText: {
    color: colors.neutral.white,
    fontFamily: fonts['600'],
    fontSize: fp(14),
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8) as any,
    marginBottom: rem(10),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.18)',
  },
  chipText: { fontFamily: fonts['500'], fontSize: fp(12), color: colors.primary.blue, marginRight: rem(8) },
  chipRemove: { fontFamily: fonts['700'], fontSize: fp(16), color: colors.primary.blue, marginTop: -1 },
  searchInput: {
    height: rem(40),
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    paddingHorizontal: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.25)',
    marginBottom: rem(10),
  },
  roleFilterContainer: {
    paddingTop: rem(6),
  },
  roleSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: rem(36),
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    paddingHorizontal: rem(12),
    borderWidth: 1,
    borderColor: colors.primary.blue,
  },
  roleSelectText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    flex: 1,
  },
  roleSelectArrow: {
    fontSize: fp(10),
    color: colors.primary.blue,
    marginLeft: rem(8),
  },
  roleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleModalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
    padding: rem(20),
    width: '80%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  roleModalTitle: {
    fontSize: fp(20),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(20),
    textAlign: 'center',
  },
  roleModalScroll: {
    maxHeight: rem(300),
  },
  roleOptionItem: {
    paddingVertical: rem(15),
    paddingHorizontal: rem(20),
    borderRadius: 12,
    marginBottom: rem(10),
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  roleOptionItemActive: {
    backgroundColor: colors.primary.blue,
    borderColor: colors.primary.blue,
  },
  roleOptionText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
  },
  roleOptionTextActive: {
    color: colors.neutral.white,
  },
  roleModalCancelButton: {
    marginTop: rem(10),
    paddingVertical: rem(15),
    paddingHorizontal: rem(20),
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
  },
  roleModalCancelText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  loaderWrap: { padding: rem(20), alignItems: 'center' },
  loaderMoreWrap: { padding: rem(12), alignItems: 'center' },
  emptyWrap: { padding: rem(16), alignItems: 'center' },
  emptyText: { fontFamily: fonts['500'], fontSize: fp(14), color: colors.neutral.darkGrey },
  separator: { height: 1, backgroundColor: colors.neutral.veryLightGrey },
  contactsListWrap: {
    marginHorizontal: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.veryLightGrey,
    borderRadius: rem(14),
    overflow: 'hidden',
    maxHeight: rem(200), // ~3 contact rows visible
    backgroundColor: colors.neutral.white,
  },
  contactsEmptyContainer: {
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(14),
    paddingVertical: rem(10),
    backgroundColor: colors.neutral.white,
  },
  userItemSelected: {
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
  },
  avatarWrap: { position: 'relative' },
  userAvatar: { width: rem(42), height: rem(42), borderRadius: borderRadius.full, backgroundColor: colors.neutral.lightGrey },
  userAvatarPlaceholder: {
    width: rem(42),
    height: rem(42),
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { color: colors.neutral.black, fontFamily: fonts['700'], fontSize: fp(13) },
  onlineIndicator: {
    position: 'absolute',
    right: rem(0),
    bottom: rem(0),
    width: rem(10),
    height: rem(10),
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.success,
    borderWidth: 2,
    borderColor: colors.neutral.white,
  },
  userInfo: { marginLeft: rem(12), flex: 1 },
  userName: { fontFamily: fonts['600'], fontSize: fp(14), color: colors.neutral.black },
  userRole: { fontFamily: fonts['400'], fontSize: fp(12), color: colors.neutral.darkGrey, marginTop: 2 },
  check: {
    width: rem(16),
    height: rem(16),
    borderRadius: rem(16),
    borderWidth: 2,
    borderColor: 'rgba(96, 102, 197, 0.35)',
  },
  checkSelected: {
    backgroundColor: colors.primary.violet,
    borderColor: colors.primary.violet,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: rem(12) as any,
    marginTop: rem(16),
  },
  actionsWrap: {
    paddingHorizontal: rem(16),
    paddingBottom: rem(16),
  },
  actionBtn: {
    flex: 1,
    paddingVertical: rem(12),
    borderRadius: rem(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.25)',
  },
  cancelText: { fontFamily: fonts['700'], fontSize: fp(14), color: colors.primary.blue },
  createBtn: { backgroundColor: colors.primary.violet },
  createBtnDisabled: { opacity: 0.8 },
  createText: { fontFamily: fonts['700'], fontSize: fp(14), color: colors.neutral.white },
});


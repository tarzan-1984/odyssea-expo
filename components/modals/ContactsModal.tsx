import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Image } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { chatApi, UsersResponse } from '@/app-api/chatApi';
import { useOnlineStatusContext } from '@/context/OnlineStatusContext';
import { useAuth } from '@/context/AuthContext';
import { useChatRooms } from '@/hooks/useChatRooms';

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profilePhoto?: string;
  email?: string;
  role?: string;
}

interface ContactsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (user: UserItem) => void;
}

export default function ContactsModal({ visible, onClose, onSelectUser }: ContactsModalProps) {
  const { isUserOnline } = useOnlineStatusContext();
  const { chatRooms } = useChatRooms();
  const { authState } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Helper: deduplicate users by id while preserving order
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

  // Reset state when modal closes to ensure clean slate on next open
  useEffect(() => {
    if (!visible) {
      setSearch('');
      setDebouncedSearch('');
      setUsers([]);
      setPage(1);
      setHasNextPage(true);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res: UsersResponse = await chatApi.getUsers({ page: 1, limit: 10, search: debouncedSearch || undefined });
        setUsers(dedupeById(res.users || []));
        setPage(res.pagination?.current_page || 1);
        setHasNextPage(!!res.pagination?.has_next_page);
      } catch (e) {
        setError('Failed to load contacts');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [visible, debouncedSearch]);

  const loadMore = async () => {
    if (!hasNextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const next = page + 1;
      const res: UsersResponse = await chatApi.getUsers({ page: next, limit: 10, search: debouncedSearch || undefined });
      setUsers(prev => dedupeById([...(prev || []), ...((res.users as UserItem[]) || [])]));
      setPage(res.pagination?.current_page || next);
      setHasNextPage(!!res.pagination?.has_next_page);
    } catch (e) {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Build a set of userIds that already have a DIRECT chat with current user
    const directUserIds = new Set<string>();
    chatRooms.forEach(room => {
      if (room.type === 'DIRECT' && room.participants?.length === 2) {
        const other = room.participants.find(p => p.userId !== authState.user?.id)?.user?.id;
        if (other) directUserIds.add(other);
      }
    });
    const base = users.filter(u => !directUserIds.has(u.id));
    if (!q) return base;
    return base.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }, [users, search, chatRooms]);

  // Handlers to clear search on close/select
  const handleClose = () => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setHasNextPage(true);
    onClose();
  };

  const handleSelect = (user: UserItem) => {
    setSearch('');
    setDebouncedSearch('');
    onSelectUser(user);
  };

  const renderItem = ({ item }: { item: UserItem }) => {
    const name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown';
    const avatarUri = item.avatar || item.profilePhoto;
    const initials = (item.firstName?.[0] || '') + (item.lastName?.[0] || '');
    const online = isUserOnline(item.id);
    return (
      <TouchableOpacity style={styles.userItem} activeOpacity={0.8} onPress={() => handleSelect(item)}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials.toUpperCase()}</Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{name}</Text>
          {!!item.email && <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Contacts</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              placeholderTextColor={colors.neutral.darkGrey}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {isLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary.violet} />
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item, index) => `contact-${item.id}-${index}`}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onEndReachedThreshold={0.6}
              onEndReached={loadMore}
              ListFooterComponent={isLoadingMore ? (
                <View style={styles.loaderMoreWrap}><ActivityIndicator size="small" color={colors.primary.violet} /></View>
              ) : null}
            />
          )}
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
    maxHeight: '80%',
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
    fontSize: fp(16),
  },
  closeBtn: {
    paddingHorizontal: rem(8),
    paddingVertical: rem(6),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.sm || 8,
  },
  closeText: {
    color: colors.neutral.white,
    fontFamily: fonts['600'],
    fontSize: fp(12),
  },
  searchBox: {
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.veryLightGrey,
  },
  searchInput: {
    height: rem(36),
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    paddingHorizontal: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    // Vertical centering for Android
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false as any,
    lineHeight: fp(16),
  },
  loaderWrap: { padding: rem(20), alignItems: 'center' },
  loaderMoreWrap: { padding: rem(12), alignItems: 'center' },
  errorWrap: { padding: rem(20), alignItems: 'center' },
  errorText: { color: colors.semantic.error, fontFamily: fonts['600'] },
  listContent: { paddingVertical: rem(8) },
  separator: { height: 1, backgroundColor: colors.neutral.veryLightGrey },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(16),
    paddingVertical: rem(10),
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: rem(44),
    height: rem(44),
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.lightGrey,
  },
  avatarPlaceholder: {
    width: rem(44),
    height: rem(44),
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.lightGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: colors.neutral.black,
    fontFamily: fonts['700'],
    fontSize: fp(14),
  },
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
  userEmail: { fontFamily: fonts['400'], fontSize: fp(12), color: colors.neutral.darkGrey },
});

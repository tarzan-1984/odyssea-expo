import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from 'expo-router';
import BottomNavigation from "../../components/navigation/BottomNavigation";
import Svg, { Path } from 'react-native-svg';
import { useChatRooms } from '@/hooks/useChatRooms';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { useOnlineStatusContext } from '@/context/OnlineStatusContext';
import ChatListItem, { ChatRoom } from '@/components/ChatListItem';
import ContactsModal from '@/components/modals/ContactsModal';
import { chatApi } from '@/app-api/chatApi';

type FilterType = 'all' | 'muted' | 'unread' | 'favorite';

interface FilterOption {
  value: FilterType;
  label: string;
}

const filterOptions: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'muted', label: 'Muted' },
  { value: 'unread', label: 'Unread' },
  { value: 'favorite', label: 'Favorite' },
];

/**
 * MessagesScreen - Messages screen of the application
 * Displays list of chat rooms with search and filter functionality
 */
export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState } = useAuth();
  const { isConnected } = useWebSocket();
  const { isUserOnline } = useOnlineStatusContext();
  const { chatRooms, isLoading, error, loadChatRooms, updateChatRoom } = useChatRooms();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  // Function to close all dropdowns
  const closeAllDropdowns = () => {
    setOpenDropdownId(null);
  };

  // Debounce search query (similar to Next.js implementation)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getCurrentFilterLabel = () => {
    return filterOptions.find(option => option.value === selectedFilter)?.label || 'All';
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
    setIsFilterDropdownOpen(false);
  };

  // Determine if all chats are muted (mirrors Next.js logic)
  const allChatsMuted = useMemo(() => {
    return chatRooms.length > 0 && chatRooms.every(room => room.isMuted);
  }, [chatRooms]);

  // Smart mute/unmute function (mirrors Next.js handleSmartMuteToggle)
  const handleSmartMuteToggle = async () => {
    if (allChatsMuted) {
      // All chats are muted, so unmute all
      await handleUnmuteAll();
    } else {
      // Some or no chats are muted, so mute all
      await handleMuteAll();
    }
  };

  // Mute all unmuted chats (mirrors Next.js handleMuteAll)
  const handleMuteAll = async () => {
    try {
      // Get all unmuted chat room IDs
      const unmutedChatRoomIds = chatRooms
        .filter(room => !room.isMuted)
        .map(room => room.id);

      if (unmutedChatRoomIds.length === 0) {
        return;
      }

      // Call the API with specific chat room IDs and mute action
      const result = await chatApi.muteChatRooms(unmutedChatRoomIds, 'mute');

      // Update the store with the muted status for all affected chat rooms
      result.chatRoomIds.forEach(chatRoomId => {
        updateChatRoom(chatRoomId, { isMuted: true });
      });

      // Refresh chat list to update UI
      await loadChatRooms();
    } catch (error) {
      console.error('Failed to mute all chats:', error);
    }
  };

  // Unmute all muted chats (mirrors Next.js handleUnmuteAll)
  const handleUnmuteAll = async () => {
    try {
      // Get all muted chat room IDs
      const mutedChatRoomIds = chatRooms
        .filter(room => room.isMuted)
        .map(room => room.id);

      if (mutedChatRoomIds.length === 0) {
        return;
      }

      // Call the API with specific chat room IDs and unmute action
      const result = await chatApi.muteChatRooms(mutedChatRoomIds, 'unmute');

      // Update the store with the unmuted status for all affected chat rooms
      result.chatRoomIds.forEach(chatRoomId => {
        updateChatRoom(chatRoomId, { isMuted: false });
      });

      // Refresh chat list to update UI
      await loadChatRooms();
    } catch (error) {
      console.error('Failed to unmute all chats:', error);
    }
  };

  // Get display name for chat room (for search filtering)
  // Mirrors Next.js ChatList.getChatDisplayName logic
  const getChatDisplayName = (chatRoom: ChatRoom): string => {
    // For DIRECT chats, always show the other participant's name first
    if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
      const otherParticipant = chatRoom.participants.find(
        p => p.user.id !== authState.user?.id
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

  // Filter chat rooms based on search query and selected filter
  // Mirrors Next.js ChatList.filteredChatRooms logic
  const filteredChatRooms = useMemo(() => {
    return chatRooms.filter(chatRoom => {
      // Apply search filter - search by display name and also by individual name parts
      const searchQueryLower = debouncedSearchQuery.trim().toLowerCase();
      let matchesSearch = !searchQueryLower;
      
      if (searchQueryLower) {
        const displayName = getChatDisplayName(chatRoom).toLowerCase();
        matchesSearch = displayName.includes(searchQueryLower);
        
        // For DIRECT chats, also search by firstName and lastName separately
        if (!matchesSearch && chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
          const otherParticipant = chatRoom.participants.find(
            p => p.user.id !== authState.user?.id
          );
          if (otherParticipant) {
            const firstName = otherParticipant.user.firstName?.toLowerCase() || '';
            const lastName = otherParticipant.user.lastName?.toLowerCase() || '';
            matchesSearch = firstName.includes(searchQueryLower) || lastName.includes(searchQueryLower);
          }
        }
      }

      // Apply selected filter
      let matchesFilter = true;
      switch (selectedFilter) {
        case 'muted':
          matchesFilter = chatRoom.isMuted === true;
          break;
        case 'unread':
          matchesFilter = (chatRoom.unreadCount ?? 0) > 0;
          break;
        case 'favorite':
          matchesFilter = chatRoom.isPinned === true;
          break;
        case 'all':
        default:
          matchesFilter = true;
          break;
      }

      return matchesSearch && matchesFilter;
    });
  }, [chatRooms, debouncedSearchQuery, selectedFilter, authState.user?.id]);

  const handleChatPress = (chatRoom: ChatRoom) => {
    setSelectedChatId(chatRoom.id);
    // Navigate to chat detail screen with chatRoomId
    router.push(`/chat/${chatRoom.id}` as any);
  };

  // Close dropdown when clicking outside (simplified for mobile)
  React.useEffect(() => {
    if (isFilterDropdownOpen) {
      // Auto-close after a delay or when filter changes
      const timer = setTimeout(() => {
        setIsFilterDropdownOpen(false);
      }, 5000); // Auto-close after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [isFilterDropdownOpen]);

  return (
    <View style={[styles.screenWrap, { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          {/* Header with time and profile */}
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.screenTitle}>Conversation</Text>
              <View style={styles.statusContainer}>
                <Text style={[
                  styles.statusText,
                  isConnected ? styles.statusOnline : styles.statusOffline
                ]}>
                  {isConnected ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.contactsButton} onPress={() => setIsContactsOpen(true)}>
              <Text style={styles.contactsButtonText}>Contacts</Text>
            </TouchableOpacity>
          </View>
          
          {/* Search and Filter Section */}
          <View style={styles.searchFilterSection}>
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <View style={styles.searchIconContainer}>
                <SearchIcon />
              </View>
              
              <TextInput
                style={styles.searchInput}
                placeholder="Search chats"
                placeholderTextColor={colors.neutral.darkGrey}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setSearchQuery('')}
                  activeOpacity={0.7}
                >
                  <ClearIcon />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Mute All Button */}
            <TouchableOpacity
              style={styles.muteAllButton}
              onPress={handleSmartMuteToggle}
              activeOpacity={0.7}
            >
              <Text style={styles.muteAllButtonText}>
                {allChatsMuted ? 'Unmute all' : 'Mute all'}
              </Text>
            </TouchableOpacity>
            
            {/* Filter Dropdown */}
            <View style={styles.filterContainer}>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                activeOpacity={0.7}
              >
                <Text style={styles.filterButtonText}>{getCurrentFilterLabel()}</Text>
                <View style={[styles.arrowIcon, isFilterDropdownOpen && styles.arrowIconRotated]}>
                  <ArrowDownIcon />
                </View>
              </TouchableOpacity>
              
              {/* Dropdown Menu */}
              {isFilterDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  {filterOptions.map((option, index) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownItem,
                        selectedFilter === option.value && styles.dropdownItemSelected,
                        index === filterOptions.length - 1 && styles.dropdownItemLast,
                      ]}
                      onPress={() => handleFilterSelect(option.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedFilter === option.value && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
          
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => {
              // Close any open dropdowns when scrolling starts
              // This is handled by the ChatListItem component itself
            }}
          >
            {isLoading && chatRooms.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary.violet} />
                <Text style={styles.loadingText}>Loading chats...</Text>
              </View>
            ) : error && chatRooms.length === 0 ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => { void loadChatRooms(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : filteredChatRooms.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {debouncedSearchQuery.trim() ? 'No chats found' : 'No chats yet'}
                </Text>
                {debouncedSearchQuery.trim() && (
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                )}
              </View>
            ) : (
                  <View style={styles.chatList}>
                    {filteredChatRooms.map((chatRoom) => {
                      // Determine online status for DIRECT chats
                      let userStatus: 'online' | 'offline' = 'offline';
                      if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
                        const otherParticipant = chatRoom.participants.find(
                          p => p.user.id !== authState.user?.id
                        );
                        if (otherParticipant && isUserOnline(otherParticipant.user.id)) {
                          userStatus = 'online';
                        }
                      }
                      
                      return (
                        <ChatListItem
                          key={chatRoom.id}
                          chatRoom={chatRoom}
                          isSelected={selectedChatId === chatRoom.id}
                          status={userStatus}
                          onPress={handleChatPress}
                          currentUserId={authState.user?.id}
                          onChatRoomUpdate={updateChatRoom}
                          isDropdownOpen={openDropdownId === chatRoom.id}
                          onDropdownToggle={(isOpen, chatId) => {
                            if (isOpen) {
                              // Simply set the new dropdown ID - React will close the old Modal automatically
                              setOpenDropdownId(chatId);
                            } else {
                              setOpenDropdownId(null);
                            }
                          }}
                          onCloseAllDropdowns={closeAllDropdowns}
                        />
                      );
                    })}
                  </View>
                )}
          </ScrollView>
        </View>
        
        {/* Bottom Navigation */}
        <BottomNavigation />
        
        {/* Contacts Modal */}
        <ContactsModal
          visible={isContactsOpen}
          onClose={() => setIsContactsOpen(false)}
          onSelectUser={async (user) => {
            try {
              // If a DIRECT chat with this user already exists, open it instead of creating
              const existing = chatRooms.find(room => 
                room.type === 'DIRECT' &&
                room.participants?.length === 2 &&
                room.participants.some(p => p.userId === user.id)
              );
              if (existing) {
                router.push(`/chat/${existing.id}` as any);
                setIsContactsOpen(false);
                return;
              }
              // Otherwise create DIRECT chat
              const participantIds = [authState.user?.id, user.id].filter(Boolean) as string[];
              await (await import('@/app-api/chatApi')).chatApi.createChatRoom({
                type: 'DIRECT',
                participantIds,
              });
              await loadChatRooms(true);
              setIsContactsOpen(false);
            } catch (e) {
              console.error('Failed to create direct chat:', e);
            }
          }}
        />
      </View>
    </View>
  );
}

// Search Icon Component
const SearchIcon = ({ color = '#8E8E93' }: { color?: string }) => (
  <Svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.04199 9.37381C3.04199 5.87712 5.87735 3.04218 9.37533 3.04218C12.8733 3.04218 15.7087 5.87712 15.7087 9.37381C15.7087 12.8705 12.8733 15.7055 9.37533 15.7055C5.87735 15.7055 3.04199 12.8705 3.04199 9.37381ZM9.37533 1.54218C5.04926 1.54218 1.54199 5.04835 1.54199 9.37381C1.54199 13.6993 5.04926 17.2055 9.37533 17.2055C11.2676 17.2055 13.0032 16.5346 14.3572 15.4178L17.1773 18.2381C17.4702 18.531 17.945 18.5311 18.2379 18.2382C18.5308 17.9453 18.5309 17.4704 18.238 17.1775L15.4182 14.3575C16.5367 13.0035 17.2087 11.2671 17.2087 9.37381C17.2087 5.04835 13.7014 1.54218 9.37533 1.54218Z"
      fill={color}
    />
  </Svg>
);

// Clear Icon Component
const ClearIcon = ({ color = '#8E8E93' }: { color?: string }) => (
  <Svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      fill={color}
    />
  </Svg>
);

// Arrow Down Icon Component
const ArrowDownIcon = ({ color = '#8E8E93' }: { color?: string }) => (
  <Svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <Path
      d="M19 9l-7 7-7-7"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    position: "relative"
  },
  chatList: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: rem(20),
    paddingHorizontal: rem(15),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
  },
  loadingText: {
    marginTop: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
    paddingHorizontal: rem(20),
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.semantic.error,
    textAlign: 'center',
    marginBottom: rem(16),
  },
  retryButton: {
    paddingHorizontal: rem(20),
    paddingVertical: rem(10),
    backgroundColor: colors.primary.violet,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
    paddingHorizontal: rem(20),
  },
  emptyText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
    marginBottom: rem(8),
  },
  emptySubtext: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  screenTitle: {
    color: colors.neutral.white,
    fontFamily: fonts["700"],
    fontSize: fp(16),
    textTransform: 'capitalize',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
    marginBottom: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
  },
  statusContainer: {
    marginLeft: rem(8),
  },
  statusText: {
    fontSize: fp(10),
    fontFamily: fonts['600'],
  },
  statusOnline: {
    color: colors.semantic.success,
  },
  statusOffline: {
    color: colors.semantic.error,
  },
  contactsButton: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: rem(100),
  },
  contactsButtonText: {
    color: colors.neutral.white,
    fontFamily: fonts['600'],
    fontSize: fp(12),
  },
  screenWrap: {
    flex: 1,
    position: "relative",
  },
  container: {
    flex: 1,
    position: 'relative',
    paddingBottom: 70,
    backgroundColor: 'rgba(247, 248, 255, 1)',
  },
  searchFilterSection: {
    paddingHorizontal: rem(15),
    marginBottom: rem(17),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: 'center',
    gap: rem(8),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    height: rem(35),
    paddingHorizontal: rem(12),
    flex: 1,
  },
  searchIconContainer: {
    marginRight: rem(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: fp(10),
    fontFamily: fonts["400"],
    color: colors.primary.blue,
    // Ensure vertical centering of text and placeholder on Android
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false as any,
    height: rem(35),
    lineHeight: rem(35),
  },
  clearButton: {
    marginLeft: rem(8),
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(4),
  },
  muteAllButton: {
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    height: rem(35),
    paddingHorizontal: rem(12),
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: rem(80),
  },
  muteAllButtonText: {
    fontSize: fp(10),
    fontFamily: fonts["500"],
    color: colors.primary.blue,
  },
  filterContainer: {
    position: 'relative',
    width: rem(100),
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 100,
    paddingHorizontal: rem(12),
    height: rem(35),
    width: '100%',
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
  },
  filterButtonText: {
    fontSize: fp(10),
    fontFamily: fonts["500"],
    color: colors.primary.blue,
  },
  arrowIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  dropdownMenu: {
    position: 'absolute',
    top: rem(50),
    left: 0,
    right: 0,
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.veryLightGrey,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemSelected: {
    backgroundColor: colors.primary.lightBlue + '20',
  },
  dropdownItemText: {
    fontSize: fp(12),
    fontFamily: fonts["400"],
    color: colors.neutral.black,
  },
  dropdownItemTextSelected: {
    fontFamily: fonts["600"],
    color: colors.primary.blue,
  },
});

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Keyboard, AppState, AppStateStatus, Modal, Pressable } from 'react-native';
import type { TextInput as RNTextInput } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from 'expo-router';
import BottomNavigation, { BOTTOM_NAV_SCROLL_PADDING } from '../../components/navigation/BottomNavigation';
import SearchIcon from '@/icons/SearchIcon';
import ClearIcon from '@/icons/ClearIcon';
import ArrowDownIcon from '@/icons/ArrowDownIcon';
import PinIcon from '@/icons/PinIcon';
import MuteIcon from '@/icons/MuteIcon';
import UnreadFilterIcon from '@/icons/UnreadFilterIcon';
import AllFilterIcon from '@/icons/AllFilterIcon';
import { useChatRooms } from '@/hooks/useChatRooms';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { useOnlineStatusContext } from '@/context/OnlineStatusContext';
import ChatListItem, { ChatRoom } from '@/components/ChatListItem';
import ContactsModal from '@/components/modals/ContactsModal';
import CreateGroupChatModal from '@/components/modals/CreateGroupChatModal';
import { chatApi } from '@/app-api/chatApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventBus } from '@/services/EventBus';
import { useChatStore } from '@/stores/chatStore';
import { chatCacheService } from '@/services/ChatCacheService';
import LoadChatsArchiveSection from '@/components/LoadChatsArchiveSection';
import { chatRoomMatchesSearchQuery } from '@/utils/chatSearch';

type FilterType = 'all' | 'muted' | 'unread' | 'favorite';

interface FilterOption {
  value: FilterType;
  label: string;
}

const filterOptions: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'muted', label: 'Muted' },
  { value: 'unread', label: 'Unread' },
  { value: 'favorite', label: 'Pinned' },
];

type MessagesTab = 'chats' | 'shipments' | 'offers';

function isRoomInMessagesTab(room: ChatRoom, tab: MessagesTab): boolean {
  if (tab === 'chats') return room.type !== 'LOAD' && room.type !== 'OFFER';
  if (tab === 'shipments') {
    return room.type === 'LOAD' && room.isLoadArchived !== true;
  }
  return room.type === 'OFFER';
}

/**
 * MessagesScreen - Messages screen of the application
 * Displays list of chat rooms with search and filter functionality
 */
export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState } = useAuth();
  const { isConnected, isDisplayOffline } = useWebSocket();
  const showConnectionOffline = isDisplayOffline || !isConnected;
  const { isUserOnline } = useOnlineStatusContext();
  const { chatRooms, isLoading, error, loadChatRooms, updateChatRoom } = useChatRooms();
  const activeTab = useChatStore((s) => s.messagesTab);
  const setActiveTab = useChatStore((s) => s.setMessagesTab);
  const mergeChatRooms = useChatStore((s) => s.mergeChatRooms);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [isCreatingDirectChat, setIsCreatingDirectChat] = useState(false);
  const [creatingDirectChatUserId, setCreatingDirectChatUserId] = useState<string | null>(null);
  const [isAddNewMenuOpen, setIsAddNewMenuOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const searchInputRef = React.useRef<RNTextInput | null>(null);
  const preventNextSearchFocusRef = React.useRef<boolean>(false);
  // Prevent infinite re-loading when the user has 0 chats.
  // When the list is empty, some hook dependencies can change and re-trigger focus effects,
  // causing "Loading chats..." <-> "No chats yet" flicker.
  const hasAttemptedInitialEmptyLoadRef = React.useRef<boolean>(false);
  
  // Load driver status from AsyncStorage
  const loadDriverStatus = React.useCallback(async () => {
    const userRole = authState.user?.role;
    if (userRole === 'DRIVER') {
      try {
        const status = await AsyncStorage.getItem('@user_status');
        setDriverStatus(status);
      } catch (error) {
        console.warn('[MessagesScreen] Failed to load driver status:', error);
      }
    } else {
      setDriverStatus(null);
    }
  }, [authState.user?.role]);

  React.useEffect(() => {
    loadDriverStatus();
  }, [loadDriverStatus]);

  const isExpiredDocumentsDriver =
    authState.user?.role === 'DRIVER' && driverStatus === 'expired_documents';

  // Force "Chats" tab for expired_documents drivers (shipments/group chats are restricted).
  React.useEffect(() => {
    if (!isExpiredDocumentsDriver) return;
    if (activeTab !== 'chats') {
      setActiveTab('chats');
    }
  }, [isExpiredDocumentsDriver, activeTab, setActiveTab]);

  // Safety: if driver becomes expired_documents while screen is open,
  // ensure "Add new" menu / group creation isn't left open.
  React.useEffect(() => {
    if (!isExpiredDocumentsDriver) return;
    setIsAddNewMenuOpen(false);
    setIsCreateGroupOpen(false);
  }, [isExpiredDocumentsDriver]);

  // Listen for driver status updates from WebSocket
  React.useEffect(() => {
    const handleDriverStatusUpdate = async (data: { driverStatus: string | null }) => {
      if (authState.user?.role === 'DRIVER') {
        setDriverStatus(data.driverStatus);
      }
    };

    const unsubscribe = eventBus.on('DRIVER_STATUS_UPDATED', handleDriverStatusUpdate);

    return () => {
      unsubscribe();
    };
  }, [authState.user?.role]);

  // Reload driver status when app returns from background
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const prevState = appStateRef.current;
      
      // Transition from inactive/background to active
      if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        if (authState.user?.role === 'DRIVER') {
          loadDriverStatus();
        }
      }
      
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [authState.user?.role, loadDriverStatus]);

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

  const visibleFilterOptions = useMemo(
    () =>
      activeTab === 'offers'
        ? filterOptions.filter((o) => o.value !== 'favorite')
        : filterOptions,
    [activeTab],
  );

  React.useEffect(() => {
    if (activeTab === 'offers' && selectedFilter === 'favorite') {
      setSelectedFilter('all');
    }
  }, [activeTab, selectedFilter]);

  const getCurrentFilterLabel = () => {
    return visibleFilterOptions.find((option) => option.value === selectedFilter)?.label || 'All';
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
    setIsFilterDropdownOpen(false);
  };

  // Determine if all chats are muted (mirrors Next.js logic)
  const allChatsMuted = useMemo(() => {
    const tabScopedRooms = chatRooms.filter((room) => isRoomInMessagesTab(room, activeTab));
    return tabScopedRooms.length > 0 && tabScopedRooms.every((room) => room.isMuted);
  }, [chatRooms, activeTab]);

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
        .filter((room) => isRoomInMessagesTab(room, activeTab))
        .filter(room => !room.isMuted)
        .map(room => room.id);

      if (unmutedChatRoomIds.length === 0) {
        return;
      }

      // Call the API with specific chat room IDs and mute action
      const result = await chatApi.muteChatRooms(unmutedChatRoomIds, 'mute');

      // Update the store with the muted status for all affected chat rooms
      await Promise.all(
        result.chatRoomIds.map((chatRoomId) =>
          updateChatRoom(chatRoomId, { isMuted: true }),
        ),
      );

      // Refresh chat list to update UI
      await loadChatRooms(true);
    } catch (error) {
      console.error('Failed to mute all chats:', error);
    }
  };

  // Unmute all muted chats (mirrors Next.js handleUnmuteAll)
  const handleUnmuteAll = async () => {
    try {
      // Get all muted chat room IDs
      const mutedChatRoomIds = chatRooms
        .filter((room) => isRoomInMessagesTab(room, activeTab))
        .filter(room => room.isMuted)
        .map(room => room.id);

      if (mutedChatRoomIds.length === 0) {
        return;
      }

      // Call the API with specific chat room IDs and unmute action
      const result = await chatApi.muteChatRooms(mutedChatRoomIds, 'unmute');

      // Update the store with the unmuted status for all affected chat rooms
      await Promise.all(
        result.chatRoomIds.map((chatRoomId) =>
          updateChatRoom(chatRoomId, { isMuted: false }),
        ),
      );

      // Refresh chat list to update UI
      await loadChatRooms(true);
    } catch (error) {
      console.error('Failed to unmute all chats:', error);
    }
  };

  const markChatRoomsAsReadLocally = useChatStore((s) => s.markChatRoomsAsReadLocally);

  // Mark all messages as read (optimistic UI, mirrors Next.js ChatList.handleReadAll)
  const handleReadAll = () => {
    const userId = authState.user?.id;
    if (!userId) return;

    const unreadChatRoomIds = chatRooms
      .filter((room) => isRoomInMessagesTab(room, activeTab))
      .filter((room) => (room.unreadCount || 0) > 0)
      .map((room) => room.id);

    if (unreadChatRoomIds.length === 0) return;

    markChatRoomsAsReadLocally(unreadChatRoomIds, userId);

    unreadChatRoomIds.forEach((chatRoomId) => {
      chatCacheService.updateChatRoom(chatRoomId, { unreadCount: 0 }).catch(() => {});
    });

    void chatApi.markAllMessagesAsReadByChatRooms(unreadChatRoomIds).catch((error) => {
      console.error('❌ [MessagesScreen] Failed to mark all messages as read:', error);
    });
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
      // Tab filtering (same as Next.js ChatList):
      // Chats: not LOAD, not OFFER | Shipments: active LOAD only (archive section is separate)
      // | Offers: OFFER
      if (!isRoomInMessagesTab(chatRoom, activeTab)) return false;

      // Filter out blocked chats for drivers with expired_documents status
      const userRole = authState.user?.role;
      if (userRole === 'DRIVER' && driverStatus === 'expired_documents') {
        // Allowed roles for expired_documents drivers
        const allowedRoles = ['RECRUITER', 'RECRUITER_TL', 'ADMINISTRATOR', 'EXPEDITE_MANAGER'];
        
        // Block all non-DIRECT chats
        if (chatRoom.type !== 'DIRECT') {
          return false;
        }
        
        // For DIRECT chats, check if other participant's role is allowed
        const otherParticipant = chatRoom.participants.find(
          p => p.user.id !== authState.user?.id
        );
        const otherRole = otherParticipant?.user.role;
        
        if (!otherRole || !allowedRoles.includes(otherRole)) {
          return false;
        }
      }

      let matchesSearch = chatRoomMatchesSearchQuery(
        chatRoom,
        debouncedSearchQuery,
        getChatDisplayName,
        { includeParticipantPhones: activeTab === 'shipments' },
      );

      // For DIRECT chats, also search by firstName and lastName separately
      if (!matchesSearch && debouncedSearchQuery.trim() && chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
        const searchQueryLower = debouncedSearchQuery.trim().toLowerCase();
        const otherParticipant = chatRoom.participants.find(
          p => p.user.id !== authState.user?.id
        );
        if (otherParticipant) {
          const firstName = otherParticipant.user.firstName?.toLowerCase() || '';
          const lastName = otherParticipant.user.lastName?.toLowerCase() || '';
          matchesSearch = firstName.includes(searchQueryLower) || lastName.includes(searchQueryLower);
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
  }, [chatRooms, activeTab, debouncedSearchQuery, selectedFilter, authState.user?.id, authState.user?.role, driverStatus]);

  const handleChatPress = (chatRoom: ChatRoom) => {
    setSelectedChatId(chatRoom.id);
    // Navigate to chat detail screen with chatRoomId
    router.push(`/chat/${chatRoom.id}` as any);
  };

  // Refresh chat rooms when screen comes into focus
  // Main synchronization when returning from background now lives inside useChatRooms (AppState effect).
  // Here we only ensure that on first screen appearance or when WebSocket is disconnected
  // the chat list will be loaded.
  useFocusEffect(
    React.useCallback(() => {
      // If we already have chat rooms in the store, do not trigger additional loads,
      // regardless of WebSocket connection status.
      if (chatRooms.length > 0) {
        hasAttemptedInitialEmptyLoadRef.current = false;
        return;
      }

      // Only load when store is empty (first load or after reset).
      // When offline, this will still try once, but won't keep reloading
      // on every focus while there is data in the store.
      if (chatRooms.length === 0) {
        if (hasAttemptedInitialEmptyLoadRef.current) {
          return;
        }
        hasAttemptedInitialEmptyLoadRef.current = true;
        loadChatRooms(false).catch((error) => {
          console.error('Failed to load chat rooms on focus:', error);
        });
      }
    }, [loadChatRooms, chatRooms.length])
  );

  // When app returns from inactive state, remove focus from search input
  // and dismiss the keyboard so it does not appear automatically.
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const prevState = appStateRef.current;

      // Transition from inactive/background to active
      if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('📱 [MessagesScreen] App became active, dismissing keyboard');
        Keyboard.dismiss();
        // Mark that the next automatic focus on search input should be suppressed
        preventNextSearchFocusRef.current = true;
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          {/* Header with time and profile */}
          <Pressable style={styles.header} onPress={Keyboard.dismiss}>
            <View style={styles.titleContainer}>
              <Text style={styles.screenTitle}>Conversations</Text>
              <View style={styles.statusContainer}>
                <View
                  style={[
                    styles.statusDot,
                    isConnected && !showConnectionOffline ? styles.statusDotOnline : styles.statusDotOffline,
                  ]}
                  accessibilityLabel={isConnected && !showConnectionOffline ? 'Online' : 'Offline'}
                />
              </View>
            </View>
            {isExpiredDocumentsDriver ? (
              <TouchableOpacity
                style={styles.contactsButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setIsContactsOpen(true);
                }}
              >
                <Text style={styles.contactsButtonText}>Contacts</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.contactsButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setIsAddNewMenuOpen(true);
                }}
              >
                <Text style={styles.contactsButtonText}>Add new</Text>
              </TouchableOpacity>
            )}
          </Pressable>
          {!isExpiredDocumentsDriver && (
            <Modal
              transparent
              visible={isAddNewMenuOpen}
              animationType="fade"
              onRequestClose={() => setIsAddNewMenuOpen(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.addNewMenuOverlay}
                onPress={() => setIsAddNewMenuOpen(false)}
              >
                <View
                  style={[styles.addNewMenu, { top: insets.top + rem(60) }]}
                  onStartShouldSetResponder={() => true}
                >
                  <TouchableOpacity
                    style={styles.addNewMenuItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setIsAddNewMenuOpen(false);
                      setIsCreateGroupOpen(true);
                    }}
                  >
                    <Text style={styles.addNewMenuItemText}>Add new room</Text>
                  </TouchableOpacity>

                  <View style={styles.addNewMenuSeparator} />

                  <TouchableOpacity
                    style={styles.addNewMenuItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setIsAddNewMenuOpen(false);
                      Keyboard.dismiss();
                      setIsContactsOpen(true);
                    }}
                  >
                    <Text style={styles.addNewMenuItemText}>Contacts</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
          
          {/* Tabs (Chats / Active Loads / Offers) — load screen style */}
          {!isExpiredDocumentsDriver && (
            <View style={styles.tabsStickyWrap}>
              <View style={styles.tabsGrid}>
                <View style={styles.tabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      activeTab === 'chats' && styles.tabButtonActive,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveTab('chats');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === 'chats' && styles.tabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Chats
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      activeTab === 'shipments' && styles.tabButtonActive,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveTab('shipments');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === 'shipments' && styles.tabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Active Loads
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      activeTab === 'offers' && styles.tabButtonActive,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveTab('offers');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === 'offers' && styles.tabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Offers
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={styles.searchFilterSection}>
            <View style={styles.searchRow}>
              <View style={styles.searchContainer}>
                <View style={styles.searchIconContainer}>
                  <SearchIcon />
                </View>
                
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search chats"
                  placeholderTextColor={colors.neutral.darkGrey}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => {
                    if (preventNextSearchFocusRef.current) {
                      preventNextSearchFocusRef.current = false;
                      Keyboard.dismiss();
                      if (searchInputRef.current) {
                        searchInputRef.current.blur();
                      }
                    }
                  }}
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
            </View>

            {/* Action Buttons and Filter (equal width) */}
            <View style={styles.actionButtonsRow}>
              {/* Mute All Button */}
              <TouchableOpacity
                style={styles.muteAllButton}
                onPress={() => {
                  Keyboard.dismiss();
                  void handleSmartMuteToggle();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.muteAllButtonText}>
                  {allChatsMuted ? 'Unmute all' : 'Mute all'}
                </Text>
              </TouchableOpacity>
              
              {/* Read All Button */}
              <TouchableOpacity
                style={styles.readAllButton}
                onPress={() => {
                  Keyboard.dismiss();
                  void handleReadAll();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.readAllButtonText}>
                  Read all
                </Text>
              </TouchableOpacity>
              
              {/* Filter Dropdown */}
              <View style={styles.filterContainer}>
                <TouchableOpacity
                  style={styles.filterButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setIsFilterDropdownOpen(!isFilterDropdownOpen);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.filterButtonContent}>
                    {selectedFilter === 'all' && (
                      <View style={styles.filterButtonIcon}>
                        <AllFilterIcon width={16} height={16} color={colors.primary.blue} />
                      </View>
                    )}
                    {selectedFilter === 'muted' && (
                      <View style={styles.filterButtonIcon}>
                        <MuteIcon width={16} height={16} color={colors.primary.blue} />
                      </View>
                    )}
                    {selectedFilter === 'unread' && (
                      <View style={styles.filterButtonIcon}>
                        <UnreadFilterIcon width={16} height={16} color={colors.primary.blue} />
                      </View>
                    )}
                    {selectedFilter === 'favorite' && (
                      <View style={styles.filterButtonIcon}>
                        <PinIcon width={16} height={16} color={colors.primary.blue} />
                      </View>
                    )}
                    <Text style={styles.filterButtonText}>{getCurrentFilterLabel()}</Text>
                  </View>
                  <View style={[styles.arrowIcon, isFilterDropdownOpen && styles.arrowIconRotated]}>
                    <ArrowDownIcon />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Dropdown Menu */}
            {isFilterDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {visibleFilterOptions.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.dropdownItem,
                      selectedFilter === option.value && styles.dropdownItemSelected,
                      index === visibleFilterOptions.length - 1 && styles.dropdownItemLast,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      handleFilterSelect(option.value);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dropdownItemContent}>
                      {option.value === 'all' && (
                        <View style={styles.dropdownItemIcon}>
                          <AllFilterIcon width={16} height={16} color={colors.primary.blue} />
                        </View>
                      )}
                      {option.value === 'muted' && (
                        <View style={styles.dropdownItemIcon}>
                          <MuteIcon width={16} height={16} color={colors.primary.blue} />
                        </View>
                      )}
                      {option.value === 'unread' && (
                        <View style={styles.dropdownItemIcon}>
                          <UnreadFilterIcon width={16} height={16} color={colors.primary.blue} />
                        </View>
                      )}
                      {option.value === 'favorite' && (
                        <View style={styles.dropdownItemIcon}>
                          <PinIcon width={16} height={16} color={colors.primary.blue} />
                        </View>
                      )}
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedFilter === option.value && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.listScrollAndArchive}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            onMomentumScrollBegin={() => Keyboard.dismiss()}
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
                  onPress={() => {
                    Keyboard.dismiss();
                    void loadChatRooms(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : filteredChatRooms.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {debouncedSearchQuery.trim()
                    ? 'No chats found'
                    : activeTab === 'shipments'
                      ? 'No active loads'
                      : 'No chats yet'}
                </Text>
                {debouncedSearchQuery.trim() ? (
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                ) : null}
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
          {!isExpiredDocumentsDriver && activeTab === 'shipments' && (
            <Pressable
              style={styles.archiveStickyFooter}
              onPress={Keyboard.dismiss}
            >
              <LoadChatsArchiveSection
                tabActive
                pinnedToBottom
                selectedChatId={selectedChatId}
                currentUserId={authState.user?.id}
                isUserOnline={isUserOnline}
                mergeChatRooms={mergeChatRooms}
                onChatPress={handleChatPress}
                openDropdownId={openDropdownId}
                setOpenDropdownId={setOpenDropdownId}
              />
            </Pressable>
          )}
          </View>
        </View>
        
        {/* Bottom Navigation */}
        <BottomNavigation />
        
        {/* Contacts Modal */}
        <ContactsModal
          visible={isContactsOpen}
          onClose={() => setIsContactsOpen(false)}
          isCreatingDirectChat={isCreatingDirectChat}
          creatingUserId={creatingDirectChatUserId}
          onSelectUser={async (user) => {
            if (isCreatingDirectChat) return;
            try {
              setIsCreatingDirectChat(true);
              setCreatingDirectChatUserId(user.id);

              const myUserId = authState.user?.id;
              if (!myUserId) return;

              await loadChatRooms(true);

              const { findDirectChatWithUser } = await import('@/utils/findDirectChatRoom');
              const latestRooms = useChatStore.getState().chatRooms;
              const existing = findDirectChatWithUser(latestRooms, myUserId, user.id);
              if (existing) {
                setIsContactsOpen(false);
                router.push(`/chat/${existing.id}` as any);
                return;
              }
              // Otherwise create DIRECT chat
              const participantIds = [authState.user?.id, user.id].filter(Boolean) as string[];
              const created = await (await import('@/app-api/chatApi')).chatApi.createChatRoom({
                type: 'DIRECT',
                participantIds,
              });
              setIsContactsOpen(false);
              // Go straight to the new chat; list will be updated by WebSocket.
              if (created?.id) {
                router.push(`/chat/${created.id}` as any);
              } else {
                // Fallback: refresh list if backend didn't return room id for some reason
                await loadChatRooms(true);
              }
            } catch (e) {
              console.error('Failed to create direct chat:', e);
            } finally {
              setIsCreatingDirectChat(false);
              setCreatingDirectChatUserId(null);
            }
          }}
        />

        <CreateGroupChatModal
          visible={isCreateGroupOpen}
          onClose={() => setIsCreateGroupOpen(false)}
          onCreated={async () => {
            await loadChatRooms(true);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    position: "relative"
  },
  listScrollAndArchive: {
    flex: 1,
    minHeight: 0,
  },
  archiveStickyFooter: {
    flexShrink: 0,
    paddingHorizontal: rem(15),
    paddingTop: rem(6),
    paddingBottom: rem(6),
    backgroundColor: 'rgba(247, 248, 255, 1)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(96, 102, 197, 0.12)',
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
  addNewMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  addNewMenu: {
    position: 'absolute',
    right: rem(16),
    width: rem(190),
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addNewMenuItem: {
    paddingVertical: rem(12),
    paddingHorizontal: rem(14),
  },
  addNewMenuItemText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  addNewMenuSeparator: {
    height: 1,
    backgroundColor: colors.neutral.veryLightGrey,
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
    fontSize: fp(22),
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
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
  },
  statusContainer: {
    marginLeft: rem(8),
    justifyContent: 'center',
  },
  statusDot: {
    width: rem(10),
    height: rem(10),
    borderRadius: rem(5),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  statusDotOnline: {
    backgroundColor: colors.semantic.success,
  },
  statusDotOffline: {
    backgroundColor: colors.semantic.error,
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
    fontSize: fp(14),
  },
  screenWrap: {
    flex: 1,
    position: "relative",
  },
  container: {
    flex: 1,
    position: 'relative',
    paddingBottom: BOTTOM_NAV_SCROLL_PADDING,
    backgroundColor: 'rgba(247, 248, 255, 1)',
  },
  searchFilterSection: {
    paddingHorizontal: rem(15),
    marginBottom: rem(17),
    marginTop: rem(8),
  },
  searchRow: {
    marginBottom: rem(8),
  },
  tabsStickyWrap: {
    alignSelf: 'stretch',
    backgroundColor: '#0d1a2d',
  },
  tabsGrid: {
    width: '100%',
    backgroundColor: '#0d1a2d',
  },
  tabsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: rem(10),
    paddingHorizontal: rem(4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.blue,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  tabButtonActive: {
    backgroundColor: '#0d1a2d',
    borderTopWidth: 3,
    borderTopColor: 'rgba(0, 0, 0, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  tabText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: 'rgba(255, 255, 255, 0.7)',
  },
  tabTextActive: {
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  actionButtonsRow: {
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
    width: '100%',
  },
  searchIconContainer: {
    marginRight: rem(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: fp(14),
    fontFamily: fonts["400"],
    color: colors.primary.blue,
    height: rem(35),
    // Platform-specific vertical centering
    ...(Platform.OS === 'android' ? {
      paddingVertical: 0,
      textAlignVertical: 'center',
      includeFontPadding: false as any,
      lineHeight: rem(35),
    } : {
      // iOS: use padding for vertical centering
      paddingVertical: rem(8),
      lineHeight: fp(14),
    }),
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
    flex: 1,
  },
  muteAllButtonText: {
    fontSize: fp(14),
    fontFamily: fonts["500"],
    color: colors.primary.blue,
  },
  readAllButton: {
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    height: rem(35),
    paddingHorizontal: rem(12),
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  readAllButtonText: {
    fontSize: fp(14),
    fontFamily: fonts["500"],
    color: colors.primary.blue,
  },
  filterContainer: {
    position: 'relative',
    flex: 1,
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
    fontSize: fp(14),
    fontFamily: fonts["500"],
    color: colors.primary.blue,
  },
  filterButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButtonIcon: {
    marginRight: rem(5),
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
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
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
    fontSize: fp(20),
    fontFamily: fonts["400"],
    color: colors.neutral.black,
  },
  dropdownItemTextSelected: {
    fontFamily: fonts["600"],
    color: colors.primary.blue,
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownItemIcon: {
    marginRight: rem(5),
  },
});

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { colors, fonts, fp, rem } from '@/lib';
import Home from '@/icons/Home';
import WorkIcon from '@/icons/WorkIcon';
import ChatIcon from '@/icons/ChatIcon';
import ProfileIcon from '@/icons/ProfileIcon';
import SettingsIcon from '@/icons/SettingsIcon';
import { useChatRooms } from '@/hooks/useChatRooms';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab } from '@/constants/roleAccess';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventBus } from '@/services/EventBus';
import { AppState, AppStateStatus } from 'react-native';
const { width } = Dimensions.get('window');
const INACTIVE_COLOR = '#8E8E93';
const ACTIVE_COLOR = colors.neutral.white;

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  route: string;
  isActive?: boolean;
  onPress?: () => void;
  badgeCount?: number;
  isLast?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, route, isActive = false, onPress, badgeCount, isLast = false }) => {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(route as any);
    }
  };

  return (
    <TouchableOpacity style={[styles.navItem, isLast && styles.navItemLast]} onPress={handlePress}>
      <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
        {icon}
        {badgeCount !== undefined && badgeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badgeCount > 99 ? '99+' : badgeCount.toString()}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.navText, isActive && styles.navTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

interface BottomNavigationProps {
  currentRoute?: string;
}

export default function BottomNavigation({ currentRoute: currentRouteProp }: BottomNavigationProps) {
  const pathname = usePathname();
  const currentRoute = currentRouteProp ?? pathname;
  const { chatRooms } = useChatRooms();
  const { authState } = useAuth();
  const canAccessOffers = canAccessWorkTab(authState.user?.role);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load driver status from AsyncStorage
  const loadDriverStatus = useCallback(async () => {
    const userRole = authState.user?.role;
    if (userRole === 'DRIVER') {
      try {
        const status = await AsyncStorage.getItem('@user_status');
        setDriverStatus(status);
      } catch (error) {
        console.warn('[BottomNavigation] Failed to load driver status:', error);
      }
    } else {
      setDriverStatus(null);
    }
  }, [authState.user?.role]);

  useEffect(() => {
    loadDriverStatus();
  }, [loadDriverStatus]);

  // Listen for driver status updates from WebSocket
  useEffect(() => {
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
  useEffect(() => {
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

  // Calculate total unread messages count, excluding blocked chats for drivers with expired_documents
  const totalUnreadCount = useMemo(() => {
    return chatRooms.reduce((total, room) => {
      // Filter out blocked chats for drivers with expired_documents status
      const userRole = authState.user?.role;
      if (userRole === 'DRIVER' && driverStatus === 'expired_documents') {
        // Allowed roles for expired_documents drivers
        const allowedRoles = ['RECRUITER', 'RECRUITER_TL', 'ADMINISTRATOR', 'EXPEDITE_MANAGER'];
        
        // Block all non-DIRECT chats
        if (room.type !== 'DIRECT') {
          return total; // Don't count unread messages from blocked chats
        }
        
        // For DIRECT chats, check if other participant's role is allowed
        const otherParticipant = room.participants.find(
          p => p.user.id !== authState.user?.id
        );
        const otherRole = otherParticipant?.user.role;
        
        if (!otherRole || !allowedRoles.includes(otherRole)) {
          return total; // Don't count unread messages from blocked chats
        }
      }

      // Count unread messages for allowed chats
      return total + (room.unreadCount || 0);
    }, 0);
  }, [chatRooms, authState.user?.role, authState.user?.id, driverStatus]);

  return (
    <View style={styles.bottomNav}>
      <NavItem 
        icon={<Home width={22} height={22} color={currentRoute?.includes('final-verify') ? ACTIVE_COLOR : INACTIVE_COLOR} />}
        label=""
        route="/final-verify"
        isActive={currentRoute?.includes('final-verify')}
      />
      
      {canAccessOffers && (
        <NavItem 
          icon={<WorkIcon width={22} height={22} color={currentRoute?.includes('work') ? ACTIVE_COLOR : INACTIVE_COLOR} />}
          label=""
          route="/work"
          isActive={currentRoute?.includes('work')}
        />
      )}
      
      <NavItem 
        icon={<ChatIcon width={22} height={22} color={currentRoute?.includes('messages') || currentRoute?.includes('chat') ? ACTIVE_COLOR : INACTIVE_COLOR} />}
        label=""
        route="/messages"
        isActive={currentRoute?.includes('messages') || currentRoute?.includes('chat')}
        badgeCount={totalUnreadCount}
      />
      
      <NavItem 
        icon={<ProfileIcon width={22} height={22} color={currentRoute?.includes('profile') ? ACTIVE_COLOR : INACTIVE_COLOR} />}
        label=""
        route="/profile"
        isActive={currentRoute?.includes('profile')}
      />
      
      <NavItem
        icon={<SettingsIcon width={22} height={22} color={currentRoute?.includes('settings') ? ACTIVE_COLOR : INACTIVE_COLOR} />}
        label=""
        route="/settings"
        isActive={currentRoute?.includes('settings')}
        isLast
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: width,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: rem(30),
    paddingTop: rem(19),
    ...(Platform.OS === 'ios' && { paddingBottom: rem(10) }),
    backgroundColor: 'rgba(41, 41, 102, 0.96)',
    borderTopLeftRadius: rem(20),
    borderTopRightRadius: rem(20),
    zIndex: 1000,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navItemLast: {
    paddingRight: rem(6),
  },
  iconContainer: {
    position: 'relative',
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    // Additional styling for active state if needed
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 8,
    textAlign: 'center',
    lineHeight: 8,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: ACTIVE_COLOR,
    padding: 0,
    fontFamily: fonts['700'],
  },
  navText: {
    fontSize: fp(12),
    fontFamily: fonts["500"],
    color: '#8E8E93',
  },
  navTextActive: {
    color: ACTIVE_COLOR,
  },
});


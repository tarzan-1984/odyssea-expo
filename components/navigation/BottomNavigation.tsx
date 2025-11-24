import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, fp, rem } from '@/lib';
import Home from '@/icons/Home';
import ChatIcon from '@/icons/ChatIcon';
import ProfileIcon from '@/icons/ProfileIcon';
import SettingsIcon from '@/icons/SettingsIcon';
import { useChatRooms } from '@/hooks/useChatRooms';
const { width } = Dimensions.get('window');

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

export default function BottomNavigation({ currentRoute }: BottomNavigationProps) {
  const { chatRooms } = useChatRooms();

  // Calculate total unread messages count
  const totalUnreadCount = useMemo(() => {
    return chatRooms.reduce((total, room) => {
      return total + (room.unreadCount || 0);
    }, 0);
  }, [chatRooms]);

  return (
    <View style={styles.bottomNav}>
      <NavItem 
        icon={<Home width={20} height={20} color={currentRoute === '/home' ? colors.primary.blue : '#8E8E93'} />}
        label=""
        route="/final-verify"
        isActive={currentRoute === '/final-verify'}
      />
      
      <NavItem 
        icon={<ChatIcon width={20} height={20} color={currentRoute === '/messages' ? colors.primary.blue : '#8E8E93'} />}
        label=""
        route="/messages"
        isActive={currentRoute === '/messages'}
        badgeCount={totalUnreadCount}
      />
      
      <NavItem 
        icon={<ProfileIcon width={20} height={20} color={currentRoute === '/profile' ? colors.primary.blue : '#8E8E93'} />}
        label=""
        route="/profile"
        isActive={currentRoute === '/profile'}
      />

      <NavItem
        icon={<SettingsIcon width={20} height={20} color={currentRoute === '/settings' ? colors.primary.blue : '#8E8E93'} />}
        label=""
        route="/settings"
        isActive={currentRoute === '/settings'}
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
    color: colors.primary.blue,
    padding: 0,
    fontFamily: fonts['700'],
  },
  navText: {
    fontSize: fp(12),
    fontFamily: fonts["500"],
    color: '#8E8E93',
  },
  navTextActive: {
    color: colors.primary.blue,
  },
});


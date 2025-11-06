import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, fp, rem } from '@/lib';
import Home from '@/icons/Home';
import ChatIcon from '@/icons/ChatIcon';
import ProfileIcon from '@/icons/ProfileIcon';
import { useChatRooms } from '@/hooks/useChatRooms';

const { width } = Dimensions.get('window');

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  route: string;
  isActive?: boolean;
  onPress?: () => void;
  badgeCount?: number;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, route, isActive = false, onPress, badgeCount }) => {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(route as any);
    }
  };

  return (
    <TouchableOpacity style={styles.navItem} onPress={handlePress}>
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
    paddingHorizontal: rem(58),
    paddingTop: rem(19),
    paddingBottom: rem(21),
    backgroundColor: 'rgba(41, 41, 102, 0.96)',
    borderTopLeftRadius: rem(20),
    borderTopRightRadius: rem(20),
    zIndex: 1000,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginBottom: 5,
    position: 'relative',
  },
  iconContainerActive: {
    // Additional styling for active state if needed
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: rem(18),
    height: rem(18),
    borderRadius: rem(9),
    backgroundColor: colors.neutral.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(4),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.1)',
  },
  badgeText: {
    fontSize: fp(10),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
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


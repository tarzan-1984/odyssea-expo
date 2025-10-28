import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, fp, rem } from '@/lib';
import Home from '@/icons/Home';
import ChatIcon from '@/icons/ChatIcon';
import ProfileIcon from '@/icons/ProfileIcon';

const { width } = Dimensions.get('window');

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  route: string;
  isActive?: boolean;
  onPress?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, route, isActive = false, onPress }) => {
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
      </View>
      <Text style={[styles.navText, isActive && styles.navTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

interface BottomNavigationProps {
  currentRoute?: string;
}

export default function BottomNavigation({ currentRoute }: BottomNavigationProps) {
  return (
    <View style={styles.bottomNav}>
      <NavItem 
        icon={<Home width={20} height={20} color={currentRoute === '/home' ? colors.primary.blue : '#8E8E93'} />}
        label="Home"
        route="/home"
        isActive={currentRoute === '/home'}
      />
      
      <NavItem 
        icon={<ChatIcon width={20} height={20} color={currentRoute === '/messages' ? colors.primary.blue : '#8E8E93'} />}
        label="Messages"
        route="/messages"
        isActive={currentRoute === '/messages'}
      />
      
      <NavItem 
        icon={<ProfileIcon width={20} height={20} color={currentRoute === '/profile' ? colors.primary.blue : '#8E8E93'} />}
        label="Profile"
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
    paddingTop: 19,
    paddingBottom: 21,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: 'rgba(41, 41, 102, 0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginBottom: 5,
  },
  iconContainerActive: {
    // Additional styling for active state if needed
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


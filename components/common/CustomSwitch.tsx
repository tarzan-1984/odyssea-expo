import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, rem } from '@/lib';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface CustomSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Custom Switch component that looks the same on iOS and Android
 * Mimics iOS Switch design with smooth animation
 */
export default function CustomSwitch({
  value,
  onValueChange,
  disabled = false,
}: CustomSwitchProps) {
  // Animated value for the thumb position (0 = off, 1 = on)
  const translateX = useSharedValue(value ? 1 : 0);

  // Update animation when value changes
  React.useEffect(() => {
    translateX.value = withSpring(value ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [value, translateX]);

  // Calculate thumb position
  const thumbWidth = rem(22);
  const trackWidth = rem(51);
  const trackHeight = rem(31);
  const thumbSize = rem(27);
  const padding = rem(2);
  const maxTranslate = trackWidth - thumbSize - padding * 2;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value * maxTranslate }],
    };
  });

  const handlePress = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
      style={styles.container}
    >
      <View
        style={[
          styles.track,
          {
            width: trackWidth,
            height: trackHeight,
            backgroundColor: value ? colors.primary.green : '#E5E5EA',
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
            },
            animatedStyle,
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    borderRadius: rem(15.5),
    justifyContent: 'center',
    padding: rem(2),
    overflow: 'hidden',
  },
  thumb: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(13.5),
    // iOS-like shadow appearance on both platforms
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    elevation: 3,
  },
});


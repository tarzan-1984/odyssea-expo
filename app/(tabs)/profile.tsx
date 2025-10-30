import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from "../../components/navigation/BottomNavigation";
import { useAuth } from "@/context/AuthContext";
import { uploadImageViaPresign, updateUserAvatarOnBackend } from '@/app-api/upload';
import { secureStorage } from '@/utils/secureStorage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

/**
 * ProfileScreen - Profile screen of the application
 * Placeholder for profile functionality
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState, updateUserLocation, clearUserLocation, updateUserAvatar, resetAuthState } = useAuth();
  const user = authState.user;
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [pickedAvatar, setPickedAvatar] = useState<string | null>(null);
  const [pickedMeta, setPickedMeta] = useState<{ filename: string; mimeType: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleLogout = useCallback(async () => {
    await resetAuthState();
    router.replace('/(auth)');
  }, [resetAuthState, router]);

  const handlePickAvatar = useCallback(async () => {
    // Ask for media library permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Please allow access to Photos to select an avatar.');
      return;
    }

    // Cross-version support for API (legacy MediaTypeOptions vs new MediaType)
    let mediaTypes: any;
    const MP: any = (ImagePicker as any).MediaType;
    if (MP && (MP.images || MP.image)) {
      mediaTypes = [MP.images ?? MP.image];
    } else {
      // Fallback without enum — string array is accepted by newer API
      mediaTypes = ['images'];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0] as any;
      setPickedAvatar(asset.uri);
      const filename = asset.fileName || asset.filename || 'avatar.jpg';
      const mimeType = asset.mimeType || 'image/jpeg';
      setPickedMeta({ filename, mimeType });
    }
  }, []);

  const handleSetAvatar = useCallback(async () => {
    if (!pickedAvatar || !pickedMeta || !authState.user) return;
    
    try {
      setIsUploading(true);
      const accessToken = await secureStorage.getItemAsync('accessToken');
      if (!accessToken) throw new Error('No access token');

      // Upload to cloud storage
      const fileUrl = await uploadImageViaPresign({
        fileUri: pickedAvatar,
        filename: pickedMeta.filename,
        mimeType: pickedMeta.mimeType,
        accessToken,
      });

      // Update user avatar in backend
      await updateUserAvatarOnBackend({
        userId: authState.user.id,
        avatarUrl: fileUrl,
        accessToken,
      });
      
      // Update local state and storage
      await updateUserAvatar(fileUrl);

      // Reset local selection so button switches back to "Upload avatar"
      setPickedAvatar(null);
      setPickedMeta(null);
    } catch (e) {
      console.error('Failed to set avatar:', e);
      alert('Failed to set avatar');
    } finally {
      setIsUploading(false);
    }
  }, [pickedAvatar, pickedMeta, authState.user, updateUserAvatar]);
  
  return (
    <View style={styles.screenWrap}>
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
        {/* Header with time and profile */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>
            Profile
          </Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Logout">
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
          
          
        </View>
        
        <ScrollView style={styles.content}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {(pickedAvatar || profilePhoto) ? (
                  <Image
                    source={{ uri: pickedAvatar || (profilePhoto as string) }}
                    style={styles.profileImage}
                    resizeMode="cover"
                  />
                ) : (
                   <Text style={styles.profileText}>{initials}</Text>
                 )}
                {isUploading && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.controlsWrap}>
              {pickedAvatar ? (
                <TouchableOpacity style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]} activeOpacity={0.8} onPress={handleSetAvatar} disabled={isUploading}>
                  <Text style={styles.uploadButtonText}>{isUploading ? 'Uploading...' : 'Set avatar'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]} activeOpacity={0.8} onPress={handlePickAvatar} disabled={isUploading}>
                  <Text style={styles.uploadButtonText}>Upload avatar</Text>
                </TouchableOpacity>
              )}
            </View>
        </ScrollView>
      </View>
      {/* Bottom Navigation */}
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: fp(30),
    fontFamily: fonts["700"],
  },
  avatar: {
    width: rem(120),
    height: rem(120),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: rem(30),
  },
  controlsWrap: {
    paddingHorizontal: 20,
    marginBottom: rem(20),
  },
  uploadButton: {
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    height: rem(45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.7,
  },
  uploadButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts["500"],
  },
  content: {
    flex: 1,
    paddingTop: rem(20),
  },
  screenTitle: {
    color: colors.neutral.white,
    fontFamily: fonts["700"],
    fontSize: fp(18),
    textTransform: 'capitalize',
  },
  screenWrap: {
    flex: 1,
    position: "relative"
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  logoutButton: {
    marginLeft: 'auto',
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
  },
  logoutText: {
    color: colors.neutral.white,
    fontFamily: fonts["700"],
    fontSize: fp(14),
  },
});

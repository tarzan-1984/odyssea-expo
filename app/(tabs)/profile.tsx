import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from "../../components/navigation/BottomNavigation";
import { useAuth } from "@/context/AuthContext";
import { uploadImageViaPresign, updateUserAvatarOnBackend } from '@/app-api/upload';
import { getUserById } from '@/app-api/users';
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
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [userDetails, setUserDetails] = useState<any | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  // Load user info from backend on mount
  React.useEffect(() => {
    const load = async () => {
      if (!authState.user?.externalId) return;
      try {
        setIsLoadingUser(true);
        setUserError(null);
        const res = await getUserById(authState.user.externalId);
        setUserDetails(res ?? null);
      } catch (e) {
        setUserError(e instanceof Error ? e.message : 'Failed to load user');
      } finally {
        setIsLoadingUser(false);
      }
    };
    load();
  }, [authState.user?.id]);

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
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
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

            {/* Basic user info block */}
            <View style={styles.infoBlock}>
              {isLoadingUser ? (
                <ActivityIndicator size="small" color={colors.primary.violet} />
              ) : userError ? (
                <Text style={styles.infoError}>{userError}</Text>
              ) : userDetails ? (
                <>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Contact</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Phone</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.driver_phone || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Email</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.driver_email || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Home Location</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.home_location || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>City</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.city || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>State</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.city_state_zip || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Date of Birth</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.date_of_birth || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Languages</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.languages || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Team Driver</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.team_driver?.name || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Preferred distance</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.preferred_distance || '-'}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Emergency contact</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Name</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.emergency_contact?.name || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Phone</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.emergency_contact?.phone || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Relation</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.contact?.emergency_contact?.relation || '-'}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Vehicle</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Type</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.type?.label || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Make</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.make || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Model</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.model || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Vehicle Year</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.year || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Payload</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.payload || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Cargo space dimensions</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.cargo_space_dimensions || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Overall dimensions</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.overall_dimensions || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Vin</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.vehicle?.vin || '-'}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Equipment</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      {userDetails?.organized_data?.vehicle?.equipment?.side_door &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Side door</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.vehicle?.equipment?.load_bars &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Load bars</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.printer &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Printer</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.sleeper &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Sleeper</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.e_tracks  &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>E-tracks</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.pallet_jack  &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Pallet jack</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.lift_gate  &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Lift gate</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.dolly &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Dolly</Text>
                        </View>
                      }
                      
                      {userDetails?.organized_data?.vehicle?.equipment?.ramp &&
                        <View style={styles.infoItem} >
                          <Text style={styles.infoTitle}>Ramp</Text>
                        </View>
                      }
                      
                    </View>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Statistics</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>All notifications</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.statistics?.notifications?.all_notifications || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Total notifications</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.statistics?.notifications?.total_count || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Average rating</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.statistics?.rating?.average_rating || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Total ratings</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.statistics?.rating?.total_ratings || '-'}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Current location</Text>
                    
                    <View style={styles.infoSectionWrap}>
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>City</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.current_location.city || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Coordinates (lat / lng)</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.current_location.coordinates.lat || '-'} / {userDetails?.organized_data?.current_location.coordinates.lng || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>State</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.current_location.state || '-'}</Text>
                      </View>
                      
                      <View style={styles.infoItem} >
                        <Text style={styles.infoTitle}>Zipcode</Text>
                        <Text style={styles.infoValue}>{userDetails?.organized_data?.current_location.zipcode || '-'}</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          
        </ScrollView>
      </View>
      
      {/* Bottom Navigation */}
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  infoValue: {
    fontSize: fp(10),
    fontFamily: fonts["400"],
  },
  infoTitle: {
    fontSize: fp(12),
    fontFamily: fonts["700"],
    marginBottom: 5,
  },
  infoItem: {
    width: '30%',
    marginBottom: 15,
  },
  infoSectionWrap: {
    flexDirection: 'row',
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  infoSectionTitle: {
    fontSize: fp(16),
    marginBottom: rem(15),
    color: colors.primary.blue,
    fontFamily: fonts["700"],
  },
  infoSection: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    borderColor: colors.primary.lightBlue,
    padding: rem(20),
    marginBottom: rem(20),
  },
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
  infoBlock: {
    paddingHorizontal: 20,
    gap: rem(6),
    marginBottom: rem(20),
  },
  infoError: {
    color: '#FF6B6B',
    fontFamily: fonts["500"],
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
    paddingBottom: 70,
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

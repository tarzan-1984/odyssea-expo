import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAppSettings } from '@/hooks/useAppSettings';
import { colors, fonts, fp, rem } from '@/lib';

export default function NotificationToggleSettings() {
  const { notificationsEnabled, setNotificationsEnabled, isLoading } = useAppSettings();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Message notifications</Text>
          <Text style={styles.caption}>
            {notificationsEnabled 
              ? 'Enabled (push notifications and sound)' 
              : 'Disabled (push notifications and sound will not be shown)'}
          </Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          disabled={isLoading}
          thumbColor={notificationsEnabled ? colors.primary.violet : '#ccc'}
          trackColor={{ false: '#ccc', true: colors.primary.violet + '80' }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: rem(16),
    backgroundColor: 'white',
    marginBottom: rem(12),
    borderRadius: rem(8),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: {
    fontFamily: fonts['700'],
    fontSize: fp(18),
    color: colors.primary.blue,
    marginBottom: rem(16),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rem(12),
  },
  rowText: {
    flex: 1,
    marginRight: rem(16),
  },
  label: {
    fontFamily: fonts['600'],
    fontSize: fp(15),
    color: colors.primary.blue,
    marginBottom: rem(4),
  },
  caption: {
    fontFamily: fonts['400'],
    fontSize: fp(12),
    color: colors.neutral.darkGrey,
    lineHeight: fp(16),
  },
});


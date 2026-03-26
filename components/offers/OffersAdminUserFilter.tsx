import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import { chatApi } from '@/app-api/chatApi';
import {
  OFFERS_CREATOR_ROLES,
  offersCreatorRoleLabel,
} from '@/constants/offersUserFilter';

const STALE_MS = 3 * 60 * 60 * 1000;

export interface OfferFilterUserRow {
  id: string;
  externalId: string | null;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  role?: string;
}

function rowKey(u: OfferFilterUserRow): string {
  return (u.externalId ?? u.id) || u.id;
}

function displayName(u: OfferFilterUserRow): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return n || '—';
}

function initials(u: OfferFilterUserRow): string {
  const a = (u.firstName?.[0] || '').toUpperCase();
  const b = (u.lastName?.[0] || u.firstName?.[1] || '').toUpperCase();
  return (a + b) || '?';
}

export interface OffersAdminUserFilterProps {
  /** externalId of creator, or '' for all offers */
  value: string;
  onChange: (externalId: string) => void;
}

export default function OffersAdminUserFilter({ value, onChange }: OffersAdminUserFilterProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ['offers-admin-user-filter', OFFERS_CREATOR_ROLES],
    queryFn: async () => {
      const res = await chatApi.getUsers({
        page: 1,
        limit: 500,
        roles: [...OFFERS_CREATOR_ROLES],
        contactsOnly: true,
        sort: { firstName: 'asc' },
      });
      return (res.users ?? []) as OfferFilterUserRow[];
    },
    staleTime: STALE_MS,
  });

  const users = useMemo(() => {
    const list = data ?? [];
    return [...list].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' })
    );
  }, [data]);

  const selected = useMemo(
    () => users.find((u) => (u.externalId ?? u.id) === value),
    [users, value]
  );

  const selectAndClose = (externalId: string) => {
    onChange(externalId);
    setOpen(false);
  };

  return (
    <>
      <View style={styles.bar}>
        <Text style={styles.label}>User</Text>
        <TouchableOpacity
          style={styles.control}
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Filter offers by user"
        >
          {!value ? (
            <Text style={styles.controlText}>All</Text>
          ) : selected ? (
            <View style={styles.controlInner}>
              {selected.avatar ? (
                <Image source={{ uri: selected.avatar }} style={styles.avatarSm} contentFit="cover" />
              ) : (
                <View style={styles.avatarSmPlaceholder}>
                  <Text style={styles.avatarSmText}>{initials(selected)}</Text>
                </View>
              )}
              <Text style={styles.controlText} numberOfLines={1}>
                {displayName(selected)}
              </Text>
            </View>
          ) : (
            <Text style={styles.controlTextMuted}>…</Text>
          )}
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(rem(16), insets.bottom) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>User</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Close</Text>
              </TouchableOpacity>
            </View>

            {isPending ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={colors.primary.blue} />
              </View>
            ) : isError ? (
              <Text style={styles.sheetError}>Could not load users</Text>
            ) : (
              <FlatList
                style={styles.sheetList}
                data={users}
                keyExtractor={(item) => rowKey(item)}
                keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <TouchableOpacity
                  style={[styles.row, !value && styles.rowSelected]}
                  onPress={() => selectAndClose('')}
                >
                  <Text style={[styles.rowName, !value && styles.rowNameSelected]}>All</Text>
                  <Text style={[styles.rowRole, !value && styles.rowRoleSelected]}>
                    All offers
                  </Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const id = rowKey(item);
                const sel = id === value;
                return (
                  <TouchableOpacity
                    style={[styles.row, sel && styles.rowSelected]}
                    onPress={() => selectAndClose(id)}
                  >
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.avatarMd} contentFit="cover" />
                    ) : (
                      <View style={styles.avatarMdPlaceholder}>
                        <Text style={styles.avatarMdText}>{initials(item)}</Text>
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, sel && styles.rowNameSelected]} numberOfLines={1}>
                        {displayName(item)}
                      </Text>
                      {item.role ? (
                        <Text
                          style={[styles.rowRole, sel && styles.rowRoleSelected]}
                          numberOfLines={1}
                        >
                          {offersCreatorRoleLabel(item.role)}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
    paddingHorizontal: rem(16),
    paddingVertical: rem(10),
    backgroundColor: '#0d1a2d',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: 'rgba(255,255,255,0.65)',
  },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: rem(40),
    paddingHorizontal: rem(12),
    borderRadius: rem(8),
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  controlInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
    minWidth: 0,
  },
  controlText: {
    flexShrink: 1,
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  controlTextMuted: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: 'rgba(255,255,255,0.5)',
  },
  chevron: {
    fontSize: fp(10),
    color: 'rgba(255,255,255,0.55)',
    marginLeft: rem(6),
  },
  avatarSm: {
    width: rem(28),
    height: rem(28),
    borderRadius: rem(14),
  },
  avatarSmPlaceholder: {
    width: rem(28),
    height: rem(28),
    borderRadius: rem(14),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: {
    fontSize: fp(11),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetList: {
    flexGrow: 1,
    flexShrink: 1,
  },
  sheet: {
    maxHeight: '72%',
    flexShrink: 0,
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: rem(16),
    borderTopRightRadius: rem(16),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(20),
    paddingVertical: rem(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.lightGrey,
  },
  sheetTitle: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  sheetClose: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  sheetLoading: {
    paddingVertical: rem(40),
    alignItems: 'center',
  },
  sheetError: {
    padding: rem(24),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
    paddingHorizontal: rem(20),
    paddingVertical: rem(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.lightGrey,
  },
  rowSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  avatarMd: {
    width: rem(40),
    height: rem(40),
    borderRadius: rem(20),
  },
  avatarMdPlaceholder: {
    width: rem(40),
    height: rem(40),
    borderRadius: rem(20),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMdText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  rowNameSelected: {
    color: colors.primary.blue,
  },
  rowRole: {
    marginTop: rem(2),
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.grey,
  },
  rowRoleSelected: {
    color: 'rgba(37, 99, 235, 0.85)',
  },
});

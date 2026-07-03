import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import type { TmsDriversSearchPage } from '@/app-api/tmsDriverSearch';
import {
  CANCELED_LOAD_VALUE,
  computeUpdatedAverageRating,
  extractLoadsForRating,
  extractRatingsFromResponse,
  extractRatingsMeta,
  formatLoadOptionLabel,
  formatRatingDateTime,
  getAvailableLoadsMessage,
  getDriverRatings,
  getRatingValue,
  getRatingsPagination,
  postDriverRating,
  type DriverRating,
  type LoadForRating,
} from '@/app-api/driverRatings';
import StarRatingInput from '@/components/drivers/StarRatingInput';
import StarRatingDisplay from '@/components/drivers/StarRatingDisplay';

const PER_PAGE = 10;

export interface DriverRatingModalProps {
  visible: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  ratingsCount: number;
  avgRating?: number | null;
}

type LoadOption = {
  value: string;
  label: string;
};

function RatingListItem({ rating }: { rating: DriverRating }) {
  const value = getRatingValue(rating);
  const text =
    rating.message ??
    rating.comments ??
    (typeof rating.comment === 'string' ? rating.comment : '');
  const orderNumber = rating.order_number ?? rating.load_number;
  const dateTime = formatRatingDateTime(rating.time ?? rating.date ?? null);

  return (
    <View style={styles.ratingCard}>
      <View style={styles.ratingCardTop}>
        <Text style={styles.ratingCardAuthor} numberOfLines={2}>
          {rating.name ?? '—'}
          {orderNumber ? (
            <Text style={styles.ratingCardOrder}> Order: {orderNumber}</Text>
          ) : null}
        </Text>
        {value != null ? (
          <View style={styles.ratingCardRight}>
            <StarRatingDisplay value={value} size={fp(14)} />
            {dateTime ? <Text style={styles.ratingCardDate}>{dateTime}</Text> : null}
          </View>
        ) : null}
      </View>
      {text ? <Text style={styles.ratingCardMessage}>{text}</Text> : null}
    </View>
  );
}

export default function DriverRatingModal({
  visible,
  onClose,
  driverId,
  driverName,
  ratingsCount,
  avgRating,
}: DriverRatingModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { authState } = useAuth();
  const userExternalId = (authState.user?.externalId ?? '').trim();

  const [selectedLoad, setSelectedLoad] = useState('');
  const [ratingValue, setRatingValue] = useState(0);
  const [comments, setComments] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [loadPickerOpen, setLoadPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelectedLoad('');
      setRatingValue(0);
      setComments('');
      setAddError(null);
      setLoadPickerOpen(false);
    }
  }, [visible]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['driver-ratings', driverId, userExternalId],
    queryFn: ({ pageParam }) =>
      getDriverRatings({
        driverId,
        userId: userExternalId,
        perPage: PER_PAGE,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const { totalPages, currentPage, hasMore, count } = getRatingsPagination(lastPage);
      if (hasMore) return currentPage + 1;
      if (totalPages > 0 && currentPage < totalPages) return currentPage + 1;
      if (count >= PER_PAGE) return lastPageParam + 1;
      return undefined;
    },
    enabled: visible && !!driverId && !!userExternalId,
  });

  const firstPage = data?.pages[0];
  const availableLoads: LoadForRating[] = firstPage
    ? extractLoadsForRating(firstPage)
    : [];
  const ratingsMeta = firstPage ? extractRatingsMeta(firstPage) : null;

  const ratings: DriverRating[] = useMemo(
    () => data?.pages.flatMap((page) => extractRatingsFromResponse(page)) ?? [],
    [data?.pages]
  );

  const loadOptions: LoadOption[] = useMemo(() => {
    const items = availableLoads.map((load) => ({
      value: load.load_number,
      label: formatLoadOptionLabel(load),
    }));
    items.push({ value: CANCELED_LOAD_VALUE, label: CANCELED_LOAD_VALUE });
    return items;
  }, [availableLoads]);

  const selectedLoadLabel =
    loadOptions.find((opt) => opt.value === selectedLoad)?.label ?? 'Select a load...';

  const displayedRatingsCount = ratingsMeta?.totalRatings ?? ratingsCount;
  const displayedAvgRating = ratingsMeta?.averageRating ?? avgRating ?? null;

  const addMutation = useMutation({
    mutationFn: () =>
      postDriverRating({
        driverId,
        userId: userExternalId,
        rating: ratingValue,
        loadNumber: selectedLoad,
        comments,
      }),
    onSuccess: async (response) => {
      const addedRating = ratingValue;
      const responseMeta = extractRatingsMeta(response);

      setComments('');
      setRatingValue(0);
      setSelectedLoad('');
      setAddError(null);

      await queryClient.cancelQueries({
        queryKey: ['driver-ratings', driverId, userExternalId],
        exact: true,
      });
      await queryClient.resetQueries({
        queryKey: ['driver-ratings', driverId, userExternalId],
        exact: true,
      });

      queryClient.setQueriesData(
        { queryKey: ['drivers-list'] },
        (old: InfiniteData<TmsDriversSearchPage> | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: {
                ...page.data,
                results: page.data.results.map((driver) => {
                  const id = String(driver.meta_data?.driver_id ?? driver.id ?? '');
                  if (id !== String(driverId)) return driver;
                  const prevCount = driver.rating?.count ?? 0;
                  const prevAvg = driver.rating?.avg_rating ?? 0;
                  const newCount =
                    responseMeta.totalRatings > 0
                      ? responseMeta.totalRatings
                      : prevCount + 1;
                  const newAvg =
                    responseMeta.averageRating ??
                    computeUpdatedAverageRating(prevAvg, prevCount, addedRating);
                  return {
                    ...driver,
                    rating: { count: newCount, avg_rating: newAvg },
                  };
                }),
              },
            })),
          };
        }
      );

      await queryClient.invalidateQueries({
        queryKey: ['drivers-list'],
        refetchType: 'active',
      });
    },
    onError: (err: Error) => {
      setAddError(err.message || 'Failed to add rating');
    },
  });

  const handleAdd = useCallback(() => {
    setAddError(null);
    if (!selectedLoad) {
      setAddError('Please select a load');
      return;
    }
    if (ratingValue < 1 || ratingValue > 5) {
      setAddError('Please select a rating from 1 to 5 stars');
      return;
    }
    if (!userExternalId) {
      setAddError('User id is missing — cannot add a rating');
      return;
    }
    addMutation.mutate();
  }, [selectedLoad, ratingValue, userExternalId, addMutation]);

  const loadsMessage = getAvailableLoadsMessage(availableLoads.length);
  const loadsMessageStyle =
    availableLoads.length > 0 ? styles.loadsMessageOk : styles.loadsMessageEmpty;

  const listHeader = (
    <View>
      <Text style={styles.sectionLabel}>Load number</Text>
      <TouchableOpacity
        style={styles.selectTrigger}
        onPress={() => setLoadPickerOpen(true)}
        activeOpacity={0.7}
        disabled={isPending}
      >
        <Text
          style={[
            styles.selectTriggerText,
            !selectedLoad && styles.selectTriggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedLoadLabel}
        </Text>
        <Text style={styles.selectChevron}>▼</Text>
      </TouchableOpacity>
      {!isPending ? <Text style={loadsMessageStyle}>{loadsMessage}</Text> : null}

      <Text style={styles.sectionLabel}>Select Rating</Text>
      <StarRatingInput
        value={ratingValue}
        onChange={setRatingValue}
        disabled={addMutation.isPending}
      />

      <Text style={styles.sectionLabel}>Comments</Text>
      <TextInput
        style={styles.textArea}
        value={comments}
        onChangeText={setComments}
        placeholder="Enter comment..."
        placeholderTextColor={colors.neutral.grey}
        multiline
        textAlignVertical="top"
        editable={!addMutation.isPending}
      />

      {addError ? <Text style={styles.addError}>{addError}</Text> : null}

      <TouchableOpacity
        style={[
          styles.btnAddRating,
          (!selectedLoad || ratingValue < 1 || addMutation.isPending || !userExternalId) &&
            styles.btnAddRatingDisabled,
        ]}
        onPress={handleAdd}
        disabled={
          !selectedLoad || ratingValue < 1 || addMutation.isPending || !userExternalId
        }
        activeOpacity={0.85}
      >
        {addMutation.isPending ? (
          <ActivityIndicator color={colors.neutral.white} />
        ) : (
          <Text style={styles.btnAddRatingText}>Add Rating</Text>
        )}
      </TouchableOpacity>

      <View style={styles.driverCountBlock}>
        <View style={styles.driverCountRow}>
          <Text style={styles.driverNameInModal} numberOfLines={2}>
            {driverName}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{displayedRatingsCount}</Text>
          </View>
        </View>
        {displayedAvgRating != null && displayedAvgRating > 0 ? (
          <Text style={styles.avgText}>
            Avg: {Number(displayedAvgRating).toFixed(2)} / 5
          </Text>
        ) : null}
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: DriverRating }) => <RatingListItem rating={item} />,
    []
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + rem(12) }]}>
          <Text style={styles.title}>Driver Ratings</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {isError ? (
            <View style={styles.centerPad}>
              <Text style={styles.loadError}>Failed to load ratings.</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={ratings}
              keyExtractor={(item, idx) =>
                item.id != null ? String(item.id) : `rating-${idx}`
              }
              renderItem={renderItem}
              ListHeaderComponent={listHeader}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom, rem(20)) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) fetchNextPage();
              }}
              onEndReachedThreshold={0.35}
              ListEmptyComponent={
                isPending ? (
                  <View style={styles.centerPad}>
                    <ActivityIndicator size="large" color={colors.primary.blue} />
                  </View>
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No ratings found for this driver.</Text>
                  </View>
                )
              }
              ListFooterComponent={
                isFetchingNextPage ? (
                  <ActivityIndicator
                    style={{ marginVertical: rem(12) }}
                    color={colors.primary.blue}
                  />
                ) : null
              }
            />
          )}
        </KeyboardAvoidingView>

        {loadPickerOpen ? (
          <View style={styles.pickerOverlay} pointerEvents="box-none">
            <Pressable style={styles.pickerBackdrop} onPress={() => setLoadPickerOpen(false)} />
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Load number</Text>
              <FlatList
                data={loadOptions}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = selectedLoad === item.value;
                  return (
                    <TouchableOpacity
                      style={[styles.pickerRow, selected && styles.pickerRowActive]}
                      onPress={() => {
                        setSelectedLoad(item.value);
                        setLoadPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[styles.pickerRowText, selected && styles.pickerRowTextActive]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(20),
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
  },
  title: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  close: {
    fontSize: fp(17),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  keyboardWrap: {
    flex: 1,
  },
  list: {
    flex: 1,
    paddingHorizontal: rem(20),
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: rem(16),
  },
  sectionLabel: {
    marginTop: rem(18),
    marginBottom: rem(8),
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(14),
    paddingVertical: rem(12),
    backgroundColor: colors.neutral.white,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  selectTriggerPlaceholder: {
    color: colors.neutral.grey,
  },
  selectChevron: {
    marginLeft: rem(8),
    fontSize: fp(12),
    color: colors.neutral.grey,
  },
  loadsMessageOk: {
    marginTop: rem(6),
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: '#16A34A',
  },
  loadsMessageEmpty: {
    marginTop: rem(6),
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
  },
  textArea: {
    minHeight: rem(100),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(14),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(10),
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(10),
    backgroundColor: colors.neutral.white,
  },
  addError: {
    fontSize: fp(13),
    color: colors.semantic.error,
    marginBottom: rem(8),
  },
  btnAddRating: {
    paddingVertical: rem(14),
    borderRadius: rem(10),
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rem(4),
  },
  btnAddRatingDisabled: {
    opacity: 0.55,
  },
  btnAddRatingText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  driverCountBlock: {
    marginTop: rem(8),
    marginBottom: rem(8),
  },
  driverCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(10),
  },
  driverNameInModal: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  countBadge: {
    minWidth: rem(32),
    paddingHorizontal: rem(8),
    paddingVertical: rem(4),
    borderRadius: rem(14),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  avgText: {
    marginTop: rem(4),
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.grey,
  },
  ratingCard: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    padding: rem(14),
    marginBottom: rem(12),
    backgroundColor: colors.neutral.veryLightGrey,
    maxHeight: rem(140),
  },
  ratingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: rem(8),
  },
  ratingCardAuthor: {
    flex: 1,
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  ratingCardOrder: {
    fontFamily: fonts['400'],
    color: colors.neutral.grey,
  },
  ratingCardRight: {
    alignItems: 'flex-end',
  },
  ratingCardDate: {
    marginTop: rem(4),
    fontSize: fp(11),
    color: colors.neutral.grey,
  },
  ratingCardMessage: {
    marginTop: rem(8),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(20),
  },
  centerPad: {
    padding: rem(24),
    alignItems: 'center',
  },
  loadError: {
    fontSize: fp(14),
    color: colors.semantic.error,
    marginBottom: rem(8),
  },
  retry: {
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  emptyBox: {
    paddingVertical: rem(16),
    paddingHorizontal: rem(12),
    borderRadius: rem(10),
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  emptyText: {
    fontSize: fp(14),
    color: colors.primary.blue,
    textAlign: 'center',
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pickerSheet: {
    maxHeight: '55%',
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: rem(16),
    borderTopRightRadius: rem(16),
    paddingTop: rem(16),
    paddingBottom: rem(24),
  },
  pickerTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
    paddingHorizontal: rem(20),
    marginBottom: rem(8),
  },
  pickerRow: {
    paddingHorizontal: rem(20),
    paddingVertical: rem(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.lightGrey,
  },
  pickerRowActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  pickerRowText: {
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  pickerRowTextActive: {
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
});

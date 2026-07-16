import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ScrollView } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { GestureHandlerRootView, RectButton } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import type { DragEndParams, RenderItemParams } from 'react-native-draggable-flatlist';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import { createOffer, type OfferRoutePoint } from '@/app-api/offers';
import { CREATE_OFFER_SPECIAL_REQUIREMENTS } from '@/constants/driversListConstants';
import {
  geocodeToFormattedAddress,
  calculateRouteDistanceMiles,
  isValidLocationFormat,
  LOCATION_FORMAT_ERROR,
  normalizeLocationForGeocode,
  needsLocationGeocode,
} from '@/utils/offerRouteLocation';
import { getRouteChronologyError } from '@/utils/offerDateTimeRange';
import OfferRouteTimePickerModal from '@/components/drivers/OfferRouteTimePickerModal';
import OfferRouteStopFlowIcon from '@/icons/OfferRouteStopFlowIcon';

/** Same as Next.js CreateOfferModal `allLocationsFilledAndValid` */
function allLocationsFilledAndValid(locs: string[]): boolean {
  return (
    locs.length >= 2 &&
    locs.every((l) => l.trim() !== '' && isValidLocationFormat(l.trim()))
  );
}

type RowType = 'pickup' | 'delivery';

interface RouteRow {
  id: string;
  type: RowType;
  location: string;
  time: string;
}

function newRow(type: RowType): RouteRow {
  return {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    location: '',
    time: '',
  };
}

/** Same as Next.js CreateOfferModal DraggableExtraRow `canRemove` */
function canRemoveRouteRow(rows: RouteRow[], index: number): boolean {
  const row = rows[index];
  if (!row) return false;
  if (row.type === 'pickup') {
    return rows.filter((r) => r.type === 'pickup').length > 1;
  }
  return rows.filter((r) => r.type === 'delivery').length > 1;
}

export interface SelectedDriverLine {
  id: string;
  /** e.g. "(4040) Jane Doe" */
  label: string;
}

interface CreateOfferSheetProps {
  visible: boolean;
  onClose: () => void;
  externalId: string;
  selectedDriverIds: string[];
  /** Display lines for selected drivers (same order as selection is optional; parent should match ids). */
  selectedDrivers?: SelectedDriverLine[];
  /** Rounded miles from TMS id_posts (address search); same as web CreateOfferModal. */
  driverEmptyMiles?: Record<string, number>;
  /** Remove one driver from the offer recipient list (updates parent selection). */
  onRemoveSelectedDriver: (driverId: string) => void;
  onSuccess: () => void;
}

export default function CreateOfferSheet({
  visible,
  onClose,
  externalId,
  selectedDriverIds,
  selectedDrivers,
  driverEmptyMiles,
  onRemoveSelectedDriver,
  onSuccess,
}: CreateOfferSheetProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const offeredRateFieldRef = useRef<View>(null);
  const weightFieldRef = useRef<View>(null);
  const commodityFieldRef = useRef<View>(null);
  const notesFieldRef = useRef<View>(null);
  /** Skip keyboard dismiss while we programmatically scroll a focused field into view. */
  const isProgrammaticScrollRef = useRef(false);
  const [driversExpanded, setDriversExpanded] = useState(false);
  const [routeRows, setRouteRows] = useState<RouteRow[]>(() => [newRow('pickup'), newRow('delivery')]);
  const [timePickerRowId, setTimePickerRowId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [offeredRate, setOfferedRate] = useState('');
  /** Trimmed locations in row order; updated on blur / add / remove / reorder (Next `committedLocations`). */
  const [committedLocations, setCommittedLocations] = useState<string[]>([]);
  const [routeRowLocationErrors, setRouteRowLocationErrors] = useState<Record<string, string>>({});
  const [commodity, setCommodity] = useState('');
  const [notes, setNotes] = useState('');
  const [special, setSpecial] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Remounts NestableDraggableFlatList so invalid drops cannot leave the list stuck (matches web: drop is rejected). */
  const [routeDndListKey, setRouteDndListKey] = useState(0);

  const resetForm = useCallback(() => {
    setRouteRows([newRow('pickup'), newRow('delivery')]);
    setWeight('');
    setOfferedRate('');
    setCommittedLocations([]);
    setRouteRowLocationErrors({});
    setCommodity('');
    setNotes('');
    setSpecial(new Set());
    setError('');
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible && !wasOpen.current) {
      resetForm();
      setDriversExpanded(false);
      setTimePickerRowId(null);
      setRouteDndListKey((k) => k + 1);
    }
    wasOpen.current = visible;
  }, [visible, resetForm]);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const dismissKeyboardFromUserScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    Keyboard.dismiss();
  }, []);

  const scrollFieldIntoView = useCallback((
    fieldRef: React.RefObject<View | null>,
    preferScrollToEnd = false
  ) => {
    // Wait for the soft keyboard to settle. On Android, scrolling too early
    // (or dismissing on momentum) often closes the keyboard right after focus.
    const delay = Platform.OS === 'ios' ? 350 : 280;
    setTimeout(() => {
      isProgrammaticScrollRef.current = true;
      const clearProgrammaticFlag = () => {
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 400);
      };

      if (preferScrollToEnd) {
        scrollRef.current?.scrollToEnd({ animated: true });
        clearProgrammaticFlag();
        return;
      }

      const field = fieldRef.current;
      const content = scrollContentRef.current;
      if (!field || !content || !scrollRef.current) {
        isProgrammaticScrollRef.current = false;
        return;
      }

      field.measureLayout(
        content,
        (_x, y) => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - rem(80)),
            animated: true,
          });
          clearProgrammaticFlag();
        },
        () => {
          scrollRef.current?.scrollToEnd({ animated: true });
          clearProgrammaticFlag();
        }
      );
    }, delay);
  }, []);

  const handleClose = useCallback(() => {
    dismissKeyboard();
    onClose();
  }, [dismissKeyboard, onClose]);

  const driverLines = useMemo((): SelectedDriverLine[] => {
    const byId = new Map((selectedDrivers ?? []).map((d) => [d.id, d.label]));
    return selectedDriverIds.map((id) => ({
      id,
      label: byId.get(id) ?? `Driver ${id}`,
    }));
  }, [selectedDriverIds, selectedDrivers]);

  const toggleDriversList = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setDriversExpanded((e) => !e);
  };

  const toggleSpecial = (v: string) => {
    setSpecial((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const parseNum = (s: string) => {
    const n = parseFloat(String(s).replace(/,/g, '').trim());
    return Number.isNaN(n) ? undefined : n;
  };

  const parseOfferedRate = (s: string): number | undefined => {
    const trimmed = String(s).replace(/,/g, '').trim();
    if (!trimmed) return undefined;
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? undefined : n;
  };

  const commitLocationsFromRows = useCallback((rows: RouteRow[]) => {
    const allFilled = rows.every((r) => r.location.trim() !== '');
    const allValid = rows.every((r) => isValidLocationFormat(r.location.trim()));
    if (!allFilled || !allValid) {
      setCommittedLocations([]);
      return;
    }
    setCommittedLocations(rows.map((r) => r.location.trim()));
  }, []);

  const {
    data: routeDistanceMiles,
    isFetching: isCalculatingRoute,
    error: routeDistanceQueryError,
    isError: routeDistanceIsError,
  } = useQuery({
    queryKey: ['route-distance', committedLocations],
    queryFn: () =>
      calculateRouteDistanceMiles(committedLocations).then((r) => r.loadedMiles),
    enabled: allLocationsFilledAndValid(committedLocations),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  const calculatedLoadedMiles =
    !routeDistanceIsError &&
    routeDistanceMiles != null &&
    Number.isFinite(routeDistanceMiles)
      ? routeDistanceMiles
      : null;
  const routeDistanceError = routeDistanceQueryError
    ? routeDistanceQueryError instanceof Error
      ? routeDistanceQueryError.message
      : 'Could not calculate route distance'
    : null;

  const handleAddressBlur = useCallback(
    async (rowId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setRouteRowLocationErrors((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
        setRouteRows((current) => {
          commitLocationsFromRows(current);
          return current;
        });
        return;
      }

      if (!isValidLocationFormat(trimmed)) {
        setRouteRowLocationErrors((prev) => ({
          ...prev,
          [rowId]: LOCATION_FORMAT_ERROR,
        }));
        return;
      }

      setRouteRowLocationErrors((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });

      const geocodeAddress = normalizeLocationForGeocode(trimmed);

      if (needsLocationGeocode(trimmed)) {
        try {
          const formatted = await geocodeToFormattedAddress(geocodeAddress);
          setRouteRows((prev) => {
            const idx = prev.findIndex((r) => r.id === rowId);
            if (idx < 0) return prev;
            const next = [...prev];
            if (formatted && formatted !== trimmed) {
              next[idx] = { ...next[idx], location: formatted };
            }
            commitLocationsFromRows(next);
            return next;
          });
        } catch {
          setRouteRows((current) => {
            commitLocationsFromRows(current);
            return current;
          });
        }
        return;
      }

      if (geocodeAddress !== trimmed) {
        setRouteRows((prev) => {
          const idx = prev.findIndex((r) => r.id === rowId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], location: geocodeAddress };
          commitLocationsFromRows(next);
          return next;
        });
        return;
      }

      setRouteRows((current) => {
        commitLocationsFromRows(current);
        return current;
      });
    },
    [commitLocationsFromRows]
  );

  const validate = (): string | null => {
    const w = parseNum(weight);
    if (w == null || w < 0) return 'Weight is required';
    if (isCalculatingRoute) {
      return 'Please wait for route distance calculation to complete';
    }
    if (calculatedLoadedMiles == null) {
      return 'Route distance could not be calculated';
    }
    if (calculatedLoadedMiles === 0) {
      return 'Loaded miles must be greater than zero';
    }

    const trimmed = routeRows.map((r) => ({
      ...r,
      location: r.location.trim(),
      time: r.time.trim(),
    }));

    const pickups = trimmed.filter((r) => r.type === 'pickup' && r.location && r.time);
    const deliveries = trimmed.filter((r) => r.type === 'delivery' && r.location && r.time);
    if (pickups.length === 0 || deliveries.length === 0) {
      return 'At least one Pick up and one Delivery with location, date and time are required';
    }
    if (trimmed.some((r) => !r.time)) return 'Each stop must have a date and time';
    if (trimmed.some((r) => !r.location)) return 'Each stop must have a location';
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (first.type !== 'pickup') return 'The first stop must be Pick up';
    if (last.type !== 'delivery') return 'The last stop must be Delivery';
    if (trimmed.some((r) => r.location && !isValidLocationFormat(r.location))) {
      return LOCATION_FORMAT_ERROR;
    }
    const routeChronologyError = getRouteChronologyError(trimmed.map((r) => r.time));
    if (routeChronologyError) return routeChronologyError;
    return null;
  };

  const submit = async () => {
    setError('');
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    if (selectedDriverIds.length === 0) {
      setError('Select at least one driver');
      return;
    }

    const offeredRateRaw = offeredRate.trim();
    const parsedOfferedRate =
      offeredRateRaw === '' ? undefined : parseOfferedRate(offeredRateRaw);
    if (offeredRateRaw !== '' && parsedOfferedRate == null) {
      setError('Enter a valid offered rate');
      return;
    }
    if (parsedOfferedRate != null && parsedOfferedRate < 0) {
      setError('Offered rate must be 0 or greater');
      return;
    }

    const route: OfferRoutePoint[] = routeRows.map((row) => ({
      type: row.type === 'pickup' ? 'pick_up_location' : 'delivery_location',
      location: row.location.trim(),
      time: row.time.trim(),
    }));

    setSubmitting(true);
    try {
      const emptyMiles =
        driverEmptyMiles && Object.keys(driverEmptyMiles).length > 0
          ? driverEmptyMiles
          : undefined;
      const result = await createOffer({
        externalId: externalId.trim() || undefined,
        driverIds: selectedDriverIds,
        route,
        loadedMiles: Math.round(calculatedLoadedMiles!),
        ...(parsedOfferedRate != null ? { offeredRate: parsedOfferedRate } : {}),
        weight: parseNum(weight)!,
        ...(emptyMiles ? { driverEmptyMiles: emptyMiles } : {}),
        commodity: commodity.trim() || undefined,
        notes: notes.trim() || undefined,
        specialRequirements: special.size ? Array.from(special) : undefined,
      });
      if (result.success) {
        resetForm();
        onSuccess();
        onClose();
      } else {
        setError(result.error ?? 'Failed to create offer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  const addPickup = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setCommittedLocations([]);
    setRouteRows((rows) => {
      if (rows.length < 2) return rows;
      const next = [...rows];
      next.splice(next.length - 1, 0, newRow('pickup'));
      return next;
    });
  };

  const addDelivery = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setCommittedLocations([]);
    setRouteRows((rows) => [...rows, newRow('delivery')]);
  };

  const removeRow = useCallback(
    (index: number) => {
      setRouteRows((rows) => {
        if (!canRemoveRouteRow(rows, index)) return rows;
        if (Platform.OS === 'android') {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        const next = rows.filter((_, i) => i !== index);
        commitLocationsFromRows(next);
        return next;
      });
    },
    [commitLocationsFromRows]
  );

  const updateRow = useCallback((index: number, field: 'location' | 'time', value: string) => {
    setRouteRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }, []);

  const onRouteDragEnd = useCallback(({ data }: DragEndParams<RouteRow>) => {
    if (data.length === 0) return;
    const firstOk = data[0].type === 'pickup';
    const lastOk = data[data.length - 1].type === 'delivery';
    if (!firstOk || !lastOk) {
      setRouteDndListKey((k) => k + 1);
      setRouteRows((prev) => prev.map((r) => ({ ...r })));
      if (Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      return;
    }
    setRouteRows(data);
    commitLocationsFromRows(data);
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [commitLocationsFromRows]);

  const renderRouteItem = useCallback(
    ({ item, drag, getIndex }: RenderItemParams<RouteRow>) => {
      const index = getIndex() ?? 0;
      const canReorder = routeRows.length > 2;

      const card = (
        <View style={styles.routeCard}>
          <View style={styles.routeCardHeader}>
            <View style={styles.routeCardHeaderLeft}>
              <Image
                source={
                  item.type === 'pickup'
                    ? require('@/icons/pickUpIcon.png')
                    : require('@/icons/deliveryIcon.png')
                }
                style={styles.routeCardTypeIcon}
                contentFit="contain"
              />
              <Text style={styles.routeCardTitle} numberOfLines={1}>
                {item.type === 'pickup' ? 'Pick up' : 'Delivery'}
              </Text>
            </View>
            <Pressable
              onLongPress={canReorder ? drag : undefined}
              delayLongPress={280}
              style={({ pressed }) => [
                styles.routeCardHeaderIcon,
                canReorder && pressed && styles.routeCardDragHandlePressed,
              ]}
              disabled={!canReorder}
              accessibilityLabel={
                canReorder ? 'Hold and drag to reorder this stop' : undefined
              }
              accessibilityRole={canReorder ? 'button' : 'none'}
            >
              <OfferRouteStopFlowIcon
                color={colors.neutral.white}
                width={rem(30)}
                height={rem(25)}
              />
            </Pressable>
          </View>
          <View style={styles.routeCardBody}>
            <View style={styles.locationTimeRow}>
              <TextInput
                style={[
                  styles.locationInput,
                  routeRowLocationErrors[item.id] ? styles.locationInputError : null,
                ]}
                value={item.location}
                onChangeText={(t) => {
                  const i = getIndex();
                  if (i !== undefined) {
                    updateRow(i, 'location', t);
                    setRouteRowLocationErrors((prev) => {
                      if (!prev[item.id]) return prev;
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    });
                  }
                }}
                onBlur={() => {
                  void handleAddressBlur(item.id, item.location);
                }}
                showSoftInputOnFocus
                placeholder={
                  item.type === 'pickup'
                    ? 'Enter pick up location'
                    : 'Enter delivery location'
                }
                placeholderTextColor={colors.neutral.grey}
              />
              <TouchableOpacity
                style={styles.timeTrigger}
                onPress={() => setTimePickerRowId(item.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.timeTriggerText,
                    !item.time.trim() && styles.timeTriggerPlaceholder,
                  ]}
                  numberOfLines={2}
                >
                  {item.time.trim() || 'Select date & time (optional end below)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );

      const wrapped =
        !canRemoveRouteRow(routeRows, index) ? (
          card
        ) : (
          <Swipeable
            overshootRight={false}
            friction={2}
            rightThreshold={rem(56)}
            renderRightActions={() => (
              <View style={styles.routeSwipeActionWrap}>
                <RectButton
                  style={styles.routeSwipeDeleteBtn}
                  onPress={() => {
                    const i = getIndex();
                    if (i !== undefined) removeRow(i);
                  }}
                  accessibilityLabel="Remove this stop"
                >
                  <Image
                    source={require('@/icons/deletePickUp.png')}
                    style={styles.routeSwipeDeleteIcon}
                    contentFit="contain"
                  />
                </RectButton>
              </View>
            )}
          >
            {card}
          </Swipeable>
        );

      return <ScaleDecorator>{wrapped}</ScaleDecorator>;
    },
    [routeRows, removeRow, updateRow, routeRowLocationErrors, handleAddressBlur]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + rem(12) }]}>
          <Text style={styles.title}>Create offer</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          // Android: let the system resize the Modal window. `behavior="height"`
          // fights soft-input and can prevent the keyboard from staying open.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
        <NestableScrollContainer
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={dismissKeyboardFromUserScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View ref={scrollContentRef} collapsable={false}>
          <TouchableOpacity
            style={styles.hintRow}
            onPress={toggleDriversList}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Selected drivers"
            accessibilityHint="Tap to show or hide the list of selected drivers"
          >
            <Text style={styles.hint}>
              {selectedDriverIds.length} driver{selectedDriverIds.length === 1 ? '' : 's'} selected
            </Text>
            <Text style={styles.hintChevron}>{driversExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {driversExpanded ? (
            <View style={styles.driverListBox}>
              {driverLines.map((line, idx) => (
                <View
                  key={line.id}
                  style={[
                    styles.driverListRow,
                    idx === driverLines.length - 1 && styles.driverListRowLast,
                  ]}
                >
                  <Text style={styles.driverListItemText} numberOfLines={2}>
                    {line.label}
                  </Text>
                  <TouchableOpacity
                    style={styles.driverRemoveBtn}
                    onPress={() => {
                      if (Platform.OS === 'android') {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      }
                      onRemoveSelectedDriver(line.id);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${line.label} from offer`}
                  >
                    <MaterialIcons name="close" size={22} color={colors.semantic.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <NestableDraggableFlatList
            key={`route-dnd-${routeDndListKey}`}
            data={routeRows}
            extraData={routeDndListKey}
            keyExtractor={(item) => item.id}
            renderItem={renderRouteItem}
            onDragEnd={onRouteDragEnd}
            scrollEnabled={false}
            activationDistance={14}
            containerStyle={styles.routeListContainer}
          />

          <View style={styles.addStopsRow}>
            <TouchableOpacity style={styles.addStopBtnHalf} onPress={addPickup} activeOpacity={0.85}>
              <View style={styles.addStopBtnInner}>
                <Image
                  source={require('@/icons/pickUp.png')}
                  style={styles.addStopIcon}
                  contentFit="contain"
                />
                <Text style={styles.addStopBtnHalfText}>Add Pick Up</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addStopBtnHalf} onPress={addDelivery} activeOpacity={0.85}>
              <View style={styles.addStopBtnInner}>
                <Image
                  source={require('@/icons/delivery.png')}
                  style={styles.addStopIcon}
                  contentFit="contain"
                />
                <Text style={styles.addStopBtnHalfText}>Add Delivery</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View ref={offeredRateFieldRef} collapsable={false}>
            <Text style={styles.label}>Offered rate</Text>
            <TextInput
              style={styles.input}
              value={offeredRate}
              onChangeText={setOfferedRate}
              onFocus={() => scrollFieldIntoView(offeredRateFieldRef)}
              keyboardType="decimal-pad"
              showSoftInputOnFocus
              placeholder="e.g. 2500.50"
              placeholderTextColor={colors.neutral.grey}
            />
          </View>

          <View style={styles.formRowHalf} ref={weightFieldRef} collapsable={false}>
            <View style={styles.formHalfColumn}>
              <Text style={styles.label}>Loaded miles *</Text>
              <View style={styles.loadedMilesWrap}>
                <TextInput
                  style={[styles.input, styles.inputInHalfColumn, styles.loadedMilesInput]}
                  value={
                    calculatedLoadedMiles != null && Number.isFinite(calculatedLoadedMiles)
                      ? String(Math.round(calculatedLoadedMiles))
                      : ''
                  }
                  editable={false}
                  placeholder="Fill all addresses and blur to calculate"
                  placeholderTextColor={colors.neutral.grey}
                />
                {isCalculatingRoute ? (
                  <View style={styles.loadedMilesSpinner} pointerEvents="none">
                    <ActivityIndicator color={colors.primary.blue} />
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.formHalfColumn}>
              <Text style={styles.label}>Weight *</Text>
              <TextInput
                style={[styles.input, styles.inputInHalfColumn]}
                value={weight}
                onChangeText={setWeight}
                onFocus={() => scrollFieldIntoView(weightFieldRef)}
                keyboardType="decimal-pad"
                showSoftInputOnFocus
                placeholder="e.g. 1,000 lbs"
                placeholderTextColor={colors.neutral.grey}
              />
            </View>
          </View>

          {routeDistanceError ? (
            <Text style={styles.routeDistanceError}>{routeDistanceError}</Text>
          ) : null}

          <View ref={commodityFieldRef} collapsable={false}>
            <Text style={styles.label}>Commodity</Text>
            <TextInput
              style={styles.input}
              value={commodity}
              onChangeText={setCommodity}
              onFocus={() => scrollFieldIntoView(commodityFieldRef)}
              showSoftInputOnFocus
              placeholder="Enter commodity"
              placeholderTextColor={colors.neutral.grey}
            />
          </View>

          <Text style={styles.label}>Special requirements</Text>
          <View style={styles.specWrap}>
            {CREATE_OFFER_SPECIAL_REQUIREMENTS.map((opt) => {
              const on = special.has(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.specChip, on && styles.specChipOn]}
                  onPress={() => toggleSpecial(opt.value)}
                >
                  <Text style={[styles.specChipText, on && styles.specChipTextOn]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View ref={notesFieldRef} collapsable={false}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => scrollFieldIntoView(notesFieldRef, true)}
              multiline
              showSoftInputOnFocus
              placeholder="Enter notes"
              placeholderTextColor={colors.neutral.grey}
            />
          </View>
          </View>
        </NestableScrollContainer>

        <View
          style={[
            styles.submitFooter,
            { paddingBottom: Math.max(insets.bottom, rem(8)) },
          ]}
        >
          {error ? <Text style={styles.errorFooter}>{error}</Text> : null}
          <TouchableOpacity
            style={[
              styles.submit,
              (submitting ||
                isCalculatingRoute ||
                calculatedLoadedMiles == null ||
                calculatedLoadedMiles === 0) &&
                styles.submitDisabled,
            ]}
            onPress={submit}
            disabled={
              submitting ||
              isCalculatingRoute ||
              calculatedLoadedMiles == null ||
              calculatedLoadedMiles === 0
            }
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.neutral.white} />
            ) : (
              <View style={styles.submitInner}>
                <Image
                  source={require('@/icons/createOffer.png')}
                  style={styles.submitIcon}
                  contentFit="contain"
                />
                <Text style={styles.submitText}>Create offer</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>

        <OfferRouteTimePickerModal
          visible={timePickerRowId !== null}
          initialTime={
            timePickerRowId
              ? routeRows.find((r) => r.id === timePickerRowId)?.time ?? ''
              : ''
          }
          onClose={() => setTimePickerRowId(null)}
          onSet={(time) => {
            if (timePickerRowId) {
              setRouteRows((rows) =>
                rows.map((r) => (r.id === timePickerRowId ? { ...r, time } : r))
              );
            }
            setTimePickerRowId(null);
          }}
        />
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  scroll: {
    flex: 1,
    paddingHorizontal: rem(20),
  },
  scrollContent: {
    paddingBottom: rem(20),
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: rem(14),
    marginBottom: rem(10),
    paddingVertical: rem(4),
  },
  hint: {
    flex: 1,
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  hintChevron: {
    fontSize: fp(12),
    color: colors.primary.blue,
    marginLeft: rem(8),
    fontFamily: fonts['600'],
  },
  driverListBox: {
    marginBottom: rem(12),
    paddingHorizontal: rem(12),
    paddingVertical: 0,
    borderRadius: rem(10),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  driverListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rem(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.lightGrey,
    gap: rem(8),
  },
  driverListRowLast: {
    borderBottomWidth: 0,
  },
  driverListItemText: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    paddingRight: rem(4),
  },
  driverRemoveBtn: {
    padding: rem(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeCard: {
    marginBottom: rem(14),
    borderRadius: rem(12),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    backgroundColor: colors.neutral.white,
    ...Platform.select({
      ios: {
        shadowColor: '#292966',
        shadowOffset: { width: 0, height: rem(3) },
        shadowOpacity: 0.12,
        shadowRadius: rem(8),
      },
      default: {
        elevation: 4,
      },
    }),
  },
  routeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rem(6),
    paddingHorizontal: rem(14),
    backgroundColor: colors.primary.violet,
  },
  routeCardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: rem(10),
  },
  routeCardTypeIcon: {
    width: rem(42),
    height: rem(42),
    marginRight: rem(10),
  },
  routeCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
    letterSpacing: 0.3,
  },
  routeCardHeaderIcon: {
    opacity: 0.95,
    paddingVertical: rem(2),
    paddingHorizontal: rem(4),
    marginRight: rem(-4),
  },
  routeCardDragHandlePressed: {
    opacity: 0.65,
  },
  routeListContainer: {
    flexGrow: 0,
  },
  routeSwipeActionWrap: {
    width: rem(100),
    marginBottom: rem(14),
    justifyContent: 'stretch',
  },
  routeSwipeDeleteBtn: {
    flex: 1,
    backgroundColor: colors.semantic.error,
    borderRadius: rem(12),
    marginLeft: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rem(10),
  },
  routeSwipeDeleteIcon: {
    width: rem(48),
    height: rem(48),
  },
  routeCardBody: {
    padding: rem(14),
    backgroundColor: colors.neutral.veryLightGrey,
  },
  locationTimeRow: {
    flexDirection: 'column',
    gap: rem(10),
  },
  locationInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(10),
    fontSize: fp(15),
    color: colors.neutral.darkGrey,
    backgroundColor: colors.neutral.white,
  },
  locationInputError: {
    borderColor: colors.semantic.error,
  },
  loadedMilesWrap: {
    position: 'relative',
    width: '100%',
  },
  loadedMilesInput: {
    backgroundColor: colors.neutral.veryLightGrey,
  },
  loadedMilesSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: rem(10),
  },
  routeDistanceError: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginTop: rem(2),
    marginBottom: rem(4),
  },
  timeTrigger: {
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(8),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(10),
    backgroundColor: colors.neutral.white,
  },
  timeTriggerText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    textAlign: 'left',
  },
  timeTriggerPlaceholder: {
    fontFamily: fonts['500'],
    color: colors.neutral.grey,
  },
  formRowHalf: {
    flexDirection: 'row',
    gap: rem(10),
    alignItems: 'flex-start',
  },
  formHalfColumn: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(6),
    marginTop: rem(8),
  },
  inputInHalfColumn: {
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: Platform.OS === 'ios' ? rem(10) : rem(8),
    fontSize: fp(15),
    color: colors.neutral.darkGrey,
  },
  notes: {
    minHeight: rem(80),
    textAlignVertical: 'top',
  },
  addStopsRow: {
    flexDirection: 'row',
    gap: rem(10),
    marginBottom: rem(20),
  },
  addStopBtnHalf: {
    flex: 1,
    minWidth: 0,
    paddingVertical: rem(5),
    paddingHorizontal: rem(6),
    borderRadius: rem(10),
    borderWidth: 2,
    borderColor: colors.primary.blue,
    backgroundColor: colors.neutral.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStopBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(8),
    maxWidth: '100%',
  },
  addStopIcon: {
    width: rem(36),
    height: rem(36),
  },
  addStopBtnHalfText: {
    flexShrink: 1,
    fontSize: fp(15),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    textAlign: 'center',
  },
  specWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  specChip: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(7),
    borderRadius: rem(8),
    backgroundColor: colors.neutral.lightGrey,
  },
  specChipOn: {
    backgroundColor: colors.primary.blue,
  },
  specChipText: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  specChipTextOn: {
    color: colors.neutral.white,
    fontFamily: fonts['600'],
  },
  submitFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral.lightGrey,
    backgroundColor: colors.neutral.white,
    paddingHorizontal: rem(20),
    paddingTop: rem(8),
  },
  errorFooter: {
    color: colors.semantic.error,
    fontSize: fp(14),
    marginBottom: rem(8),
  },
  submit: {
    backgroundColor: colors.primary.blue,
    paddingVertical: rem(6),
    borderRadius: rem(12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: rem(46),
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(10),
  },
  submitIcon: {
    width: rem(40),
    height: rem(40),
  },
  submitText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['700'],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

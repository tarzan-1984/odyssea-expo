import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { User } from '@/context/AuthContext';
import CloseIcon from '@/icons/CloseIcon';
import FileIcon from '@/icons/FileIcon';
import SearchIcon from '@/icons/SearchIcon';
import TrashDeleteIcon from '@/icons/TrashDeleteIcon';
import {
  AdminCompanyGroupFilter,
  MessageTemplateDto,
  MessageTemplateGroupDto,
  MessageTemplateKind,
  MessageTemplateScope,
  messageTemplatesApi,
} from '@/app-api/messageTemplatesApi';

const PER_PAGE = 10;

type Props = {
  visible: boolean;
  currentUser: User | null;
  onClose: () => void;
  onInsertContent: (content: string) => void;
};

function normRole(user: User | null): string {
  return (user?.role ?? '').trim().toUpperCase();
}

function canSeeCompanyTab(user: User | null): boolean {
  const role = normRole(user);
  return [
    'ADMINISTRATOR',
    'EXPEDITE_MANAGER',
    'TRACKING_TL',
    'RECRUITER_TL',
    'RECRUITER',
    'DISPATCHER',
    'DISPATCHER_TL',
    'NIGHTSHIFT_TRACKING',
    'MORNING_TRACKING',
    'TRACKING',
  ].includes(role);
}

function canCreateCompanyTemplate(user: User | null): boolean {
  return ['ADMINISTRATOR', 'EXPEDITE_MANAGER', 'TRACKING_TL', 'RECRUITER_TL'].includes(normRole(user));
}

function canEditTemplate(tpl: MessageTemplateDto, user: User | null): boolean {
  if (!user) return false;
  const role = normRole(user);
  const externalId = typeof user.externalId === 'string' ? user.externalId.trim() : '';
  if (tpl.type === 'personal') return tpl.externalId === externalId || role === 'ADMINISTRATOR';
  if (role === 'ADMINISTRATOR') return true;
  if (!['EXPEDITE_MANAGER', 'TRACKING_TL', 'RECRUITER_TL'].includes(role)) return false;
  return tpl.externalId === externalId;
}

function managerDefaultGroup(user: User | null): MessageTemplateGroupDto {
  const role = normRole(user);
  if (role === 'TRACKING_TL') return 'Tracking';
  if (role === 'RECRUITER_TL') return 'HR';
  return 'Expedite';
}

const adminGroupTabs: { id: AdminCompanyGroupFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Tracking', label: 'Tracking' },
  { id: 'HR', label: 'HR' },
  { id: 'Expedite', label: 'Expedite' },
];

export default function MessageTemplatesModal({
  visible,
  currentUser,
  onClose,
  onInsertContent,
}: Props) {
  const [tab, setTab] = useState<MessageTemplateScope>('personal');
  const [companyGroupFilter, setCompanyGroupFilter] = useState<AdminCompanyGroupFilter>('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MessageTemplateDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftId, setDraftId] = useState<number | undefined>();
  const [draftType, setDraftType] = useState<MessageTemplateKind>('personal');
  const [draftGroup, setDraftGroup] = useState<MessageTemplateGroupDto>('Expedite');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const showCompanyTab = useMemo(() => canSeeCompanyTab(currentUser), [currentUser]);
  const isAdmin = normRole(currentUser) === 'ADMINISTRATOR';
  const showAdd = tab === 'personal' || (tab === 'company' && canCreateCompanyTemplate(currentUser));

  const resetEditor = useCallback(() => {
    setDraftId(undefined);
    setDraftType('personal');
    setDraftGroup(managerDefaultGroup(currentUser));
    setDraftTitle('');
    setDraftMessage('');
    setEditorOpen(false);
  }, [currentUser]);

  const loadTemplates = useCallback(
    async (nextPage: number, append: boolean = false) => {
      if (!visible) return;
      if (tab === 'company' && !showCompanyTab) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await messageTemplatesApi.fetchPage({
          scope: tab,
          page: nextPage,
          limit: PER_PAGE,
          search: search.trim() || undefined,
          companyGroup: tab === 'company' && isAdmin ? companyGroupFilter : undefined,
        });
        setItems(prev => (append ? [...prev, ...result.items] : result.items));
        setPage(result.pagination.page);
        setHasMore(result.pagination.hasMore);
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to load templates');
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [companyGroupFilter, isAdmin, search, showCompanyTab, tab, visible],
  );

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setTab('personal');
      setCompanyGroupFilter('all');
      setItems([]);
      resetEditor();
      return;
    }
    const timer = setTimeout(() => {
      loadTemplates(1, false).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [loadTemplates, resetEditor, visible]);

  useEffect(() => {
    if (visible && tab === 'company' && !showCompanyTab) {
      setTab('personal');
    }
  }, [showCompanyTab, tab, visible]);

  useEffect(() => {
    if (!visible || !editorOpen) {
      setIsKeyboardVisible(false);
      return;
    }

    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [editorOpen, visible]);

  const openCreateEditor = () => {
    setDraftId(undefined);
    setDraftTitle('');
    setDraftMessage('');
    if (tab === 'personal') {
      setDraftType('personal');
      setDraftGroup(managerDefaultGroup(currentUser));
    } else {
      setDraftType('company');
      setDraftGroup(isAdmin ? 'Expedite' : managerDefaultGroup(currentUser));
    }
    setEditorOpen(true);
  };

  const openEditEditor = (tpl: MessageTemplateDto) => {
    setDraftId(tpl.id);
    setDraftType(tpl.type);
    setDraftGroup(tpl.group ?? managerDefaultGroup(currentUser));
    setDraftTitle(tpl.title ?? '');
    setDraftMessage(tpl.content ?? '');
    setEditorOpen(true);
  };

  const saveTemplate = async () => {
    const content = draftMessage.trim();
    if (!content) {
      Alert.alert('Error', 'Message is required.');
      return;
    }
    setSaving(true);
    try {
      const base = {
        ...(draftId != null ? { id: draftId } : {}),
        title: draftTitle.trim() || undefined,
        content,
      };
      if (draftType === 'company') {
        await messageTemplatesApi.upsert({
          ...base,
          type: 'company',
          ...(isAdmin ? { group: draftGroup } : {}),
        });
      } else {
        await messageTemplatesApi.upsert({ ...base, type: 'personal' });
      }
      resetEditor();
      await loadTemplates(1, false);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = (tpl: MessageTemplateDto) => {
    Alert.alert('Delete template', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await messageTemplatesApi.delete(tpl.id);
            await loadTemplates(1, false);
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  const renderTemplate = ({ item }: { item: MessageTemplateDto }) => (
    <View style={styles.templateRow}>
      <View style={styles.templateTextWrap}>
        <Text style={styles.templateTitle} numberOfLines={1}>
          {item.title?.trim() || 'Untitled'}
        </Text>
        {item.type === 'company' && item.group ? (
          <Text style={styles.templateGroup}>{item.group}</Text>
        ) : null}
        <Text style={styles.templateContent} numberOfLines={2}>
          {item.content?.trim() || '-'}
        </Text>
      </View>
      <View style={styles.templateActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            const text = item.content?.trim();
            if (!text) return;
            onInsertContent(text);
            onClose();
          }}
        >
          <Text style={styles.insertIconText}>↧</Text>
        </TouchableOpacity>
        {canEditTemplate(item, currentUser) ? (
          <TouchableOpacity style={styles.actionButton} onPress={() => openEditEditor(item)}>
            <Text style={styles.editIconText}>✎</Text>
          </TouchableOpacity>
        ) : null}
        {canEditTemplate(item, currentUser) ? (
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => deleteTemplate(item)}>
            <TrashDeleteIcon width={rem(15)} height={rem(15)} color="#E5484D" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={editorOpen ? Keyboard.dismiss : onClose}
            accessibilityRole="button"
          />
          <View style={styles.sheetWrap} pointerEvents="box-none">
            <View style={styles.modalCard}>
            {editorOpen ? (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={rem(16)}
              >
                <View style={styles.header}>
                  <Text style={styles.title}>
                    {draftId != null ? 'Edit message template' : 'Add message template'}
                  </Text>
                  <TouchableOpacity style={styles.closeButton} onPress={resetEditor} disabled={saving}>
                    <CloseIcon width={rem(20)} height={rem(20)} color={colors.primary.blue} />
                  </TouchableOpacity>
                </View>
                {isKeyboardVisible ? (
                  <TouchableOpacity
                    style={styles.headerKeyboardButton}
                    onPress={Keyboard.dismiss}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.keyboardDoneText}>Hide keyboard</Text>
                  </TouchableOpacity>
                ) : null}

                <ScrollView
                  style={styles.editorScroll}
                  contentContainerStyle={styles.editorBody}
                  keyboardShouldPersistTaps="handled"
                >
                  {draftType === 'personal' ? (
                    <Text style={styles.editorHint}>
                      Personal template (only you). Not linked to a company group.
                    </Text>
                  ) : null}

                  {draftType === 'company' && isAdmin ? (
                    <View style={[styles.groupTabs, styles.editorGroupTabs]}>
                      {(['Expedite', 'HR', 'Tracking'] as MessageTemplateGroupDto[]).map(group => (
                        <TouchableOpacity
                          key={group}
                          style={[styles.groupTab, draftGroup === group && styles.groupTabActive]}
                          onPress={() => setDraftGroup(group)}
                          disabled={saving}
                        >
                          <Text style={[styles.groupTabText, draftGroup === group && styles.groupTabTextActive]}>
                            {group}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {draftType === 'company' && !isAdmin ? (
                    <Text style={styles.editorHint}>
                      Company template · Group: {draftGroup}
                      {draftId == null ? ' (assigned from your role)' : ''}
                    </Text>
                  ) : null}

                  <TextInput
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder="Optional title"
                    placeholderTextColor={colors.neutral.darkGrey}
                    editable={!saving}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.editorInput}
                  />
                  <TextInput
                    value={draftMessage}
                    onChangeText={setDraftMessage}
                    placeholder="Template text"
                    placeholderTextColor={colors.neutral.darkGrey}
                    editable={!saving}
                    multiline
                    blurOnSubmit
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={[styles.editorInput, styles.editorMessageInput]}
                  />
                  <TouchableOpacity style={styles.saveButton} onPress={saveTemplate} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator color={colors.neutral.white} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </KeyboardAvoidingView>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Text message templates</Text>
                  {showAdd ? (
                    <TouchableOpacity style={styles.headerIconButton} onPress={openCreateEditor}>
                      <FileIcon width={rem(22)} height={rem(22)} color={colors.primary.blue} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <CloseIcon width={rem(20)} height={rem(20)} color={colors.primary.blue} />
                  </TouchableOpacity>
                </View>

                <View style={styles.tabs}>
                  <TouchableOpacity
                    style={[styles.tabButton, tab === 'personal' && styles.tabButtonActive]}
                    onPress={() => {
                      setTab('personal');
                      setCompanyGroupFilter('all');
                    }}
                  >
                    <Text style={[styles.tabText, tab === 'personal' && styles.tabTextActive]}>Personal</Text>
                  </TouchableOpacity>
                  {showCompanyTab ? (
                    <TouchableOpacity
                      style={[styles.tabButton, tab === 'company' && styles.tabButtonActive]}
                      onPress={() => setTab('company')}
                    >
                      <Text style={[styles.tabText, tab === 'company' && styles.tabTextActive]}>Company</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.searchWrap}>
                  <SearchIcon width={rem(18)} height={rem(18)} color={colors.neutral.darkGrey} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={tab === 'personal' ? 'Search personal templates' : 'Search company templates'}
                    placeholderTextColor={colors.neutral.darkGrey}
                    style={styles.searchInput}
                  />
                </View>

                {tab === 'company' && isAdmin ? (
                  <View style={styles.groupTabs}>
                    {adminGroupTabs.map(group => (
                      <TouchableOpacity
                        key={group.id}
                        style={[styles.groupTab, companyGroupFilter === group.id && styles.groupTabActive]}
                        onPress={() => setCompanyGroupFilter(group.id)}
                      >
                        <Text style={[styles.groupTabText, companyGroupFilter === group.id && styles.groupTabTextActive]}>
                          {group.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {loading ? (
                  <View style={styles.list}>
                    <View style={styles.centerState}>
                      <ActivityIndicator color={colors.primary.violet} />
                    </View>
                  </View>
                ) : (
                  <FlatList
                    style={styles.list}
                    data={items}
                    keyExtractor={item => `${item.id}-${item.updatedAt}`}
                    renderItem={renderTemplate}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
                    ListEmptyComponent={<Text style={styles.emptyText}>No templates yet.</Text>}
                    onEndReached={() => {
                      if (!hasMore || loadingMore) return;
                      loadTemplates(page + 1, true).catch(() => {});
                    }}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary.violet} /> : null}
                  />
                )}
              </>
            )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: rem(16),
  },
  modalCard: {
    width: '100%',
    height: '86%',
    maxHeight: '86%',
    backgroundColor: colors.neutral.white,
    borderRadius: rem(20),
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  editorBody: {
    paddingBottom: rem(28),
  },
  editorScroll: {
    maxHeight: rem(440),
  },
  editorCard: {
    width: '100%',
    backgroundColor: colors.neutral.white,
    borderRadius: rem(20),
    paddingBottom: rem(16),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rem(18),
    paddingVertical: rem(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(41, 41, 102, 0.12)',
    gap: rem(8),
  },
  title: {
    flex: 1,
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  editorHint: {
    marginHorizontal: rem(16),
    marginTop: rem(12),
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    borderRadius: rem(10),
    backgroundColor: 'rgba(96, 102, 197, 0.06)',
    color: colors.primary.blue,
    fontSize: fp(13),
    lineHeight: fp(18),
    fontFamily: fonts['400'],
  },
  headerIconButton: {
    width: rem(34),
    height: rem(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: rem(34),
    height: rem(34),
    borderRadius: rem(17),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(41, 41, 102, 0.12)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: rem(13),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.primary.violet,
  },
  tabText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  tabTextActive: {
    color: colors.primary.violet,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
    margin: rem(14),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    borderRadius: rem(12),
    paddingHorizontal: rem(12),
    backgroundColor: 'rgba(96, 102, 197, 0.06)',
  },
  searchInput: {
    flex: 1,
    minHeight: rem(44),
    color: colors.primary.blue,
    fontSize: fp(14),
    fontFamily: fonts['400'],
  },
  groupTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(6),
    paddingHorizontal: rem(14),
    paddingBottom: rem(10),
  },
  editorGroupTabs: {
    paddingTop: rem(14),
  },
  groupTab: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(10),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
  },
  groupTabActive: {
    backgroundColor: colors.primary.violet,
  },
  groupTabText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  groupTabTextActive: {
    color: colors.neutral.white,
  },
  centerState: {
    minHeight: rem(180),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: {
    minHeight: rem(180),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.neutral.darkGrey,
    fontSize: fp(14),
    fontFamily: fonts['400'],
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(10),
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(41, 41, 102, 0.08)',
  },
  templateTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  templateTitle: {
    color: colors.primary.blue,
    fontSize: fp(14),
    fontFamily: fonts['700'],
  },
  templateGroup: {
    marginTop: rem(2),
    color: colors.primary.violet,
    fontSize: fp(10),
    fontFamily: fonts['700'],
    textTransform: 'uppercase',
  },
  templateContent: {
    marginTop: rem(3),
    color: colors.neutral.darkGrey,
    fontSize: fp(13),
    fontFamily: fonts['400'],
  },
  templateActions: {
    flexDirection: 'row',
    gap: rem(6),
  },
  actionButton: {
    width: rem(34),
    height: rem(34),
    borderRadius: rem(9),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    borderColor: 'rgba(229, 72, 77, 0.6)',
  },
  insertIconText: {
    fontSize: fp(20),
    color: colors.primary.blue,
    lineHeight: fp(22),
  },
  editIconText: {
    fontSize: fp(18),
    color: colors.primary.blue,
    lineHeight: fp(20),
  },
  editorInput: {
    marginHorizontal: rem(16),
    marginTop: rem(12),
    borderWidth: 1,
    borderColor: 'rgba(41, 41, 102, 0.12)',
    borderRadius: rem(12),
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    backgroundColor: 'rgba(96, 102, 197, 0.06)',
  },
  editorMessageInput: {
    minHeight: rem(130),
    textAlignVertical: 'top',
  },
  headerKeyboardButton: {
    alignSelf: 'flex-end',
    marginHorizontal: rem(16),
    marginTop: rem(10),
    marginBottom: rem(2),
    paddingHorizontal: rem(12),
    paddingVertical: rem(7),
    borderRadius: rem(10),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
  },
  keyboardDoneText: {
    color: colors.primary.blue,
    fontSize: fp(12),
    fontFamily: fonts['600'],
  },
  saveButton: {
    marginHorizontal: rem(16),
    marginTop: rem(14),
    minHeight: rem(44),
    borderRadius: rem(12),
    backgroundColor: colors.primary.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts['700'],
  },
});

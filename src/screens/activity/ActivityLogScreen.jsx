import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilyActivityLog, fetchFamilies, fetchCamps } from '../../lib/supabase';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import { showError } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import colors from '../../theme/colors';

const ACTION_TYPES = [
  { key: '', icon: '👥', label: 'الكل' },
  { key: 'insert', icon: '➕', label: 'إضافة' },
  { key: 'update', icon: '✏️', label: 'تعديل' },
  { key: 'delete', icon: '🗑️', label: 'حذف' },
];

const ACTIVITY_FIELD_LABELS = {
  head_name: 'اسم رب الأسرة', head_id: 'رقم الهوية', head_dob: 'تاريخ الميلاد',
  head_gender: 'الجنس', head_marital: 'الحالة الاجتماعية', phone1: 'رقم الجوال',
  phone2: 'جوال بديل', camp_id: 'المخيم', tent: 'رقم الخيمة',
  original_address: 'العنوان الأصلي', address_details: 'تفاصيل العنوان', notes: 'ملاحظات',
  category_tags: 'الفئة الاجتماعية',
  review_status: 'حالة المراجعة', head_qualification: 'المؤهل العلمي',
};

export default function ActivityLogScreen() {
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [activity, setActivity] = useState([]);
  const [families, setFamilies] = useState([]);
  const [camps, setCamps] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [actionType, setActionType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('activity_log', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setActivity(cached.data.activity || []);
      setFamilies(cached.data.families || []);
      setCamps(cached.data.camps || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const [log, famsRaw, campsData] = await withTimeout(
        Promise.all([fetchFamilyActivityLog(orgId, 300), fetchFamilies(orgId), fetchCamps(orgId)]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const allowedCampIds = getAllowedCampIds(campsData);
      const fams = allowedCampIds === null ? famsRaw : famsRaw.filter((f) => allowedCampIds.includes(f.camp_id));
      const visibleCamps = getVisibleCamps(campsData);

      setActivity(log);
      setFamilies(fams);
      setCamps(visibleCamps);
      setOfflineInfo(null);
      cacheData('activity_log', profile?.id, { activity: log, families: fams, camps: visibleCamps });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل سجل التعديلات ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const famCampMap = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f.camp_id])), [families]);
  const allowedFamilyIds = useMemo(() => new Set(families.map((f) => f.id)), [families]);

  const filteredActivity = useMemo(() => {
    return activity
      // نطاق رؤية المستخدم -- نفس تحديد المخيمات المسموحة، بس بدون ما نفقد
      // سجلات أسر مو موجودة أصلاً بقائمة families المحمّلة (مثلاً أسرة
      // انحذفت -- سجل حذفها مهم يبقى ظاهر حتى لو الأسرة نفسها مو موجودة)
      .filter((a) => !a.family_id || allowedFamilyIds.has(a.family_id) || a.action === 'delete')
      .filter((a) => !filterCamp || famCampMap[a.family_id] === filterCamp)
      .filter((a) => !actionType || a.action === actionType)
      .filter((a) => !search.trim() || (a.family_name || '').includes(search) || (a.actor_name || '').includes(search))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [activity, allowedFamilyIds, famCampMap, filterCamp, actionType, search]);

  const actionCounts = useMemo(() => {
    const base = filterCamp ? activity.filter((a) => famCampMap[a.family_id] === filterCamp) : activity;
    const counts = { '': base.length };
    ACTION_TYPES.forEach((t) => { if (t.key) counts[t.key] = base.filter((a) => a.action === t.key).length; });
    return counts;
  }, [activity, famCampMap, filterCamp]);

  const styles = getStyles();

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const renderRow = ({ item: a }) => {
    const meta =
      a.action === 'insert' ? { icon: '➕', color: colors.green, label: 'إضافة' } :
      a.action === 'delete' ? { icon: '🗑️', color: colors.red, label: 'حذف' } :
      { icon: '✏️', color: colors.blue, label: 'تعديل' };
    const when = new Date(a.created_at);
    const timeStr = isNaN(when) ? '' : when.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return (
      <Pressable style={styles.activityRow} onPress={() => setSelectedActivity(a)}>
        <View style={[styles.activityIconBox, { backgroundColor: `${meta.color}22` }]}>
          <Text style={styles.activityIcon}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.activityLine}>
            <Text style={{ color: meta.color, fontWeight: 'bold' }}>{meta.label}</Text> — {a.family_name || 'أسرة'}
            {a.members_count ? ` (${a.members_count} فرد)` : ''}
          </Text>
          <Text style={styles.activityMeta}>
            👤 {a.actor_name || 'غير معروف'} · 🕒 {timeStr}
            {!!famCampMap[a.family_id] && ` · 🏕️ ${campMap[famCampMap[a.family_id]] || ''}`}
          </Text>
        </View>
        <Text style={styles.activityChevron}>‹</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filteredActivity}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📝"
              title="آخر التعديلات على الأسر"
              subtitle={<Text style={styles.headerSubtitle}>{filteredActivity.length} حركة</Text>}
            />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة
                </Text>
              </View>
            )}

            <View style={styles.chipsRow}>
              <FilterChip
                label={filterCamp ? campMap[filterCamp] : 'كل المخيمات'}
                selected={!!filterCamp}
                onPress={() => setCampPickerVisible(true)}
              />
            </View>

            <View style={styles.categoryGrid}>
              {ACTION_TYPES.map((t) => (
                <Pressable
                  key={t.key || 'all'}
                  onPress={() => setActionType(t.key)}
                  style={[styles.categoryCell, actionType === t.key && styles.categoryCellActive]}
                >
                  <Text style={styles.categoryIcon}>{t.icon}</Text>
                  <Text style={[styles.categoryCount, actionType === t.key && styles.categoryCountActive]}>
                    {actionCounts[t.key] || 0}
                  </Text>
                  <Text style={styles.categoryLabel}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث باسم الأسرة أو الفاعل..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📝" title="لا توجد حركات مطابقة" />}
      />

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.campOption} onPress={() => { setFilterCamp(''); setCampPickerVisible(false); }}>
          <Text style={styles.campOptionText}>كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.campOption} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.campOptionText}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>

      <BottomSheetModal
        visible={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title="📝 تفاصيل الحركة"
      >
        {selectedActivity && (() => {
          const a = selectedActivity;
          const meta =
            a.action === 'insert' ? { icon: '➕', color: colors.green, label: 'إضافة أسرة جديدة' } :
            a.action === 'delete' ? { icon: '🗑️', color: colors.red, label: 'حذف أسرة' } :
            { icon: '✏️', color: colors.blue, label: 'تعديل بيانات أسرة' };
          const when = new Date(a.created_at);
          const fullTime = isNaN(when)
            ? '—'
            : when.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const changeEntries = a.changes && typeof a.changes === 'object' ? Object.entries(a.changes) : [];

          return (
            <View>
              <View style={[styles.detailBadge, { backgroundColor: `${meta.color}22` }]}>
                <Text style={[styles.detailBadgeText, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>الأسرة</Text>
                <Text style={styles.detailValue}>{a.family_name || '—'}</Text>
              </View>
              {!!a.members_count && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>عدد الأفراد</Text>
                  <Text style={styles.detailValue}>{a.members_count}</Text>
                </View>
              )}
              {!!famCampMap[a.family_id] && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>المخيم</Text>
                  <Text style={styles.detailValue}>{campMap[famCampMap[a.family_id]] || '—'}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>من قام بالإجراء</Text>
                <Text style={styles.detailValue}>{a.actor_name || 'غير معروف'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>التاريخ والوقت</Text>
                <Text style={styles.detailValue}>{fullTime}</Text>
              </View>

              {changeEntries.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.detailChangesTitle}>التغييرات ({changeEntries.length})</Text>
                  {changeEntries.map(([field, val]) => (
                    <View key={field} style={styles.changeCard}>
                      <Text style={styles.changeField}>{ACTIVITY_FIELD_LABELS[field] || field}</Text>
                      <View style={styles.changeValuesRow}>
                        <View style={styles.changeOld}>
                          <Text style={styles.changeOldLabel}>القديم</Text>
                          <Text style={styles.changeOldValue}>{(val?.old ?? val?.from) || '(فارغ)'}</Text>
                        </View>
                        <View style={styles.changeNew}>
                          <Text style={styles.changeNewLabel}>الجديد</Text>
                          <Text style={styles.changeNewValue}>{(val?.new ?? val?.to) || '(فارغ)'}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const getStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, paddingBottom: 32 },
    headerSubtitle: { color: colors.muted, fontSize: 11 },
    offlineBanner: {
      backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
      borderRadius: 12, padding: 10, marginBottom: 12,
    },
    offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    categoryCell: {
      flexGrow: 1, minWidth: '22%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    categoryCellActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    categoryIcon: { fontSize: 18, marginBottom: 2 },
    categoryCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
    categoryCountActive: { color: colors.accent },
    categoryLabel: { color: colors.muted, fontSize: 9, marginTop: 1, textAlign: 'center' },

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
    },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },

    activityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    activityIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    activityIcon: { fontSize: 14 },
    activityLine: { color: colors.white, fontSize: 12, textAlign: 'right' },
    activityMeta: { color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' },
    activityChevron: { color: colors.muted, fontSize: 18 },

    detailBadge: { alignSelf: 'flex-end', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
    detailBadgeText: { fontWeight: 'bold', fontSize: 13 },
    detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    detailLabel: { color: colors.muted, fontSize: 12 },
    detailValue: { color: colors.white, fontSize: 12, fontWeight: 'bold' },
    detailChangesTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginBottom: 8, textAlign: 'right' },
    changeCard: { backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginBottom: 8 },
    changeField: { color: colors.white, fontWeight: 'bold', fontSize: 12, marginBottom: 6, textAlign: 'right' },
    changeValuesRow: { flexDirection: 'row-reverse', gap: 8 },
    changeOld: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 6 },
    changeOldLabel: { color: colors.red, fontSize: 9, textAlign: 'right' },
    changeOldValue: { color: colors.white, fontSize: 11, textAlign: 'right', marginTop: 2 },
    changeNew: { flex: 1, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 6 },
    changeNewLabel: { color: colors.green, fontSize: 9, textAlign: 'right' },
    changeNewValue: { color: colors.white, fontSize: 11, textAlign: 'right', marginTop: 2 },
  });

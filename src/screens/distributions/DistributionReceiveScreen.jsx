import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import {
  fetchFamilies,
  fetchFamilyMembers,
  fetchCamps,
  fetchOrgMembers,
  fetchDistRounds,
  fetchDistReceivedFamilyIdsByRound,
  markFamilyReceivedByRound,
  unmarkFamilyReceivedByRound,
} from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const SORT_OPTIONS = [
  { value: 'size_desc', label: '👤 حجم الأسرة (الأكبر أولاً)' },
  { value: 'tent_asc', label: '⛺ رقم الخيمة' },
  { value: 'alpha', label: '🔤 أبجدي' },
];

/**
 * شاشة جولة توزيع واحدة — تُفتح مباشرة من قائمة الجولات (بدون أي شاشة
 * "دفعات" وسيطة). قائمتان: مستلمين/غير مستلمين. أربع فلاتر بالترتيب
 * المطلوب بالضبط: (1) المخيم، (2) جولة سابقة -- تعرض فقط من لم يستلم
 * منها، (3) ترتيب حسب عدد الأفراد تصاعدياً أو رقم الخيمة، (4) بحث بالاسم
 * أو الهوية. الاختيار بالنقر على الاسم (تحديد متعدد)، وزر "استلام" بالأسفل.
 */
export default function DistributionReceiveScreen() {
  const route = useRoute();
  const { round } = route.params || {};
  const { orgId, canWrite, profile } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [membersByFamily, setMembersByFamily] = useState({});
  const [camps, setCamps] = useState([]);
  const [otherRounds, setOtherRounds] = useState([]);
  const [receivedIds, setReceivedIds] = useState(new Set());
  const [otherRoundReceivedIds, setOtherRoundReceivedIds] = useState(null);

  const [tab, setTab] = useState('pending'); // pending | received
  const [filterCamp, setFilterCamp] = useState('');
  const [filterOtherRound, setFilterOtherRound] = useState('');
  const [sortMode, setSortMode] = useState('size_desc');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!round?.id || !orgId) return;
    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) throw new Error('لا يوجد اتصال بالإنترنت');

      const campsData = await withTimeout(fetchCamps(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const allowedCampIds = getAllowedCampIds(campsData);
      const visibleCamps = getVisibleCamps(campsData);
      setCamps(visibleCamps);

      const famsRaw = await withTimeout(fetchFamilies(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const fams = filterLocal(famsRaw, allowedCampIds);
      setFamilies(fams);

      const members = await withTimeout(fetchFamilyMembers(fams.map((f) => f.id)), 12000, 'انتهت مهلة تحميل البيانات');
      const grouped = {};
      members.forEach((m) => {
        if (!grouped[m.family_id]) grouped[m.family_id] = [];
        grouped[m.family_id].push(m);
      });
      setMembersByFamily(grouped);

      const [received, roundsData] = await withTimeout(
        Promise.all([
          fetchDistReceivedFamilyIdsByRound(round.id),
          fetchDistRounds(orgId),
        ]),
        12000,
        'انتهت مهلة تحميل البيانات'
      );
      const otherRoundsList = roundsData.filter((r) => r.id !== round.id);
      setReceivedIds(received);
      setOtherRounds(otherRoundsList);
      setOfflineInfo(null);
      cacheData(`dist_receive_${round.id}`, profile?.id, {
        camps: visibleCamps, families: fams, membersByFamily: grouped,
        receivedIds: [...received], otherRounds: otherRoundsList,
      });
    } catch (e) {
      const cached = await getCachedData(`dist_receive_${round.id}`, profile?.id);
      if (cached?.data) {
        setCamps(cached.data.camps || []);
        setFamilies(cached.data.families || []);
        setMembersByFamily(cached.data.membersByFamily || {});
        setReceivedIds(new Set(cached.data.receivedIds || []));
        setOtherRounds(cached.data.otherRounds || []);
        setOfflineInfo({ savedAt: cached.savedAt });
      } else {
        showError('تعذّر تحميل قائمة الأسر');
      }
    } finally {
      setLoading(false);
    }
  }, [round?.id, orgId, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // فلتر "جولة سابقة" -- يجيب مين استلم من هذي الجولة تحديداً، عشان نستبعدهم
  // (نعرض بس اللي لم يستلموا منها)
  useEffect(() => {
    if (!filterOtherRound) {
      setOtherRoundReceivedIds(null);
      return;
    }
    fetchDistReceivedFamilyIdsByRound(filterOtherRound).then(setOtherRoundReceivedIds).catch(() => setOtherRoundReceivedIds(null));
  }, [filterOtherRound]);

  const campMap = Object.fromEntries(camps.map((c) => [c.id, c.name]));

  // القاعدة المشتركة: الأسر بعد تطبيق فلاتر المخيم/الجولة السابقة/البحث،
  // قبل تقسيمها لتبويبي مستلم/غير مستلم -- نستخدمها لحساب أعداد التبويبين
  // نفسها (بدل عدد إجمالي ثابت لا يعكس الفلاتر المطبَّقة، وهذا كان يبين
  // "متجمّد" ومربك لما تفلتر بمخيم مثلاً).
  const baseFiltered = useMemo(() => {
    let list = families;

    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);

    if (filterOtherRound && otherRoundReceivedIds) {
      list = list.filter((f) => !otherRoundReceivedIds.has(f.id));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => (f.head_name || '').toLowerCase().includes(q) || (f.head_id || '').includes(q));
    }

    return list;
  }, [families, filterCamp, filterOtherRound, otherRoundReceivedIds, search]);

  const pendingCount = baseFiltered.filter((f) => !receivedIds.has(f.id)).length;
  const receivedCount = baseFiltered.filter((f) => receivedIds.has(f.id)).length;

  const filtered = useMemo(() => {
    let list = baseFiltered.filter((f) => (tab === 'received' ? receivedIds.has(f.id) : !receivedIds.has(f.id)));

    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case 'alpha':
          return (a.head_name || '').localeCompare(b.head_name || '', 'ar');
        case 'tent_asc':
          return String(a.tent || '').localeCompare(String(b.tent || ''), 'ar', { numeric: true });
        default: {
          const am = (membersByFamily[a.id]?.length || 0) + 1;
          const bm = (membersByFamily[b.id]?.length || 0) + 1;
          return bm - am; // الأكبر أولاً
        }
      }
    });

    return list;
  }, [baseFiltered, receivedIds, tab, membersByFamily, sortMode]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(filtered.map((f) => f.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const toggleReceive = async (family) => {
    if (!canWrite) {
      showError('لا تملك صلاحية تسجيل الاستلام');
      return;
    }
    if (offlineInfo) {
      showError('تسجيل الاستلام يتطلب اتصالاً بالإنترنت');
      return;
    }
    const already = receivedIds.has(family.id);
    try {
      if (already) {
        await unmarkFamilyReceivedByRound(round.id, family.id);
        setReceivedIds((prev) => {
          const next = new Set(prev);
          next.delete(family.id);
          return next;
        });
        showSuccess('تم إلغاء الاستلام');
      } else {
        await markFamilyReceivedByRound(round.id, orgId, family.id);
        setReceivedIds((prev) => new Set(prev).add(family.id));
        showSuccess('تم تسجيل الاستلام');
      }
    } catch (e) {
      showError('خطأ: ' + e.message);
    }
  };

  const bulkMarkReceived = async () => {
    if (!canWrite) {
      showError('لا تملك صلاحية تسجيل الاستلام');
      return;
    }
    if (selectedIds.size === 0) {
      showError('لم تُحدد أي أسرة');
      return;
    }
    setBulkSaving(true);
    try {
      const ids = [...selectedIds];
      for (const famId of ids) {
        await markFamilyReceivedByRound(round.id, orgId, famId);
      }
      setReceivedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      showSuccess(`تم تسجيل استلام ${ids.length} أسرة`);
      setSelectedIds(new Set());
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  /** يبني صفوف أسرة واحدة لملف التصدير (اسم، هوية، مخيم، خيمة، عدد أفراد، جوال) */
  const buildExportRow = (f, i) => ({
    '#': i + 1,
    'المخيم': campMap[f.camp_id] || '—',
    'اسم رب الأسرة': f.head_name || '',
    'رقم الهوية': f.head_id || '',
    'رقم الخيمة': f.tent || '',
    'عدد الأفراد': 1 + (membersByFamily[f.id]?.length || 0),
    'الجوال': f.phone1 || '',
  });

  /** ترتيب الأسر حسب المخيم (تجميعي)، ثم رقم الخيمة (عددياً، والي بدون
   * رقم خيمة يروح بآخر القائمة دايماً)، ثم الاسم -- لكل من ورقتي الاستلام */
  const sortByCamp = (list) =>
    [...list].sort((a, b) => {
      const ca = campMap[a.camp_id] || '';
      const cb = campMap[b.camp_id] || '';
      if (ca !== cb) return ca.localeCompare(cb, 'ar');

      const ta = a.tent ? String(a.tent).trim() : '';
      const tb = b.tent ? String(b.tent).trim() : '';
      if (!ta && !tb) return (a.head_name || '').localeCompare(b.head_name || '', 'ar');
      if (!ta) return 1; // بدون رقم خيمة → بالآخر
      if (!tb) return -1;
      return ta.localeCompare(tb, 'ar', { numeric: true });
    });

  const handleExport = async () => {
    setExporting(true);
    try {
      const received = sortByCamp(families.filter((f) => receivedIds.has(f.id)));
      const rows = received.map(buildExportRow);
      const fileName = `تقرير_استلام_${(round?.name || 'جولة_توزيع').replace(/\s+/g, '_')}`;

      if (round?.camp_id) {
        // الجولة عندها مخيم بانر محدّد وقت الإنشاء -- نبني بانر بأعلى الملف:
        // السطر الأول اسم المخيم، والثاني مندوب المخيم (role='camp_delegate')
        // + جواله + إحداثيات المخيم. البانر معلوماتي فقط -- لا يقيّد عرض
        // الأسر (تبقى من كل المخيمات).
        const bannerCamp = camps.find((c) => c.id === round.camp_id);
        const orgMembers = await fetchOrgMembers(orgId);
        const delegate = orgMembers.find((m) => m.role === 'camp_delegate' && m.camp_id === bannerCamp?.id);
        const coords = bannerCamp?.latitude && bannerCamp?.longitude
          ? `${bannerCamp.latitude}, ${bannerCamp.longitude}`
          : 'بلا إحداثيات';
        const rawName = bannerCamp?.name || '—';
        // نضيف كلمة "مخيم" قبل الاسم لو مو موجودة أصلاً بالاسم (بعض المخيمات
        // مسمّاة "مخيم هند" أصلاً، فما نكرّرها "مخيم مخيم هند").
        const campDisplayName = rawName.trim().startsWith('مخيم') ? rawName : `مخيم ${rawName}`;
        const bannerLines = [
          { text: `🏕️ ${campDisplayName}`, size: 18 },
          { text: `👤 المندوب: ${delegate?.full_name || 'غير معيَّن'}   📱 ${delegate?.phone || '—'}   📍 ${coords}`, size: 11 },
        ];

        await exportXLSXMultiSheetWithBanners(
          [{ name: 'استلموا', banner: bannerLines, rows }],
          fileName
        );
      } else {
        await exportXLSX(rows, 'استلموا', fileName);
      }
      showSuccess('تم تصدير التقرير');
    } catch (e) {
      showError('فشل التصدير: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const renderFamily = ({ item: f }) => {
    const memberCount = 1 + (membersByFamily[f.id]?.length || 0);
    const selected = selectedIds.has(f.id);

    return (
      <Pressable
        style={[styles.card, selected && styles.cardSelected]}
        onPress={() => (tab === 'pending' ? toggleSelect(f.id) : toggleReceive(f))}
      >
        <View style={styles.cardRow}>
          {tab === 'pending' && selected && <Text style={styles.selectedIcon}>✓</Text>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.familyName, selected && styles.familyNameSelected]}>{f.head_name || '—'}</Text>
            <Text style={styles.metaLine}>
              {memberCount} أفراد{f.tent ? ` · ⛺ ${f.tent}` : ''}{f.camp_id ? ` · 🏕️ ${campMap[f.camp_id] || '—'}` : ''}
            </Text>
          </View>
          {tab === 'received' && (
            <Pressable style={styles.undoBtn} onPress={() => toggleReceive(f)}>
              <Text style={styles.undoBtnText}>↺ إلغاء</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        extraData={{ filterCamp, filterOtherRound, sortMode, search, tab, selectedIds, receivedIds }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="✅"
              title={round?.name || 'جولة توزيع'}
              subtitle={<Text style={styles.headerSubtitle}>{receivedIds.size} استلم من أصل {families.length}</Text>}
              action={
                <Pressable style={[styles.exportBtn, exporting && styles.disabled]} onPress={handleExport} disabled={exporting}>
                  {exporting ? <ActivityIndicator color={colors.green} size="small" /> : <Text style={styles.exportBtnText}>📤 تصدير</Text>}
                </Pressable>
              }
            />

            {!!offlineInfo && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  📡 لا يوجد اتصال — بيانات محفوظة من {formatDateTime(offlineInfo.savedAt)}، قد تكون غير محدّثة (تسجيل الاستلام غير متاح الآن)
                </Text>
              </View>
            )}

            <View style={styles.chipsRow}>
              <FilterChip
                label={`⏳ لم يستلم (${pendingCount})`}
                selected={tab === 'pending'}
                onPress={() => { setTab('pending'); setSelectedIds(new Set()); }}
              />
              <FilterChip
                label={`✅ استلم (${receivedCount})`}
                selected={tab === 'received'}
                onPress={() => setTab('received')}
              />
            </View>

            {/* 1) فلتر المخيم */}
            <SelectField
              value={filterCamp ? campMap[filterCamp] : undefined}
              placeholder="🏕️ كل المخيمات"
              options={[{ value: '', label: 'كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={setFilterCamp}
            />

            {/* 2) فلتر جولة سابقة -- من لم يستلم منها */}
            <SelectField
              value={filterOtherRound ? `لم يستلم من: ${otherRounds.find((r) => r.id === filterOtherRound)?.name || ''}` : undefined}
              placeholder="🔁 كل الجولات (بدون فلترة)"
              options={[{ value: '', label: 'بدون فلترة' }, ...otherRounds.map((r) => ({ value: r.id, label: `لم يستلم من: ${r.name}` }))]}
              onSelect={setFilterOtherRound}
            />

            {/* 3) الترتيب */}
            <SelectField
              value={SORT_OPTIONS.find((o) => o.value === sortMode)?.label}
              options={SORT_OPTIONS}
              onSelect={setSortMode}
            />

            {/* 4) البحث */}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم أو رقم الهوية..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.resultCount}>📋 {filtered.length} نتيجة مطابقة</Text>

            {tab === 'pending' && (
              <>
                <View style={styles.selectAllRow}>
                  <Pressable style={styles.selectAllBtn} onPress={selectAllVisible}>
                    <Text style={styles.selectAllBtnText}>☑️ تحديد الكل ({filtered.length})</Text>
                  </Pressable>
                  <Pressable style={styles.deselectAllBtn} onPress={deselectAll}>
                    <Text style={styles.deselectAllBtnText}>✕ إلغاء التحديد</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>اضغط على اسم الأسرة لتحديدها، ثم اضغط "استلام" بالأسفل</Text>
              </>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="✅" title={tab === 'pending' ? 'كل الأسر استلمت أو لا نتائج مطابقة' : 'لا توجد أسر مستلمة بعد'} />}
      />

      {tab === 'pending' && selectedIds.size > 0 && canWrite && !offlineInfo && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.size} محددة</Text>
          <Pressable style={[styles.bulkBtn, bulkSaving && styles.disabled]} onPress={bulkMarkReceived} disabled={bulkSaving}>
            {bulkSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.bulkBtnText}>✅ استلام</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 90 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  offlineBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
  exportBtn: { backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  exportBtnText: { color: colors.green, fontWeight: 'bold', fontSize: 12 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 10,
  },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  resultCount: { color: colors.accent, fontSize: 11, fontWeight: 'bold', marginBottom: 8, textAlign: 'right' },
  selectAllRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  selectAllBtn: { flex: 1, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  selectAllBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 11 },
  deselectAllBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  deselectAllBtnText: { color: colors.muted, fontWeight: 'bold', fontSize: 11 },
  hint: { color: colors.muted, fontSize: 10, marginBottom: 10, textAlign: 'right' },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.accent, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardSelected: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: colors.accent, borderWidth: 1.5 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedIcon: { fontSize: 16, fontWeight: '900', color: colors.accent },
  familyName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
  familyNameSelected: { color: colors.accent },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  undoBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  undoBtnText: { color: colors.muted, fontSize: 10, fontWeight: 'bold' },

  bulkBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  bulkText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  bulkBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  disabled: { opacity: 0.6 },
  bulkBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
});

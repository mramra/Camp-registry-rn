import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, fetchFamilyMembers, fetchCamps, fetchOrgMembers } from '../../lib/supabase';
import { calcAge, naturalCompare, buildCampExportBanner, isInfantAge, INFANT_MAX_AGE, VALID_MOTHER_RELATIONS, normalizeHealthValue } from '../../lib/helpers';
import { exportXLSX, exportXLSXMultiSheetWithBanners } from '../../lib/excelIO';
import { showError, showSuccess } from '../../utils/toast';
import { cacheData, getCachedData, withTimeout } from '../../lib/offlineCache';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FieldPicker, { orderedSelected } from '../../components/ui/FieldPicker';
import CampDelegatePanel from '../../components/ui/CampDelegatePanel';
import colors from '../../theme/colors';

// حقول تصدير كشف الأطفال القابلة للتخصيص بالنقر (ترقيم = ترتيب الأعمدة
// الفعلي بالملف) عبر مكوّن FieldPicker المشترك. الحقول الأساسية الـ11
// مرقَّمة مسبقاً 1→11 بالضبط حسب الترتيب المطلوب، الاختيارية تبدأ بـ0
// (غير محدَّدة، المستخدم يفعّلها بالنقر يدوياً). بدون حقل خاص برقم
// الخيمة إطلاقاً (الترتيب يعتمد الخيمة داخلياً، بس مو معروضة كعمود).
const CHILD_FIELD_DEFS = [
  { key: 'number', label: 'ترقيم تلقائي', order: 1 },
  { key: 'name', label: 'اسم الطفل', order: 2 },
  { key: 'national_id', label: 'رقم هوية الطفل', order: 3 },
  { key: 'dob', label: 'تاريخ الميلاد', order: 4 },
  { key: 'age', label: 'العمر', order: 5 },
  { key: 'gender', label: 'الجنس', order: 6 },
  { key: 'relation', label: 'الصلة', order: 7 },
  { key: 'head_name', label: 'اسم رب الأسرة', order: 8 },
  { key: 'head_id', label: 'هوية رب الأسرة', order: 9 },
  { key: 'head_phone', label: 'رقم جوال رب الأسرة', order: 10 },
  { key: 'camp_name', label: 'اسم المخيم', order: 11 },
  // اختيارية -- غير محدَّدة افتراضياً (order: 0)
  { key: 'mother_name', label: 'اسم الأم', order: 0 },
  { key: 'mother_id', label: 'رقم هوية الأم', order: 0 },
  { key: 'chronic', label: 'أمراض مزمنة', order: 0 },
  { key: 'disabilities', label: 'إعاقات', order: 0 },
  { key: 'injuries', label: 'إصابات', order: 0 },
  { key: 'orphan', label: 'يتيم؟', order: 0 },
  { key: 'orphan_cause', label: 'سبب اليتم', order: 0 },
  { key: 'needs', label: 'احتياجات خاصة', order: 0 },
  { key: 'original_address', label: 'المنطقة الأصلية', order: 0 },
];

export default function ChildrenScreen() {
  const navigation = useNavigation();
  const { orgId, profile } = useAuth();
  const { getAllowedCampIds, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [camps, setCamps] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [filterCamp, setFilterCamp] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [childFields, setChildFields] = useState(() => CHILD_FIELD_DEFS.map((f) => ({ ...f })));
  const [campPickerVisible, setCampPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const infantsActive = ageMin === '0' && ageMax === String(INFANT_MAX_AGE);
  const toggleInfants = () => {
    if (infantsActive) {
      setAgeMin('');
      setAgeMax('');
    } else {
      setAgeMin('0');
      setAgeMax(String(INFANT_MAX_AGE));
    }
  };
  const [orphansOnly, setOrphansOnly] = useState(false);
  // شارة "رضّع" ما عادت حالة منفصلة (كانت infantsOnly) -- صارت مجرد
  // اختصار يعبّي خانتي "من/إلى" مباشرة بحدود isInfantAge المركزية
  // (0 إلى INFANT_MAX_AGE). هيك تستخدم شارة "رضّع" وخانة البحث اليدوي
  // نفس آلية الفلترة بالضبط (ageMin/ageMax)، فمستحيل يختلف رقم الشارة
  // عن رقم البحث اليدوي بعد اليوم -- بدل ما يكون فيه مسارين منفصلين
  // ممكن ينفصلا بصمت زي ما صار قبل هذا التوحيد.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const cached = await getCachedData('children_registry', profile?.id);
    const hadCache = !!cached?.data;
    if (hadCache) {
      setFamilies(cached.data.families || []);
      setMembers(cached.data.members || []);
      setCamps(cached.data.camps || []);
      setOrgMembers(cached.data.orgMembers || []);
      setOfflineInfo({ savedAt: cached.savedAt });
      setLoading(false);
    }

    try {
      const net = await withTimeout(NetInfo.fetch(), 4000, 'تعذّر تحديد حالة الاتصال');
      if (!net.isConnected) {
        if (!hadCache) showError('لا يوجد اتصال ولا توجد بيانات محفوظة');
        return;
      }

      const campsData = await withTimeout(fetchCamps(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const allowedCampIds = getAllowedCampIds(campsData);
      const famsRaw = await withTimeout(fetchFamilies(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const fams = allowedCampIds === null ? famsRaw : famsRaw.filter((f) => allowedCampIds.includes(f.camp_id));
      const mems = await withTimeout(fetchFamilyMembers(fams.map((f) => f.id)), 12000, 'انتهت مهلة تحميل البيانات');
      const members2 = await withTimeout(fetchOrgMembers(orgId), 12000, 'انتهت مهلة تحميل البيانات');
      const visibleCamps = getVisibleCamps(campsData);

      setCamps(visibleCamps);
      setFamilies(fams);
      setMembers(mems);
      setOrgMembers(members2);
      setOfflineInfo(null);
      cacheData('children_registry', profile?.id, { families: fams, members: mems, camps: visibleCamps, orgMembers: members2 });
    } catch (e) {
      if (!hadCache) showError('تعذّر تحميل السجل ولا توجد نسخة محفوظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);
  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f])), [families]);

  const childrenData = useMemo(() => {
    return members
      .map((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return { ...m, age, famName: f.head_name || '—', camp: campMap[f.camp_id] || '—', camp_id: f.camp_id || '', tent: f.tent || '—' };
      })
      .filter((k) => k.age !== null && k.age < 18)
      .filter((k) => !filterCamp || k.camp_id === filterCamp)
      .filter((k) => !ageMin || k.age >= Number(ageMin))
      .filter((k) => !ageMax || k.age <= Number(ageMax))
      .filter((k) => !orphansOnly || !!k.orphan_status)
      .filter((k) => !search.trim() || (k.name || '').includes(search) || (k.famName || '').includes(search))
      .sort((a, b) => naturalCompare(a.tent, b.tent));
  }, [members, famMap, campMap, filterCamp, ageMin, ageMax, orphansOnly, search]);

  const orphansCount = useMemo(() => {
    return members
      .filter((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return age !== null && age < 18 && !!m.orphan_status && (!filterCamp || f.camp_id === filterCamp);
      }).length;
  }, [members, famMap, filterCamp]);

  const infantsCount = useMemo(() => {
    return members
      .filter((m) => {
        const age = calcAge(m.dob);
        const f = famMap[m.family_id] || {};
        return isInfantAge(age) && (!filterCamp || f.camp_id === filterCamp);
      }).length;
  }, [members, famMap, filterCamp]);

  const handleCustomExport = async () => {
    const selected = orderedSelected(childFields);
    if (!selected.length) return showError('اختر حقلاً واحداً على الأقل');
    try {
      const banner = filterCamp && showBanner ? buildCampExportBanner(camps.find((c) => c.id === filterCamp), orgMembers) : null;
      // الترتيب حسب رقم الخيمة داخلياً فقط -- بدون أي عمود مخصَّص لها
      // بالجدول الناتج (حسب طلب محمود صراحة)
      const sorted = [...childrenData].sort((a, b) => naturalCompare(a.tent, b.tent));
      const healthCount = (raw) => {
        const n = normalizeHealthValue(raw);
        return n ? n.split('، ').filter(Boolean).length : 0;
      };
      const rows = sorted.map((k, i) => {
        const f = famMap[k.family_id] || {};
        const famMembers = members.filter((m) => m.family_id === k.family_id);
        const mother = famMembers.find((m) => VALID_MOTHER_RELATIONS.includes(m.relation || ''));
        const row = {};
        selected.forEach((def) => {
          switch (def.key) {
            case 'number': row[def.label] = i + 1; break;
            case 'name': row[def.label] = k.name || ''; break;
            case 'national_id': row[def.label] = k.national_id || ''; break;
            case 'dob': row[def.label] = k.dob || ''; break;
            case 'age': row[def.label] = k.age ?? ''; break;
            case 'gender': row[def.label] = k.gender || ''; break;
            case 'relation': row[def.label] = k.relation || ''; break;
            case 'head_name': row[def.label] = f.head_name || ''; break;
            case 'head_id': row[def.label] = f.head_id || ''; break;
            case 'head_phone': row[def.label] = f.phone1 || ''; break;
            case 'camp_name': row[def.label] = k.camp || ''; break;
            case 'mother_name': row[def.label] = mother?.name || ''; break;
            case 'mother_id': row[def.label] = mother?.national_id || ''; break;
            case 'chronic': row[def.label] = healthCount(k.chronic_diseases); break;
            case 'disabilities': row[def.label] = healthCount(k.disabilities); break;
            case 'injuries': row[def.label] = healthCount(k.injuries); break;
            case 'orphan': row[def.label] = k.orphan_status ? 'نعم' : 'لا'; break;
            case 'orphan_cause': row[def.label] = k.orphan_cause || ''; break;
            case 'needs': row[def.label] = k.needs || ''; break;
            case 'original_address': row[def.label] = f.original_address || ''; break;
            default: break;
          }
        });
        return row;
      });
      await (banner
        ? exportXLSXMultiSheetWithBanners([{ name: 'الأطفال', banner, rows }], 'كشف_الأطفال')
        : exportXLSX(rows, 'الأطفال', 'كشف_الأطفال'));
      showSuccess('تم تجهيز الملف للمشاركة/الحفظ');
      setFieldPickerOpen(false);
    } catch (e) {
      showError('تعذّر التصدير: ' + e.message);
    }
  };

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

  const renderChild = ({ item: k }) => (
    <Pressable style={styles.card} onPress={() => k.family_id && navigation.push('FamilyDetail', { familyId: k.family_id })}>
      <Text style={styles.cardName}>{k.name} <Text style={styles.ageTag}>({k.age})</Text></Text>
      <Text style={styles.cardMeta}>{k.relation} {k.gender ? `• ${k.gender}` : ''} {k.orphan_status ? '• 🔸يتيم' : ''}</Text>
      <Text style={styles.cardSubMeta}>⛺{k.tent} 🏕️{k.camp} 👨‍👩‍👧{k.famName} — اضغط للانتقال للأسرة ←</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={childrenData}
        keyExtractor={(item) => item.id}
        renderItem={renderChild}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader icon="🧒" title="سجل الأطفال" />

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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={styles.smsBtn} onPress={() => setFieldPickerOpen(true)}>
                  <Text style={styles.smsBtnText}>📤 تصدير الكشف</Text>
                </Pressable>
                <Pressable
                  style={styles.smsBtn}
                  onPress={() => {
                    const preselectFamilyIds = [...new Set(childrenData.map((k) => k.family_id))];
                    const birthdayNames = {};
                    childrenData.forEach((k) => { birthdayNames[k.family_id] = k.name; });
                    navigation.navigate('SMS', { preselectFamilyIds, birthdayNames });
                  }}
                >
                  <Text style={styles.smsBtnText}>📤 SMS</Text>
                </Pressable>
              </View>
            </View>

            <CampDelegatePanel
              camp={camps.find((c) => c.id === filterCamp)}
              orgMembers={orgMembers}
              showBanner={showBanner}
              onToggleBanner={setShowBanner}
            />

            <View style={styles.ageGrid}>
              <Pressable
                style={[styles.ageBox, orphansOnly && styles.ageBoxActive]}
                onPress={() => setOrphansOnly((v) => !v)}
              >
                <Text style={styles.ageIcon}>🔸</Text>
                <Text style={[styles.ageCount, orphansOnly && styles.ageCountActive]}>{orphansCount}</Text>
                <Text style={styles.ageLabel}>أيتام</Text>
              </Pressable>
              <Pressable
                style={[styles.ageBox, infantsActive && styles.ageBoxActive]}
                onPress={toggleInfants}
              >
                <Text style={styles.ageIcon}>🍼</Text>
                <Text style={[styles.ageCount, infantsActive && styles.ageCountActive]}>{infantsCount}</Text>
                <Text style={styles.ageLabel}>رضع</Text>
              </Pressable>
            </View>

            <View style={styles.ageRow}>
              <Text style={styles.ageRowLabel}>أو عمر مخصّص:</Text>
              <TextInput
                value={ageMin}
                onChangeText={setAgeMin}
                placeholder="من"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.ageInput}
              />
              <Text style={styles.ageDash}>—</Text>
              <TextInput
                value={ageMax}
                onChangeText={setAgeMax}
                placeholder="إلى"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.ageInput}
              />
              {(!!ageMin || !!ageMax) && (
                <Pressable onPress={() => { setAgeMin(''); setAgeMax(''); }} style={styles.ageClear}>
                  <Text style={styles.ageClearText}>✕ مسح</Text>
                </Pressable>
              )}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <Text style={styles.countText}>
              {filterCamp ? `مجموع الأطفال (أقل من 18) بـ${campMap[filterCamp]}: ` : 'مجموع الأطفال (أقل من 18): '}
              <Text style={styles.countValue}>{childrenData.length}</Text>
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="🧒" title="لا توجد نتائج" />}
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

      <BottomSheetModal visible={fieldPickerOpen} onClose={() => setFieldPickerOpen(false)} title="تخصيص حقول التصدير">
        <FieldPicker title="📋 حقول كشف الأطفال" cols={childFields} onChange={setChildFields} startOpen />
        <Pressable style={styles.customExportBtn} onPress={handleCustomExport}>
          <Text style={styles.customExportBtnText}>📥 تصدير ({orderedSelected(childFields).length} حقل)</Text>
        </Pressable>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const getStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, paddingBottom: 32 },
    offlineBanner: {
      backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
      borderRadius: 12, padding: 10, marginBottom: 12,
    },
    offlineBannerText: { color: colors.accent, fontSize: 11, textAlign: 'right', lineHeight: 17 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },
    smsBtn: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent,
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', justifyContent: 'center',
    },
    smsBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },

    ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    ageBox: {
      flexGrow: 1, minWidth: '22%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    },
    ageBoxActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: colors.accent },
    ageIcon: { fontSize: 18, marginBottom: 2 },
    ageCount: { color: colors.white, fontWeight: '900', fontSize: 14 },
    ageCountActive: { color: colors.accent },
    ageLabel: { color: colors.muted, fontSize: 9, marginTop: 1 },
    ageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
    ageRowLabel: { color: colors.muted, fontSize: 12 },
    ageInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 8, color: colors.white, fontSize: 13, textAlign: 'center', width: 64,
    },
    ageDash: { color: colors.muted },
    ageClear: { paddingHorizontal: 8, paddingVertical: 6 },
    ageClearText: { color: colors.red, fontSize: 11 },

    searchInput: {
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 8,
    },
    countText: { color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'right' },
    countValue: { color: colors.accent, fontWeight: '900', fontSize: 13 },

    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardName: { color: colors.white, fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    ageTag: { color: colors.accent, fontWeight: '900' },
    cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
    cardSubMeta: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },

    campOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    customExportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
    customExportBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
    campOptionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  });

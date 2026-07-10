import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchDistRounds, fetchCamps, createDistRound } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const STATUS_MAP = {
  draft: { label: 'مسودة', color: colors.muted },
  active: { label: 'نشط', color: colors.green },
  completed: { label: 'مكتمل', color: colors.blue },
  cancelled: { label: 'ملغي', color: colors.red },
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  ...Object.entries({ draft: 'مسودة', active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي' }).map(([value, label]) => ({ value, label })),
];

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * قائمة جولات التوزيع — جولة = كيان واحد فقط (اسم + تاريخ يحدده المستخدم +
 * ملاحظات)، بدون أي مفهوم "دفعة" وسيط. فتح الجولة يوديك مباشرة لشاشة تسجيل
 * الاستلام (مستلمين/غير مستلمين) — لا شاشة وسيطة بينهم.
 */
export default function DistributionsScreen() {
  const navigation = useNavigation();
  const { orgId, canWrite } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [rounds, setRounds] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [roundDate, setRoundDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [roundsData, campsData] = await Promise.all([fetchDistRounds(orgId), fetchCamps(orgId)]);
      const campIds = getAllowedCampIds(campsData);
      // الجولة نفسها غير مرتبطة بمخيم -- تظهر لكل المستخدمين المصرَّح لهم
      // بأي مخيم ضمن المنظمة (فلترة المخيم تصير داخل شاشة الاستلام نفسها).
      setRounds(roundsData);
      setCamps(getVisibleCamps(campsData));
    } catch (e) {
      showError('تعذّر تحميل جولات التوزيع');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered = rounds.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (search.trim() && !(r.name || '').toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const handleAddRound = async () => {
    if (!name.trim()) {
      showError('اسم الجولة مطلوب');
      return;
    }
    if (!roundDate) {
      showError('تاريخ الجولة مطلوب');
      return;
    }
    setSaving(true);
    try {
      const result = await createDistRound({
        org_id: orgId,
        name: name.trim(),
        round_date: roundDate,
        notes: notes.trim() || null,
        status: 'draft',
      });
      if (!result.success) {
        showError(result.error || 'فشل الإنشاء');
        return;
      }
      showSuccess('تمت إضافة الجولة');
      setFormVisible(false);
      setName('');
      setRoundDate(todayStr());
      setNotes('');
      loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderRound = ({ item: r }) => {
    const st = STATUS_MAP[r.status] || { label: r.status, color: colors.muted };
    return (
      <Pressable
        style={[styles.card, { borderRightColor: st.color }]}
        onPress={() => navigation.navigate('DistributionReceive', { round: r })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roundName}>📦 {r.name}</Text>
            {!!r.notes && <Text style={styles.metaLine}>{r.notes}</Text>}
            <Text style={styles.dateLine}>📅 {formatDate(r.round_date || r.created_at)}</Text>
          </View>
          <Text style={[styles.statusBadge, { color: st.color, backgroundColor: `${st.color}22` }]}>{st.label}</Text>
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
        renderItem={renderRound}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📦"
              title="التوزيعات"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} من {rounds.length} جولة</Text>}
              action={
                canWrite && (
                  <Pressable style={styles.addBtn} onPress={() => setFormVisible(true)}>
                    <Text style={styles.addBtnText}>➕ جولة جديدة</Text>
                  </Pressable>
                )
              }
            />

            <View style={styles.statsGrid}>
              {Object.entries(STATUS_MAP).map(([key, meta]) => (
                <View key={key} style={styles.statBox}>
                  <Text style={[styles.statValue, { color: meta.color }]}>{rounds.filter((r) => r.status === key).length}</Text>
                  <Text style={styles.statLabel}>{meta.label}</Text>
                </View>
              ))}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث في الجولات..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <SelectField
              value={STATUS_FILTER_OPTIONS.find((o) => o.value === filterStatus)?.label}
              placeholder="كل الحالات"
              options={STATUS_FILTER_OPTIONS}
              onSelect={setFilterStatus}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📦" title="لا توجد جولات توزيع مطابقة" />}
      />

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title="➕ جولة توزيع جديدة">
        <FormInput label="اسم الجولة *" placeholder="توزيع شتوي 2026" value={name} onChangeText={setName} />
        <FormInput label="تاريخ الجولة * (YYYY-MM-DD)" value={roundDate} onChangeText={setRoundDate} />
        <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleAddRound} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>✅ إضافة</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => setFormVisible(false)}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },

  statsGrid: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 10,
  },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roundName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right' },
  dateLine: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  statusBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },

  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

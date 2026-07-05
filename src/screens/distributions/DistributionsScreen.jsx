import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
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

export default function DistributionsScreen() {
  const navigation = useNavigation();
  const { orgId, canWrite } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [rounds, setRounds] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [campId, setCampId] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [roundsData, campsData] = await Promise.all([fetchDistRounds(orgId), fetchCamps(orgId)]);
      const campIds = getAllowedCampIds(campsData);
      setRounds(filterLocal(roundsData, campIds));
      setCamps(getVisibleCamps(campsData));
    } catch (e) {
      showError('تعذّر تحميل جولات التوزيع');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getAllowedCampIds, filterLocal, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = Object.fromEntries(camps.map((c) => [c.id, c.name]));

  const handleAddRound = async () => {
    if (!name.trim()) {
      showError('اسم الجولة مطلوب');
      return;
    }
    setSaving(true);
    try {
      const result = await createDistRound({
        org_id: orgId,
        name: name.trim(),
        camp_id: campId || null,
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
      setCampId(null);
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
      <Pressable style={[styles.card, { borderRightColor: st.color }]} onPress={() => navigation.navigate('DistributionBatches', { round: r })}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roundName}>📦 {r.name}</Text>
            {!!r.camp_id && <Text style={styles.metaLine}>🏕️ {campMap[r.camp_id] || '—'}</Text>}
            {!!r.notes && <Text style={styles.metaLine}>{r.notes}</Text>}
            <Text style={styles.dateLine}>{formatDate(r.created_at)}</Text>
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
        data={rounds}
        keyExtractor={(item) => item.id}
        renderItem={renderRound}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <PageHeader
            icon="📦"
            title="التوزيعات"
            subtitle={<Text style={styles.headerSubtitle}>{rounds.length} جولة</Text>}
            action={
              canWrite && (
                <Pressable style={styles.addBtn} onPress={() => setFormVisible(true)}>
                  <Text style={styles.addBtnText}>➕ جولة جديدة</Text>
                </Pressable>
              )
            }
          />
        }
        ListEmptyComponent={<EmptyState icon="📦" title="لا توجد جولات توزيع بعد" />}
      />

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title="➕ جولة توزيع جديدة">
        <FormInput label="اسم الجولة *" placeholder="توزيع شتوي 2026" value={name} onChangeText={setName} />
        <SelectField
          label="المخيم (اختياري)"
          value={camps.find((c) => c.id === campId)?.name}
          options={[{ value: '', label: '— كل المخيمات —' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
          onSelect={(v) => setCampId(v || null)}
          placeholder="— كل المخيمات —"
        />
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

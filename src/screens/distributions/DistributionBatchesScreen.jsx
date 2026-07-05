import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchDistBatches, fetchCamps, createDistBatch } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const STATUS_MAP = {
  pending: { label: 'معلقة', color: colors.muted },
  active: { label: 'نشطة', color: colors.green },
  completed: { label: 'مكتملة', color: colors.blue },
};

export default function DistributionBatchesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const round = route.params?.round;
  const { orgId, canWrite } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [batches, setBatches] = useState([]);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [campId, setCampId] = useState(round?.camp_id || null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!round?.id || !orgId) return;
    try {
      const [batchesData, campsData] = await Promise.all([fetchDistBatches(round.id), fetchCamps(orgId)]);
      const campIds = getAllowedCampIds(campsData);
      setBatches(filterLocal(batchesData, campIds));
      setCamps(getVisibleCamps(campsData));
    } catch (e) {
      showError('تعذّر تحميل دفعات التوزيع');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [round?.id, orgId, getAllowedCampIds, filterLocal, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };
  const campMap = Object.fromEntries(camps.map((c) => [c.id, c.name]));

  const handleAddBatch = async () => {
    if (!name.trim()) {
      showError('اسم الدفعة مطلوب');
      return;
    }
    setSaving(true);
    try {
      const result = await createDistBatch({
        org_id: orgId,
        round_id: round.id,
        name: name.trim(),
        camp_id: campId || round.camp_id || null,
        notes: notes.trim() || null,
        status: 'pending',
      });
      if (!result.success) {
        showError(result.error || 'فشل الإنشاء');
        return;
      }
      showSuccess('تمت إضافة الدفعة');
      setFormVisible(false);
      setName('');
      setNotes('');
      loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderBatch = ({ item: b }) => {
    const st = STATUS_MAP[b.status] || { label: b.status, color: colors.muted };
    return (
      <Pressable style={[styles.card, { borderRightColor: st.color }]} onPress={() => navigation.navigate('DistributionReceive', { batch: b, round })}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.batchName}>📋 {b.name}</Text>
            {!!b.camp_id && <Text style={styles.metaLine}>🏕️ {campMap[b.camp_id] || '—'}</Text>}
            {!!b.notes && <Text style={styles.metaLine}>{b.notes}</Text>}
            <Text style={styles.dateLine}>{formatDate(b.created_at)}</Text>
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
        data={batches}
        keyExtractor={(item) => item.id}
        renderItem={renderBatch}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <PageHeader
            icon="📋"
            title={round?.name || 'دفعات التوزيع'}
            subtitle={<Text style={styles.headerSubtitle}>{batches.length} دفعة</Text>}
            action={
              canWrite && (
                <Pressable style={styles.addBtn} onPress={() => setFormVisible(true)}>
                  <Text style={styles.addBtnText}>➕ دفعة</Text>
                </Pressable>
              )
            }
          />
        }
        ListEmptyComponent={<EmptyState icon="📋" title="لا توجد دفعات بهذه الجولة بعد" />}
      />

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title="➕ دفعة توزيع جديدة">
        <FormInput label="اسم الدفعة *" placeholder="دفعة مخيم السلام الأولمبي" value={name} onChangeText={setName} />
        <SelectField
          label="المخيم"
          value={camps.find((c) => c.id === campId)?.name}
          options={camps.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={setCampId}
          placeholder="— اختر المخيم —"
        />
        <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleAddBatch} disabled={saving}>
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
  batchName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
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

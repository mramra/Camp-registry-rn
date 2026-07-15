import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchDistRounds, fetchCamps, createDistRound, updateDistRound, deleteDistRound, fetchDistReceivedCountsByRound } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * قائمة جولات التوزيع — جولة = كيان واحد فقط (اسم + تاريخ يحدده المستخدم +
 * ملاحظات)، بدون أي مفهوم "دفعة" وسيط، وبدون نظام حالة (مسودة/نشط/مكتمل/
 * ملغي) -- حُذف بالكامل بناءً على الطلب. فتح الجولة يوديك مباشرة لشاشة
 * تسجيل الاستلام (مستلمين/غير مستلمين) — لا شاشة وسيطة بينهم.
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
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [roundDate, setRoundDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [bannerCampId, setBannerCampId] = useState(null); // اختياري -- للبانر بالتصدير فقط، لا يقيّد عرض الأسر
  const [saving, setSaving] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState(null); // null = إضافة جديدة، وإلا تعديل
  const [receivedCounts, setReceivedCounts] = useState({});

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [roundsData, campsData, counts] = await Promise.all([
        fetchDistRounds(orgId),
        fetchCamps(orgId),
        fetchDistReceivedCountsByRound(orgId),
      ]);
      const campIds = getAllowedCampIds(campsData);
      setRounds(roundsData);
      setCamps(getVisibleCamps(campsData));
      setReceivedCounts(counts);
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
    if (search.trim() && !(r.name || '').toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const openAddForm = () => {
    setEditingRoundId(null);
    setName('');
    setRoundDate(todayStr());
    setNotes('');
    setBannerCampId(null);
    setFormVisible(true);
  };

  const openEditForm = (round) => {
    setEditingRoundId(round.id);
    setName(round.name || '');
    setRoundDate(round.round_date || todayStr());
    setNotes(round.notes || '');
    setBannerCampId(round.camp_id || null);
    setFormVisible(true);
  };

  const handleSaveRound = async () => {
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
      const result = editingRoundId
        ? await updateDistRound(editingRoundId, { name: name.trim(), round_date: roundDate, notes: notes.trim() || null, camp_id: bannerCampId })
        : await createDistRound({
            org_id: orgId,
            name: name.trim(),
            round_date: roundDate,
            notes: notes.trim() || null,
            camp_id: bannerCampId,
          });
      if (!result.success) {
        showError(result.error || 'فشل الحفظ');
        return;
      }
      showSuccess(editingRoundId ? 'تم تحديث الجولة' : 'تمت إضافة الجولة');
      setFormVisible(false);
      setEditingRoundId(null);
      setName('');
      setRoundDate(todayStr());
      setNotes('');
      setBannerCampId(null);
      loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRound = (round) => {
    Alert.alert(
      'حذف الجولة',
      `هل تريد حذف جولة "${round.name}" نهائياً؟ سيُحذف معها كل سجلات الاستلام المرتبطة فيها (كأن الاستلام لم يحدث).`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteDistRound(round.id);
            if (result.success) {
              showSuccess('تم حذف الجولة وكل سجلات الاستلام المرتبطة فيها');
              loadData();
            } else {
              showError(result.error || 'فشل الحذف');
            }
          },
        },
      ]
    );
  };

  const renderRound = ({ item: r }) => {
    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.push('DistributionReceive', { round: r })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.roundName}>📦 {r.name}</Text>
          {!!r.notes && <Text style={styles.metaLine}>{r.notes}</Text>}
          <Text style={styles.dateLine}>📅 {formatDate(r.round_date || r.created_at)}</Text>
          {!!r.camp_id && (
            <Text style={styles.metaLine}>🏷️ بانر: {camps.find((c) => c.id === r.camp_id)?.name || '—'}</Text>
          )}
          <Text style={styles.receivedLine}>✅ {receivedCounts[r.id] || 0} أسرة استلمت</Text>
        </View>
        {canWrite && (
          <View style={styles.cardActions}>
            <Pressable style={styles.editIconBtn} onPress={() => openEditForm(r)}>
              <Text style={styles.editIconBtnText}>✏️ تعديل</Text>
            </Pressable>
            <Pressable style={styles.deleteIconBtn} onPress={() => handleDeleteRound(r)}>
              <Text style={styles.deleteIconBtnText}>🗑️ حذف</Text>
            </Pressable>
          </View>
        )}
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
            />

            {canWrite && <PrimaryButton label="➕ جولة جديدة" onPress={openAddForm} />}

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث في الجولات..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📦" title="لا توجد جولات توزيع مطابقة" />}
      />

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title={editingRoundId ? '✏️ تعديل الجولة' : '➕ جولة توزيع جديدة'}>
        <FormInput label="اسم الجولة *" placeholder="توزيع شتوي 2026" value={name} onChangeText={setName} />
        <FormInput label="تاريخ الجولة * (YYYY-MM-DD)" value={roundDate} onChangeText={setRoundDate} />
        <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
        <SelectField
          label="مخيم البانر (اختياري -- يظهر بأعلى ملف Excel عند التصدير بس)"
          value={camps.find((c) => c.id === bannerCampId)?.name}
          options={[{ value: '', label: '— بدون بانر —' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
          onSelect={(v) => setBannerCampId(v || null)}
          placeholder="— بدون بانر —"
        />
        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSaveRound} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingRoundId ? '💾 حفظ التعديلات' : '✅ إضافة'}</Text>}
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

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 10,
  },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 8 },
  roundName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right' },
  dateLine: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  receivedLine: { color: colors.green, fontSize: 11, fontWeight: 'bold', marginTop: 4, textAlign: 'right' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  editIconBtn: { flex: 1, backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  editIconBtnText: { color: colors.blue, fontWeight: 'bold', fontSize: 11 },
  deleteIconBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  deleteIconBtnText: { color: colors.red, fontWeight: 'bold', fontSize: 11 },

  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

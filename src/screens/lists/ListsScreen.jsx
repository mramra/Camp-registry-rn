import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { fetchOrgLists, fetchOrgListFamilyCounts, createOrgList, updateOrgList, deleteOrgList } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { exportXLSX } from '../../lib/excelIO';
import { naturalCompare } from '../../lib/helpers';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import FieldPicker, { orderedSelected } from '../../components/ui/FieldPicker';
import colors from '../../theme/colors';

// حقول تصدير كشف القوائم نفسها (سطر لكل قائمة، وليس لكل أسرة -- تصدير
// أسر قائمة واحدة موجود بشاشة تفاصيل القائمة). الأربعة الأساسية مفعّلة
// افتراضياً بالترتيب المطلوب.
const LISTS_FIELD_DEFS = [
  { key: 'name', label: 'اسم القائمة (المؤسسة)', order: 1 },
  { key: 'family_count', label: 'عدد الأسر', order: 2 },
  { key: 'created_at', label: 'تاريخ الإنشاء', order: 3 },
  { key: 'notes', label: 'ملاحظات', order: 4 },
];

/**
 * قائمة "القوائم المعتمدة" — كل قائمة تمثّل أسماء أُسر معتمدة لدى مؤسسة
 * مانحة معيّنة (مثلاً "أكتد"). القائمة دائمة: تُنشأ مرة واحدة ويُضاف
 * عليها أسر باستمرار مع الوقت (لا تُنشأ نسخة جديدة كل مرة). فتح القائمة
 * يودّي مباشرة لشاشة التفاصيل (إضافة/حذف أسر + تصدير Excel).
 */
export default function ListsScreen() {
  const navigation = useNavigation();
  const { orgId, canWrite } = useAuth();

  const [lists, setLists] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingListId, setEditingListId] = useState(null); // null = إضافة جديدة، وإلا تعديل اسم
  const [exporting, setExporting] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [listsFields, setListsFields] = useState(LISTS_FIELD_DEFS);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [listsData, countsData] = await Promise.all([
        fetchOrgLists(orgId),
        fetchOrgListFamilyCounts(orgId),
      ]);
      setLists(listsData);
      setCounts(countsData);
    } catch (e) {
      showError('تعذّر تحميل القوائم');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered = lists.filter((l) => {
    if (search.trim() && !(l.name || '').toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const openAddForm = () => {
    setEditingListId(null);
    setName('');
    setNotes('');
    setFormVisible(true);
  };

  const openEditForm = (list) => {
    setEditingListId(list.id);
    setName(list.name || '');
    setNotes(list.notes || '');
    setFormVisible(true);
  };

  const handleSaveList = async () => {
    if (!name.trim()) {
      showError('اسم القائمة (المؤسسة) مطلوب');
      return;
    }
    setSaving(true);
    try {
      const result = editingListId
        ? await updateOrgList(editingListId, { name: name.trim(), notes: notes.trim() || null })
        : await createOrgList({ org_id: orgId, name: name.trim(), notes: notes.trim() || null });
      if (!result.success) {
        showError(result.error || 'فشل الحفظ');
        return;
      }
      showSuccess(editingListId ? 'تم تحديث القائمة' : 'تمت إضافة القائمة');
      setFormVisible(false);
      setEditingListId(null);
      setName('');
      setNotes('');
      loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = (list) => {
    Alert.alert(
      'حذف القائمة',
      `هل تريد حذف قائمة "${list.name}" نهائياً؟ سيُحذف معها تسجيل كل الأسر المضافة إليها (الأسر نفسها لن تتأثر).`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteOrgList(list.id);
            if (result.success) {
              showSuccess('تم حذف القائمة');
              loadData();
            } else {
              showError(result.error || 'فشل الحذف');
            }
          },
        },
      ]
    );
  };

  const buildExportRow = (l, i, cols) => {
    const all = {
      name: l.name || '',
      family_count: counts[l.id] || 0,
      created_at: formatDate(l.created_at),
      notes: l.notes || '',
    };
    const row = { '#': i + 1 };
    cols.forEach((c) => { row[c.label] = all[c.key]; });
    return row;
  };

  const handleExport = async () => {
    const cols = orderedSelected(listsFields);
    if (cols.length === 0) {
      showError('اختر حقلاً واحداً على الأقل للتصدير');
      return;
    }
    setExporting(true);
    try {
      const sorted = [...filtered].sort((a, b) => naturalCompare(a.name, b.name));
      const rows = sorted.map((l, i) => buildExportRow(l, i, cols));
      await exportXLSX(rows, 'القوائم', 'كشف_القوائم_المعتمدة');
      showSuccess('تم تصدير كشف القوائم');
    } catch (e) {
      showError('فشل التصدير: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const renderList = ({ item: l }) => (
    <Pressable style={styles.card} onPress={() => navigation.push('ListDetail', { list: l })}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listName}>📋 {l.name}</Text>
        {!!l.notes && <Text style={styles.metaLine}>{l.notes}</Text>}
        <Text style={styles.dateLine}>📅 أُنشئت {formatDate(l.created_at)}</Text>
        <Text style={styles.countLine}>👪 {counts[l.id] || 0} أسرة</Text>
      </View>
      {canWrite && (
        <View style={styles.cardActions}>
          <Pressable style={styles.editIconBtn} onPress={() => openEditForm(l)}>
            <Text style={styles.editIconBtnText}>✏️ تعديل</Text>
          </Pressable>
          <Pressable style={styles.deleteIconBtn} onPress={() => handleDeleteList(l)}>
            <Text style={styles.deleteIconBtnText}>🗑️ حذف</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );

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
        renderItem={renderList}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title="القوائم"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} من {lists.length} قائمة</Text>}
            />

            {canWrite && <PrimaryButton label="➕ قائمة جديدة" onPress={openAddForm} />}

            <Pressable style={[styles.exportBtn, exporting && styles.disabled]} onPress={() => setFieldPickerOpen(true)} disabled={exporting || lists.length === 0}>
              {exporting ? <ActivityIndicator color="#000" /> : <Text style={styles.exportBtnText}>📤 تصدير كشف القوائم (Excel)</Text>}
            </Pressable>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث باسم القائمة/المؤسسة..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title="لا توجد قوائم مطابقة"
            subtitle="أنشئ قائمة باسم المؤسسة المانحة، ثم أضف عليها أسماء الأسر المعتمدة لديها"
          />
        }
      />

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title={editingListId ? '✏️ تعديل القائمة' : '➕ قائمة جديدة'}>
        <FormInput label="اسم القائمة (اسم المؤسسة) *" placeholder="مثلاً: أكتد" value={name} onChangeText={setName} />
        <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSaveList} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingListId ? '💾 حفظ التعديلات' : '✅ إضافة'}</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => setFormVisible(false)}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </Pressable>
        </View>
      </BottomSheetModal>

      <BottomSheetModal visible={fieldPickerOpen} onClose={() => setFieldPickerOpen(false)} title="تخصيص حقول التصدير">
        <FieldPicker title="📋 حقول كشف القوائم" cols={listsFields} onChange={setListsFields} startOpen />
        <Pressable
          style={styles.customExportBtn}
          onPress={() => { setFieldPickerOpen(false); handleExport(); }}
        >
          <Text style={styles.customExportBtnText}>📥 تصدير ({orderedSelected(listsFields).length} حقل)</Text>
        </Pressable>
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

  exportBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  exportBtnText: { color: colors.accent, fontWeight: '900', fontSize: 13 },
  customExportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  customExportBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 8 },
  listName: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right' },
  dateLine: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  countLine: { color: colors.green, fontSize: 11, fontWeight: 'bold', marginTop: 4, textAlign: 'right' },
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

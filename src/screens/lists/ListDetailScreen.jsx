import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import {
  fetchFamilies,
  fetchFamilyMembers,
  fetchCamps,
  fetchOrgListFamilyIds,
  addFamilyToList,
  removeFamilyFromList,
} from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import { exportXLSX } from '../../lib/excelIO';
import { naturalCompare } from '../../lib/helpers';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import FilterChip from '../../components/ui/FilterChip';
import SelectField from '../../components/ui/SelectField';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FieldPicker, { orderedSelected } from '../../components/ui/FieldPicker';
import colors from '../../theme/colors';

// حقول تصدير القائمة القابلة للتخصيص — الخمسة المطلوبة مفعّلة افتراضياً
// بالترتيب المطلوب بالضبط، وأي حقل إضافي (لو احتاجه لاحقاً) يبقى اختيارياً.
const LIST_FIELD_DEFS = [
  { key: 'head_name', label: 'اسم رب الأسرة', order: 1 },
  { key: 'head_id', label: 'رقم الهوية', order: 2 },
  { key: 'phone1', label: 'رقم الهاتف', order: 3 },
  { key: 'member_count', label: 'عدد الأفراد', order: 4 },
  { key: 'tent', label: 'رقم الخيمة/المأوى', order: 5 },
  { key: 'camp_name', label: 'المخيم', order: 0 },
  { key: 'vulnerability', label: 'درجة الضعف', order: 0 },
];

/**
 * شاشة قائمة واحدة (مثلاً "أكتد") — تبويبان: "المضافون" (أسر القائمة
 * حالياً، مع إمكانية الحذف) و"إضافة أسر" (بحث + فلتر مخيم + تحديد متعدد،
 * بنفس نمط اختيار الأسر بشاشة استلام التوزيعات). الإضافة/العرض هنا فقط
 * — لا إمكانية إضافة أسرة لقائمة من أي شاشة أخرى، حسب الطلب.
 */
export default function ListDetailScreen() {
  const route = useRoute();
  const { list } = route.params || {};
  const { orgId, canWrite } = useAuth();
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [membersByFamily, setMembersByFamily] = useState({});
  const [camps, setCamps] = useState([]);
  const [memberIds, setMemberIds] = useState(new Set());

  const [tab, setTab] = useState('members'); // members | add
  const [filterCamp, setFilterCamp] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [listFields, setListFields] = useState(LIST_FIELD_DEFS);

  const loadData = useCallback(async () => {
    if (!list?.id || !orgId) return;
    try {
      const campsData = await fetchCamps(orgId);
      const allowedCampIds = getAllowedCampIds(campsData);
      setCamps(getVisibleCamps(campsData));

      const famsRaw = await fetchFamilies(orgId);
      const fams = filterLocal(famsRaw, allowedCampIds);
      setFamilies(fams);

      const members = await fetchFamilyMembers(fams.map((f) => f.id));
      const grouped = {};
      members.forEach((m) => {
        if (!grouped[m.family_id]) grouped[m.family_id] = [];
        grouped[m.family_id].push(m);
      });
      setMembersByFamily(grouped);

      const ids = await fetchOrgListFamilyIds(list.id);
      setMemberIds(ids);
    } catch (e) {
      showError('تعذّر تحميل بيانات القائمة');
    } finally {
      setLoading(false);
    }
  }, [list?.id, orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const campMap = Object.fromEntries(camps.map((c) => [c.id, c.name]));

  const baseFiltered = useMemo(() => {
    let list = families;
    if (filterCamp) list = list.filter((f) => f.camp_id === filterCamp);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => {
        if ((f.head_name || '').toLowerCase().includes(q)) return true;
        if ((f.head_id || '').includes(q)) return true;
        const mems = membersByFamily[f.id] || [];
        return mems.some((m) => (m.name || '').toLowerCase().includes(q) || (m.national_id || '').includes(q));
      });
    }
    return [...list].sort((a, b) => naturalCompare(a.head_name, b.head_name));
  }, [families, filterCamp, search, membersByFamily]);

  const memberFamilies = baseFiltered.filter((f) => memberIds.has(f.id));
  const addableFamilies = baseFiltered.filter((f) => !memberIds.has(f.id));
  const shown = tab === 'members' ? memberFamilies : addableFamilies;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedIds(new Set(addableFamilies.map((f) => f.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleRemove = async (family) => {
    if (!canWrite) {
      showError('لا تملك صلاحية التعديل');
      return;
    }
    try {
      await removeFamilyFromList(list.id, family.id);
      setMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(family.id);
        return next;
      });
      showSuccess('تم حذف الأسرة من القائمة');
    } catch (e) {
      showError('خطأ: ' + e.message);
    }
  };

  const bulkAdd = async () => {
    if (!canWrite) {
      showError('لا تملك صلاحية التعديل');
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
        await addFamilyToList(list.id, orgId, famId);
      }
      setMemberIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      showSuccess(`تمت إضافة ${ids.length} أسرة للقائمة`);
      setSelectedIds(new Set());
      setTab('members');
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const buildExportRow = (f, i, cols) => {
    const memberCount = 1 + (membersByFamily[f.id]?.length || 0);
    const all = {
      head_name: f.head_name || '',
      head_id: f.head_id || '',
      phone1: f.phone1 || '',
      member_count: memberCount,
      tent: f.tent || '',
      camp_name: campMap[f.camp_id] || '—',
    };
    const row = { '#': i + 1 };
    cols.forEach((c) => { row[c.label] = all[c.key]; });
    return row;
  };

  const handleExport = async () => {
    const cols = orderedSelected(listFields);
    if (cols.length === 0) {
      showError('اختر حقلاً واحداً على الأقل للتصدير');
      return;
    }
    setExporting(true);
    try {
      const sorted = [...memberFamilies].sort((a, b) => naturalCompare(a.head_name, b.head_name));
      const rows = sorted.map((f, i) => buildExportRow(f, i, cols));
      const fileName = `قائمة_${(list?.name || 'معتمدة').replace(/\s+/g, '_')}`;
      await exportXLSX(rows, list?.name?.slice(0, 30) || 'القائمة', fileName);
      showSuccess('تم تصدير القائمة');
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
        style={[styles.card, tab === 'add' && selected && styles.cardSelected]}
        onPress={() => (tab === 'add' ? toggleSelect(f.id) : null)}
      >
        <View style={styles.cardRow}>
          {tab === 'add' && selected && <Text style={styles.selectedIcon}>✓</Text>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.familyName, selected && styles.familyNameSelected]}>{f.head_name || '—'}</Text>
            <Text style={styles.metaLine}>
              {memberCount} أفراد{f.tent ? ` · ⛺ ${f.tent}` : ''}{f.camp_id ? ` · 🏕️ ${campMap[f.camp_id] || '—'}` : ''}
            </Text>
          </View>
          {tab === 'members' && canWrite && (
            <Pressable style={styles.removeBtn} onPress={() => handleRemove(f)}>
              <Text style={styles.removeBtnText}>✕ حذف</Text>
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
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={renderFamily}
        extraData={{ filterCamp, search, tab, selectedIds, memberIds }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📋"
              title={list?.name || 'قائمة'}
              subtitle={<Text style={styles.headerSubtitle}>{memberFamilies.length} أسرة بالقائمة</Text>}
            />

            <Pressable style={[styles.exportBtn, exporting && styles.disabled]} onPress={() => setFieldPickerOpen(true)} disabled={exporting}>
              {exporting ? <ActivityIndicator color="#000" /> : <Text style={styles.exportBtnText}>📤 تصدير القائمة (Excel)</Text>}
            </Pressable>

            <View style={styles.chipsRow}>
              <FilterChip
                label={`👪 المضافون (${memberFamilies.length})`}
                selected={tab === 'members'}
                onPress={() => { setTab('members'); setSelectedIds(new Set()); }}
              />
              {canWrite && (
                <FilterChip
                  label={`➕ إضافة أسر (${addableFamilies.length})`}
                  selected={tab === 'add'}
                  onPress={() => setTab('add')}
                />
              )}
            </View>

            <SelectField
              value={filterCamp ? campMap[filterCamp] : undefined}
              placeholder="🏕️ كل المخيمات"
              options={[{ value: '', label: 'كل المخيمات' }, ...camps.map((c) => ({ value: c.id, label: c.name }))]}
              onSelect={setFilterCamp}
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالاسم أو رقم الهوية..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            {tab === 'add' && canWrite && (
              <>
                <View style={styles.selectAllRow}>
                  <Pressable style={styles.selectAllBtn} onPress={selectAllVisible}>
                    <Text style={styles.selectAllBtnText}>☑️ تحديد الكل ({addableFamilies.length})</Text>
                  </Pressable>
                  <Pressable style={styles.deselectAllBtn} onPress={deselectAll}>
                    <Text style={styles.deselectAllBtnText}>✕ إلغاء التحديد</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>اضغط على اسم الأسرة لتحديدها، ثم اضغط "إضافة" بالأسفل</Text>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title={tab === 'members' ? 'لا توجد أسر بالقائمة بعد' : 'كل الأسر المطابقة مضافة أصلاً'}
          />
        }
      />

      {tab === 'add' && canWrite && selectedIds.size > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.size} محددة</Text>
          <Pressable style={[styles.bulkBtn, bulkSaving && styles.disabled]} onPress={bulkAdd} disabled={bulkSaving}>
            {bulkSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.bulkBtnText}>➕ إضافة للقائمة</Text>}
          </Pressable>
        </View>
      )}

      <BottomSheetModal visible={fieldPickerOpen} onClose={() => setFieldPickerOpen(false)} title="تخصيص حقول التصدير">
        <FieldPicker title="📋 حقول التصدير" cols={listFields} onChange={setListFields} startOpen />
        <Pressable
          style={styles.customExportBtn}
          onPress={() => { setFieldPickerOpen(false); handleExport(); }}
        >
          <Text style={styles.customExportBtnText}>📥 تصدير ({orderedSelected(listFields).length} حقل)</Text>
        </Pressable>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 90 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  exportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  exportBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  disabled: { opacity: 0.6 },

  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 10,
  },

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
  removeBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { color: colors.red, fontSize: 10, fontWeight: 'bold' },

  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 14,
  },
  bulkText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
  bulkBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  bulkBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },

  customExportBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  customExportBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
});

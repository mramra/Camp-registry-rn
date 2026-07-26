import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { hasPermission } from '../../lib/permissions';
import {
  fetchFieldActivities, fetchCamps, fetchDistRounds,
  createFieldActivity, updateFieldActivity, deleteFieldActivity,
} from '../../lib/supabase';
import { exportXLSX } from '../../lib/excelIO';
import { formatDate } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import EmptyState from '../../components/ui/EmptyState';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import DateFields from '../../components/ui/DateFields';
import colors from '../../theme/colors';

/**
 * التقرير الإداري (field_activities) — سجل يومي لنشاطات المخيم الميدانية:
 * ندوات، ورشات عمل، توزيعات، اجتماعات، زيارات ميدانية. مستقل تماماً عن
 * family_activity_log (سجل تعديلات الأسر) وactivity_log بالقائمة الجانبية
 * (نفس المفهوم القديم) -- اسم جدول مختلف عمداً (field_activities) تفادياً
 * لأي التباس بين المفهومين.
 *
 * نشاط من نوع "توزيع" يقدر يُربط اختيارياً بجولة توزيع فعلية موجودة
 * (dist_round_id) بدل تكرار إدخالها يدوياً بالكامل، أو يُسجَّل مستقلاً
 * (زيارة/توزيع خارج نظام الجولات الرسمي) -- الاثنين مدعومان.
 */
const ACTIVITY_TYPE_OPTIONS = [
  { value: 'ندوة', label: '🗣️ ندوة' },
  { value: 'ورشة عمل', label: '🛠️ ورشة عمل' },
  { value: 'توزيع', label: '📦 توزيع' },
  { value: 'اجتماع', label: '🤝 اجتماع' },
  { value: 'زيارة ميدانية', label: '🚶 زيارة ميدانية' },
  { value: 'أخرى', label: '📌 أخرى' },
];
const ACTIVITY_TYPE_LABELS = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export default function FieldActivitiesScreen() {
  const navigation = useNavigation();
  const { orgId, profile, canWrite, canEdit, canDelete } = useAuth();
  const { getVisibleCamps } = useDataScope();
  const canExport = hasPermission(profile, 'export');

  const [activities, setActivities] = useState([]);
  const [camps, setCamps] = useState([]);
  const [distRounds, setDistRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCamp, setFilterCamp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [campPickerVisible, setCampPickerVisible] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [campId, setCampId] = useState(null);
  const [activityType, setActivityType] = useState('ندوة');
  const [actDay, setActDay] = useState(() => new Date().getDate());
  const [actMonth, setActMonth] = useState(() => new Date().getMonth() + 1);
  const [actYear, setActYear] = useState(() => new Date().getFullYear());
  const actDateStr = (actDay && actMonth && actYear)
    ? `${actYear}-${String(actMonth).padStart(2, '0')}-${String(actDay).padStart(2, '0')}`
    : '';
  const [title, setTitle] = useState('');
  const [attendeesCount, setAttendeesCount] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [linkedRoundId, setLinkedRoundId] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [activitiesData, campsData, roundsData] = await Promise.all([
        fetchFieldActivities(orgId),
        fetchCamps(orgId),
        fetchDistRounds(orgId),
      ]);
      setActivities(activitiesData);
      setCamps(getVisibleCamps(campsData));
      setDistRounds(roundsData);
    } catch (e) {
      showError('تعذّر تحميل التقرير الإداري');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, getVisibleCamps]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const campMap = useMemo(() => Object.fromEntries(camps.map((c) => [c.id, c.name])), [camps]);

  const filtered = useMemo(() => {
    let list = activities;
    if (filterCamp) list = list.filter((a) => a.camp_id === filterCamp);
    if (filterType) list = list.filter((a) => a.activity_type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) => (a.title || '').toLowerCase().includes(q) || (a.organizer || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activities, filterCamp, filterType, search]);

  const resetForm = () => {
    setEditingId(null);
    setCampId(null);
    setActivityType('ندوة');
    const t = new Date();
    setActDay(t.getDate());
    setActMonth(t.getMonth() + 1);
    setActYear(t.getFullYear());
    setTitle('');
    setAttendeesCount('');
    setOrganizer('');
    setLinkedRoundId(null);
    setNotes('');
  };

  const openAddForm = () => {
    resetForm();
    setFormVisible(true);
  };

  const openEditForm = (a) => {
    setEditingId(a.id);
    setCampId(a.camp_id);
    setActivityType(a.activity_type || 'ندوة');
    const d = a.activity_date ? new Date(a.activity_date) : new Date();
    setActDay(d.getDate());
    setActMonth(d.getMonth() + 1);
    setActYear(d.getFullYear());
    setTitle(a.title || '');
    setAttendeesCount(a.attendees_count != null ? String(a.attendees_count) : '');
    setOrganizer(a.organizer || '');
    setLinkedRoundId(a.dist_round_id || null);
    setNotes(a.notes || '');
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!campId) return showError('اختر المخيم');
    if (!title.trim()) return showError('اكتب عنوان النشاط');
    if (!actDateStr) return showError('أدخل تاريخ النشاط كاملاً');

    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        camp_id: campId,
        activity_date: actDateStr,
        activity_type: activityType,
        title: title.trim(),
        attendees_count: attendeesCount.trim() ? Number(attendeesCount.trim()) : null,
        organizer: organizer.trim() || null,
        dist_round_id: activityType === 'توزيع' ? linkedRoundId : null,
        notes: notes.trim() || null,
        created_by: profile?.full_name || null,
      };

      const result = editingId
        ? await updateFieldActivity(editingId, payload)
        : await createFieldActivity(payload);

      if (!result.success) {
        showError(result.error || 'فشل الحفظ');
        return;
      }
      showSuccess(editingId ? 'تم تحديث النشاط' : 'تمت إضافة النشاط');
      setFormVisible(false);
      resetForm();
      loadData();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (a) => {
    Alert.alert('حذف النشاط', `هل تريد حذف "${a.title}" نهائياً؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteFieldActivity(a.id);
          if (result.success) {
            showSuccess('تم حذف النشاط');
            loadData();
          } else {
            showError(result.error || 'فشل الحذف');
          }
        },
      },
    ]);
  };

  const handleExport = async () => {
    if (!filtered.length) return showError('لا توجد نشاطات للتصدير حسب الفلترة الحالية');
    try {
      const rows = filtered.map((a) => ({
        'التاريخ': formatDate(a.activity_date),
        'المخيم': campMap[a.camp_id] || '—',
        'نوع النشاط': a.activity_type || '—',
        'العنوان': a.title || '—',
        'عدد الحضور': a.attendees_count ?? '—',
        'الجهة المنظِّمة': a.organizer || '—',
        'جولة التوزيع المرتبطة': a.dist_rounds?.name || '—',
        'ملاحظات': a.notes || '',
        'سجّله': a.created_by || '—',
      }));
      await exportXLSX(rows, 'التقرير الإداري', 'التقرير_الإداري');
      showSuccess(`تم تصدير ${rows.length} نشاط`);
    } catch (e) {
      showError(e.message || 'فشل التصدير');
    }
  };

  const renderActivity = ({ item: a }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle}>{ACTIVITY_TYPE_LABELS[a.activity_type] || '📌'} {a.title}</Text>
        <Text style={styles.metaLine}>📅 {formatDate(a.activity_date)} · 🏕️ {campMap[a.camp_id] || '—'}</Text>
        {a.attendees_count != null && <Text style={styles.metaLine}>👥 {a.attendees_count} حاضر</Text>}
        {!!a.organizer && <Text style={styles.metaLine}>🏢 {a.organizer}</Text>}
        {!!a.dist_rounds?.name && <Text style={styles.metaLine}>🔗 مرتبط بجولة: {a.dist_rounds.name}</Text>}
        {!!a.notes && <Text style={styles.metaLine}>{a.notes}</Text>}
        {!!a.created_by && <Text style={styles.dateLine}>سجّله: {a.created_by}</Text>}
      </View>
      {canWrite && (
        <View style={styles.cardActions}>
          {canEdit && (
            <Pressable style={styles.editIconBtn} onPress={() => openEditForm(a)}>
              <Text style={styles.editIconBtnText}>✏️ تعديل</Text>
            </Pressable>
          )}
          {canDelete && (
            <Pressable style={styles.deleteIconBtn} onPress={() => handleDelete(a)}>
              <Text style={styles.deleteIconBtnText}>🗑️ حذف</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
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
        renderItem={renderActivity}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <PageHeader
              icon="📝"
              title="التقرير الإداري"
              subtitle={<Text style={styles.headerSubtitle}>{filtered.length} من {activities.length} نشاط</Text>}
              action={
                canExport ? (
                  <Pressable style={styles.exportBtn} onPress={handleExport}>
                    <Text style={styles.exportBtnText}>📤 تصدير</Text>
                  </Pressable>
                ) : null
              }
            />

            {canWrite && <PrimaryButton label="➕ نشاط جديد" onPress={openAddForm} />}

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 بحث بالعنوان أو الجهة المنظِّمة..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />

            <View style={styles.fieldsRow}>
              <Pressable style={styles.campField} onPress={() => setCampPickerVisible(true)}>
                <Text style={styles.campFieldText}>
                  {filterCamp ? `المخيم: ${campMap[filterCamp]}` : `المخيم: كل المخيمات`}
                </Text>
                <Text style={styles.campFieldChevron}>▾</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <SelectField
                  value={filterType ? `النوع: ${ACTIVITY_TYPE_LABELS[filterType]}` : undefined}
                  options={[{ value: '', label: 'كل الأنواع' }, ...ACTIVITY_TYPE_OPTIONS]}
                  onSelect={setFilterType}
                  placeholder="النوع: الكل"
                />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="📝" title="لا توجد نشاطات مطابقة" subtitle="اضغط (➕ نشاط جديد) لتسجيل أول نشاط" />}
      />

      <BottomSheetModal visible={campPickerVisible} onClose={() => setCampPickerVisible(false)} title="اختر المخيم">
        <Pressable style={styles.pickerRow} onPress={() => { setFilterCamp(''); setCampPickerVisible(false); }}>
          <Text style={styles.pickerRowText}>كل المخيمات</Text>
        </Pressable>
        {camps.map((c) => (
          <Pressable key={c.id} style={styles.pickerRow} onPress={() => { setFilterCamp(c.id); setCampPickerVisible(false); }}>
            <Text style={styles.pickerRowText}>{c.name}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>

      <BottomSheetModal visible={formVisible} onClose={() => setFormVisible(false)} title={editingId ? '✏️ تعديل النشاط' : '➕ نشاط جديد'}>
        <SelectField
          label="المخيم *"
          value={camps.find((c) => c.id === campId)?.name}
          options={camps.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={setCampId}
          placeholder="اختر المخيم"
        />
        <SelectField
          label="نوع النشاط *"
          value={ACTIVITY_TYPE_LABELS[activityType]}
          options={ACTIVITY_TYPE_OPTIONS}
          onSelect={(v) => setActivityType(v || 'أخرى')}
          placeholder="اختر النوع"
        />
        <Text style={styles.fieldLabel}>تاريخ النشاط *</Text>
        <DateFields
          day={actDay}
          month={actMonth}
          year={actYear}
          onChangeDay={setActDay}
          onChangeMonth={setActMonth}
          onChangeYear={setActYear}
        />
        <FormInput label="عنوان النشاط *" placeholder="مثال: ندوة توعية صحية" value={title} onChangeText={setTitle} />

        {activityType === 'توزيع' && (
          <SelectField
            label="ربط بجولة توزيع موجودة (اختياري)"
            value={distRounds.find((r) => r.id === linkedRoundId)?.name}
            options={[{ value: '', label: '— بدون ربط (تسجيل مستقل) —' }, ...distRounds.map((r) => ({ value: r.id, label: r.name }))]}
            onSelect={(v) => setLinkedRoundId(v || null)}
            placeholder="— بدون ربط —"
          />
        )}

        <FormInput
          label="عدد الحضور/المستفيدين"
          value={attendeesCount}
          onChangeText={(v) => setAttendeesCount(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
        />
        <FormInput label="الجهة المنظِّمة (اختياري)" value={organizer} onChangeText={setOrganizer} />
        <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />

        <View style={styles.row}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>{editingId ? '💾 حفظ التعديلات' : '✅ إضافة'}</Text>}
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
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  headerSubtitle: { color: colors.muted, fontSize: 11 },

  exportBtn: {
    backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: colors.accent,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
  },
  exportBtnText: { color: colors.accent, fontWeight: 'bold', fontSize: 12 },

  searchInput: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: colors.white, fontSize: 13, textAlign: 'right', marginBottom: 10,
  },

  fieldsRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  campField: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
  },
  campFieldText: { color: colors.white, fontSize: 13 },
  campFieldChevron: { color: colors.muted, fontSize: 12 },

  pickerRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerRowText: { color: colors.white, fontSize: 14, textAlign: 'right' },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRightWidth: 3, borderRightColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 8 },
  activityTitle: { color: colors.white, fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  metaLine: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right' },
  dateLine: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
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

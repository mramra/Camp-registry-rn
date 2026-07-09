import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, transferFamily } from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * ورقة "نقل أسرة لمخيم آخر" — الطريقة الوحيدة لتغيير مخيم أسرة بعد إضافتها
 * (حقل المخيم مقفول بنموذج الأسرة نفسه). دخول الأسرة يُسجَّل تلقائياً عند
 * الإضافة (بشاشة FamilyFormScreen)، وخروجها من صفحة تفاصيل الأسرة --
 * فهذه الورقة مخصصة للنقل فقط، ولا تعرض خيار نوع حركة.
 *
 * عند الحفظ: يتحدّث camp_id وentry_date على الأسرة نفسها فعلياً (تاريخ
 * النقل = دخول جديد)، مع تسجيل حركة "نقل" بجدول family_movements للأرشفة.
 */
export default function MovementFormSheet({ visible, onClose, onSaved, camps, orgId }) {
  const { profile, user } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState(null);
  const [toCamp, setToCamp] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!visible || !orgId) return;
    (async () => {
      const famsRaw = await fetchFamilies(orgId);
      const allowedCampIds = getAllowedCampIds(camps);
      setFamilies(filterLocal(famsRaw, allowedCampIds));
    })();
  }, [visible, orgId]);

  const resetForm = () => {
    setFamilyId(null);
    setSearch('');
    setToCamp(null);
    setDate(todayStr());
    setReason('');
    setNotes('');
    setErrors({});
  };

  const selectedFamily = families.find((f) => f.id === familyId);

  const filteredFamilies = families.filter(
    (f) =>
      !search.trim() ||
      (f.head_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.head_id || '').includes(search)
  );

  const validate = () => {
    const e = {};
    if (!familyId) e.familyId = 'اختر أسرة';
    if (!toCamp) e.toCamp = 'اختر المخيم الجديد';
    if (toCamp && selectedFamily && toCamp === selectedFamily.camp_id) e.toCamp = 'الأسرة أصلاً بهذا المخيم';
    if (!date) e.date = 'التاريخ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await transferFamily(selectedFamily, {
        toCampId: toCamp,
        date,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        actorId: profile?.id || user?.id || null,
        orgId,
      });
      if (!result.success) {
        showError(result.error || 'فشل تسجيل النقل');
        return;
      }
      showSuccess('تم نقل الأسرة بنجاح');
      resetForm();
      onSaved();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="🔵 نقل أسرة لمخيم آخر">
      <FormInput
        label="بحث عن أسرة"
        placeholder="اسم رب الأسرة أو رقم الهوية..."
        value={search}
        onChangeText={setSearch}
      />
      <SelectField
        value={selectedFamily?.head_name}
        options={filteredFamilies.slice(0, 50).map((f) => ({ value: f.id, label: f.head_name }))}
        onSelect={setFamilyId}
        placeholder="— اختر أسرة —"
        error={errors.familyId}
      />

      {!!selectedFamily && (
        <View style={styles.currentCampBox}>
          <Text style={styles.currentCampLabel}>المخيم الحالي</Text>
          <Text style={styles.currentCampValue}>{camps.find((c) => c.id === selectedFamily.camp_id)?.name || '— بلا مخيم —'}</Text>
        </View>
      )}

      <SelectField
        label="المخيم الجديد"
        value={camps.find((c) => c.id === toCamp)?.name}
        options={camps.filter((c) => c.id !== selectedFamily?.camp_id).map((c) => ({ value: c.id, label: c.name }))}
        onSelect={setToCamp}
        placeholder="— اختر —"
        error={errors.toCamp}
      />

      <FormInput label="تاريخ النقل (YYYY-MM-DD)" value={date} onChangeText={setDate} error={errors.date} />
      <FormInput label="السبب" placeholder="سبب النقل..." value={reason} onChangeText={setReason} />
      <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />

      <View style={styles.row}>
        <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>✅ تأكيد النقل</Text>}
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>إلغاء</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  currentCampBox: { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 12 },
  currentCampLabel: { color: colors.muted, fontSize: 10, textAlign: 'right' },
  currentCampValue: { color: colors.white, fontWeight: 'bold', fontSize: 13, marginTop: 2, textAlign: 'right' },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

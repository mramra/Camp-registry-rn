import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useDataScope } from '../../lib/useDataScope';
import { fetchFamilies, createMovement } from '../../lib/supabase';
import { showError, showSuccess } from '../../utils/toast';
import BottomSheetModal from '../../components/ui/BottomSheetModal';
import FormInput from '../../components/ui/FormInput';
import SelectField from '../../components/ui/SelectField';
import colors from '../../theme/colors';

const TYPE_OPTIONS = [
  { key: 'entry', label: '🟢 دخول' },
  { key: 'exit', label: '🔴 خروج' },
  { key: 'transfer', label: '🔵 نقل' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * ورقة تسجيل حركة أسرة (دخول/خروج/نقل) — مكوّن مستقل يُستخدم من
 * MovementsScreen. لا يستدعي نظام موافقات (مؤجّل)؛ التسجيل مباشر
 * لمن يملك صلاحية canWrite (نفس تبسيط الأسر/المخيمات بهذه المرحلة).
 */
export default function MovementFormSheet({ visible, onClose, onSaved, camps, orgId }) {
  const { profile, user } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  const [families, setFamilies] = useState([]);
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState(null);
  const [type, setType] = useState('entry');
  const [fromCamp, setFromCamp] = useState(null);
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
    setType('entry');
    setFromCamp(null);
    setToCamp(null);
    setDate(todayStr());
    setReason('');
    setNotes('');
    setErrors({});
  };

  const filteredFamilies = families.filter(
    (f) =>
      !search.trim() ||
      (f.head_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.head_id || '').includes(search)
  );

  const validate = () => {
    const e = {};
    if (!familyId) e.familyId = 'اختر أسرة';
    if (!date) e.date = 'التاريخ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        family_id: familyId,
        type,
        from_camp: type !== 'entry' ? fromCamp : null,
        to_camp: type !== 'exit' ? toCamp : null,
        date,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        created_by: profile?.id || user?.id || null,
      };
      const result = await createMovement(payload);
      if (!result.success) {
        showError(result.error || 'فشل تسجيل الحركة');
        return;
      }
      showSuccess('تم تسجيل الحركة');
      resetForm();
      onSaved();
    } catch (e) {
      showError('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="➕ تسجيل حركة">
      <FormInput
        label="بحث عن أسرة"
        placeholder="اسم رب الأسرة أو رقم الهوية..."
        value={search}
        onChangeText={setSearch}
      />
      <SelectField
        value={families.find((f) => f.id === familyId)?.head_name}
        options={filteredFamilies.slice(0, 50).map((f) => ({ value: f.id, label: f.head_name }))}
        onSelect={setFamilyId}
        placeholder="— اختر أسرة —"
        error={errors.familyId}
      />

      <Text style={styles.fieldLabel}>نوع الحركة</Text>
      <View style={styles.segmentRow}>
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.segmentBtn, type === opt.key && styles.segmentBtnActive]}
            onPress={() => setType(opt.key)}
          >
            <Text style={[styles.segmentText, type === opt.key && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {(type === 'exit' || type === 'transfer') && (
        <SelectField
          label="من مخيم"
          value={camps.find((c) => c.id === fromCamp)?.name}
          options={camps.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={setFromCamp}
          placeholder="— اختر —"
        />
      )}
      {(type === 'entry' || type === 'transfer') && (
        <SelectField
          label="إلى مخيم"
          value={camps.find((c) => c.id === toCamp)?.name}
          options={camps.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={setToCamp}
          placeholder="— اختر —"
        />
      )}

      <FormInput label="التاريخ (YYYY-MM-DD)" value={date} onChangeText={setDate} error={errors.date} />
      <FormInput label="السبب" placeholder="سبب الحركة..." value={reason} onChangeText={setReason} />
      <FormInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />

      <View style={styles.row}>
        <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>✅ تسجيل</Text>}
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>إلغاء</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 4, textAlign: 'right' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.white, fontWeight: 'bold', fontSize: 12 },
  segmentTextActive: { color: '#000' },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

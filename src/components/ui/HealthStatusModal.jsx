import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import SelectField from './SelectField';
import { calcAge } from '../../lib/helpers';
import {
  DISABILITY_TYPES, INJURY_TYPES, CHRONIC_DISEASES,
  FEMALE_STATUSES, ORPHAN_TYPES, ORPHAN_CAUSES, normalizeHealthValue,
} from '../../lib/healthOptions';
import colors from '../../theme/colors';

/** صف اختيار متعدد مع تفصيل اختياري (إعاقة/إصابة/مرض مزمن) */
function MultiSelectWithDetails({ typesList, items, onChange }) {
  const list = Array.isArray(items) ? items : [];

  const toggle = (label) => {
    const exists = list.find((i) => i.type === label);
    if (exists) onChange(list.filter((i) => i.type !== label));
    else onChange([...list, { type: label, detail: '' }]);
  };
  const setDetail = (label, detail) => {
    onChange(list.map((i) => (i.type === label ? { ...i, detail } : i)));
  };

  return (
    <View style={{ gap: 8 }}>
      {typesList.map((t) => {
        const current = list.find((i) => i.type === t.label);
        const checked = !!current;
        return (
          <View key={t.key} style={styles.optionCard}>
            <Pressable style={styles.optionRow} onPress={() => toggle(t.label)}>
              <Text style={styles.checkbox}>{checked ? '☑️' : '⬜'}</Text>
              <Text style={styles.optionLabel}>{t.label}</Text>
            </Pressable>
            {checked && t.details.length > 0 && (
              <SelectField
                value={current.detail}
                options={t.details}
                onSelect={(v) => setDetail(t.label, v)}
                placeholder="تفاصيل (اختياري)"
              />
            )}
            {checked && t.details.length === 0 && (
              <TextInput
                value={current.detail || ''}
                onChangeText={(v) => setDetail(t.label, v)}
                placeholder="تفاصيل (اختياري)"
                placeholderTextColor={colors.muted}
                style={styles.detailInput}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * مودال الحالات الصحية التفصيلية — لرب الأسرة (subjectKind='head') وكل فرد.
 * نفس منطق وخيارات النسخة الأصلية: إعاقات/إصابات/أمراض مزمنة (متعدد الاختيار
 * مع تفصيل اختياري)، يُتم (للقاصرين فقط)، حالات نسائية (للإناث فقط).
 */
export default function HealthStatusModal({ visible, onClose, subjectName, gender, dob, initial, onSave }) {
  const [orphanStatus, setOrphanStatus] = useState(initial?.orphan_status || '');
  const [orphanCause, setOrphanCause] = useState(initial?.orphan_cause || '');
  const [disabilities, setDisabilities] = useState(normalizeHealthValue(initial?.disabilities));
  const [injuries, setInjuries] = useState(normalizeHealthValue(initial?.injuries));
  const [chronics, setChronics] = useState(normalizeHealthValue(initial?.chronic_diseases));
  const [femaleStatus, setFemaleStatus] = useState(normalizeHealthValue(initial?.female_status));

  const age = useMemo(() => calcAge(dob), [dob]);
  const isMinor = age !== null && age < 18;
  const isFemale = (gender || '').includes('أنثى');

  const toggleFemale = (s) =>
    setFemaleStatus((fs) => (fs.includes(s) ? fs.filter((x) => x !== s) : [...fs, s]));

  const handleSave = () => {
    onSave({
      orphan_status: orphanStatus || null,
      orphan_cause: orphanStatus ? orphanCause || null : null,
      disabilities,
      injuries,
      chronic_diseases: chronics,
      female_status: femaleStatus,
    });
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={`🩺 حالات صحية — ${subjectName || ''}`}>
      <ScrollView style={{ maxHeight: 460 }}>
        {isMinor && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>👶 حالة اليتم</Text>
            <View style={{ gap: 6 }}>
              {ORPHAN_TYPES.map((o) => (
                <Pressable key={o.key} style={styles.optionCard} onPress={() => setOrphanStatus(o.key)}>
                  <View style={styles.optionRow}>
                    <Text style={styles.radio}>{orphanStatus === o.key ? '🔘' : '⚪'}</Text>
                    <Text style={styles.optionLabel}>{o.label}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable style={styles.optionCard} onPress={() => setOrphanStatus('')}>
                <View style={styles.optionRow}>
                  <Text style={styles.radio}>{!orphanStatus ? '🔘' : '⚪'}</Text>
                  <Text style={styles.optionLabelMuted}>ليس يتيماً</Text>
                </View>
              </Pressable>
            </View>
            {!!orphanStatus && (
              <SelectField
                value={orphanCause}
                options={ORPHAN_CAUSES}
                onSelect={setOrphanCause}
                placeholder="سبب الوفاة (اختياري)"
              />
            )}
          </View>
        )}

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>🦽 الإعاقات</Text>
          <MultiSelectWithDetails typesList={DISABILITY_TYPES} items={disabilities} onChange={setDisabilities} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>🩹 إصابات الحرب</Text>
          <MultiSelectWithDetails typesList={INJURY_TYPES} items={injuries} onChange={setInjuries} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>💊 الأمراض المزمنة</Text>
          <MultiSelectWithDetails typesList={CHRONIC_DISEASES} items={chronics} onChange={setChronics} />
        </View>

        {isFemale && (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>♀️ حالات خاصة</Text>
            <View style={{ gap: 6 }}>
              {FEMALE_STATUSES.map((s) => (
                <Pressable key={s} style={styles.optionCard} onPress={() => toggleFemale(s)}>
                  <View style={styles.optionRow}>
                    <Text style={styles.checkbox}>{femaleStatus.includes(s) ? '☑️' : '⬜'}</Text>
                    <Text style={styles.optionLabel}>{s}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.actionsRow}>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>💾 حفظ الحالات</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>إلغاء</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.muted, fontWeight: 'bold', fontSize: 12, marginBottom: 8, textAlign: 'right' },
  optionCard: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
  optionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  checkbox: { fontSize: 16 },
  radio: { fontSize: 14 },
  optionLabel: { color: colors.white, fontSize: 13 },
  optionLabelMuted: { color: colors.muted, fontSize: 13 },
  detailInput: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, color: colors.white, fontSize: 12, marginTop: 8, textAlign: 'right',
  },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

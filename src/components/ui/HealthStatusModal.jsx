import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import SelectField from './SelectField';
import { calcAge } from '../../lib/helpers';
import {
  DISABILITY_TYPES, INJURY_TYPES, CHRONIC_DISEASES, NEEDS_TYPES,
  FEMALE_STATUSES, ORPHAN_TYPES, ORPHAN_CAUSES, normalizeHealthValue,
} from '../../lib/healthOptions';
import colors from '../../theme/colors';

/**
 * اختيار متعدد بأسلوب شرائح (chips) — نفس نمط اختيار الحقول بشاشة الاستيراد
 * والتصدير: ضغطة على الشريحة تختارها/تلغيها (بدل صف بعلامة صح). لكل نوع
 * مختار وعنده تفاصيل محدَّدة مسبقاً (details.length > 0)، يظهر منتقي تفصيل
 * مختصر تحت الشرائح مباشرة، موسوم باسم النوع نفسه.
 */
function ChipMultiSelectWithDetails({ typesList, items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const selectedTypes = typesList.filter((t) => list.some((i) => i.type === t.label));

  const toggle = (label) => {
    const exists = list.find((i) => i.type === label);
    if (exists) onChange(list.filter((i) => i.type !== label));
    else onChange([...list, { type: label, detail: '' }]);
  };
  const setDetail = (label, detail) => {
    onChange(list.map((i) => (i.type === label ? { ...i, detail } : i)));
  };

  return (
    <View>
      <View style={styles.chipsWrap}>
        {typesList.map((t) => {
          const checked = list.some((i) => i.type === t.label);
          return (
            <Pressable key={t.key} onPress={() => toggle(t.label)} style={[styles.chip, checked && styles.chipActive]}>
              <Text style={[styles.chipText, checked && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedTypes.length > 0 && (
        <View style={{ marginTop: 8, gap: 8 }}>
          {selectedTypes.map((t) => {
            const current = list.find((i) => i.type === t.label);
            if (t.details.length === 0) {
              return (
                <View key={t.key} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t.label}</Text>
                  <TextInput
                    value={current?.detail || ''}
                    onChangeText={(v) => setDetail(t.label, v)}
                    placeholder="تفاصيل (اختياري)"
                    placeholderTextColor={colors.muted}
                    style={styles.detailInput}
                  />
                </View>
              );
            }
            return (
              <View key={t.key} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.label}</Text>
                <View style={{ flex: 1 }}>
                  <SelectField
                    value={current?.detail}
                    options={t.details}
                    onSelect={(v) => setDetail(t.label, v)}
                    placeholder="تفاصيل (اختياري)"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** اختيار متعدد بشرائح بسيطة بلا تفاصيل (احتياجات مساعدة / حالات نسائية) */
function ChipMultiSelectSimple({ options, items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const toggle = (v) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <View style={styles.chipsWrap}>
      {options.map((opt) => {
        const checked = list.includes(opt);
        return (
          <Pressable key={opt} onPress={() => toggle(opt)} style={[styles.chip, checked && styles.chipActive]}>
            <Text style={[styles.chipText, checked && styles.chipTextActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * مودال الحالات الصحية التفصيلية — لرب الأسرة (subjectKind='head') وكل فرد.
 * إعاقات/إصابات/أمراض مزمنة/احتياجات مساعدة (شرائح اختيار متعدد)، يُتم
 * (للقاصرين فقط)، حالات نسائية (للإناث فقط).
 */
export default function HealthStatusModal({ visible, onClose, subjectName, gender, dob, initial, onSave }) {
  const [orphanStatus, setOrphanStatus] = useState(initial?.orphan_status || '');
  const [orphanCause, setOrphanCause] = useState(initial?.orphan_cause || '');
  const [disabilities, setDisabilities] = useState(normalizeHealthValue(initial?.disabilities));
  const [injuries, setInjuries] = useState(normalizeHealthValue(initial?.injuries));
  const [chronics, setChronics] = useState(normalizeHealthValue(initial?.chronic_diseases));
  const [femaleStatus, setFemaleStatus] = useState(normalizeHealthValue(initial?.female_status));
  const [needs, setNeeds] = useState(normalizeHealthValue(initial?.needs));

  const age = useMemo(() => calcAge(dob), [dob]);
  const isMinor = age !== null && age < 18;
  const isFemale = (gender || '').includes('أنثى');

  const handleSave = () => {
    onSave({
      orphan_status: orphanStatus || null,
      orphan_cause: orphanStatus ? orphanCause || null : null,
      disabilities,
      injuries,
      chronic_diseases: chronics,
      female_status: femaleStatus,
      needs,
    });
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={`🩺 حالات صحية — ${subjectName || ''}`}>
      <ScrollView style={{ maxHeight: 480 }}>
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
          <ChipMultiSelectWithDetails typesList={DISABILITY_TYPES} items={disabilities} onChange={setDisabilities} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>🩹 إصابات الحرب</Text>
          <ChipMultiSelectWithDetails typesList={INJURY_TYPES} items={injuries} onChange={setInjuries} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>💊 الأمراض المزمنة</Text>
          <ChipMultiSelectWithDetails typesList={CHRONIC_DISEASES} items={chronics} onChange={setChronics} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>🦯 احتياجات مساعدة</Text>
          <ChipMultiSelectSimple options={NEEDS_TYPES} items={needs} onChange={setNeeds} />
        </View>

        {isFemale && (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>♀️ حالات خاصة</Text>
            <ChipMultiSelectSimple options={FEMALE_STATUSES} items={femaleStatus} onChange={setFemaleStatus} />
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

  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: colors.purple },
  chipText: { color: colors.muted, fontSize: 12 },
  chipTextActive: { color: colors.purple, fontWeight: 'bold' },

  detailRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 10, padding: 8 },
  detailLabel: { color: colors.white, fontSize: 11, fontWeight: 'bold', width: 90, textAlign: 'right' },
  detailInput: {
    flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, color: colors.white, fontSize: 12, textAlign: 'right',
  },

  optionCard: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
  optionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  radio: { fontSize: 14 },
  optionLabel: { color: colors.white, fontSize: 13 },
  optionLabelMuted: { color: colors.muted, fontSize: 13 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});

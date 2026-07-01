/**
 * HealthStatusModal.jsx — إدخال/تعديل الحالات الصحية التفصيلية
 * منقول من camp-registry-react/src/pages/Families/HealthStatusModal.jsx
 * نفس المنطق والخيارات بالضبط: إعاقات/إصابات/أمراض مزمنة (متعددة الاختيار
 * مع تفصيل اختياري)، يتم (للقاصرين فقط)، حالات النساء (للإناث فقط).
 */
import { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { calcAge } from '../../lib/helpers'
import {
  DISABILITY_TYPES, INJURY_TYPES, CHRONIC_DISEASES,
  FEMALE_STATUSES, ORPHAN_TYPES, ORPHAN_CAUSES,
} from '../../lib/healthOptions'
import { colors, radius } from '../../theme'

// ── صف اختيار متعدد مع تفصيل اختياري (إعاقة/إصابة/مرض) ──
function MultiSelectWithDetails({ typesList, items, onChange }) {
  const list = Array.isArray(items) ? items : []

  function toggle(label) {
    const exists = list.find(i => i.type === label)
    if (exists) onChange(list.filter(i => i.type !== label))
    else onChange([...list, { type: label, detail: '' }])
  }
  function setDetail(label, detail) {
    onChange(list.map(i => i.type === label ? { ...i, detail } : i))
  }

  return (
    <View style={{ gap: 8 }}>
      {typesList.map(t => {
        const current = list.find(i => i.type === t.label)
        const checked = !!current
        return (
          <View key={t.key} style={styles.optionBox}>
            <TouchableOpacity onPress={() => toggle(t.label)} style={styles.checkRow}>
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.optionLabel}>{t.label}</Text>
            </TouchableOpacity>
            {checked && t.details.length > 0 && (
              <Select
                value={current.detail || ''}
                onChange={v => setDetail(t.label, v)}
                placeholder="تفاصيل (اختياري)"
                options={t.details.map(d => ({ value: d, label: d }))}
              />
            )}
            {checked && t.details.length === 0 && (
              <TextInput
                value={current.detail || ''}
                onChangeText={v => setDetail(t.label, v)}
                placeholder="تفاصيل (اختياري)"
                placeholderTextColor={colors.muted}
                style={styles.detailInput}
              />
            )}
          </View>
        )
      })}
    </View>
  )
}

export default function HealthStatusModal({ open, onClose, subjectName, gender, dob, initial, onSave }) {
  const [orphanStatus, setOrphanStatus] = useState(initial?.orphan_status || '')
  const [orphanCause,  setOrphanCause]  = useState(initial?.orphan_cause  || '')
  const [disabilities, setDisabilities] = useState(initial?.disabilities || [])
  const [injuries,     setInjuries]     = useState(initial?.injuries     || [])
  const [chronics,     setChronics]     = useState(initial?.chronic_diseases || [])
  const [femaleStatus, setFemaleStatus] = useState(initial?.female_status || [])

  const age = useMemo(() => calcAge(dob), [dob])
  const isMinor  = age !== null && age < 18
  const isFemale = (gender || '').includes('أنثى')

  function toggleFemale(s) {
    setFemaleStatus(fs => fs.includes(s) ? fs.filter(x => x !== s) : [...fs, s])
  }

  function handleSave() {
    onSave({
      orphan_status: orphanStatus || null,
      orphan_cause:  orphanStatus ? (orphanCause || null) : null,
      disabilities,
      injuries,
      chronic_diseases: chronics,
      female_status: femaleStatus,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`🩺 حالات صحية — ${subjectName || ''}`} size="md">
      <View style={{ gap: 16 }}>

        {/* اليتم — للقاصرين فقط */}
        {isMinor && (
          <View>
            <Text style={styles.sectionTitle}>👶 حالة اليتم</Text>
            <View style={{ gap: 6 }}>
              {ORPHAN_TYPES.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setOrphanStatus(o.key)} style={styles.radioRow}>
                  <View style={[styles.radio, orphanStatus === o.key && styles.radioChecked]}>
                    {orphanStatus === o.key && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setOrphanStatus('')} style={styles.radioRow}>
                <View style={[styles.radio, !orphanStatus && styles.radioChecked]}>
                  {!orphanStatus && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.mutedLabel}>ليس يتيماً</Text>
              </TouchableOpacity>
            </View>
            {!!orphanStatus && (
              <View style={{ marginTop: 8 }}>
                <Select
                  value={orphanCause} onChange={setOrphanCause}
                  placeholder="سبب الوفاة (اختياري)"
                  options={ORPHAN_CAUSES.map(c => ({ value: c, label: c }))}
                />
              </View>
            )}
          </View>
        )}

        {/* الإعاقات */}
        <View>
          <Text style={styles.sectionTitle}>🦽 الإعاقات</Text>
          <MultiSelectWithDetails typesList={DISABILITY_TYPES} items={disabilities} onChange={setDisabilities} />
        </View>

        {/* الإصابات */}
        <View>
          <Text style={styles.sectionTitle}>🩹 إصابات الحرب</Text>
          <MultiSelectWithDetails typesList={INJURY_TYPES} items={injuries} onChange={setInjuries} />
        </View>

        {/* الأمراض المزمنة */}
        <View>
          <Text style={styles.sectionTitle}>💊 الأمراض المزمنة</Text>
          <MultiSelectWithDetails typesList={CHRONIC_DISEASES} items={chronics} onChange={setChronics} />
        </View>

        {/* حالات خاصة بالنساء */}
        {isFemale && (
          <View>
            <Text style={styles.sectionTitle}>♀️ حالات خاصة</Text>
            <View style={{ gap: 6 }}>
              {FEMALE_STATUSES.map(s => {
                const checked = femaleStatus.includes(s)
                return (
                  <TouchableOpacity key={s} onPress={() => toggleFemale(s)} style={styles.checkRow}>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.optionLabel}>{s}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>💾 حفظ الحالات</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  optionBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10,
  },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioChecked: { borderColor: colors.accent },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  optionLabel: { color: colors.white, fontSize: 13 },
  mutedLabel: { color: colors.muted, fontSize: 13 },
  detailInput: {
    marginTop: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, color: colors.white, fontSize: 12, textAlign: 'right',
  },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
})

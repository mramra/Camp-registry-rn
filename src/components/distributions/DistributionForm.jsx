/**
 * DistributionForm.jsx — فورم إنشاء/تعديل توزيع
 * مستخلص من camp-registry (المستودع القديم) — دالة showNewDistForm/saveNewRound
 */
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { TYPE_NAMES } from './DistributionCard'
import { colors, radius } from '../../theme'

export default function DistributionForm({
  visible, onClose, form, setForm, editDist, camps, onSave, saving,
}) {
  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <Modal open={visible} onClose={onClose} title={editDist ? '✏️ تعديل توزيع' : '📦 توزيع جديد'} size="md">
      <View style={styles.form}>
        <View>
          <Text style={styles.label}>اسم التوزيع *</Text>
          <TextInput
            value={form.name}
            onChangeText={v => set('name', v)}
            placeholder="مثال: توزيعة لحمة رمضان"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <Select
          label="النوع"
          value={form.type}
          onChange={v => set('type', v)}
          options={Object.entries(TYPE_NAMES).map(([v, l]) => ({ value: v, label: l }))}
        />

        <Select
          label="المخيم"
          value={form.camp_id}
          onChange={v => set('camp_id', v)}
          placeholder="— كل المخيمات —"
          options={camps.map(c => ({ value: c.id, label: c.name }))}
        />

        <View>
          <Text style={styles.label}>الكمية</Text>
          <TextInput
            value={String(form.quantity || '')}
            onChangeText={v => set('quantity', v)}
            placeholder="0 = غير محدد"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <View>
          <Text style={styles.label}>التاريخ</Text>
          <TextInput
            value={form.date}
            onChangeText={v => set('date', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.mono]}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveBtn, saving && styles.disabled]}>
            <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : editDist ? '💾 حفظ' : '✅ إنشاء'}</Text>
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
  form: { gap: 14 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.white, fontSize: 13, textAlign: 'right',
  },
  mono: { textAlign: 'left', fontFamily: 'monospace' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
})

/**
 * Select.jsx — قائمة منسدلة مخصصة (v2، 2 يوليو 2026)
 *
 * ⚠️ إعادة بناء كاملة: النسخة الأصلية استخدمت @react-native-picker/picker
 * مباشرة، وهذه المكتبة على الويب تُرندر عنصر <select> HTML قياسي (عبر
 * Picker.web.js الخاص بها) لا يتأثر بأنماط StyleSheet الخاصة بالتطبيق
 * بنفس الطريقة التي يتأثر بها على أندرويد — النتيجة: مربعات رمادية باهتة
 * فارغة الشكل على الويب، غير متطابقة مع هوية التطبيق البصرية.
 *
 * الحل: مكوّن مبني بالكامل من View/Text/TouchableOpacity/Modal (بدون أي
 * عنصر نظام أصلي) — يضمن شكلاً متطابقاً 100% على أندرويد والويب معاً،
 * وبنفس هوية التطبيق (خلفية surface2، حدود واضحة، تمييز ذهبي عند الفتح).
 * زر الفتح يعرض القيمة المختارة، والاختيار الفعلي عبر Modal منبثق بقائمة
 * قابلة للتمرير — كل عنصر بطاقة كاملة العرض سهلة اللمس.
 *
 * الواجهة (props) مطابقة تماماً للنسخة القديمة (value/onChange/options/
 * placeholder/label) — لا حاجة لتعديل أي من الأحد عشر ملفاً التي تستخدمه.
 */
import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function Select({ label, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => String(o.value) === String(value))
  const displayText = selected ? selected.label : (placeholder || '— اختر —')

  function pick(val) {
    onChange(val)
    setOpen(false)
  }

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[styles.trigger, open && styles.triggerOpen]}
      >
        <Text style={[styles.triggerText, !selected && styles.triggerPlaceholder]} numberOfLines={1}>
          {displayText}
        </Text>
        <Text style={[styles.chevron, open && styles.chevronOpen]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            {label && (
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView style={styles.optionsList} keyboardShouldPersistTaps="handled">
              {placeholder && (
                <OptionRow
                  label={placeholder}
                  muted
                  active={!value}
                  onPress={() => pick('')}
                />
              )}
              {options.map(o => (
                <OptionRow
                  key={String(o.value)}
                  label={o.label}
                  active={String(o.value) === String(value)}
                  onPress={() => pick(o.value)}
                />
              ))}
              {options.length === 0 && (
                <Text style={styles.emptyText}>لا توجد خيارات متاحة</Text>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

function OptionRow({ label, active, muted, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[styles.option, active && styles.optionActive]}>
      <Text style={[styles.optionText, muted && styles.optionTextMuted, active && styles.optionTextActive]} numberOfLines={2}>
        {label}
      </Text>
      {active && <Text style={styles.checkmark}>✓</Text>}
    </TouchableOpacity>
  )
}

/** حقل معطّل يعرض نصاً ثابتاً بدل قائمة اختيار — لحالات "مفروض تلقائياً" */
export function DisabledField({ label, text }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.disabledBox}>
        <Text style={styles.disabledText}>{text}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },

  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11,
  },
  triggerOpen: { borderColor: colors.accent },
  triggerText: { color: colors.white, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  triggerPlaceholder: { color: colors.muted, fontWeight: '400' },
  chevron: { color: colors.muted, fontSize: 12, marginRight: 8 },
  chevronOpen: { color: colors.accent },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
    maxHeight: '70%', paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: colors.muted, fontSize: 16 },

  optionsList: { paddingHorizontal: 10, paddingTop: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: radius.md, marginBottom: 4,
  },
  optionActive: { backgroundColor: 'rgba(245,158,11,0.15)' },
  optionText: { color: colors.white, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },
  optionTextMuted: { color: colors.muted, fontWeight: '400' },
  optionTextActive: { color: colors.accent, fontWeight: '800' },
  checkmark: { color: colors.accent, fontSize: 15, fontWeight: '900', marginLeft: 10 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  disabledBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  disabledText: { color: colors.muted, fontSize: 13 },
})

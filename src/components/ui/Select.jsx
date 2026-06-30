/**
 * Select.jsx — قائمة منسدلة موحَّدة (يكافئ <select> في نسخة الويب)
 * يستخدم @react-native-picker/picker الذي تم تثبيته من بداية المشروع.
 *
 * Props:
 *   label    — عنوان فوق الحقل
 *   value    — القيمة المختارة
 *   onChange — دالة تُستدعى بالقيمة الجديدة
 *   options  — [{ value, label }]
 *   disabled — تعطيل الاختيار (لعرض نص ثابت بدلاً منه، استخدم DisabledField)
 */
import { View, Text, StyleSheet } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { colors, radius } from '../../theme'

export default function Select({ label, value, onChange, options, placeholder }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={value}
          onValueChange={onChange}
          style={styles.picker}
          dropdownIconColor={colors.muted}
        >
          {placeholder && <Picker.Item label={placeholder} value="" color={colors.muted} />}
          {options.map(o => (
            <Picker.Item key={String(o.value)} label={o.label} value={o.value} color={colors.white} />
          ))}
        </Picker>
      </View>
    </View>
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
  pickerBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, overflow: 'hidden',
  },
  picker: { color: colors.white },
  disabledBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12,
  },
  disabledText: { color: colors.muted, fontSize: 13 },
})

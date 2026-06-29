/**
 * Input.jsx — منقول من camp-registry-react/src/components/ui/Input.jsx
 * نفس الشكل (label فوق، حقل بحدود، رسالة خطأ تحت) — TextInput بدل <input>
 */
import { View, Text, TextInput, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function Input({ label, error, icon, style, ...props }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.fieldWrap}>
        {icon && <View style={styles.iconWrap}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            { borderColor: error ? colors.red : colors.border },
            icon && styles.inputWithIcon,
            style,
          ]}
          placeholderTextColor={colors.muted}
          {...props}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted },
  fieldWrap: { position: 'relative' },
  iconWrap: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center', zIndex: 1,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.white,
    textAlign: 'right',
  },
  inputWithIcon: { paddingRight: 36 },
  error: { color: colors.red, fontSize: 12 },
})

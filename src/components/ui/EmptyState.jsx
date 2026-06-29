/**
 * EmptyState.jsx — منقول من camp-registry-react/src/components/ui/EmptyState.jsx
 * نفس الشكل: أيقونة كبيرة + عنوان + عنوان فرعي + إجراء اختياري
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon || '📭'}</Text>
      <Text style={styles.title}>{title || 'لا توجد بيانات'}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && onAction && (
        <TouchableOpacity onPress={onAction} style={styles.btn}>
          <Text style={styles.btnText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { color: colors.white, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  btn: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: radius.md },
  btnText: { color: colors.bg, fontSize: 14, fontWeight: '700' },
})

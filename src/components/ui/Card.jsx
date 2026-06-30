/**
 * Card.jsx — منقول من camp-registry-react/src/components/ui/Card.jsx
 * بطاقة موحَّدة (خلفية + حدود + زوايا دائرية) بعنوان وأيقونة اختياريين.
 */
import { View, Text, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export default function Card({ title, icon, children, action, style }) {
  return (
    <View style={[styles.card, style]}>
      {title && (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {icon && <Text style={styles.icon}>{icon}</Text>}
            <Text style={styles.title}>{title}</Text>
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 16, marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 14 },
  title: { color: colors.accent, fontWeight: '700', fontSize: 13 },
})

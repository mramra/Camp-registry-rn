/**
 * MovementCard.jsx — بطاقة حركة أسرة واحدة (دخول/خروج/نقل)
 * مستخلص من camp-registry-react/src/pages/Movements/Movements.jsx
 */
import { View, Text, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export const TYPE_MAP = {
  entry:    { label: '🟢 دخول', color: colors.green },
  exit:     { label: '🔴 خروج', color: colors.red },
  transfer: { label: '🔵 نقل',  color: colors.blue },
}

export default function MovementCard({ movement: m, campMap }) {
  const t = TYPE_MAP[m.type] || { label: m.type, color: colors.muted }

  return (
    <View style={[styles.card, { borderRightColor: t.color }]}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name}>{m.families?.head_name || m.family_name || '—'}</Text>
          {!!m.families?.head_id && <Text style={styles.id}>{m.families.head_id}</Text>}

          <View style={styles.metaRow}>
            {!!m.from_camp && <Text style={styles.meta}>📤 {campMap[m.from_camp] || '—'}</Text>}
            {!!m.to_camp   && <Text style={styles.meta}>📥 {campMap[m.to_camp] || '—'}</Text>}
            {!!m.reason    && <Text style={styles.meta}>· {m.reason}</Text>}
          </View>

          {!!m.notes && <Text style={styles.notes}>{m.notes}</Text>}
        </View>

        <View style={styles.right}>
          <View style={[styles.badge, { backgroundColor: t.color + '22' }]}>
            <Text style={[styles.badgeText, { color: t.color }]}>{t.label}</Text>
          </View>
          <Text style={styles.date}>{m.date}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRightWidth: 4, borderRadius: radius.md, padding: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  info: { flex: 1 },
  name: { color: colors.white, fontWeight: '700', fontSize: 13 },
  id: { color: colors.muted, fontSize: 10, textAlign: 'left' },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  meta: { color: colors.muted, fontSize: 10 },
  notes: { color: colors.muted, fontSize: 10, marginTop: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 10 },
})

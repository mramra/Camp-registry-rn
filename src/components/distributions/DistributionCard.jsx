/**
 * DistributionCard.jsx — بطاقة جولة توزيع واحدة (v2 — بدون مفهوم الكمية/الدفعة)
 * تم حذف quantity/remaining بعد إلغاء مفهوم "الدفعة" (1 يوليو 2026) —
 * الجولة الآن كيان واحد بلا كمية محددة مسبقاً، فقط عدد من استلم فعلياً.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, radius } from '../../theme'

export const TYPE_NAMES = {
  food: '🍞 غذاء', shelter: '🏠 إيواء',
  hygiene: '🧴 نظافة', financial: '💰 مالية', general: '📦 عام',
}

export default function DistributionCard({ dist, campMap, receivedCount, onOpen, onEdit, onDelete, canWrite }) {
  const date = dist.created_at ? new Date(dist.created_at).toLocaleDateString('ar-EG') : ''

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{dist.name}</Text>
          <Text style={styles.meta}>
            {TYPE_NAMES[dist.type] || dist.type} · {dist.camp_id ? (campMap[dist.camp_id] || '—') : 'كل المخيمات'} · 📅 {date}
          </Text>
          <Text style={styles.receivedLine}>
            👥 استلم: <Text style={styles.receivedCount}>{receivedCount ?? '...'}</Text> أسرة
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onOpen(dist.id)} style={styles.openBtn}>
          <Text style={styles.openBtnText}>📋 فتح الجولة</Text>
        </TouchableOpacity>
        {canWrite && (
          <>
            <TouchableOpacity onPress={() => onEdit(dist)} style={styles.editBtn}>
              <Text style={styles.editBtnText}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(dist)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 14,
  },
  header: { flexDirection: 'row' },
  name: { color: colors.white, fontWeight: '700', fontSize: 14 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  receivedLine: { color: colors.white, fontSize: 11, marginTop: 4 },
  receivedCount: { color: colors.accent, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  openBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center' },
  openBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
  editBtn: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: colors.blue, borderRadius: radius.sm, paddingHorizontal: 12, justifyContent: 'center' },
  editBtnText: { fontSize: 12 },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: colors.red, borderRadius: radius.sm, paddingHorizontal: 12, justifyContent: 'center' },
  deleteBtnText: { fontSize: 12 },
})

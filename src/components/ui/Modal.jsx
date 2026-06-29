/**
 * Modal.jsx — منقول من camp-registry-react/src/components/ui/Modal.jsx
 * يستخدم Modal الأصلي من react-native (بدل position:fixed + z-index في الويب)
 * نفس الأحجام (sm/md/lg) ونفس شكل الرأس (عنوان + زر إغلاق).
 */
import { Modal as RNModal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native'
import { colors, radius } from '../../theme'

const SCREEN_WIDTH = Dimensions.get('window').width

const MAX_WIDTHS = { sm: 360, md: 420, lg: 480 }

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const maxWidth = Math.min(MAX_WIDTHS[size] || MAX_WIDTHS.md, SCREEN_WIDTH - 32)

  return (
    <RNModal visible={!!open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, { maxWidth, width: maxWidth }]}>
          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, maxHeight: '90%', overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { color: colors.white, fontWeight: '700', fontSize: 15, flex: 1 },
  closeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.muted, fontSize: 18 },
  body: { },
  bodyContent: { padding: 18 },
})

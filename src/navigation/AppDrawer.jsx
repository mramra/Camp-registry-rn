import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';

/**
 * قائمة جانبية بسيطة (RTL — تنزلق من اليمين) لاختيار أي صفحة مباشرة.
 * لا تعتمد على @react-navigation/drawer (يحتاج react-native-gesture-handler +
 * reanimated = مكتبات native جديدة تحتاج APK جديد) — بُنيت بـ Modal الأساسي
 * بـ React Native نفسه، فتعمل فوراً عبر تحديث OTA بدون أي بناء إضافي.
 *
 * الأقسام مطابقة لتجميع القائمة الجانبية بالنسخة الأصلية (camp-registry-react).
 */
export default function AppDrawer({ visible, onClose, navigation }) {
  const { profile, logout, isOwner, isSuperAdmin } = useAuth();

  const go = (screen) => {
    onClose();
    navigation.navigate(screen);
  };

  const SECTIONS = [
    {
      title: '🏠 الرئيسية',
      items: [{ icon: '🏠', label: 'الرئيسية', screen: 'Dashboard' }],
    },
    {
      title: '👨‍👩‍👧 الأسر',
      items: [
        { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر', screen: 'FamiliesList' },
        { icon: '🚶', label: 'حركات الأسر', screen: 'Movements' },
        { icon: '📦', label: 'التوزيعات', screen: 'Distributions' },
      ],
    },
    {
      title: '🏕️ المخيمات والمستخدمون',
      items: [
        { icon: '🏕️', label: 'المخيمات', screen: 'CampsList' },
        { icon: '👥', label: 'المستخدمون', screen: 'UsersList' },
        ...(isOwner ? [{ icon: '🔐', label: 'إدارة الصلاحيات', screen: 'PermissionsAdmin' }] : []),
      ],
    },
    {
      title: '⚕️ السجلات الاجتماعية والصحية',
      items: [{ icon: '📋', label: 'السجلات', screen: 'Registers' }],
    },
    {
      title: '💬 التواصل والحساب',
      items: [{ icon: '💬', label: 'الرسائل', screen: 'SMS' }],
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={styles.appName}>🏕️ نبض المخيم</Text>
            <Text style={styles.userName}>{profile?.full_name || ''}</Text>
            <Text style={styles.roleTag}>
              {isOwner ? '👑 مالك المنصة' : isSuperAdmin ? '🔴 مدير الإيواء' : profile?.role || ''}
            </Text>
          </View>

          <ScrollView style={styles.body}>
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((item) => (
                  <Pressable key={item.screen} style={styles.item} onPress={() => go(item.screen)}>
                    <Text style={styles.itemIcon}>{item.icon}</Text>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={styles.logoutBtn}
            onPress={() => {
              onClose();
              logout();
            }}
          >
            <Text style={styles.logoutText}>🚪 تسجيل الخروج</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row-reverse' },
  drawer: { width: '78%', height: '100%', backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
  appName: { color: colors.white, fontWeight: '900', fontSize: 16, textAlign: 'right' },
  userName: { color: colors.accent, fontWeight: 'bold', fontSize: 13, marginTop: 8, textAlign: 'right' },
  roleTag: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: 'right' },
  body: { flex: 1, padding: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  item: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemIcon: { fontSize: 18 },
  itemLabel: { color: colors.white, fontSize: 14, fontWeight: 'bold' },
  logoutBtn: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  logoutText: { color: colors.red, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
});

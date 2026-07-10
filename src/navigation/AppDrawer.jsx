import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';

/**
 * قائمة جانبية (RTL — تنزلق من اليمين) لاختيار أي صفحة مباشرة، بأقسام
 * قابلة للطي/البسط (نفس سلوك القائمة الجانبية بالنسخة الأصلية للويب).
 *
 * لا تعتمد على @react-navigation/drawer (يحتاج react-native-gesture-handler +
 * reanimated = مكتبات native جديدة تحتاج APK جديد) — بُنيت بـ Modal الأساسي
 * بـ React Native نفسه، فتعمل فوراً عبر تحديث OTA بدون أي بناء إضافي.
 */
export default function AppDrawer({ visible, onClose, navigation }) {
  const { profile, logout, isOwner, isSuperAdmin } = useAuth();

  const SECTIONS = [
    {
      key: 'home',
      title: '🏠 الرئيسية',
      items: [
        { icon: '🏠', label: 'الرئيسية', screen: 'Dashboard' },
        { icon: '🔔', label: 'التنبيهات', screen: 'Alerts' },
      ],
    },
    {
      key: 'families',
      title: '👨‍👩‍👧 الأسر',
      items: [
        { icon: '👨‍👩‍👧‍👦', label: 'قائمة الأسر', screen: 'FamiliesList' },
        { icon: '🚶', label: 'حركات الأسر', screen: 'Movements' },
        { icon: '📦', label: 'التوزيعات', screen: 'Distributions' },
        ...(isOwner ? [{ icon: '🚪', label: 'الأسر الخارجة', screen: 'ExitedFamilies' }] : []),
      ],
    },
    {
      key: 'camps',
      title: '🏕️ المخيمات والمستخدمون',
      items: [
        { icon: '🏕️', label: 'المخيمات', screen: 'CampsList' },
        { icon: '👥', label: 'المستخدمون', screen: 'UsersList' },
        { icon: '📱', label: 'الأجهزة', screen: 'Devices' },
        ...(isOwner ? [{ icon: '🔐', label: 'إدارة الصلاحيات', screen: 'PermissionsAdmin' }] : []),
      ],
    },
    {
      key: 'registers',
      title: '⚕️ السجلات الاجتماعية والصحية',
      items: [
        { icon: '📋', label: 'السجلات', screen: 'Registers' },
        { icon: '🎓', label: 'الحالة الدراسية', screen: 'Education' },
      ],
    },
    {
      key: 'analysis',
      title: '📊 التحليل والتقارير',
      items: [
        { icon: '📈', label: 'التقارير والتحليلات', screen: 'Analysis' },
        { icon: '📋', label: 'تقارير الاحتياجات', screen: 'NeedsReport' },
        { icon: '🏕️', label: 'مقارنة المخيمات', screen: 'CampCompare' },
        { icon: '⚕️', label: 'كشف الحالات الصحية', screen: 'HealthReport' },
        { icon: '💾', label: 'استيراد وتصدير', screen: 'Export' },
      ],
    },
    {
      key: 'comms',
      title: '💬 التواصل والحساب',
      items: [
        { icon: '💬', label: 'الرسائل', screen: 'SMS' },
        { icon: '⚙️', label: 'الإعدادات', screen: 'Settings' },
        { icon: '💎', label: 'الاشتراك والباقات', screen: 'Subscription' },
        { icon: '❓', label: 'المساعدة والدعم', screen: 'Help' },
      ],
    },
    ...(isOwner || profile?.can_review_approvals
      ? [
          {
            key: 'admin',
            title: '⚙️ الإدارة والنظام',
            items: [
              { icon: '📋', label: 'الطلبات المعلّقة', screen: 'PendingRequests' },
              { icon: '📝', label: 'سجل التغييرات', screen: 'Audit' },
              { icon: '🩺', label: 'تشخيص النظام', screen: 'Diagnostics' },
              { icon: '🗄️', label: 'إدارة البيانات', screen: 'Data' },
              ...(isOwner ? [{ icon: '🛡️', label: 'الفحص الأمني', screen: 'SecurityAudit' }] : []),
            ],
          },
        ]
      : []),
  ];

  // القسم اللي فيه الشاشة الحالية يفتح لحاله، والباقي مطوي (نفس السابق) —
  // بس الآن بمنطق أكورديون: قسم واحد بس مفتوح بأي وقت. فتح قسم جديد يطوي
  // القديم تلقائياً.
  const getCurrentScreen = () => {
    const state = navigation?.getState?.();
    return state?.routes?.[state.index]?.name || null;
  };
  const getActiveSectionKey = () => {
    const current = getCurrentScreen();
    if (!current) return null;
    const found = SECTIONS.find((s) => s.items.some((it) => it.screen === current));
    return found?.key || null;
  };

  const [openKey, setOpenKey] = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);

  React.useEffect(() => {
    if (!visible) return;
    setOpenKey(getActiveSectionKey());
    setActiveScreen(getCurrentScreen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggleSection = (key) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  // push (مو navigate) عمداً: navigate يرجع لنسخة قديمة من نفس الشاشة لو
  // موجودة بتاريخ التنقل، وهذا يمسح أي شاشات بينهم بصمت -- فيصير زر الرجوع
  // يقفز فجأة لصفحة بعيدة (غالباً الرئيسية) بدل الشاشة اللي كنت فيها فعلاً.
  // push يضمن كل ضغطة بالقائمة تضيف خطوة جديدة بتاريخ حقيقي ومتسلسل.
  const go = (screen) => {
    onClose();
    navigation.push(screen);
  };

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
            {SECTIONS.map((section) => {
              const isCollapsed = openKey !== section.key;
              return (
                <View key={section.key} style={styles.section}>
                  <Pressable style={styles.sectionHeader} onPress={() => toggleSection(section.key)}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.chevron}>{isCollapsed ? '◀' : '▼'}</Text>
                  </Pressable>

                  {!isCollapsed &&
                    section.items.map((item) => {
                      const isActive = item.screen === activeScreen;
                      return (
                        <Pressable
                          key={item.screen}
                          style={[styles.item, isActive && styles.itemActive]}
                          onPress={() => go(item.screen)}
                        >
                          <Text style={styles.itemIcon}>{item.icon}</Text>
                          <Text style={[styles.itemLabel, isActive && styles.itemLabelActive]}>{item.label}</Text>
                          {isActive && <Text style={styles.activeDot}>●</Text>}
                        </Pressable>
                      );
                    })}
                </View>
              );
            })}
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
  section: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
  chevron: { color: colors.muted, fontSize: 10 },
  item: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemActive: { backgroundColor: 'rgba(245,158,11,0.15)' },
  itemIcon: { fontSize: 18 },
  itemLabel: { flex: 1, color: colors.white, fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  itemLabelActive: { color: colors.accent },
  activeDot: { color: colors.accent, fontSize: 10 },
  logoutBtn: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  logoutText: { color: colors.red, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
});

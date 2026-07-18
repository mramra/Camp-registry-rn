import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useDataScope } from '../lib/useDataScope';
import { fetchPendingRequestsCount, fetchPendingDevicesCount, fetchFamilies, fetchFamilyMembers, fetchCamps } from '../lib/supabase';
import { isIncomplete } from '../lib/helpers';
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
  const { profile, logout, isOwner, isSuperAdmin, orgId, canAccessPageNow } = useAuth();
  const { getAllowedCampIds, filterLocal } = useDataScope();

  // شارات عدد بسيطة على "الطلبات المعلّقة" و"التنبيهات" -- تُحسب فقط
  // عند فتح القائمة (مو بكل تنقّل)، وتُحفظ لحد الفتحة الجاية عشان ما نكرر
  // طلبات شبكة زيادة. الطلبات المعلّقة: عدّاد خفيف مباشر. التنبيهات: بروكسي
  // خفيف (عدد الأسر ببيانات ناقصة فقط -- أشيع نوع تنبيه) بدل حساب كل أنواع
  // التنبيهات الكامل (أثقل بكثير ومطابق لما تحسبه شاشة التنبيهات نفسها).
  const [pendingCount, setPendingCount] = useState(0);
  const [devicesPendingCount, setDevicesPendingCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);

  useEffect(() => {
    if (!visible || !orgId) return;

    if (isOwner || profile?.can_review_approvals) {
      fetchPendingRequestsCount(orgId).then(setPendingCount);
      fetchPendingDevicesCount(orgId).then(setDevicesPendingCount);
    }

    (async () => {
      try {
        const [famsRaw, camps] = await Promise.all([fetchFamilies(orgId), fetchCamps(orgId)]);
        const campIds = getAllowedCampIds(camps);
        const myFams = filterLocal(famsRaw, campIds);
        const members = await fetchFamilyMembers(myFams.map((f) => f.id));
        const mByFam = {};
        members.forEach((m) => {
          if (!mByFam[m.family_id]) mByFam[m.family_id] = [];
          mByFam[m.family_id].push(m);
        });
        setAlertsCount(myFams.filter((f) => isIncomplete(f, mByFam[f.id])).length);
      } catch {
        // فشل حساب الشارة لا يجب أن يعطّل القائمة أبداً
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, orgId]);

  const SECTIONS = [
    {
      key: 'home',
      title: '🏠 الرئيسية',
      items: [
        { icon: '🏠', label: 'الرئيسية', screen: 'Dashboard', pageKey: 'dashboard' },
        { icon: '🔔', label: 'التنبيهات', screen: 'Alerts', count: alertsCount, pageKey: 'alerts' },
      ],
    },
    {
      key: 'families',
      title: '👨‍👩‍👧 الأسر',
      items: [
        { icon: '👨‍👩‍👧‍👦', label: 'كل الأسر', screen: 'FamiliesList', pageKey: 'families' },
        { icon: '🔍', label: 'البحث الذكي', screen: 'SmartSearch', pageKey: 'families' },
        { icon: '💬', label: 'رسائل بوابة الأسرة', screen: 'PortalMessages', pageKey: 'families' },
        { icon: '🚶', label: 'حركات الأسر', screen: 'Movements', pageKey: 'movements' },
        { icon: '📦', label: 'التوزيعات', screen: 'Distributions', pageKey: 'distributions' },
        { icon: '💬', label: 'الرسائل', screen: 'SMS', pageKey: 'sms' },
        { icon: '📝', label: 'آخر التعديلات على الأسر', screen: 'ActivityLog', pageKey: 'activity_log' },
        ...(isOwner ? [{ icon: '🚪', label: 'الأسر الخارجة', screen: 'ExitedFamilies' }] : []),
      ],
    },
    {
      key: 'registers',
      title: '⚕️ السجلات الاجتماعية والصحية',
      items: [
        { icon: '🧒', label: 'سجل الأطفال', screen: 'Children', pageKey: 'children' },
        { icon: '👩', label: 'سجل النساء', screen: 'Women', pageKey: 'women' },
        { icon: '👨', label: 'سجل الرجال', screen: 'Men', pageKey: 'men' },
        { icon: '🩺', label: 'سجل الحالات الصحية', screen: 'HealthRecords', pageKey: 'health_records' },
        { icon: '🎓', label: 'السجل الدراسي', screen: 'Education', pageKey: 'education_status' },
        { icon: '💾', label: 'استيراد وتصدير', screen: 'Export', pageKey: 'export' },
      ],
    },
    {
      key: 'analysis',
      title: '📊 التحليل والتقارير',
      items: [
        { icon: '📈', label: 'لوحة الإحصائيات', screen: 'Analysis', pageKey: 'analysis' },
        { icon: '🏕️', label: 'مقارنة المخيمات', screen: 'CampCompare', pageKey: 'camp_compare' },
      ],
    },
    {
      key: 'camps',
      title: '🏕️ الإدارة والوصول',
      items: [
        { icon: '🏕️', label: 'المخيمات', screen: 'CampsList', pageKey: 'camps' },
        { icon: '👥', label: 'المستخدمون', screen: 'UsersList', pageKey: 'users' },
        { icon: '📱', label: 'الأجهزة', screen: 'Devices', count: devicesPendingCount, pageKey: 'devices' },
        ...(isOwner ? [{ icon: '🔐', label: 'إدارة الصلاحيات', screen: 'PermissionsAdmin' }] : []),
      ],
    },
    {
      key: 'admin',
      title: '⚙️ الإدارة والنظام',
      items: [
        // عناصر إدارية حسّاسة -- لمالك المنصة أو من عنده صلاحية مراجعة الطلبات فقط
        ...(isOwner || profile?.can_review_approvals
          ? [
              { icon: '📋', label: 'الطلبات المعلّقة', screen: 'PendingRequests', count: pendingCount, pageKey: 'pending_requests' },
              { icon: '🗄️', label: 'إدارة البيانات والتشخيص', screen: 'Data', pageKey: 'data' },
              { icon: '📋', label: 'سجل التدقيق الشامل', screen: 'AuditLog', pageKey: 'data' },
            ]
          : []),
        // عناصر حساب عامة -- متاحة لكل مستخدم بغض النظر عن دوره (كانت
        // بقسم منفصل 'التواصل والحساب'، أُلغي ودُمجت هنا)
        { icon: '⚙️', label: 'الإعدادات', screen: 'Settings', pageKey: 'settings' },
        { icon: '💎', label: 'الاشتراك والباقات', screen: 'Subscription', pageKey: 'subscription' },
        { icon: '❓', label: 'المساعدة والدعم', screen: 'Help', pageKey: 'help' },
      ],
    },
  ]
    // فلترة كل عنصر حسب صلاحيات الصفحات الفعلية (canAccessPageNow) --
    // عناصر بدون pageKey (محصورة أصلاً بشرط isOwner بالتعريف فوق) تبقى
    // زي ما هي. القسم اللي تفضى بالكامل بعد الفلترة ما يظهر إطلاقاً.
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.pageKey || canAccessPageNow(item.pageKey)),
    }))
    .filter((section) => section.items.length > 0);

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

  // كل تنقل من القائمة الجانبية = "وجهة رئيسية جديدة"، فنعيد ضبط الـ stack
  // بالكامل لـ [الرئيسية, الشاشة المطلوبة] بدل تكديسها فوق كل الشاشات
  // السابقة. هذا يحل مشكلة: فتح عدة شاشات من القائمة بالتتابع يخلي زر
  // الرجوع يحتاج ضغطات كثيرة عشان يوصل للرئيسية بدل ضغطة وحدة متوقَّعة.
  // التنقل الداخلي بكل شاشة (تفاصيل/تعديل عبر push) يبقى فوق هذا الأساس
  // الجديد بشكل طبيعي، فما يتأثر إطلاقاً.
  const go = (screen) => {
    onClose();
    navigation.reset({
      index: screen === 'Dashboard' ? 0 : 1,
      routes: screen === 'Dashboard' ? [{ name: 'Dashboard' }] : [{ name: 'Dashboard' }, { name: screen }],
    });
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
                          {!!item.count && (
                            <View style={styles.countBadge}>
                              <Text style={styles.countBadgeText}>{item.count > 99 ? '99+' : item.count}</Text>
                            </View>
                          )}
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
  sectionTitle: { color: colors.accent, fontSize: 15, fontWeight: '900', textAlign: 'right' },
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
  countBadge: { backgroundColor: colors.red, borderRadius: 999, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  logoutBtn: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  logoutText: { color: colors.red, fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
});

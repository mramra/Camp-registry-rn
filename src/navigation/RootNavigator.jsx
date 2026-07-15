import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, View, Pressable, Text } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { fetchPendingRequestsCount, fetchPendingDevicesCount } from '../lib/supabase';
import { notifyNow } from '../lib/notifications';
import LoginScreen from '../screens/login/LoginScreen';
import FamilyPortalScreen from '../screens/familyportal/FamilyPortalScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import FamiliesListScreen from '../screens/families/FamiliesListScreen';
import FamilyDetailScreen from '../screens/families/FamilyDetailScreen';
import FamilyFormScreen from '../screens/families/FamilyFormScreen';
import ExitedFamiliesScreen from '../screens/exited/ExitedFamiliesScreen';
import CampsListScreen from '../screens/camps/CampsListScreen';
import CampFormScreen from '../screens/camps/CampFormScreen';
import UsersListScreen from '../screens/users/UsersListScreen';
import UserFormScreen from '../screens/users/UserFormScreen';
import MovementsScreen from '../screens/movements/MovementsScreen';
import DistributionsScreen from '../screens/distributions/DistributionsScreen';
import DistributionReceiveScreen from '../screens/distributions/DistributionReceiveScreen';
import PermissionsAdminScreen from '../screens/permissions/PermissionsAdminScreen';
import ChildrenScreen from '../screens/children/ChildrenScreen';
import WomenScreen from '../screens/women/WomenScreen';
import HealthRecordsScreen from '../screens/health/HealthRecordsScreen';
import MenScreen from '../screens/men/MenScreen';
import ActivityLogScreen from '../screens/activity/ActivityLogScreen';
import SMSScreen from '../screens/sms/SMSScreen';
import PendingRequestsScreen from '../screens/pending/PendingRequestsScreen';
import AlertsScreen from '../screens/alerts/AlertsScreen';
import AuditScreen from '../screens/audit/AuditScreen';
import DevicesScreen from '../screens/devices/DevicesScreen';
import AnalysisScreen from '../screens/analysis/AnalysisScreen';
import CampCompareScreen from '../screens/campcompare/CampCompareScreen';
import DiagnosticsScreen from '../screens/diagnostics/DiagnosticsScreen';
import SecurityAuditScreen from '../screens/diagnostics/SecurityAuditScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import HelpScreen from '../screens/help/HelpScreen';
import EducationScreen from '../screens/education/EducationScreen';
import ExportScreen from '../screens/export/ExportScreen';
import DataScreen from '../screens/data/DataScreen';
import AppDrawer from './AppDrawer';
import colors from '../theme/colors';

const Stack = createNativeStackNavigator();

// ثيم التنقل مطابق لألوان الأصل (داكن، حدود، برتقالي)
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    text: colors.white,
    primary: colors.accent,
  },
};

const RootNavigator = () => {
  const { isAuthenticated, loading, isPreviewMode, previewAs, setPreviewAs, realProfile, orgId, isOwner, profile } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [navRef, setNavRef] = useState(null);
  const prevCounts = useRef({ pending: null, devices: null });

  // فحص دوري خفيف (كل 3 دقائق، طالما التطبيق مفتوح) لعدد الطلبات
  // المعلّقة وطلبات الأجهزة الجديدة -- عند أي زيادة عن آخر فحص، إشعار
  // محلي فوري. هذا يعمل طالما JS للتطبيق شغّال (مقدمة أو خلفية قريبة)،
  // وليس بديلاً عن Push Notification حقيقي من سيرفر (يستمر حتى لو
  // أُغلق التطبيق بالكامل) -- ذلك يحتاج بنية تحتية منفصلة على الخادم.
  useEffect(() => {
    if (!isAuthenticated || !orgId || !(isOwner || profile?.can_review_approvals)) return;

    const check = async () => {
      try {
        const [pending, devices] = await Promise.all([
          fetchPendingRequestsCount(orgId),
          fetchPendingDevicesCount(orgId),
        ]);
        const prev = prevCounts.current;
        if (prev.pending !== null && pending > prev.pending) {
          notifyNow('📋 طلب جديد بانتظار المراجعة', `عدد الطلبات المعلّقة الآن: ${pending}`);
        }
        if (prev.devices !== null && devices > prev.devices) {
          notifyNow('📱 جهاز جديد بانتظار الموافقة', `عدد الأجهزة المعلّقة الآن: ${devices}`);
        }
        prevCounts.current = { pending, devices };
      } catch {
        // فشل الفحص الدوري غير حرج -- يُعاد المحاولة تلقائياً بالدورة الجاية
      }
    };

    check();
    const interval = setInterval(check, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, orgId, isOwner, profile?.can_review_approvals]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // زر القائمة (☰) — يُضاف تلقائياً بأعلى كل شاشة مُصادَق عليها
  const menuButton = () => (
    <Pressable onPress={() => setDrawerVisible(true)} hitSlop={12} style={{ paddingHorizontal: 4 }}>
      <Text style={{ color: colors.white, fontSize: 22 }}>☰</Text>
    </Pressable>
  );

  return (
    <NavigationContainer theme={navTheme} ref={setNavRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '900' },
          contentStyle: { backgroundColor: colors.bg },
          ...(isAuthenticated ? { headerRight: menuButton } : {}),
        }}
      >
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FamilyPortal" component={FamilyPortalScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: '🏕️ نبض المخيم' }}
            />
            {/* الأسر — منقولة بالكامل */}
            <Stack.Screen name="FamiliesList" component={FamiliesListScreen} options={{ title: 'كل الأسر' }} />
            <Stack.Screen name="ExitedFamilies" component={ExitedFamiliesScreen} options={{ title: 'الأسر الخارجة' }} />
            <Stack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: 'تفاصيل الأسرة' }} />
            <Stack.Screen name="FamilyForm" component={FamilyFormScreen} options={{ title: 'بيانات الأسرة' }} />

            {/* المخيمات — منقولة بالكامل */}
            <Stack.Screen name="CampsList" component={CampsListScreen} options={{ title: 'المخيمات' }} />
            <Stack.Screen name="CampForm" component={CampFormScreen} options={{ title: 'بيانات المخيم' }} />

            {/* المستخدمون — منقولة بالكامل */}
            <Stack.Screen name="UsersList" component={UsersListScreen} options={{ title: 'المستخدمون' }} />
            <Stack.Screen name="UserForm" component={UserFormScreen} options={{ title: 'بيانات المستخدم' }} />

            {/* حركات الأسر — منقولة بالكامل */}
            <Stack.Screen name="Movements" component={MovementsScreen} options={{ title: 'حركات الأسر' }} />

            {/* التوزيعات — منقولة بالكامل */}
            <Stack.Screen name="Distributions" component={DistributionsScreen} options={{ title: 'التوزيعات' }} />
            <Stack.Screen name="DistributionReceive" component={DistributionReceiveScreen} options={{ title: 'تسجيل الاستلام' }} />

            {/* إدارة الصلاحيات — منقولة بالكامل */}
            <Stack.Screen name="PermissionsAdmin" component={PermissionsAdminScreen} options={{ title: 'إدارة الصلاحيات' }} />

            {/* السجلات — الرجال والتعديلات بس (أطفال/نساء/صحة اعتمدنا شاشات التحليل بدلها) */}
            <Stack.Screen name="Children" component={ChildrenScreen} options={{ title: 'سجل الأطفال' }} />
            <Stack.Screen name="Women" component={WomenScreen} options={{ title: 'سجل النساء' }} />
            <Stack.Screen name="HealthRecords" component={HealthRecordsScreen} options={{ title: 'سجل الحالات الصحية' }} />
            <Stack.Screen name="Men" component={MenScreen} options={{ title: 'سجل الرجال' }} />
            <Stack.Screen name="ActivityLog" component={ActivityLogScreen} options={{ title: 'آخر التعديلات على الأسر' }} />

            {/* الرسائل — منقولة بالكامل */}
            <Stack.Screen name="SMS" component={SMSScreen} options={{ title: 'الرسائل' }} />

            {/* الطلبات المعلّقة — منقولة بالكامل */}
            <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} options={{ title: 'الطلبات المعلّقة' }} />
            <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'التنبيهات' }} />
            <Stack.Screen name="Audit" component={AuditScreen} options={{ title: 'سجل التغييرات' }} />
            <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: 'إدارة الأجهزة' }} />
            <Stack.Screen name="Analysis" component={AnalysisScreen} options={{ title: 'لوحة الإحصائيات' }} />
            <Stack.Screen name="CampCompare" component={CampCompareScreen} options={{ title: 'مقارنة المخيمات' }} />
            <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} options={{ title: 'تشخيص النظام' }} />
            <Stack.Screen name="SecurityAudit" component={SecurityAuditScreen} options={{ title: 'الفحص الأمني' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'الإعدادات' }} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: 'الاشتراك والباقات' }} />
            <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'المساعدة والدعم' }} />
            <Stack.Screen name="Education" component={EducationScreen} options={{ title: 'السجل الدراسي' }} />
            <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'استيراد وتصدير' }} />
            <Stack.Screen name="Data" component={DataScreen} options={{ title: 'إدارة البيانات' }} />
          </>
        )}
      </Stack.Navigator>

      {isAuthenticated && navRef && (
        <AppDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} navigation={navRef} />
      )}

      {isPreviewMode && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#7c2d12', flexDirection: 'row-reverse',
          alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10, paddingBottom: 18,
          borderTopWidth: 2, borderTopColor: colors.accent,
        }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', flex: 1, textAlign: 'right' }}>
            👁️ تعاين الآن كـ: {previewAs?.full_name} — أنت فعلياً {realProfile?.full_name}
          </Text>
          <Pressable
            onPress={() => { setPreviewAs(null); navRef?.reset({ index: 0, routes: [{ name: 'Dashboard' }] }); }}
            style={{ backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 10 }}
          >
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>إنهاء المعاينة</Text>
          </Pressable>
        </View>
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;

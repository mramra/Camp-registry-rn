import React, { useState } from 'react';
import { ActivityIndicator, View, Pressable, Text } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FamiliesListScreen from '../screens/families/FamiliesListScreen';
import FamilyDetailScreen from '../screens/families/FamilyDetailScreen';
import FamilyFormScreen from '../screens/families/FamilyFormScreen';
import CampsListScreen from '../screens/camps/CampsListScreen';
import CampFormScreen from '../screens/camps/CampFormScreen';
import UsersListScreen from '../screens/users/UsersListScreen';
import UserFormScreen from '../screens/users/UserFormScreen';
import MovementsScreen from '../screens/movements/MovementsScreen';
import DistributionsScreen from '../screens/distributions/DistributionsScreen';
import DistributionBatchesScreen from '../screens/distributions/DistributionBatchesScreen';
import DistributionReceiveScreen from '../screens/distributions/DistributionReceiveScreen';
import PermissionsAdminScreen from '../screens/permissions/PermissionsAdminScreen';
import RegistersScreen from '../screens/registers/RegistersScreen';
import SMSScreen from '../screens/sms/SMSScreen';
import PendingRequestsScreen from '../screens/pending/PendingRequestsScreen';
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
  const { isAuthenticated, loading } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [navRef, setNavRef] = useState(null);

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
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: '🏕️ نبض المخيم' }}
            />
            {/* الأسر — منقولة بالكامل */}
            <Stack.Screen name="FamiliesList" component={FamiliesListScreen} options={{ title: 'قائمة الأسر' }} />
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
            <Stack.Screen name="DistributionBatches" component={DistributionBatchesScreen} options={{ title: 'الدفعات' }} />
            <Stack.Screen name="DistributionReceive" component={DistributionReceiveScreen} options={{ title: 'تسجيل الاستلام' }} />

            {/* إدارة الصلاحيات — منقولة بالكامل */}
            <Stack.Screen name="PermissionsAdmin" component={PermissionsAdminScreen} options={{ title: 'إدارة الصلاحيات' }} />

            {/* السجلات — منقولة (أطفال/نساء/صحة) */}
            <Stack.Screen name="Registers" component={RegistersScreen} options={{ title: 'السجلات' }} />

            {/* الرسائل — منقولة بالكامل */}
            <Stack.Screen name="SMS" component={SMSScreen} options={{ title: 'الرسائل' }} />

            {/* الطلبات المعلّقة — منقولة بالكامل */}
            <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} options={{ title: 'الطلبات المعلّقة' }} />
          </>
        )}
      </Stack.Navigator>

      {isAuthenticated && navRef && (
        <AppDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} navigation={navRef} />
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;

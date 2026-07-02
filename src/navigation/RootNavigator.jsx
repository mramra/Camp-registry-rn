/**
 * RootNavigator.jsx — يحدد الشاشة حسب حالة المصادقة (Login أو التطبيق الرئيسي).
 *
 * بنية التنقل (بعد إضافة Drawer Navigation، 2 يوليو 2026):
 *   Stack جذر
 *     └─ AppDrawer (كل الشاشات الرئيسية: Dashboard, Families, Camps...)
 *     └─ FamilyForm (شاشة فرعية تُفتح من داخل Families، تظهر فوق الـ Drawer
 *                    بدون أن تكون جزءاً من عناصر القائمة الجانبية نفسها)
 *
 * السبب: FamilyForm ليست "صفحة تنقل رئيسية" (مثل Camps أو Users) بل
 * إجراء ينبثق من داخل شاشة الأسر (إضافة/تعديل) ثم يعود إليها — وضعها
 * داخل الـ Drawer نفسه كان سيجعلها تظهر كعنصر قائمة مستقل بلا داعٍ.
 */
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import FamilyFormScreen from '../screens/FamilyFormScreen'
import AppDrawer from './AppDrawer'
import { colors } from '../theme'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>جارٍ التحميل...</Text>
      </View>
    )
  }

  const isAuthenticated = !!(user && profile)

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={AppDrawer} />
            <Stack.Screen name="FamilyForm" component={FamilyFormScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontSize: 13 },
})

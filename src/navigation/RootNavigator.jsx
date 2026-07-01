/**
 * RootNavigator.jsx — يحدد الشاشة حسب حالة المصادقة (Login أو Dashboard).
 * يكافئ منطق App.jsx الأصلي في React (PrivateRoute / حماية المسارات عبر react-router)،
 * لكن بمنطق Native Stack بدل URLs.
 */
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import FamiliesScreen from '../screens/FamiliesScreen'
import CampsScreen from '../screens/CampsScreen'
import MovementsScreen from '../screens/MovementsScreen'
import SMSScreen from '../screens/SMSScreen'
import DistributionsScreen from '../screens/DistributionsScreen'
import FamilyFormScreen from '../screens/FamilyFormScreen'
import UsersScreen from '../screens/UsersScreen'
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
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Families" component={FamiliesScreen} />
            <Stack.Screen name="Camps" component={CampsScreen} />
            <Stack.Screen name="Movements" component={MovementsScreen} />
            <Stack.Screen name="SMS" component={SMSScreen} />
            <Stack.Screen name="Distributions" component={DistributionsScreen} />
            <Stack.Screen name="FamilyForm" component={FamilyFormScreen} />
            <Stack.Screen name="Users" component={UsersScreen} />
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

/**
 * App.js — نقطة الدخول الرئيسية
 * يكافئ App.jsx الأصلي في النسخة React (ترتيب الـ Providers):
 *   AuthProvider → PowerSyncProvider (كاشف اتصال) → AppProvider (toast + تنبيهات) → Navigator
 */
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { PowerSyncProvider } from './src/context/PowerSyncContext'
import { AppProvider } from './src/context/AppContext'
import RootNavigator from './src/navigation/RootNavigator'

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PowerSyncProvider>
          <AppProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </AppProvider>
        </PowerSyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

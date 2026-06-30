/**
 * App.js — نقطة الدخول الرئيسية
 * يكافئ App.jsx الأصلي في النسخة React (ترتيب الـ Providers):
 *   AuthProvider → PowerSyncProvider (كاشف اتصال) → AppProvider (toast + تنبيهات) → Navigator
 *
 * فحص التحديثات (EAS Update): الفحص التلقائي الافتراضي لـ expo-updates
 * (checkAutomatically: "ON_LOAD") قد لا يعمل بثبات كافٍ على كل الأجهزة/
 * الحالات. هنا فحص صريح عند بدء التطبيق: لو فيه تحديث جديد على نفس
 * القناة (channel) المضمَّنة في هذا البناء، يُنزَّل ويُعاد تحميل التطبيق
 * تلقائياً ليعرض أحدث نسخة من الكود فوراً دون أي تدخل من المستخدم.
 */
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import * as Updates from 'expo-updates'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { PowerSyncProvider } from './src/context/PowerSyncContext'
import { AppProvider } from './src/context/AppContext'
import RootNavigator from './src/navigation/RootNavigator'

export default function App() {
  useEffect(() => { checkForAppUpdate() }, [])

  async function checkForAppUpdate() {
    // __DEV__ (تشغيل تطويري عبر Expo Go/dev server) لا يدعم expo-updates أصلاً
    if (__DEV__) return
    try {
      const result = await Updates.checkForUpdateAsync()
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync()
        await Updates.reloadAsync()
      }
    } catch (e) {
      // فشل الفحص (مثل عدم وجود اتصال) ليس خطأً حرجاً — التطبيق يستمر
      // بالنسخة المحلية الحالية دون انقطاع
      console.warn('[updates] فشل فحص التحديثات:', e.message)
    }
  }

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

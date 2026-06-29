/**
 * PowerSyncContext — الآن "ConnectionContext" فعلياً
 * منقول من camp-registry-react/src/context/PowerSyncContext.jsx
 * يتتبّع فقط حالة الاتصال بالإنترنت. لا SQLite، لا PowerSync.
 *
 * الاسم بقي كما هو فقط لأن صفحات كثيرة (المنقولة من المشروع الأصلي) تستورد
 * useSyncStatus من هنا — تغييره يتطلب تعديل كل تلك الصفحات بلا فائدة عملية.
 *
 * تكييف React Native: window.addEventListener('online'/'offline') غير موجود
 * في RN → استُبدل بـ NetInfo.addEventListener (نفس الدلالة المنطقية تماماً).
 */
import { createContext, useContext, useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

const PowerSyncContext = createContext({ psReady: true, isOnline: true })

export function PowerSyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false && state.isInternetReachable !== false
      setIsOnline(connected)
    })
    return unsubscribe
  }, [])

  return (
    <PowerSyncContext.Provider value={{ psReady: isOnline, isOnline, psStatus: isOnline ? 'online' : 'offline' }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() { return useContext(PowerSyncContext) }

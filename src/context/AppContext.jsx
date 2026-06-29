/**
 * AppContext.jsx — حالة عامة (toast، حالة الاتصال، تنبيه الطلبات المعلّقة)
 * منقول حرفياً من camp-registry-react/src/context/AppContext.jsx
 *
 * تكييف React Native:
 *   - navigator.onLine + window.addEventListener('online'/'offline') → NetInfo
 *   - باقي المنطق (فحص الطلبات المعلّقة كل 45 ثانية وتنبيه toast) مطابق تماماً للأصل
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useSyncStatus } from './PowerSyncContext'
import { ORG_ID, supabase, canUserReviewRequest, fetchPendingRequests, isOnlineNow } from '../lib/db'
import { useAuth } from './AuthContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(true)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()
  const { profile, isOwner } = useAuth()
  const lastKnownPending = useRef(null) // null = لم يُفحص بعد (لا تُنبِّه عند أول تحميل)

  // مراقبة الإنترنت — Supabase مباشر لا يحتاج معالجة قائمة انتظار
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false && state.isInternetReachable !== false
      setOnline(connected)
    })
    return unsubscribe
  }, [])

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // تنبيه فوري داخل التطبيق — لا حاجة لـ Push، يعمل طالما التطبيق مفتوح.
  // فحص خفيف كل 45 ثانية لمن يحق له مراجعة شيء (طلبات أسر/حركات + أجهزة)؛ يُطلق
  // toast فقط عند ازدياد العدد عن آخر فحص (لا يُكرَّر التنبيه لنفس الطلبات القديمة).
  useEffect(() => {
    if (!profile || !(isOwner || profile.can_review_approvals)) return
    let cancelled = false

    async function checkPending() {
      if (!isOnlineNow()) return
      try {
        const [reqRows, devRows, members] = await Promise.all([
          fetchPendingRequests(),
          supabase.from('devices').select('user_id').eq('org_id', ORG_ID).eq('is_approved', false).eq('is_blocked', false),
          isOwner ? Promise.resolve([]) : supabase.from('org_members').select('*').eq('org_id', ORG_ID).then(r => r.data || []),
        ])
        const byUserId = Object.fromEntries(members.map(m => [m.user_id, m]))
        const visibleReq = isOwner ? reqRows : reqRows.filter(r => canUserReviewRequest(profile, byUserId[r.changed_by]))
        const visibleDev = isOwner ? (devRows.data || []) : (devRows.data || []).filter(d => canUserReviewRequest(profile, byUserId[d.user_id]))
        const total = visibleReq.length + visibleDev.length

        if (!cancelled) {
          if (lastKnownPending.current !== null && total > lastKnownPending.current) {
            showToast(`📋 ${total - lastKnownPending.current} طلب جديد بانتظار موافقتك`)
          }
          lastKnownPending.current = total
        }
      } catch (e) { console.warn('[pending-poll]', e.message) }
    }

    checkPending()
    const interval = setInterval(checkPending, 45000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [profile, isOwner, showToast])

  return (
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSynced, psStatus }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}

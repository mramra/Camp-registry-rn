import React, { createContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchAllPagePermissions, checkDeviceApproval } from '../lib/supabase';
import { registerPushToken } from '../lib/notifications';
import { hasPermission, canAccessPageSync } from '../lib/permissions';
import { cacheData, getCachedData, withTimeout } from '../lib/offlineCache';

export const AuthContext = createContext({});

// من المسؤول عن الموافقة على جهاز جديد حسب دور صاحبه (رسالة توضيحية فقط)
const NEXT_DEVICE_APPROVER = {
  assistant: 'مندوبك أو مدير الإيواء',
  camp_delegate: 'مدير الإيواء أو مالك المنصة',
  super_admin: 'مالك المنصة',
};

/**
 * قراءة الجلسة المحفوظة مباشرة من AsyncStorage، متجاوزين supabase.auth
 * .getSession() تماماً. سبب الحاجة لهذا: getSession() ليست قراءة محلية
 * بحتة كما يبدو -- لو رمز الوصول (access_token) منتهي الصلاحية (شائع
 * جداً لو التطبيق ما اتفتح لفترة)، تحاول تجدده تلقائياً عبر الشبكة قبل
 * ما ترجع أي نتيجة. لو النت مقطوع، هذي المحاولة "تعلّق" لفترة طويلة، وبعد
 * فشلها ترجع "لا جلسة" -- فيوصل المستخدم لشاشة تسجيل الدخول رغم إن
 * جلسته محفوظة أصلاً على الجهاز. هذي الدالة تقرأ المفتاح الخام مباشرة
 * (بدون أي محاولة تجديد شبكة) كخط دفاع أخير عند فشل/تعليق getSession().
 */
async function getRawStoredSession() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!authKey) return null;
    const raw = await AsyncStorage.getItem(authKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sessionLike = parsed?.user ? parsed : parsed?.currentSession;
    return sessionLike?.user ? sessionLike : null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [previewAs, setPreviewAs] = useState(null);
  const [pagePermRows, setPagePermRows] = useState([]);
  const [pagePermLoaded, setPagePermLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // بدء التشغيل — الآن بنفس مبدأ "اعرض المحفوظ فوراً" المطبَّق بكل الشاشات:
  // لا ننتظر أي طلب شبكة قبل ما نعرض واجهة المستخدم. getSession() نفسها
  // سريعة (قراءة محلية من AsyncStorage، بدون شبكة)، فنعتمد عليها لتحديد
  // isAuthenticated فوراً؛ الملف الشخصي (اللي يحتاج طلب شبكة حقيقي) يُعرض
  // من آخر نسخة محفوظة فوراً لو موجودة، وتحديثه الحي يصير بالخلفية بدون
  // ما يمنع فتح التطبيق ولا يطيل دائرة التحميل.
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setError(null);

        let activeSession = null;
        try {
          const { data, error: sessionError } = await withTimeout(
            supabase.auth.getSession(),
            5000,
            'انتهت مهلة قراءة الجلسة'
          );
          if (sessionError) throw sessionError;
          activeSession = data?.session || null;
        } catch (sessionErr) {
          // getSession() تعلّقت أو فشلت (غالباً محاولة تجديد رمز عبر شبكة
          // مقطوعة) -- نرجع للجلسة الخام المحفوظة مباشرة بدل ما نعتبر
          // المستخدم غير مسجَّل دخول أصلاً.
          activeSession = await getRawStoredSession();
        }

        // احتياط إضافي: حتى لو getSession() رجعت بنجاح لكن بدون جلسة
        // (بعض الحالات النادرة أوفلاين)، جرّب القراءة الخام قبل الاستسلام.
        if (!activeSession) {
          activeSession = await getRawStoredSession();
        }

        if (activeSession?.user) {
          setSession(activeSession);
          setUser(activeSession.user);

          // اعرض الملف الشخصي المحفوظ فوراً (لو موجود) -- بدون انتظار الشبكة
          const cached = await getCachedData('user_profile', activeSession.user.id);
          if (cached?.data) setProfile(cached.data);

          // خلّص شاشة التحميل الآن -- التحديث الحي يصير بالخلفية
          setLoading(false);

          fetchUserProfile(activeSession.user.id);
          return;
        }
      } catch (err) {
        console.error('[initializeAuth]', err.message);
        setError(err.message);
      }
      setLoading(false);
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (currentSession?.user) {
        setSession(currentSession);
        setUser(currentSession.user);
        await fetchUserProfile(currentSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        // مسح الجلسة فقط عند تسجيل خروج صريح -- تجاهل أي حدث تلقائي
        // بجلسة فارغة (غالباً محاولة تحقق/تجديد فشلت بسبب انقطاع نت،
        // مو تسجيل خروج حقيقي) عشان ما نطيح المستخدم لشاشة الدخول بالغلط.
        setSession(null);
        setUser(null);
        setProfile(null);
        setPagePermRows([]);
        setPagePermLoaded(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const fetchUserProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await withTimeout(
        supabase.from('org_members').select('*').eq('user_id', userId).single(),
        8000
      );

      if (error) throw error;
      setProfile(data);
      cacheData('user_profile', userId, data);
      loadPagePermissions(data.org_id);
      return data;
    } catch (err) {
      console.error('[fetchUserProfile]', err.message);
      // فشل جلب الملف الشخصي (غالباً انقطاع نت أو شبكة متعلّقة عند فتح
      // التطبيق) -- بدون هذا الاحتياط، الملف الشخصي يفضل فاضياً للأبد،
      // وكل الشاشات تتوقف عنده (تعتمد على profile.org_id) قبل حتى ما توصل
      // لمنطق التخزين المحلي الخاص فيها. نرجع لآخر ملف شخصي محفوظ عشان
      // يكمل التطبيق فتحه طبيعياً.
      const cached = await getCachedData('user_profile', userId);
      if (cached?.data) {
        setProfile(cached.data);
        loadPagePermissions(cached.data.org_id);
        return cached.data;
      }
      return null;
    }
  }, []);

  // جلب صفوف صلاحيات الصفحات (page_permissions) -- مرة عند تسجيل الدخول،
  // تُستخدم بعدها محلياً (canAccessPageNow) بدون طلب شبكة إضافي بكل شاشة.
  const loadPagePermissions = useCallback(async (orgId) => {
    if (!orgId) return;
    try {
      const rows = await fetchAllPagePermissions(orgId);
      setPagePermRows(rows);
      cacheData('page_permissions', orgId, rows);
    } catch (err) {
      console.error('[loadPagePermissions]', err.message);
      const cached = await getCachedData('page_permissions', orgId);
      if (cached?.data) setPagePermRows(cached.data);
    } finally {
      setPagePermLoaded(true);
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        const profileData = await fetchUserProfile(data.session.user.id);

        // فحص/تسجيل الجهاز -- ميزة كانت موجودة بالأصل وناقصة كلياً بـRN.
        // مالك المنصة معفى دائماً. غيره: جهاز جديد أو غير معتمد أو محظور
        // يوقف الدخول فوراً لحد ما حد يعتمده من شاشة الأجهزة.
        //
        // ⚠️ مهم: هذا الفحص يجب أن يحصل *قبل* setSession/setUser وليس
        // بعدهما -- تفعيل الجلسة مبكراً (isAuthenticated=true) كان يخلي
        // RootNavigator ينقل المستخدم فوراً للتطبيق الرئيسي، وبعدها لو
        // فشل فحص الجهاز كنا نسجّل خروج ونرجع لشاشة الدخول -- لكن هذا
        // "الرجوع" كان يهدم شاشة الدخول القديمة ويبنيها من جديد (remount)
        // فتضيع رسالة الخطأ المعروضة عليها (كانت على نسخة مهجورة من
        // React state)، ويظهر للمستخدم كأنه "رجع لصفحة فاضية بدون أي
        // خطأ" رغم وجود خطأ حقيقي. هذا البق كان موجوداً من الأصل، يظهر
        // فقط أول مرة يسجّل فيها جهاز معيّن دخول (جهاز جديد يحتاج موافقة).
        const deviceCheck = await checkDeviceApproval(data.session.user.id, profileData);
        if (!deviceCheck.ok) {
          await supabase.auth.signOut();
          setProfile(null);
          const approver = NEXT_DEVICE_APPROVER[deviceCheck.role] || 'المسؤول عنك';
          const msg =
            deviceCheck.status === 'blocked'
              ? '🚫 جهازك محظور من الدخول لهذا الحساب.'
              : `⏳ جهازك الجديد بانتظار الموافقة من: ${approver}`;
          setError(msg);
          return { success: false, error: msg, deviceStatus: deviceCheck.status };
        }

        setSession(data.session);
        setUser(data.session.user);

        // تسجيل رمز Push الحقيقي -- بدون انتظار (fire-and-forget) عشان
        // ما يبطّئ إحساس المستخدم بسرعة الدخول؛ فشله غير حرج أصلاً
        registerPushToken(data.session.user.id, profileData?.org_id);

        return { success: true };
      } catch (err) {
        const errorMsg = err.message || 'فشل تسجيل الدخول';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setLoading(false);
      }
    },
    [fetchUserProfile]
  );

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setSession(null);
      setUser(null);
      setProfile(null);
      setPreviewAs(null);
      setPagePermRows([]);
      setPagePermLoaded(false);
      setError(null);

      return { success: true };
    } catch (err) {
      const errorMsg = err.message || 'فشل تسجيل الخروج';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, []);

  // ملف "المعاينة" (لو مفعّل) يحل محل الملف الحقيقي بكل مكان بالتطبيق --
  // كل الصلاحيات (isOwner/isSuperAdmin/canWrite...) وحدود الرؤية بـ
  // useDataScope تُشتق منه تلقائياً بدون أي تغيير إضافي بباقي الشاشات،
  // فمالك المنصة يقدر يشوف التطبيق بالضبط متل ما يشوفه أي مستخدم تاني.
  const effectiveProfile = previewAs || profile;

  const role = effectiveProfile?.role;
  const isOwner = role === 'platform_owner';
  const isSuperAdmin = role === 'super_admin' || isOwner;
  const isCampDelegate = role === 'camp_delegate' || isSuperAdmin;
  const isAssistant = role === 'assistant';

  const canAccessPageNow = useCallback(
    (pageKey) => canAccessPageSync(effectiveProfile, pageKey, pagePermRows),
    [effectiveProfile, pagePermRows]
  );

  const value = {
    user,
    session,
    profile: effectiveProfile,
    realProfile: profile,
    previewAs,
    setPreviewAs,
    isPreviewMode: !!previewAs,
    pagePermLoaded,
    canAccessPageNow,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!session,
    userRole: role,
    orgId: effectiveProfile?.org_id,
    isOwner,
    isSuperAdmin,
    isCampDelegate,
    isAssistant,
    canWrite: hasPermission(effectiveProfile, 'write'),
    canEdit: hasPermission(effectiveProfile, 'edit'),
    canDelete: hasPermission(effectiveProfile, 'delete'),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;

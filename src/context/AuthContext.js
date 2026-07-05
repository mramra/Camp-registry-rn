import React, { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { hasPermission } from '../lib/permissions';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user);
          await fetchUserProfile(data.session.user.id);
        }
      } catch (err) {
        console.error('[initializeAuth]', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        setUser(currentSession.user);
        await fetchUserProfile(currentSession.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const fetchUserProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('[fetchUserProfile]', err.message);
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

        setSession(data.session);
        setUser(data.session.user);
        await fetchUserProfile(data.session.user.id);

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

  const role = profile?.role;
  const isOwner = role === 'platform_owner';
  const isSuperAdmin = role === 'super_admin' || isOwner;
  const isCampDelegate = role === 'camp_delegate' || isSuperAdmin;
  const isAssistant = role === 'assistant';

  const value = {
    user,
    session,
    profile,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!session,
    userRole: role,
    orgId: profile?.org_id,
    isOwner,
    isSuperAdmin,
    isCampDelegate,
    isAssistant,
    canWrite: hasPermission(profile, 'write'),
    canEdit: hasPermission(profile, 'edit'),
    canDelete: hasPermission(profile, 'delete'),
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

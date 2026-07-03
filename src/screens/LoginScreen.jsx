import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import { showError, showSuccess } from '../utils/toast';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

const LoginScreen = () => {
  const { login, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('412617003@c.co');
  const [password, setPassword] = useState('506641234');
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'البريد الإلكتروني مطلوب';
    if (!password.trim()) newErrors.password = 'كلمة المرور مطلوبة';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    const result = await login(email.trim(), password);

    if (!result.success) {
      showError(result.error || 'فشل تسجيل الدخول');
    } else {
      showSuccess('تم تسجيل الدخول بنجاح');
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
    gradientHeader: {
      paddingVertical: spacing['3xl'],
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing['3xl'],
    },
    logo: {
      fontSize: 48,
      marginBottom: spacing.md,
    },
    appName: {
      ...typography.h1,
      color: '#ffffff',
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    tagline: {
      ...typography.body,
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
    },
    formContainer: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing['2xl'],
    },
    formCard: {
      padding: spacing.xl,
    },
    submitButton: {
      marginTop: spacing.lg,
    },
    demoSection: {
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopColor: colors.border,
      borderTopWidth: 1,
    },
    demoTitle: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    demoText: {
      ...typography.bodySmall,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    helperText: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Gradient Header */}
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <Text style={styles.logo}>🏕️</Text>
            <Text style={styles.appName}>نبض المخيم</Text>
            <Text style={styles.tagline}>إدارة أسرية ذكية</Text>
          </LinearGradient>

          {/* Form Card */}
          <View style={styles.formContainer}>
            <Card>
              {/* Email Input */}
              <Input
                label="البريد الإلكتروني"
                placeholder="أدخل بريدك الإلكتروني"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
                error={errors.email}
              />

              {/* Password Input */}
              <Input
                label="كلمة المرور"
                placeholder="أدخل كلمة المرور"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                error={errors.password}
              />

              {/* Submit Button */}
              <Button
                text={loading ? 'جاري الدخول...' : 'دخول'}
                variant="primary"
                fullWidth
                onPress={handleLogin}
                disabled={loading}
                loading={loading}
                style={styles.submitButton}
              />

              {/* Demo Credentials */}
              <View style={styles.demoSection}>
                <Text style={styles.demoTitle}>بيانات الاختبار:</Text>
                <Text style={styles.demoText}>البريد: 412617003@c.co</Text>
                <Text style={styles.demoText}>كلمة المرور: 506641234</Text>
              </View>
            </Card>
          </View>

          {/* Helper Text */}
          <Text style={styles.helperText}>
            هل نسيت كلمة المرور؟ تواصل مع المسؤول
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

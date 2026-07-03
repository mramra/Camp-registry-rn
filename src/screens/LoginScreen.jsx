import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, Button, Card, HelperText } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { showError, showSuccess } from '../utils/toast';
import spacing from '../theme/spacing';

const LoginScreen = () => {
  const { login, loading } = useAuth();
  const { colors } = useTheme();
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  // إصلاح خاص بالويب: كروم يفرض خلفية فاتحة على الحقول المحفوظة (autofill)
  // بغض النظر عن أي theme في React Native Web، لازم override بـ CSS مباشر
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const styleId = 'autofill-fix-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      input:-webkit-autofill:active {
        -webkit-box-shadow: 0 0 0 30px ${colors.surface} inset !important;
        -webkit-text-fill-color: ${colors.text} !important;
        caret-color: ${colors.text} !important;
        transition: background-color 5000s ease-in-out 0s !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, [colors]);

  const validateForm = () => {
    const newErrors = {};
    if (!nationalId.trim()) newErrors.nationalId = 'رقم الهوية مطلوب';
    if (!password.trim()) newErrors.password = 'كلمة المرور مطلوبة';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    const email = `${nationalId.trim()}@c.co`;
    const result = await login(email, password);

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
      color: '#ffffff',
      textAlign: 'center',
      marginBottom: spacing.sm,
      fontWeight: 'bold',
    },
    tagline: {
      color: 'rgba(255, 255, 255, 0.85)',
      textAlign: 'center',
    },
    formContainer: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing['2xl'],
    },
    card: {
      padding: spacing.md,
    },
    input: {
      marginBottom: spacing.xs,
      textAlign: 'right',
    },
    submitButton: {
      marginTop: spacing.lg,
      borderRadius: 8,
    },
    submitButtonContent: {
      paddingVertical: spacing.xs,
    },
    helperText: {
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
      color: colors.textMuted,
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
            <Text variant="headlineMedium" style={styles.appName}>نبض المخيم</Text>
            <Text variant="bodyMedium" style={styles.tagline}>إدارة أسرية ذكية</Text>
          </LinearGradient>

          {/* Form Card */}
          <View style={styles.formContainer}>
            <Card mode="elevated" style={styles.card}>
              <Card.Content>
                {/* National ID Input */}
                <TextInput
                  mode="outlined"
                  label="رقم الهوية"
                  placeholder="أدخل رقم الهوية"
                  value={nationalId}
                  onChangeText={setNationalId}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  disabled={loading}
                  error={!!errors.nationalId}
                  style={[styles.input, { backgroundColor: colors.surface }]}
                  outlineColor={colors.border}
                  activeOutlineColor={colors.primary}
                  textColor={colors.text}
                  placeholderTextColor={colors.textMuted}
                  theme={{ colors: { onSurfaceVariant: colors.textSecondary } }}
                />
                <HelperText type="error" visible={!!errors.nationalId}>
                  {errors.nationalId}
                </HelperText>

                {/* Password Input */}
                <TextInput
                  mode="outlined"
                  label="كلمة المرور"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  disabled={loading}
                  error={!!errors.password}
                  style={[styles.input, { backgroundColor: colors.surface }]}
                  outlineColor={colors.border}
                  activeOutlineColor={colors.primary}
                  textColor={colors.text}
                  placeholderTextColor={colors.textMuted}
                  theme={{ colors: { onSurfaceVariant: colors.textSecondary } }}
                  right={
                    <TextInput.Icon
                      icon={() => (
                        <Text style={{ fontSize: 18 }}>
                          {showPassword ? '🙈' : '👁️'}
                        </Text>
                      )}
                      onPress={() => setShowPassword(!showPassword)}
                      style={{ backgroundColor: colors.surface }}
                    />
                  }
                />
                <HelperText type="error" visible={!!errors.password}>
                  {errors.password}
                </HelperText>

                {/* Submit Button */}
                <Button
                  mode="contained"
                  onPress={handleLogin}
                  disabled={loading}
                  loading={loading}
                  style={styles.submitButton}
                  contentStyle={styles.submitButtonContent}
                >
                  {loading ? 'جاري الدخول...' : 'دخول'}
                </Button>
              </Card.Content>
            </Card>
          </View>

          {/* Helper Text */}
          <Text variant="bodySmall" style={styles.helperText}>
            هل نسيت كلمة المرور؟ تواصل مع المسؤول
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

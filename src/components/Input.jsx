import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

export const Input = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  editable = true,
  error,
  disabled = false,
  style,
  ...props
}) => {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const styles = StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    label: {
      ...typography.label,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: spacing.radius,
      borderWidth: 1,
      borderColor: error ? colors.error : isFocused ? colors.primary : colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      minHeight: spacing.inputHeight,
    },
    input: {
      flex: 1,
      ...typography.body,
      color: colors.text,
      paddingVertical: spacing.sm,
      paddingHorizontal: 0,
    },
    passwordToggle: {
      padding: spacing.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    passwordToggleText: {
      fontSize: 18,
    },
    errorText: {
      ...typography.caption,
      color: colors.error,
      marginTop: spacing.sm,
    },
  });

  const isPassword = secureTextEntry;
  const shouldShowPassword = isPassword && showPassword;

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword && !shouldShowPassword}
          keyboardType={keyboardType}
          editable={editable && !disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {isPassword && (
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.passwordToggleText}>
              {shouldShowPassword ? '👁️' : '🙈'}
            </Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

export default Input;

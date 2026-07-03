import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

export const Button = ({
  variant = 'primary', // primary, secondary, danger, ghost
  size = 'md', // sm, md, lg
  text,
  onPress,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  ...props
}) => {
  const { colors } = useTheme();

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 36,
        };
      case 'lg':
        return {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          minHeight: 52,
        };
      case 'md':
      default:
        return {
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.lg,
          minHeight: spacing.buttonHeight,
        };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case 'danger':
        return {
          backgroundColor: colors.error,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
        };
      case 'primary':
      default:
        return {
          backgroundColor: colors.primary,
        };
    }
  };

  const getTextColor = () => {
    if (variant === 'secondary' || variant === 'ghost') {
      return colors.text;
    }
    return '#ffffff';
  };

  const styles = StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: spacing.radiusMd,
      ...getSizeStyles(),
      ...getVariantStyles(),
      opacity: disabled ? 0.5 : 1,
    },
    text: {
      ...typography.labelLarge,
      color: getTextColor(),
      marginHorizontal: spacing.sm,
    },
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        fullWidth && { flex: 1 },
        pressed && !disabled && { opacity: 0.8 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <Text style={styles.text}>{text}</Text>
      )}
    </Pressable>
  );
};

export default Button;

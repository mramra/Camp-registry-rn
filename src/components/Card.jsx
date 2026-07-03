import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import spacing from '../theme/spacing';

export const Card = ({ children, variant = 'elevated', style, ...props }) => {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    card: {
      borderRadius: spacing.radiusMd,
      padding: spacing.lg,
      backgroundColor: variant === 'filled' ? colors.surface2 : colors.surface,
      borderWidth: variant === 'outlined' ? 1 : 0,
      borderColor: colors.border,
      shadowColor: variant === 'elevated' ? '#000' : 'transparent',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: variant === 'elevated' ? 0.08 : 0,
      shadowRadius: 8,
      elevation: variant === 'elevated' ? 3 : 0,
    },
  });

  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
};

export default Card;

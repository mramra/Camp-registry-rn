/**
 * Button.jsx — منقول من camp-registry-react/src/components/ui/Button.jsx
 * نفس الـ variants و sizes بالضبط، مبنية بـ TouchableOpacity + StyleSheet
 * بدل CSS classes (Tailwind لا يعمل في React Native).
 */
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native'
import { colors, radius } from '../../theme'

const VARIANTS = {
  primary:   { bg: colors.accent, text: colors.bg, border: null },
  secondary: { bg: colors.surface2, text: colors.white, border: colors.border },
  danger:    { bg: 'rgba(239,68,68,0.15)', text: colors.red, border: 'rgba(239,68,68,0.4)' },
  ghost:     { bg: 'transparent', text: colors.muted, border: null },
  outline:   { bg: 'transparent', text: colors.accent, border: colors.accent },
}

const SIZES = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 12 },
  md: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 14 },
  lg: { paddingVertical: 13, paddingHorizontal: 20, fontSize: 16 },
  icon: { width: 40, height: 40, padding: 0 },
}

export default function Button({
  children, variant = 'primary', size = 'md', loading, icon,
  disabled, style, onPress, ...props
}) {
  const v = VARIANTS[variant] || VARIANTS.primary
  const s = SIZES[size] || SIZES.md
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border || 'transparent',
          borderWidth: v.border ? 1 : 0,
          opacity: isDisabled ? 0.5 : 1,
        },
        s,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        icon && <View style={styles.iconWrap}>{icon}</View>
      )}
      {children != null && (
        <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
  },
  text: {
    fontWeight: '700',
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})

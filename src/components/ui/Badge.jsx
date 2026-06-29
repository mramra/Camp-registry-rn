/**
 * Badge.jsx — وسم ملوّن صغير (نقص/تكرار/حالة/دور...)
 * مكوّن عام مستخلص من FamiliesScreen، قابل للاستخدام في كل الشاشات.
 */
import { View, Text, StyleSheet } from 'react-native'

export default function Badge({ color, text, style }) {
  return (
    <View style={[
      styles.badge,
      { backgroundColor: color + '26', borderColor: color + '66' },
      style,
    ]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  text: {
    fontSize: 9,
    fontWeight: '700',
  },
})

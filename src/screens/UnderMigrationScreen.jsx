import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '../theme/colors';

/**
 * شاشة مؤقتة للصفحات التي لم تُنقل بعد من النسخة الويب —
 * بنفس أسلوب التصميم الأصلي، تختفي تدريجياً مع اكتمال النقل.
 */
export default function UnderMigrationScreen() {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Text style={styles.icon}>🚧</Text>
        <Text style={styles.title}>هذه الصفحة قيد النقل</Text>
        <Text style={styles.sub}>جاري تحويلها من النسخة الويب — قريباً</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>← رجوع</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { color: colors.white, fontWeight: '900', fontSize: 18, marginBottom: 8 },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 24 },
  btn: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: '#000', fontWeight: '900' },
});

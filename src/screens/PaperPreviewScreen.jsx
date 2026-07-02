/**
 * PaperPreviewScreen.jsx — شاشة تجريبية مؤقتة لمعاينة React Native Paper
 * ⚠️ هذا ملف تجريبي فقط للمقارنة البصرية — غير مرتبط بأي Navigator،
 * وسيُحذف بعد اتخاذ القرار (إما اعتماد Paper أو حذف هذا الملف).
 *
 * يعرض نفس المكوّنات (زر + بطاقة) بنسختين جنباً إلى جنب:
 *   1. مكوّناتنا الحالية (Button.jsx, Card.jsx من components/ui/)
 *   2. مكوّنات React Native Paper المكافئة، بثيم مخصص بنفس ألوان theme.js
 */
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { PaperProvider, MD3DarkTheme, Button as PaperButton, Card as PaperCard, TextInput as PaperInput } from 'react-native-paper'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { colors, radius } from '../theme'

// ثيم Paper مخصص بنفس ألوان theme.js الحالية (خلفية داكنة + ذهبي)
const paperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.accent,
    onPrimary: colors.bg,
    background: colors.bg,
    surface: colors.surface,
    surfaceVariant: colors.surface2,
    onSurface: colors.white,
    onSurfaceVariant: colors.muted,
    outline: colors.border,
    error: colors.red,
  },
  roundness: 2, // يقارب radius.md بتاعنا
}

export default function PaperPreviewScreen() {
  return (
    <PaperProvider theme={paperTheme}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>1️⃣ النظام الحالي (مكوّناتنا المخصصة)</Text>

        <Card title="بطاقة عادية" icon="📦">
          <Text style={styles.cardText}>هذا نص تجريبي داخل بطاقتنا الحالية.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button variant="primary">زر أساسي</Button>
            <Button variant="secondary">زر ثانوي</Button>
          </View>
        </Card>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>2️⃣ React Native Paper (Material Design 3)</Text>

        <PaperCard style={styles.paperCard}>
          <PaperCard.Title title="بطاقة Paper" subtitle="Material Design 3" />
          <PaperCard.Content>
            <Text style={styles.paperCardText}>هذا نص تجريبي داخل بطاقة Paper.</Text>
            <PaperInput
              label="حقل نصي تجريبي"
              mode="outlined"
              style={{ marginTop: 12, backgroundColor: colors.surface2 }}
            />
          </PaperCard.Content>
          <PaperCard.Actions>
            <PaperButton mode="contained">زر أساسي</PaperButton>
            <PaperButton mode="outlined">زر ثانوي</PaperButton>
          </PaperCard.Actions>
        </PaperCard>

        <Text style={styles.hint}>
          💡 قارن الشكلين — أي واحد أقرب لما تتخيله؟
        </Text>
      </ScrollView>
    </PaperProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  sectionTitle: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  cardText: { color: colors.muted, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  paperCard: { backgroundColor: colors.surface, borderRadius: radius.lg },
  paperCardText: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
})

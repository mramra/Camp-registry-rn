import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import WheelPicker from './WheelPicker';
import colors from '../../theme/colors';

/**
 * حقل اختيار من قائمة (بديل <select> على الويب) — يفتح ورقة سفلية
 * بالخيارات. label اختياري يظهر فوق الحقل بنفس نمط باقي حقول النماذج.
 *
 * wheel: لو true، الورقة السفلية تعرض عجلة اختيار حقيقية بأسلوب آيفون
 * (WheelPicker) بدل قائمة عادية -- طلب مباشر لكل حقول نموذج الأسرة.
 */
export default function SelectField({ label, value, placeholder = 'اختر', options, onSelect, error, large, wheel }) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.field, error && styles.fieldError]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <BottomSheetModal visible={visible} onClose={() => setVisible(false)} title={label || placeholder}>
        {wheel ? (
          <WheelPicker
            options={options}
            value={value}
            onChange={onSelect}
            onCommit={() => setTimeout(() => setVisible(false), 250)}
          />
        ) : (
          options.map((opt) => {
            const optValue = typeof opt === 'string' ? opt : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            return (
              <Pressable
                key={optValue}
                style={[styles.option, large && styles.optionLarge]}
                onPress={() => {
                  onSelect(optValue);
                  setVisible(false);
                }}
              >
                <Text style={[styles.optionText, large && styles.optionTextLarge]}>{optLabel}</Text>
              </Pressable>
            );
          })
        )}
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldError: { borderColor: colors.red },
  value: { color: colors.white, fontSize: 13 },
  placeholder: { color: colors.muted, fontSize: 13 },
  chevron: { color: colors.muted, fontSize: 12 },
  errorText: { color: colors.red, fontSize: 11, marginTop: 4, textAlign: 'right' },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.white, fontSize: 13, textAlign: 'right' },
  // حجم أكبر ومتوسط -- لقوائم اليوم/الشهر/السنة بتاريخ الميلاد تحديداً
  // (طلب مباشر: كانت أسماء الأشهر صغيرة وصعبة القراءة بالقائمة المنسدلة)
  optionLarge: { paddingVertical: 16 },
  optionTextLarge: { fontSize: 17, fontWeight: '600' },
});

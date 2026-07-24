import React, { forwardRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

/** حقل نص موحّد لكل النماذج — تسمية + إدخال + رسالة خطأ اختيارية.
 * forwardRef عشان حقول متتابعة (مثلاً يوم/شهر/سنة) تقدر تنقل التركيز
 * تلقائياً للحقل التالي بعد تعبئة الحقل الحالي. */
const FormInput = forwardRef(({ label, error, style, ...inputProps }, ref) => {
  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        style={[styles.input, error && styles.inputError, style]}
        {...inputProps}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});

export default FormInput;

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, flex: 1 },
  label: { color: colors.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 13,
    textAlign: 'right',
  },
  inputError: { borderColor: colors.red },
  errorText: { color: colors.red, fontSize: 11, marginTop: 4, textAlign: 'right' },
});

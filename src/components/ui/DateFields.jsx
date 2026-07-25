import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import FormInput from './FormInput';

/**
 * حقل تاريخ مركزي موحّد -- 3 خانات أرقام (يوم/شهر/سنة) بلوحة مفاتيح
 * رقمية، تنتقل تلقائياً للخانة التالية بمجرد اكتمال أرقامها. بديل
 * مركزي واحد يُستخدم بكل مكان بالتطبيق يحتاج إدخال تاريخ (تاريخ ميلاد
 * بنموذج الأسرة، تاريخ جولة توزيع، إلخ) بدل تكرار نفس الكود بكل شاشة
 * أو الاعتماد على عجلة اختيار/حقل نصي يتطلب صيغة دقيقة (YYYY-MM-DD).
 *
 * props: day/month/year (أرقام أو null)، onChangeDay/onChangeMonth/onChangeYear
 * (كل وحدة تستدعى برقم أو null).
 */
export default function DateFields({ day, month, year, onChangeDay, onChangeMonth, onChangeYear }) {
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  return (
    <View style={styles.row}>
      <View style={styles.third}>
        <FormInput
          placeholder="يوم"
          value={day ? String(day) : ''}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 2);
            onChangeDay(digits ? Number(digits) : null);
            if (digits.length === 2) monthRef.current?.focus();
          }}
          keyboardType="number-pad"
          maxLength={2}
          style={styles.center}
        />
      </View>
      <View style={styles.third}>
        <FormInput
          ref={monthRef}
          placeholder="شهر"
          value={month ? String(month) : ''}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 2);
            onChangeMonth(digits ? Number(digits) : null);
            if (digits.length === 2) yearRef.current?.focus();
          }}
          keyboardType="number-pad"
          maxLength={2}
          style={styles.center}
        />
      </View>
      <View style={styles.third}>
        <FormInput
          ref={yearRef}
          placeholder="سنة"
          value={year ? String(year) : ''}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 4);
            onChangeYear(digits ? Number(digits) : null);
          }}
          keyboardType="number-pad"
          maxLength={4}
          style={styles.center}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  third: { flex: 1 },
  center: { textAlign: 'center' },
});

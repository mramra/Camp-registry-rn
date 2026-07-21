import React, { useRef, useMemo, useEffect } from 'react';
import { View, Animated, StyleSheet, Pressable } from 'react-native';
import colors from '../../theme/colors';

/**
 * عجلة اختيار حقيقية بأسلوب آيفون (تلف وتستقر بمنتصف نافذة التحديد) --
 * مبنية بالكامل بـReact Native Animated (بدون أي مكتبة خارجية أو كود
 * Native)، فتبقى قابلة للنشر فوراً عبر OTA بلا حاجة لـeas build جديد.
 *
 * الخيار المتمركز بالنافذة (الشريط المميَّز بمنتصف العجلة) أكبر وأوضح،
 * والخيارات المحيطة تصغر وتخفت تدريجياً كلما ابتعدت -- تماماً زي عجلة
 * UIPickerView بالآيفون.
 */
const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const CENTER_OFFSET = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

export default function WheelPicker({ options, value, onChange, onCommit }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const normalized = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
    [options]
  );

  const selectedIndex = Math.max(0, normalized.findIndex((o) => o.value === value));

  // لو تغيّرت القيمة من الخارج (فتح نفس الحقل بقيمة محفوظة سابقاً)، نلف
  // العجلة لمكانها الصحيح فوراً بدون حركة.
  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitIndex = (idx) => {
    const clamped = Math.max(0, Math.min(normalized.length - 1, idx));
    if (normalized[clamped]) {
      onChange(normalized[clamped].value);
      onCommit?.();
    }
  };

  const handleMomentumEnd = (e) => {
    commitIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
  };

  const scrollToIndex = (idx) => {
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    commitIndex(idx);
  };

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.selectionBand} />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: CENTER_OFFSET }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        style={{ height: WHEEL_HEIGHT }}
      >
        {normalized.map((opt, i) => {
          const inputRange = [
            (i - 2) * ITEM_HEIGHT,
            (i - 1) * ITEM_HEIGHT,
            i * ITEM_HEIGHT,
            (i + 1) * ITEM_HEIGHT,
            (i + 2) * ITEM_HEIGHT,
          ];
          const opacity = scrollY.interpolate({ inputRange, outputRange: [0.25, 0.55, 1, 0.55, 0.25], extrapolate: 'clamp' });
          const scale = scrollY.interpolate({ inputRange, outputRange: [0.72, 0.86, 1.18, 0.86, 0.72], extrapolate: 'clamp' });
          return (
            <Pressable key={`${opt.value}-${i}`} onPress={() => scrollToIndex(i)} style={styles.item}>
              <Animated.Text style={[styles.itemText, { opacity, transform: [{ scale }] }]} numberOfLines={1}>
                {opt.label}
              </Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: WHEEL_HEIGHT, position: 'relative' },
  selectionBand: {
    position: 'absolute',
    top: CENTER_OFFSET,
    left: 16,
    right: 16,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    zIndex: 1,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
});

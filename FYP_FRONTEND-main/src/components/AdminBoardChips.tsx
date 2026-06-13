import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { CATALOG_BOARD_OPTIONS, type CatalogBoardOption } from '../constants/catalogBoards';
import { colors, radii } from '../theme/colors';

type Props = {
  value: CatalogBoardOption;
  onChange: (board: CatalogBoardOption) => void;
  options?: readonly CatalogBoardOption[];
};

export default function AdminBoardChips({ value, onChange, options = CATALOG_BOARD_OPTIONS }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Board</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, value === opt && styles.chipOn]}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === opt }}
          >
            <Text style={[styles.chipTxt, value === opt && styles.chipTxtOn]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  scroll: { maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.primaryMuted },
  chipTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.text },
});

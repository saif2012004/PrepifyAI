import React from 'react';
import { View, Text, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { splitBilingualOptionLines } from '../utils/mcqParse';

type Props = {
  text: string;
  /** Base style applied to all lines (e.g. color, flex). */
  baseStyle?: TextStyle;
  /** First line (usually English). */
  primaryStyle?: TextStyle;
  /** Second+ lines (usually Urdu). */
  secondaryStyle?: TextStyle;
  containerStyle?: ViewStyle;
};

/**
 * Renders MCQ option text: bilingual lines (English + Urdu) like FBISE papers.
 */
export function McqOptionBody({
  text,
  baseStyle,
  primaryStyle,
  secondaryStyle,
  containerStyle,
}: Props) {
  const lines = splitBilingualOptionLines(text);
  if (lines.length === 0) {
    return <Text style={baseStyle}>—</Text>;
  }
  if (lines.length === 1) {
    return <Text style={baseStyle}>{lines[0]}</Text>;
  }
  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={[baseStyle, styles.primary, primaryStyle]}>{lines[0]}</Text>
      {lines.slice(1).map((line, idx) => (
        <Text
          key={`${idx}-${line.slice(0, 24)}`}
          style={[baseStyle, styles.secondary, secondaryStyle]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  primary: { fontWeight: '500' },
  secondary: { marginTop: 2, fontSize: 14, lineHeight: 20, opacity: 0.92 },
});

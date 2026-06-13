import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

interface LoaderProps {
  size?: 'small' | 'large';
  color?: string;
}

export default function Loader({ size = 'large', color = '#2563EB' }: LoaderProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

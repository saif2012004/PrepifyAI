import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoComplete?: 'off' | 'email' | 'password' | 'username' | 'name';
  textContentType?:
    | 'none'
    | 'emailAddress'
    | 'password'
    | 'newPassword'
    | 'name'
    | 'username';
  /** Dark glass forms (e.g. login on gradient) */
  appearance?: 'light' | 'dark';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoComplete = 'off',
  textContentType = 'none',
  appearance = 'light',
  autoCapitalize = 'none',
}: InputFieldProps) {
  const dark = appearance === 'dark';
  return (
    <View style={styles.container}>
      <Text style={[styles.label, dark && styles.labelDark]}>{label}</Text>
      <TextInput
        style={[styles.input, dark && styles.inputDark]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? '#64748B' : '#9CA3AF'}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete as any}
        textContentType={textContentType} // iOS autofill control
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        importantForAutofill="no" // Android autofill control
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    outlineStyle: 'none' as any, // Remove focus outline on web
  },
  labelDark: {
    color: '#94A3B8',
  },
  inputDark: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#F4F7FF',
  },
});

import React from 'react';
import { Pressable, Text as RNText, TextInput, View } from 'react-native';
import { radius, spacing } from '../tokens';

export function Text({ children, style, ...props }: any) {
  return (
    <RNText {...props} style={[{ color: '#111', fontSize: 16 }, style]}>
      {children}
    </RNText>
  );
}

export function Card({ children, style }: any) {
  return (
    <View style={[{ backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.md }, style]}>
      {children}
    </View>
  );
}

export function Button({ label, onPress, disabled, style }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: disabled ? '#9FB7EE' : '#1E6BFF',
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <RNText style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{label}</RNText>
    </Pressable>
  );
}

export function TextField({ value, onChangeText, placeholder, secureTextEntry, style, ...props }: any) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={secureTextEntry}
      {...props}
      placeholderTextColor="#8B9099"
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          fontSize: 16,
        },
        style,
      ]}
    />
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'danger' }) {
  const color = tone === 'success' ? '#30B07A' : tone === 'danger' ? '#D64545' : '#62708A';
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: `${color}22`, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <RNText style={{ color, fontWeight: '600' }}>{label}</RNText>
    </View>
  );
}

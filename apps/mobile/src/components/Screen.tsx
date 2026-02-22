import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        paddingTop: Math.max(insets.top, 16),
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#F5F7FA',
      }}
    >
      {children}
    </View>
  );
}

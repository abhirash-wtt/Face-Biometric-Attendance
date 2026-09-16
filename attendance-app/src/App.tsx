import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { KioskScreen } from './screens/KioskScreen';
import { EnrollScreen } from './screens/EnrollScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { RegularizationScreen } from './screens/RegularizationScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { store } from './state/attendanceSlice';
import { storage } from './services/storage';
import { TAP_TARGET, useLayout } from './theme/responsive';

type Tab = 'kiosk' | 'enroll' | 'attendance' | 'wfh' | 'settings';

function Shell() {
  const [tab, setTab] = useState<Tab>('kiosk');
  const [role, setRole] = useState<'admin' | 'user' | ''>('');
  const [canWfh, setCanWfh] = useState(false);
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  const refreshRole = useCallback(async () => {
    const next = await storage.getRole();
    const wfh = await storage.canUseRegularization();
    setRole(next);
    setCanWfh(wfh);
    setTab((current) => {
      if (next !== 'admin' && (current === 'enroll' || current === 'attendance')) return 'kiosk';
      if (!wfh && current === 'wfh') return 'kiosk';
      return current;
    });
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  const tabs: Array<[Tab, string]> =
    role === 'admin'
      ? [
          ['kiosk', 'Kiosk'],
          ['enroll', 'Enroll'],
          ['attendance', 'Attend'],
          ['wfh', 'Regularize'],
          ['settings', 'Settings'],
        ]
      : canWfh
        ? [
            ['kiosk', 'Kiosk'],
            ['wfh', 'Regularize'],
            ['settings', 'Settings'],
          ]
        : [
            ['kiosk', 'Kiosk'],
            ['settings', 'Settings'],
          ];

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#07111f" />
      <View
        style={[
          styles.body,
          {
            paddingTop: insets.top,
            paddingLeft: Math.max(insets.left, 0),
            paddingRight: Math.max(insets.right, 0),
          },
        ]}
      >
        {tab === 'kiosk' && <KioskScreen />}
        {tab === 'enroll' && role === 'admin' && <EnrollScreen />}
        {tab === 'attendance' && role === 'admin' && <AttendanceScreen />}
        {tab === 'wfh' && canWfh && <RegularizationScreen role={role} />}
        {tab === 'settings' && <SettingsScreen onAuthChange={refreshRole} />}
      </View>
      <View
        style={[
          styles.tabs,
          {
            paddingBottom: insets.bottom,
            paddingLeft: Math.max(insets.left, 0),
            paddingRight: Math.max(insets.right, 0),
          },
        ]}
      >
        {tabs.map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            accessibilityLabel={label}
            android_ripple={{ color: '#1b2b44' }}
            style={[styles.tab, tab === id && styles.tabOn]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={Platform.OS === 'ios'}
              minimumFontScale={0.8}
              style={[
                styles.tabText,
                { fontSize: layout.compact || tabs.length > 4 ? 12 : 15 },
                tab === id && styles.tabTextOn,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <Shell />
      </Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07111f' },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1b2b44',
    backgroundColor: '#0c182c',
  },
  tab: {
    flex: 1,
    minHeight: TAP_TARGET,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { borderTopWidth: 2, borderTopColor: '#7ee0c5' },
  tabText: { color: '#8ea0b8', fontWeight: '700' },
  tabTextOn: { color: '#7ee0c5' },
});

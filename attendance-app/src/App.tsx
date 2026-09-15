import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Provider } from 'react-redux';
import { KioskScreen } from './screens/KioskScreen';
import { EnrollScreen } from './screens/EnrollScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { store } from './state/attendanceSlice';
import { storage } from './services/storage';

type Tab = 'kiosk' | 'enroll' | 'settings';

function Shell() {
  const [tab, setTab] = useState<Tab>('kiosk');
  const [role, setRole] = useState<'admin' | 'user' | ''>('');

  const refreshRole = useCallback(async () => {
    const next = await storage.getRole();
    setRole(next);
    setTab((current) => (next !== 'admin' && current === 'enroll' ? 'kiosk' : current));
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  const tabs: Array<[Tab, string]> =
    role === 'admin'
      ? [
          ['kiosk', 'Kiosk'],
          ['enroll', 'Enroll'],
          ['settings', 'Settings'],
        ]
      : [
          ['kiosk', 'Kiosk'],
          ['settings', 'Settings'],
        ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        {tab === 'kiosk' && <KioskScreen />}
        {tab === 'enroll' && role === 'admin' && <EnrollScreen />}
        {tab === 'settings' && <SettingsScreen onAuthChange={refreshRole} />}
      </View>
      <View style={styles.tabs}>
        {tabs.map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <Shell />
    </Provider>
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
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabOn: { borderTopWidth: 2, borderTopColor: '#7ee0c5' },
  tabText: { color: '#8ea0b8', fontWeight: '700' },
  tabTextOn: { color: '#7ee0c5' },
});

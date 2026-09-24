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
import type { AppRole } from './services/storage';
import { TAP_TARGET, useLayout } from './theme/responsive';
import { THEME } from './theme/colors';

type Tab = 'kiosk' | 'enroll' | 'attendance' | 'wfh' | 'settings';

function TabPanel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={active ? styles.panel : styles.panelHidden}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('kiosk');
  const [role, setRole] = useState<AppRole>('');
  const [canWfh, setCanWfh] = useState(false);
  const [canEnroll, setCanEnroll] = useState(false);
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  const refreshRole = useCallback(async () => {
    const snap = await storage.getAccessSnapshot();
    setRole(snap.role);
    setCanWfh(snap.canWfh);
    setCanEnroll(snap.canEnroll);
    setTab((current) => {
      // Admin/BU do not use kiosk; send them to a management tab.
      if (snap.adminLike && current === 'kiosk') return 'attendance';
      if (current === 'attendance' && !snap.canAttendance) return 'kiosk';
      if (!snap.canEnroll && current === 'enroll') return snap.canAttendance ? 'attendance' : 'kiosk';
      if (!snap.canWfh && current === 'wfh') return snap.canAttendance ? 'attendance' : 'kiosk';
      return current;
    });
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  const adminLike = storage.isAdminLike(role);
  const canAttendance = storage.canAccessAttendance(role);
  const tabs: Array<[Tab, string]> = adminLike
    ? [
        ...(canEnroll ? [['enroll', 'Enroll'] as [Tab, string]] : []),
        ['attendance', 'Attend'],
        ['wfh', 'Regularize'],
        ['settings', 'Settings'],
      ]
    : [
        ['kiosk', 'Kiosk'],
        ...(canEnroll ? [['enroll', 'Enroll'] as [Tab, string]] : []),
        ...(canAttendance ? [['attendance', 'Attend'] as [Tab, string]] : []),
        ...(canWfh ? [['wfh', 'Regularize'] as [Tab, string]] : []),
        ['settings', 'Settings'],
      ];

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 8) + 6,
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          },
        ]}
      >
        <View style={styles.brand}>
          <View style={styles.brandIconContainer}>
            <Text style={styles.brandIcon}>⚡</Text>
          </View>
          <Text style={styles.brandTitle}>FaceID Attend</Text>
        </View>
        {!!role && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{role.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View
        style={[
          styles.body,
          {
            paddingLeft: Math.max(insets.left, 0),
            paddingRight: Math.max(insets.right, 0),
          },
        ]}
      >
        {/* Keep screens mounted so Attendance does not remount/refetch on every tab switch. */}
        {!adminLike && (
          <TabPanel active={tab === 'kiosk'}>
            <KioskScreen />
          </TabPanel>
        )}
        {canEnroll && (
          <TabPanel active={tab === 'enroll'}>
            <EnrollScreen />
          </TabPanel>
        )}
        {canAttendance && (
          <TabPanel active={tab === 'attendance'}>
            <AttendanceScreen active={tab === 'attendance'} />
          </TabPanel>
        )}
        {canWfh && (
          <TabPanel active={tab === 'wfh'}>
            <RegularizationScreen role={role} />
          </TabPanel>
        )}
        <TabPanel active={tab === 'settings'}>
          <SettingsScreen onAuthChange={refreshRole} />
        </TabPanel>
      </View>
      <View
        style={[
          styles.tabs,
          {
            paddingBottom: Math.max(insets.bottom, 8) + 4,
            paddingLeft: Math.max(insets.left, 8),
            paddingRight: Math.max(insets.right, 8),
          },
        ]}
      >
        {tabs.map(([id, label]) => {
          const isSelected = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={label}
              android_ripple={{ color: 'rgba(6, 182, 212, 0.2)' }}
              style={[styles.tab, isSelected && styles.tabOn]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit={Platform.OS === 'ios'}
                minimumFontScale={0.8}
                style={[
                  styles.tabText,
                  { fontSize: layout.compact || tabs.length > 4 ? 12 : 14 },
                  isSelected && styles.tabTextOn,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
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
  safe: { flex: 1, backgroundColor: THEME.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    backgroundColor: 'rgba(11, 18, 32, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: THEME.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: { fontSize: 13, fontWeight: '900', color: '#fff' },
  brandTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  roleBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleText: { color: THEME.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  body: { flex: 1 },
  panel: { flex: 1 },
  panelHidden: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0,
    zIndex: -1,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
  },
  tab: {
    flex: 1,
    minHeight: TAP_TARGET - 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabOn: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  tabText: { color: THEME.textMuted, fontWeight: '700' },
  tabTextOn: { color: '#fff', fontWeight: '800' },
});

import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { api } from '../services/api';
import { storage, Settings, AppRole } from '../services/storage';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

export function SettingsScreen({ onAuthChange }: { onAuthChange?: () => void }) {
  const layout = useLayout();
  const [settings, setSettings] = useState<Settings>({
    apiBase: '',
    deviceId: '',
    siteCode: '',
    bootstrapSecret: '',
  });
  const [email, setEmail] = useState('admin@attendance.local');
  const [password, setPassword] = useState('Admin@123');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<AppRole>('');

  useEffect(() => {
    storage.getSettings().then(setSettings);
    storage.getRole().then(setRole);
  }, []);

  const save = async () => {
    await storage.setSettings(settings);
    setMessage('Settings saved successfully');
  };

  const login = async () => {
    try {
      const res = await api.login(email, password);
      await storage.setToken(res.access_token);
      const nextRole = storage.roleFromToken(res.access_token);
      setRole(nextRole);
      onAuthChange?.();
      setMessage(`Logged in as ${res.user.role}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const bind = async () => {
    try {
      await storage.setSettings(settings);
      const res = await api.registerDevice({
        device_id: settings.deviceId,
        site_code: settings.siteCode,
        bootstrap_secret: settings.bootstrapSecret,
        description: 'Kiosk',
      });
      await storage.setToken(res.access_token);
      const nextRole = storage.roleFromToken(res.access_token);
      setRole(nextRole);
      onAuthChange?.();
      setMessage(`Device registered: ${res.device.device_id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Bind failed');
    }
  };

  const logout = async () => {
    await storage.setToken(null);
    setRole('');
    onAuthChange?.();
    setMessage('Signed out');
  };

  const isLoggedIn = !!role;
  // Guests (bootstrap) and admin-like accounts may bind; employee/manager/hr may not.
  const showBind = !role || storage.isAdminLike(role);

  const flush = async () => {
    try {
      const res = await api.flushQueue();
      setMessage(`Synced ${res.flushed} queued events (${res.remaining} remaining)`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        indicatorStyle="white"
        persistentScrollbar={false}
      >
        <Text style={styles.title}>Settings</Text>
        <View style={styles.roleHeader}>
          <Text style={styles.roleText}>{role ? `Signed in as ${role.toUpperCase()}` : 'Not signed in'}</Text>
        </View>

        {/* Card 1: Device & API Configuration */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Device & API Configuration</Text>
          <Field
            label="API URL"
            value={settings.apiBase}
            onChange={(apiBase) => setSettings({ ...settings, apiBase })}
            keyboardType="url"
          />
          <Field
            label="Device ID"
            value={settings.deviceId}
            onChange={(deviceId) => setSettings({ ...settings, deviceId })}
          />
          <Field
            label="Site Code"
            value={settings.siteCode}
            onChange={(siteCode) => setSettings({ ...settings, siteCode })}
          />
          {showBind && (
            <Field
              label="Device Bind Secret"
              value={settings.bootstrapSecret}
              onChange={(bootstrapSecret) => setSettings({ ...settings, bootstrapSecret })}
            />
          )}
          <Pressable onPress={save} accessibilityRole="button" style={styles.btnPrimary}>
            <Text style={styles.btnText}>Save Settings</Text>
          </Pressable>
        </View>

        {/* Card 2: User Account & Authentication */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>User Account & Auth</Text>
          <Field label="Email Address" value={email} onChange={setEmail} keyboardType="email-address" />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            secure
            returnKeyType="go"
            onSubmit={isLoggedIn ? undefined : login}
          />
          <View style={styles.btnRow}>
            {!isLoggedIn && (
              <Pressable
                onPress={login}
                accessibilityRole="button"
                style={[styles.btnPrimary, styles.flexBtn]}
              >
                <Text style={styles.btnText}>Login</Text>
              </Pressable>
            )}
            {isLoggedIn && (
              <Pressable
                onPress={logout}
                accessibilityRole="button"
                style={[styles.btnDanger, styles.flexBtn]}
              >
                <Text style={styles.btnText}>Logout</Text>
              </Pressable>
            )}
          </View>
          {showBind && (
            <Pressable onPress={bind} accessibilityRole="button" style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>Register This Device</Text>
            </Pressable>
          )}
        </View>

        {/* Card 3: System Sync Operations */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Offline Queue Operations</Text>
          <Pressable onPress={flush} accessibilityRole="button" style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Sync Offline Queue</Text>
          </Pressable>
        </View>

        {!!message && <Text style={styles.status}>{message}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
  returnKeyType,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType ?? 'next'}
        onSubmitEditing={onSubmit}
        placeholderTextColor={THEME.textSubtle}
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: 16,
    paddingBottom: 48,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6, letterSpacing: -0.2 },
  roleHeader: { marginBottom: 14 },
  roleText: { color: THEME.cyan, fontSize: 13, fontWeight: '800' },
  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: THEME.cyan, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { color: THEME.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flexBtn: { flex: 1 },
  btnPrimary: {
    minHeight: TAP_TARGET,
    backgroundColor: THEME.cyan,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: THEME.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDanger: {
    minHeight: TAP_TARGET,
    backgroundColor: THEME.rose,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnSecondary: {
    minHeight: TAP_TARGET,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondaryText: { color: THEME.cyan, fontWeight: '800', fontSize: 14 },
  status: { color: THEME.textSecondary, marginTop: 14, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});


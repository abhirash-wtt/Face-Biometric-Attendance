import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../services/api';
import { storage, Settings } from '../services/storage';

export function SettingsScreen({ onAuthChange }: { onAuthChange?: () => void }) {
  const [settings, setSettings] = useState<Settings>({
    apiBase: '',
    deviceId: '',
    siteCode: '',
    bootstrapSecret: '',
  });
  const [email, setEmail] = useState('admin@attendance.local');
  const [password, setPassword] = useState('Admin@123');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'admin' | 'user' | ''>('');

  useEffect(() => {
    storage.getSettings().then(setSettings);
    storage.getRole().then(setRole);
  }, []);

  const save = async () => {
    await storage.setSettings(settings);
    setMessage('Settings saved');
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
      setMessage(`Device bound: ${res.device.device_id}`);
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

  const showBind = role !== 'user';

  const flush = async () => {
    try {
      const res = await api.flushQueue();
      setMessage(`Synced ${res.flushed} queued events (${res.remaining} remaining)`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.section}>{role ? `Signed in as ${role}` : 'Not signed in'}</Text>
      <Field label="API URL" value={settings.apiBase} onChange={(apiBase) => setSettings({ ...settings, apiBase })} />
      <Field label="Device ID" value={settings.deviceId} onChange={(deviceId) => setSettings({ ...settings, deviceId })} />
      <Field label="Site code" value={settings.siteCode} onChange={(siteCode) => setSettings({ ...settings, siteCode })} />
      {showBind && (
        <Field
          label="Device bind secret"
          value={settings.bootstrapSecret}
          onChange={(bootstrapSecret) => setSettings({ ...settings, bootstrapSecret })}
        />
      )}
      <Pressable onPress={save} style={styles.btn}>
        <Text style={styles.btnText}>Save</Text>
      </Pressable>
      <Text style={styles.section}>Login</Text>
      <Field label="Email" value={email} onChange={setEmail} />
      <Field label="Password" value={password} onChange={setPassword} secure />
      <Pressable onPress={login} style={styles.btn}>
        <Text style={styles.btnText}>Login</Text>
      </Pressable>
      <Pressable onPress={logout} style={styles.btnAlt}>
        <Text style={styles.btnText}>Logout</Text>
      </Pressable>
      {showBind && (
        <Pressable onPress={bind} style={styles.btnAlt}>
          <Text style={styles.btnText}>Register this device</Text>
        </Pressable>
      )}
      <Pressable onPress={flush} style={styles.btnAlt}>
        <Text style={styles.btnText}>Sync offline queue</Text>
      </Pressable>
      {!!message && <Text style={styles.status}>{message}</Text>}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        placeholderTextColor="#6d7f96"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f' },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  section: { color: '#7ee0c5', fontWeight: '700', marginTop: 18, marginBottom: 8 },
  field: { marginBottom: 10 },
  label: { color: '#9fb0c8', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    color: '#f4f7fb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    backgroundColor: '#2d6cdf',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnAlt: {
    backgroundColor: '#1f8a70',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '800' },
  status: { color: '#c5d2e4', marginTop: 14, textAlign: 'center' },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, AttendanceStatusRow } from '../services/api';

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatPunch(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AttendanceScreen() {
  const [date, setDate] = useState(todayIst());
  const [rows, setRows] = useState<AttendanceStatusRow[]>([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (queryDate = date) => {
    try {
      setBusy(true);
      const res = await api.attendanceStatus(queryDate || undefined);
      setRows(res.employees || []);
      if (res.date) setDate(res.date);
      if (res.timezone) setTimezone(res.timezone);
      setMessage(`${(res.employees || []).length} employee${(res.employees || []).length === 1 ? '' : 's'}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load attendance');
    } finally {
      setBusy(false);
    }
  }, [date]);

  useEffect(() => {
    load(todayIst());
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.meta}>
        Times in {timezone} for {date || 'today'}.
      </Text>
      <View style={styles.toolbar}>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6d7f96"
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable onPress={load} style={styles.refresh}>
          <Text style={styles.refreshText}>{busy ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      <View style={styles.head}>
        <Text style={[styles.headText, styles.colName]}>Employee</Text>
        <Text style={[styles.headText, styles.colTime]}>In</Text>
        <Text style={[styles.headText, styles.colTime]}>Out</Text>
        <Text style={[styles.headText, styles.colStatus]}>Status</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.employee_id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor="#7ee0c5" />}
        ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.colName}>
              <Text style={styles.name}>
                {item.display_name} ({item.employee_code})
              </Text>
              {!!item.email && <Text style={styles.email}>{item.email}</Text>}
            </View>
            <Text style={[styles.time, styles.colTime]}>{formatPunch(item.clock_in)}</Text>
            <Text style={[styles.time, styles.colTime]}>{formatPunch(item.clock_out)}</Text>
            <View style={styles.colStatus}>
              <View style={[styles.pill, item.status === 'Present' ? styles.present : styles.absent]}>
                <Text style={[styles.pillText, item.status === 'Present' ? styles.presentText : styles.absentText]}>
                  {item.status}
                </Text>
              </View>
            </View>
          </View>
        )}
      />
      {!!message && <Text style={styles.status}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f', padding: 16 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  meta: { color: '#9fb0c8', fontSize: 12, marginBottom: 10 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    color: '#f4f7fb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refresh: {
    backgroundColor: '#2d6cdf',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  refreshText: { color: '#fff', fontWeight: '800' },
  head: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#22344f' },
  headText: { color: '#9fb0c8', fontSize: 11, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22344f',
  },
  colName: { flex: 1.4, paddingRight: 6 },
  colTime: { flex: 0.9 },
  colStatus: { width: 78, alignItems: 'flex-end' },
  name: { color: '#f4f7fb', fontWeight: '700' },
  email: { color: '#9fb0c8', fontSize: 11, marginTop: 2 },
  time: { color: '#c5d2e4', fontSize: 12 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  present: { backgroundColor: '#1f8a70' },
  absent: { backgroundColor: '#3a4a63' },
  presentText: { color: '#fff' },
  absentText: { color: '#c5d2e4' },
  empty: { color: '#9fb0c8', textAlign: 'center', marginTop: 24 },
  status: { color: '#c5d2e4', textAlign: 'center', marginTop: 10 },
});

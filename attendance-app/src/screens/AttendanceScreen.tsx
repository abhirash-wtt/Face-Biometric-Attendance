import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, AttendanceStatusRow } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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

function formatDateLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd || 'Select date';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function toYmd(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function DatePickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const layout = useLayout();
  const [open, setOpen] = useState(false);
  const selected = value || todayIst();
  const [viewYear, setViewYear] = useState(() => Number(selected.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(selected.slice(5, 7)) - 1);

  useEffect(() => {
    if (!open) return;
    setViewYear(Number(selected.slice(0, 4)));
    setViewMonth(Number(selected.slice(5, 7)) - 1);
  }, [open, selected]);

  const title = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    [viewYear, viewMonth],
  );
  const cells = useMemo(() => {
    const start = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    return [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.dateField}
        accessibilityRole="button"
        accessibilityLabel={`Change date, currently ${formatDateLabel(selected)}`}
      >
        <Text style={styles.calIcon}>📅</Text>
        <Text style={styles.dateLabel} numberOfLines={1}>
          {formatDateLabel(selected)}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.calBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.calendar,
              { width: Math.min(360, layout.width - 2 * layout.gutter - 16) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.calHead}>
              <Pressable onPress={() => shiftMonth(-1)} style={styles.calNav}>
                <Text style={styles.calNavText}>‹</Text>
              </Pressable>
              <Text style={styles.calTitle}>{title}</Text>
              <Pressable onPress={() => shiftMonth(1)} style={styles.calNav}>
                <Text style={styles.calNavText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.calGrid}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.calDow}>
                  {d}
                </Text>
              ))}
              {cells.map((day, idx) => {
                if (!day) return <View key={`empty-${idx}`} style={styles.calDay} />;
                const ymd = toYmd(viewYear, viewMonth, day);
                const on = ymd === selected;
                return (
                  <Pressable
                    key={ymd}
                    onPress={() => {
                      onChange(ymd);
                      setOpen(false);
                    }}
                    style={[styles.calDay, on && styles.calDayOn]}
                  >
                    <Text style={[styles.calDayText, on && styles.calDayTextOn]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const present = status === 'Present';
  return (
    <View style={[styles.pill, present ? styles.present : styles.absent]}>
      <Text style={[styles.pillText, present ? styles.presentText : styles.absentText]}>
        {status}
      </Text>
    </View>
  );
}

export function AttendanceScreen() {
  const layout = useLayout();
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
    <View
      style={[styles.root, { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth }]}
    >
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.meta}>
        Times in {timezone} for {date || 'today'}.
      </Text>
      <View style={styles.toolbar}>
        <DatePickerField
          value={date}
          onChange={(next) => {
            setDate(next);
            load(next);
          }}
        />
        <Pressable onPress={() => load(date)} accessibilityRole="button" style={styles.refresh}>
          <Text style={styles.refreshText}>{busy ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {/* Four columns only fit on wider screens; phones get stacked cards instead. */}
      {!layout.stackRows && (
        <View style={styles.head}>
          <Text style={[styles.headText, styles.colName]}>Employee</Text>
          <Text style={[styles.headText, styles.colTime]}>In</Text>
          <Text style={[styles.headText, styles.colTime]}>Out</Text>
          <Text style={[styles.headText, styles.colStatus]}>Status</Text>
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.employee_id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => load(date)} tintColor="#7ee0c5" />}
        ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) =>
          layout.stackRows ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardWho}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  <Text style={styles.code}>{item.employee_code}</Text>
                  {!!item.email && (
                    <Text style={styles.email} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </View>
                <StatusPill status={item.status} />
              </View>
              <View style={styles.cardTimes}>
                <View style={styles.cardTime}>
                  <Text style={styles.cardTimeLabel}>Clock in</Text>
                  <Text style={styles.cardTimeValue}>{formatPunch(item.clock_in)}</Text>
                </View>
                <View style={styles.cardTime}>
                  <Text style={styles.cardTimeLabel}>Clock out</Text>
                  <Text style={styles.cardTimeValue}>{formatPunch(item.clock_out)}</Text>
                </View>
              </View>
            </View>
          ) : (
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
                <StatusPill status={item.status} />
              </View>
            </View>
          )
        }
      />
      {!!message && <Text style={styles.status}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: '#07111f', paddingVertical: 16 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  meta: { color: '#9fb0c8', fontSize: 12, marginBottom: 10 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateLabel: { flex: 1, color: '#f4f7fb', fontWeight: '700' },
  calIcon: { fontSize: 16 },
  calBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  calendar: {
    maxWidth: '100%',
    backgroundColor: '#152238',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a3d5c',
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calTitle: { flex: 1, textAlign: 'center', color: '#f4f7fb', fontWeight: '800' },
  calNav: {
    minWidth: 44,
    minHeight: 40,
    backgroundColor: '#102038',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  calNavText: { color: '#7ee0c5', fontWeight: '800', fontSize: 18 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: '14.28%', textAlign: 'center', color: '#9fb0c8', fontSize: 11, fontWeight: '700', paddingVertical: 6 },
  calDay: { width: '14.28%', minHeight: 40, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calDayOn: { backgroundColor: '#1f8a70' },
  calDayText: { color: '#f4f7fb', fontWeight: '700' },
  calDayTextOn: { color: '#fff' },
  refresh: {
    minHeight: TAP_TARGET,
    backgroundColor: '#2d6cdf',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: { color: '#fff', fontWeight: '800' },
  head: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#22344f' },
  headText: { color: '#9fb0c8', fontSize: 11, fontWeight: '700' },
  listContent: { paddingBottom: 12 },
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
  card: {
    backgroundColor: '#102038',
    borderWidth: 1,
    borderColor: '#22344f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardWho: { flex: 1 },
  cardTimes: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#22344f',
  },
  cardTime: { flex: 1 },
  cardTimeLabel: {
    color: '#9fb0c8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardTimeValue: { color: '#f4f7fb', fontSize: 16, fontWeight: '700', marginTop: 2 },
  code: { color: '#7ee0c5', fontSize: 12, fontWeight: '700', marginTop: 2 },
  name: { color: '#f4f7fb', fontWeight: '700', fontSize: 15 },
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

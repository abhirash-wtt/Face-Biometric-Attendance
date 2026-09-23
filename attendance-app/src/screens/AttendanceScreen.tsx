import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, AttendanceStatusRow } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type RoleFilter = '' | 'bu' | 'manager' | 'hr' | 'employee';

const ROLE_FILTERS: Array<{ id: RoleFilter; label: string }> = [
  { id: 'bu', label: 'BU' },
  { id: 'manager', label: 'Manager' },
  { id: 'hr', label: 'HR' },
  { id: 'employee', label: 'Employee' },
];

/** Map linked user role onto the four filter buckets (unlinked → employee). */
function matchesRoleFilter(role: string | null | undefined, filter: RoleFilter): boolean {
  if (!filter) return true;
  const normalized = role || 'employee';
  if (filter === 'employee') return normalized === 'employee';
  return normalized === filter;
}

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

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
  const tone =
    status === 'Present' ? 'present' : status === 'Half Day' ? 'halfDay' : 'absent';
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.pillText, styles[`${tone}Text`]]}>{status.toUpperCase()}</Text>
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
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');

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

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesRoleFilter(r.role, roleFilter)) return false;
      if (!q) return true;
      const hay = `${r.display_name} ${r.employee_code} ${r.email || ''} ${r.role || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery, roleFilter]);

  const totalCount = rows.length;
  const presentCount = rows.filter((r) => r.status === 'Present').length;
  const halfDayCount = rows.filter((r) => r.status === 'Half Day').length;
  const absentCount = rows.filter((r) => r.status === 'Absent').length;

  const exportCsv = async () => {
    if (!filteredRows.length) {
      setMessage('Nothing to export');
      return;
    }
    const header = 'Employee,Code,Email,Role,Clock In,Clock Out,Status,Reporting Manager,BU Owner';
    const lines = filteredRows.map((r) =>
      [
        csvEscape(r.display_name),
        csvEscape(r.employee_code),
        csvEscape(r.email || ''),
        csvEscape(r.role || 'employee'),
        csvEscape(formatPunch(r.clock_in)),
        csvEscape(formatPunch(r.clock_out)),
        csvEscape(r.status),
        csvEscape(r.reporting_manager || ''),
        csvEscape(r.bu_owner || ''),
      ].join(','),
    );
    const csv = [header, ...lines].join('\n');
    try {
      await Share.share({
        title: `Attendance ${date}`,
        message: csv,
      });
      setMessage(`Exported ${filteredRows.length} row${filteredRows.length === 1 ? '' : 's'}`);
    } catch (err) {
      if (err instanceof Error && /share.*cancel|dismiss/i.test(err.message)) return;
      setMessage(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const filterActive = !!roleFilter;

  return (
    <View
      style={[styles.root, { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth }]}
    >
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.meta}>
        Times in {timezone} for {date || 'today'}. Status from worked hours (Present ≥9h, Half Day
        ≥4h, Absent &lt;4h).
      </Text>

      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{totalCount}</Text>
          <Text style={styles.kpiLabel}>Total Staff</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardPresent]}>
          <Text style={[styles.kpiValue, { color: THEME.emerald }]}>{presentCount}</Text>
          <Text style={styles.kpiLabel}>Present</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardHalfDay]}>
          <Text style={[styles.kpiValue, { color: THEME.amber }]}>{halfDayCount}</Text>
          <Text style={styles.kpiLabel}>Half Day</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardAbsent]}>
          <Text style={[styles.kpiValue, { color: THEME.textMuted }]}>{absentCount}</Text>
          <Text style={styles.kpiLabel}>Absent</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => {
            setShowSearch((v) => !v);
            if (showFilter) setShowFilter(false);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: showSearch }}
          style={[styles.actionBtn, showSearch && styles.actionBtnOn]}
        >
          <Text style={[styles.actionBtnText, showSearch && styles.actionBtnTextOn]}>Search</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setShowFilter((v) => !v);
            if (showSearch) setShowSearch(false);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: showFilter || filterActive }}
          style={[styles.actionBtn, (showFilter || filterActive) && styles.actionBtnOn]}
        >
          <Text
            style={[
              styles.actionBtnText,
              (showFilter || filterActive) && styles.actionBtnTextOn,
            ]}
          >
            Filter
          </Text>
        </Pressable>
        <Pressable onPress={exportCsv} accessibilityRole="button" style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>Export</Text>
        </Pressable>
      </View>

      {showSearch && (
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name, code, or email"
          placeholderTextColor={THEME.textSubtle}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      )}

      {showFilter && (
        <View style={styles.filterRow}>
          {ROLE_FILTERS.map((opt) => {
            const on = roleFilter === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setRoleFilter((prev) => (prev === opt.id ? '' : opt.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.filterChip, on && styles.filterChipOn]}
              >
                <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.toolbar}>
        <Text style={styles.dateCaption}>Date</Text>
        <DatePickerField
          value={date}
          onChange={(next) => {
            setDate(next);
            load(next);
          }}
        />
      </View>

      {!layout.stackRows && (
        <View style={styles.head}>
          <Text style={[styles.headText, styles.colName]}>Employee</Text>
          <Text style={[styles.headText, styles.colTime]}>In</Text>
          <Text style={[styles.headText, styles.colTime]}>Out</Text>
          <Text style={[styles.headText, styles.colStatus]}>Status</Text>
          <Text style={[styles.headText, styles.colOrg]}>Reporting Manager</Text>
          <Text style={[styles.headText, styles.colOrg]}>BU Owner</Text>
        </View>
      )}
      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.employee_id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => load(date)} tintColor={THEME.cyan} />}
        ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
        contentContainerStyle={styles.listContent}
        indicatorStyle="white"
        persistentScrollbar={false}
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
              <View style={styles.cardOrg}>
                <View style={styles.cardTime}>
                  <Text style={styles.cardTimeLabel}>Reporting Manager</Text>
                  <Text style={styles.cardTimeValue}>{item.reporting_manager || '—'}</Text>
                </View>
                <View style={styles.cardTime}>
                  <Text style={styles.cardTimeLabel}>BU Owner</Text>
                  <Text style={styles.cardTimeValue}>{item.bu_owner || '—'}</Text>
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
              <Text style={[styles.org, styles.colOrg]} numberOfLines={2}>
                {item.reporting_manager || '—'}
              </Text>
              <Text style={[styles.org, styles.colOrg]} numberOfLines={2}>
                {item.bu_owner || '—'}
              </Text>
            </View>
          )
        }
      />
      {!!message && <Text style={styles.status}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: THEME.bg, paddingVertical: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4, letterSpacing: -0.2 },
  meta: { color: THEME.textMuted, fontSize: 13, marginBottom: 12 },
  kpiContainer: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  kpiCardPresent: { borderColor: 'rgba(16, 185, 129, 0.25)', backgroundColor: 'rgba(16, 185, 129, 0.08)' },
  kpiCardHalfDay: { borderColor: 'rgba(245, 158, 11, 0.25)', backgroundColor: 'rgba(245, 158, 11, 0.08)' },
  kpiCardAbsent: { borderColor: 'rgba(148, 163, 184, 0.2)', backgroundColor: 'rgba(148, 163, 184, 0.06)' },
  kpiValue: { fontSize: 20, fontWeight: '900', color: '#fff' },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: THEME.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  actionBtn: {
    flex: 1,
    minHeight: TAP_TARGET - 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  actionBtnOn: {
    borderColor: 'rgba(6, 182, 212, 0.55)',
    backgroundColor: 'rgba(6, 182, 212, 0.22)',
  },
  actionBtnText: { color: THEME.cyanLight, fontWeight: '800', fontSize: 13 },
  actionBtnTextOn: { color: '#fff' },
  searchInput: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    color: '#fff',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  filterChipOn: {
    borderColor: 'rgba(6, 182, 212, 0.5)',
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
  },
  filterChipText: { color: THEME.textMuted, fontWeight: '800', fontSize: 12 },
  filterChipTextOn: { color: '#fff' },
  toolbar: { marginBottom: 14 },
  dateCaption: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  dateLabel: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  calIcon: { fontSize: 16 },
  calBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  calendar: {
    maxWidth: '100%',
    backgroundColor: THEME.cardSolid,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800', fontSize: 15 },
  calNav: {
    minWidth: 44,
    minHeight: 38,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  calNavText: { color: THEME.cyan, fontWeight: '800', fontSize: 18 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: '14.28%', textAlign: 'center', color: THEME.textMuted, fontSize: 11, fontWeight: '800', paddingVertical: 6 },
  calDay: { width: '14.28%', minHeight: 40, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calDayOn: { backgroundColor: THEME.cyan },
  calDayText: { color: THEME.textSecondary, fontWeight: '700' },
  calDayTextOn: { color: '#fff', fontWeight: '800' },
  head: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  headText: { color: THEME.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  listContent: { paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  colName: { flex: 1.3, paddingRight: 6 },
  colOrg: { flex: 1.1, paddingRight: 4 },
  colTime: { flex: 0.75 },
  colStatus: { width: 92, alignItems: 'flex-end' },
  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardWho: { flex: 1 },
  cardOrg: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardTimes: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardTime: { flex: 1 },
  cardTimeLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardTimeValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },
  code: { color: THEME.cyan, fontSize: 12, fontWeight: '800', marginTop: 2 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  email: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  org: { color: THEME.textSecondary, fontSize: 13, fontWeight: '600' },
  time: { color: THEME.textSecondary, fontSize: 13, fontWeight: '600' },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  present: { backgroundColor: THEME.presentBg, borderColor: THEME.presentBorder },
  halfDay: { backgroundColor: THEME.pendingBg, borderColor: THEME.pendingBorder },
  absent: { backgroundColor: THEME.absentBg, borderColor: THEME.absentBorder },
  presentText: { color: THEME.presentText },
  halfDayText: { color: THEME.pendingText },
  absentText: { color: THEME.absentText },
  empty: { color: THEME.textMuted, textAlign: 'center', marginTop: 24, fontSize: 15 },
  status: { color: THEME.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 14, fontWeight: '600' },
});


import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, AttendanceStatusRow } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

type PersonFilterKind = 'reporting_manager' | 'employee';
type AttendancePeriod = 'today' | 'weekly' | 'monthly';

const PERSON_FILTER_KINDS: Array<{ id: PersonFilterKind; label: string }> = [
  { id: 'reporting_manager', label: 'Reporting Manager' },
  { id: 'employee', label: 'Employee' },
];

const ATTENDANCE_PERIODS: Array<{ id: AttendancePeriod; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const name = (raw || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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

/** Date ranges use Asia/Kolkata calendar days (Mon–Sun week). */
function rangeForPeriod(period: AttendancePeriod): { start_date: string; end_date: string } {
  const today = todayIst();
  if (period === 'today') return { start_date: today, end_date: today };

  const [y, m, d] = today.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));

  if (period === 'weekly') {
    const dow = todayUtc.getUTCDay(); // 0 = Sunday
    const daysFromMonday = (dow + 6) % 7;
    const monday = new Date(todayUtc);
    monday.setUTCDate(todayUtc.getUTCDate() - daysFromMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      start_date: toYmd(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
      end_date: toYmd(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()),
    };
  }

  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start_date: toYmd(y, m - 1, 1),
    end_date: toYmd(y, m - 1, lastDay),
  };
}

function periodLabel(period: AttendancePeriod) {
  return ATTENDANCE_PERIODS.find((p) => p.id === period)?.label || 'Today';
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function PeriodDropdown({
  value,
  onChange,
}: {
  value: AttendancePeriod;
  onChange: (next: AttendancePeriod) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.periodField}
        accessibilityRole="button"
        accessibilityLabel={`Attendance Period, currently ${periodLabel(value)}`}
      >
        <Text style={styles.periodFieldText} numberOfLines={1}>
          {periodLabel(value)}
        </Text>
        <Text style={styles.periodChevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.periodBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.periodMenu} onPress={(e) => e.stopPropagation()}>
            {ATTENDANCE_PERIODS.map((opt) => {
              const on = opt.id === value;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.periodOption, on && styles.periodOptionOn]}
                >
                  <Text style={[styles.periodOptionText, on && styles.periodOptionTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Survives tab switches so returning to Attendance paints instantly. */
let rosterCache: {
  period: AttendancePeriod;
  startDate: string;
  endDate: string;
  timezone: string;
  rows: AttendanceStatusRow[];
} | null = null;

const StatusPill = React.memo(function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'Present' ? 'present' : status === 'Half Day' ? 'halfDay' : 'absent';
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.pillText, styles[`${tone}Text`]]}>{status.toUpperCase()}</Text>
    </View>
  );
});

const AttendanceRow = React.memo(function AttendanceRow({
  item,
  stackRows,
}: {
  item: AttendanceStatusRow;
  stackRows: boolean;
}) {
  if (stackRows) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardWho}>
            {!!item.date && <Text style={styles.rowDate}>{formatDateLabel(item.date)}</Text>}
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
    );
  }
  return (
    <View style={styles.row}>
      <Text style={[styles.time, styles.colDate]} numberOfLines={2}>
        {item.date ? formatDateLabel(item.date) : '—'}
      </Text>
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
  );
});

export function AttendanceScreen({ active = true }: { active?: boolean }) {
  const layout = useLayout();
  const initialRange = rosterCache
    ? { start_date: rosterCache.startDate, end_date: rosterCache.endDate }
    : rangeForPeriod('today');
  const [period, setPeriod] = useState<AttendancePeriod>(rosterCache?.period || 'today');
  const [startDate, setStartDate] = useState(initialRange.start_date);
  const [endDate, setEndDate] = useState(initialRange.end_date);
  const [rows, setRows] = useState<AttendanceStatusRow[]>(rosterCache?.rows || []);
  const [timezone, setTimezone] = useState(rosterCache?.timezone || 'Asia/Kolkata');
  const [message, setMessage] = useState(
    rosterCache?.rows?.length
      ? `${rosterCache.rows.length} row${rosterCache.rows.length === 1 ? '' : 's'}`
      : '',
  );
  const [busy, setBusy] = useState(!rosterCache?.rows?.length);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<PersonFilterKind>('reporting_manager');
  /** Text typed in the filter field — only narrows the dropdown. */
  const [filterDraft, setFilterDraft] = useState('');
  /** Value applied to the roster — set only when a dropdown option is chosen. */
  const [filterSelected, setFilterSelected] = useState('');
  const loadedRef = React.useRef(!!rosterCache?.rows?.length);
  const periodRef = React.useRef(period);
  periodRef.current = period;

  const rangeLabel = useMemo(() => {
    const label = periodLabel(period);
    if (!startDate) return label.toLowerCase();
    if (!endDate || endDate === startDate) return `${label} (${startDate})`;
    return `${label} (${startDate} → ${endDate})`;
  }, [period, startDate, endDate]);

  const load = useCallback(
    async (
      range: { start_date: string; end_date: string } = { start_date: startDate, end_date: endDate },
      opts?: { silent?: boolean; period?: AttendancePeriod },
    ) => {
      try {
        if (!opts?.silent || !rosterCache?.rows?.length) setBusy(true);
        let start = range.start_date || todayIst();
        let end = range.end_date || start;
        if (end < start) end = start;
        const nextPeriod = opts?.period ?? periodRef.current;
        const res = await api.attendanceStatus({ start_date: start, end_date: end });
        const nextRows = res.employees || [];
        const nextStart = res.start_date || res.date || start;
        const nextEnd = res.end_date || res.date || end;
        const nextTz = res.timezone || 'Asia/Kolkata';
        rosterCache = {
          period: nextPeriod,
          startDate: nextStart,
          endDate: nextEnd,
          timezone: nextTz,
          rows: nextRows,
        };
        loadedRef.current = true;
        setRows(nextRows);
        setPeriod(nextPeriod);
        setStartDate(nextStart);
        setEndDate(nextEnd);
        if (res.timezone) setTimezone(res.timezone);
        setMessage(`${nextRows.length} row${nextRows.length === 1 ? '' : 's'}`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to load attendance');
      } finally {
        setBusy(false);
      }
    },
    [startDate, endDate],
  );

  const loadRef = React.useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!active) return;
    if (loadedRef.current && rosterCache?.rows?.length) {
      loadRef.current(
        { start_date: rosterCache.startDate, end_date: rosterCache.endDate },
        { silent: true, period: rosterCache.period },
      );
      return;
    }
    const range = rangeForPeriod('today');
    loadRef.current(range, { period: 'today' });
  }, [active]);

  const clearPersonFilter = useCallback(() => {
    setFilterDraft('');
    setFilterSelected('');
  }, []);

  const personFilterOptions = useMemo(() => {
    const names =
      filterKind === 'reporting_manager'
        ? uniqueSortedNames(rows.map((r) => r.reporting_manager))
        : uniqueSortedNames(rows.map((r) => r.display_name));
    const q = filterDraft.trim().toLowerCase();
    if (!q) return names;
    return names.filter((n) => n.toLowerCase().includes(q));
  }, [rows, filterKind, filterDraft]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const personQ = filterSelected.trim().toLowerCase();
    return rows.filter((r) => {
      if (personQ) {
        const hay =
          filterKind === 'reporting_manager'
            ? (r.reporting_manager || '').toLowerCase()
            : r.display_name.toLowerCase();
        if (hay !== personQ) return false;
      }
      if (!q) return true;
      const hay = `${r.display_name} ${r.employee_code} ${r.email || ''} ${r.role || ''} ${r.date || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery, filterKind, filterSelected]);

  const { totalCount, presentCount, halfDayCount, absentCount } = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    for (const r of rows) {
      if (r.status === 'Present') present += 1;
      else if (r.status === 'Half Day') halfDay += 1;
      else absent += 1;
    }
    return {
      totalCount: rows.length,
      presentCount: present,
      halfDayCount: halfDay,
      absentCount: absent,
    };
  }, [rows]);

  const renderItem = useCallback(
    ({ item }: { item: AttendanceStatusRow }) => (
      <AttendanceRow item={item} stackRows={layout.stackRows} />
    ),
    [layout.stackRows],
  );

  const exportCsv = async () => {
    if (!filteredRows.length) {
      setMessage('Nothing to export');
      return;
    }
    const header = 'Date,Employee,Code,Email,Role,Clock In,Clock Out,Status,Reporting Manager,BU Owner';
    const lines = filteredRows.map((r) =>
      [
        csvEscape(r.date || startDate),
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
        title: `Attendance ${rangeLabel}`,
        message: csv,
      });
      setMessage(`Exported ${filteredRows.length} row${filteredRows.length === 1 ? '' : 's'}`);
    } catch (err) {
      if (err instanceof Error && /share.*cancel|dismiss/i.test(err.message)) return;
      setMessage(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const filterActive = !!filterSelected.trim();
  const filterPlaceholder =
    filterKind === 'reporting_manager' ? 'Search reporting manager…' : 'Search employee…';

  const onPeriodChange = (next: AttendancePeriod) => {
    if (next === period) return;
    const range = rangeForPeriod(next);
    setPeriod(next);
    setStartDate(range.start_date);
    setEndDate(range.end_date);
    load(range, { period: next });
  };

  return (
    <View
      style={[styles.root, { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth }]}
    >
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.meta}>
        Times in {timezone} for {rangeLabel}. Present when Clock In and Clock Out both exist
        (any duration); Absent otherwise.
      </Text>

      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{totalCount}</Text>
          <Text style={styles.kpiLabel}>Total Rows</Text>
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
          style={[styles.actionBtn, styles.filterTrigger, (showFilter || filterActive) && styles.actionBtnOn]}
        >
          <Text
            style={[
              styles.actionBtnText,
              styles.filterTriggerLabel,
              (showFilter || filterActive) && styles.actionBtnTextOn,
            ]}
            numberOfLines={1}
          >
            {filterActive ? filterSelected.trim() : 'Filter'}
          </Text>
          <View style={styles.filterChevronWrap} pointerEvents="none">
            <Text style={[styles.filterChevron, (showFilter || filterActive) && styles.actionBtnTextOn]}>
              {showFilter ? '▴' : '▾'}
            </Text>
          </View>
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
        <View style={styles.filterPanel}>
          <View style={styles.filterRow}>
            {PERSON_FILTER_KINDS.map((opt) => {
              const on = filterKind === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    if (filterKind === opt.id) return;
                    setFilterKind(opt.id);
                    clearPersonFilter();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.filterChip, on && styles.filterChipOn]}
                >
                  <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.filterInputRow}>
            <TextInput
              value={filterDraft}
              onChangeText={setFilterDraft}
              placeholder={filterPlaceholder}
              placeholderTextColor={THEME.textSubtle}
              style={styles.filterInput}
              autoCapitalize="words"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              accessibilityLabel={filterPlaceholder}
            />
            {(filterActive || !!filterDraft.trim()) && (
              <Pressable
                onPress={clearPersonFilter}
                accessibilityRole="button"
                accessibilityLabel="Clear filter"
                style={styles.filterClearBtn}
              >
                <Text style={styles.filterClearText}>Clear</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            style={styles.filterDropdown}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {personFilterOptions.length ? (
              personFilterOptions.map((name) => {
                const on = filterSelected.trim().toLowerCase() === name.toLowerCase();
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      setFilterSelected(name);
                      setFilterDraft(name);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.filterOption, on && styles.filterOptionOn]}
                  >
                    <Text style={[styles.filterOptionText, on && styles.filterOptionTextOn]} numberOfLines={1}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.filterEmpty}>No matches</Text>
            )}
          </ScrollView>
        </View>
      )}

      <View style={styles.periodRow}>
        <Text style={styles.periodCaption}>Attendance Period</Text>
        <PeriodDropdown value={period} onChange={onPeriodChange} />
      </View>

      {!layout.stackRows && (
        <View style={styles.head}>
          <Text style={[styles.headText, styles.colDate]}>Date</Text>
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
        keyExtractor={(item) => `${item.date || startDate}-${item.employee_id}`}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={() => {
              const range = rangeForPeriod(period);
              load(range, { period });
            }}
            tintColor={THEME.cyan}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {busy ? 'Loading attendance…' : 'No employees found'}
          </Text>
        }
        contentContainerStyle={styles.listContent}
        indicatorStyle="white"
        persistentScrollbar={false}
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        renderItem={renderItem}
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
  filterTrigger: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  filterTriggerLabel: {
    width: '100%',
    textAlign: 'center',
  },
  filterChevronWrap: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChevron: {
    color: THEME.cyanLight,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
  },
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
  filterPanel: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipOn: {
    borderColor: 'rgba(6, 182, 212, 0.5)',
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
  },
  filterChipText: { color: THEME.textMuted, fontWeight: '800', fontSize: 12 },
  filterChipTextOn: { color: '#fff' },
  filterInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterInput: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  filterClearBtn: {
    minHeight: TAP_TARGET - 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  filterClearText: { color: THEME.cyanLight, fontWeight: '800', fontSize: 12 },
  filterDropdown: {
    maxHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  filterOption: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  filterOptionOn: { backgroundColor: 'rgba(6, 182, 212, 0.18)' },
  filterOptionText: { color: THEME.textSecondary, fontWeight: '700', fontSize: 14 },
  filterOptionTextOn: { color: '#fff' },
  filterEmpty: {
    color: THEME.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
    fontWeight: '600',
  },
  periodRow: { marginBottom: 14 },
  periodCaption: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  periodField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  periodFieldText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  periodChevron: { color: THEME.cyan, fontWeight: '800', fontSize: 14 },
  periodBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  periodMenu: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: THEME.cardSolid,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
  },
  periodOption: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
  },
  periodOptionOn: { backgroundColor: 'rgba(6, 182, 212, 0.18)' },
  periodOptionText: { color: THEME.textSecondary, fontWeight: '700', fontSize: 15 },
  periodOptionTextOn: { color: '#fff' },
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
  colName: { flex: 1.2, paddingRight: 6 },
  colOrg: { flex: 1, paddingRight: 4 },
  colDate: { flex: 0.95, paddingRight: 4 },
  colTime: { flex: 0.7 },
  colStatus: { width: 92, alignItems: 'flex-end' },
  rowDate: { color: THEME.cyan, fontSize: 12, fontWeight: '800', marginBottom: 4 },
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


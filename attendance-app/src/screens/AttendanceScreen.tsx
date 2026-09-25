import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
/** Fixed periods plus `month-YYYY-MM` for prior months in the current IST year. */
type AttendancePeriod = string;

type PeriodOption = { id: AttendancePeriod; label: string };

const FIXED_ATTENDANCE_PERIODS: PeriodOption[] = [
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'This Week' },
  { id: 'previous_week', label: 'Previous Week' },
  { id: 'monthly', label: 'This Month' },
];

function monthPeriodId(year: number, month1to12: number): AttendancePeriod {
  return `month-${year}-${String(month1to12).padStart(2, '0')}`;
}

function parseMonthPeriod(period: AttendancePeriod): { year: number; month: number } | null {
  const match = /^month-(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function buildAttendancePeriods(): PeriodOption[] {
  const today = todayIst();
  const [y, m] = today.split('-').map(Number);
  const periods: PeriodOption[] = [...FIXED_ATTENDANCE_PERIODS];
  // Prior months in the current IST year, newest first (e.g. August … January).
  for (let month = (m || 1) - 1; month >= 1; month--) {
    periods.push({
      id: monthPeriodId(y, month),
      label: new Date(Date.UTC(y, month - 1, 1)).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    });
  }
  return periods;
}

function isValidPeriod(period: AttendancePeriod): boolean {
  return buildAttendancePeriods().some((p) => p.id === period);
}

const PERSON_FILTER_KINDS: Array<{ id: PersonFilterKind; label: string }> = [
  { id: 'reporting_manager', label: 'Reporting Manager' },
  { id: 'employee', label: 'Employee' },
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

function formatPunchShort(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayHeader(ymd: string): { day: string; weekday: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return { day: ymd || '—', weekday: '' };
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    day: String(d).padStart(2, '0'),
    weekday: dt.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
  };
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  if (!start) return out;
  const e = end || start;
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = e.split('-').map(Number);
  if (!ys || !ms || !ds || !ye || !me || !de) return out;
  const cur = new Date(Date.UTC(ys, ms - 1, ds));
  const last = new Date(Date.UTC(ye, me - 1, de));
  while (cur <= last) {
    out.push(toYmd(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

type DayPunch = { clock_in: string | null; clock_out: string | null };

type EmployeeMatrixRow = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  email: string | null;
  role: string | null;
  reporting_manager: string | null;
  bu_owner: string | null;
  days: Record<string, DayPunch>;
};

function pivotRoster(rows: AttendanceStatusRow[]): EmployeeMatrixRow[] {
  const byEmp = new Map<string, EmployeeMatrixRow>();
  for (const r of rows) {
    let emp = byEmp.get(r.employee_id);
    if (!emp) {
      emp = {
        employee_id: r.employee_id,
        employee_code: r.employee_code,
        display_name: r.display_name,
        email: r.email,
        role: r.role,
        reporting_manager: r.reporting_manager,
        bu_owner: r.bu_owner,
        days: {},
      };
      byEmp.set(r.employee_id, emp);
    }
    if (r.date) {
      emp.days[r.date] = { clock_in: r.clock_in, clock_out: r.clock_out };
    }
  }
  return Array.from(byEmp.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }),
  );
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

  if (period === 'weekly' || period === 'previous_week') {
    const dow = todayUtc.getUTCDay(); // 0 = Sunday
    const daysFromMonday = (dow + 6) % 7;
    const monday = new Date(todayUtc);
    monday.setUTCDate(todayUtc.getUTCDate() - daysFromMonday);
    if (period === 'previous_week') {
      monday.setUTCDate(monday.getUTCDate() - 7);
    }
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      start_date: toYmd(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
      end_date: toYmd(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()),
    };
  }

  const monthParts = parseMonthPeriod(period);
  if (monthParts) {
    const lastDay = new Date(Date.UTC(monthParts.year, monthParts.month, 0)).getUTCDate();
    return {
      start_date: toYmd(monthParts.year, monthParts.month - 1, 1),
      end_date: toYmd(monthParts.year, monthParts.month - 1, lastDay),
    };
  }

  // monthly (default) = current IST calendar month
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start_date: toYmd(y, m - 1, 1),
    end_date: toYmd(y, m - 1, lastDay),
  };
}

function periodLabel(period: AttendancePeriod) {
  return buildAttendancePeriods().find((p) => p.id === period)?.label || 'Today';
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
  const options = useMemo(() => buildAttendancePeriods(), [open]);

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
            <ScrollView style={styles.periodMenuScroll} bounces={false} keyboardShouldPersistTaps="handled">
              {options.map((opt) => {
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
            </ScrollView>
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

const DayPunchCell = React.memo(function DayPunchCell({ day }: { day?: DayPunch }) {
  const cin = formatPunchShort(day?.clock_in ?? null);
  const cout = formatPunchShort(day?.clock_out ?? null);
  return (
    <View style={styles.dayCell}>
      <View style={styles.dayTimeBlock}>
        <Text style={styles.dayTimeLabel}>In</Text>
        <Text style={[styles.dayTimeValue, cin === '—' && styles.dayTimeEmpty]} numberOfLines={1}>
          {cin}
        </Text>
      </View>
      <View style={styles.dayTimeBlock}>
        <Text style={styles.dayTimeLabel}>Out</Text>
        <Text
          style={[styles.dayTimeValue, styles.dayTimeOut, cout === '—' && styles.dayTimeEmpty]}
          numberOfLines={1}
        >
          {cout}
        </Text>
      </View>
    </View>
  );
});

const MatrixEmployeeCol = React.memo(function MatrixEmployeeCol({
  item,
  width,
}: {
  item: EmployeeMatrixRow;
  width: number;
}) {
  return (
    <View style={[styles.empCol, { width }]}>
      <Text style={styles.name} numberOfLines={2}>
        {item.display_name}
      </Text>
      <Text style={styles.code}>{item.employee_code}</Text>
      {!!item.email && (
        <Text style={styles.email} numberOfLines={1}>
          {item.email}
        </Text>
      )}
      {!!item.reporting_manager && (
        <Text style={styles.empMeta} numberOfLines={1}>
          RM: {item.reporting_manager}
        </Text>
      )}
      {!!item.bu_owner && (
        <Text style={styles.empMeta} numberOfLines={1}>
          BU: {item.bu_owner}
        </Text>
      )}
    </View>
  );
});

const MatrixRow = React.memo(function MatrixRow({
  item,
  dates,
  empWidth,
  dayWidth,
}: {
  item: EmployeeMatrixRow;
  dates: string[];
  empWidth: number;
  dayWidth: number;
}) {
  return (
    <View style={styles.matrixRow}>
      <MatrixEmployeeCol item={item} width={empWidth} />
      {dates.map((ymd) => (
        <View key={ymd} style={[styles.dayCol, { width: dayWidth }]}>
          <DayPunchCell day={item.days[ymd]} />
        </View>
      ))}
    </View>
  );
});

const MatrixHeader = React.memo(function MatrixHeader({
  dates,
  empWidth,
  dayWidth,
}: {
  dates: string[];
  empWidth: number;
  dayWidth: number;
}) {
  return (
    <View style={[styles.matrixRow, styles.matrixHead]}>
      <View style={[styles.empCol, { width: empWidth }]}>
        <Text style={styles.headText}>Employee</Text>
      </View>
      {dates.map((ymd) => {
        const h = formatDayHeader(ymd);
        return (
          <View key={ymd} style={[styles.dayCol, styles.dayHeadCol, { width: dayWidth }]}>
            <Text style={styles.dayHeadNum}>{h.day}</Text>
            <Text style={styles.dayHeadWd}>{h.weekday}</Text>
          </View>
        );
      })}
    </View>
  );
});

export function AttendanceScreen({ active = true }: { active?: boolean }) {
  const layout = useLayout();
  const cachedPeriod =
    rosterCache?.period && isValidPeriod(rosterCache.period) ? rosterCache.period : 'today';
  const initialRange = rosterCache && cachedPeriod === rosterCache.period
    ? { start_date: rosterCache.startDate, end_date: rosterCache.endDate }
    : rangeForPeriod(cachedPeriod);
  const [period, setPeriod] = useState<AttendancePeriod>(cachedPeriod);
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

  const empColWidth = layout.compact ? 132 : 168;
  const dayColWidth = layout.compact ? 78 : 88;

  const rangeLabel = useMemo(() => {
    const label = periodLabel(period);
    if (!startDate) return label.toLowerCase();
    if (!endDate || endDate === startDate) return `${label} (${startDate})`;
    return `${label} (${startDate} → ${endDate})`;
  }, [period, startDate, endDate]);

  const matrixDates = useMemo(() => enumerateDates(startDate, endDate), [startDate, endDate]);

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

  const matrixEmployees = useMemo(() => pivotRoster(filteredRows), [filteredRows]);

  const tableMinWidth = empColWidth + matrixDates.length * dayColWidth;

  const exportCsv = async () => {
    if (!filteredRows.length) {
      setMessage('Nothing to export');
      return;
    }
    const header = 'Date,Employee,Code,Email,Role,Clock In,Clock Out,Reporting Manager,BU Owner';
    const lines = filteredRows.map((r) =>
      [
        csvEscape(r.date || startDate),
        csvEscape(r.display_name),
        csvEscape(r.employee_code),
        csvEscape(r.email || ''),
        csvEscape(r.role || 'employee'),
        csvEscape(formatPunch(r.clock_in)),
        csvEscape(formatPunch(r.clock_out)),
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
        Clock In / Clock Out in {timezone} for {rangeLabel}.
      </Text>

      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{matrixEmployees.length}</Text>
          <Text style={styles.kpiLabel}>Employees</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{matrixDates.length}</Text>
          <Text style={styles.kpiLabel}>Days</Text>
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

      <ScrollView
        style={styles.matrixScroll}
        contentContainerStyle={styles.matrixScrollContent}
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
        nestedScrollEnabled
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.matrixHContent}
        >
          <View style={{ minWidth: Math.max(tableMinWidth, layout.width - layout.gutter * 2) }}>
            <MatrixHeader dates={matrixDates} empWidth={empColWidth} dayWidth={dayColWidth} />
            {matrixEmployees.length ? (
              matrixEmployees.map((item) => (
                <MatrixRow
                  key={item.employee_id}
                  item={item}
                  dates={matrixDates}
                  empWidth={empColWidth}
                  dayWidth={dayColWidth}
                />
              ))
            ) : (
              <Text style={styles.empty}>
                {busy ? 'Loading attendance…' : 'No employees found'}
              </Text>
            )}
          </View>
        </ScrollView>
      </ScrollView>
      {!!message && (
        <Text style={styles.status}>
          {/exported|unable|fail|nothing/i.test(message)
            ? message
            : `${matrixEmployees.length} employee${matrixEmployees.length === 1 ? '' : 's'}${
                matrixDates.length
                  ? ` · ${matrixDates.length} day${matrixDates.length === 1 ? '' : 's'}`
                  : ''
              }${filteredRows.length !== rows.length ? ' (filtered)' : ''}`}
        </Text>
      )}
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
    maxHeight: '70%',
    backgroundColor: THEME.cardSolid,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
  },
  periodMenuScroll: { maxHeight: 420 },
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
  matrixScroll: { flex: 1, marginHorizontal: -2 },
  matrixScrollContent: { paddingBottom: 16, flexGrow: 1 },
  matrixHContent: { paddingBottom: 4 },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  matrixHead: {
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  empCol: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
  },
  dayCol: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeadCol: { paddingVertical: 10 },
  dayHeadNum: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  dayHeadWd: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 2,
  },
  dayCell: { alignItems: 'center', gap: 6, minHeight: 52, justifyContent: 'center' },
  dayTimeBlock: { alignItems: 'center' },
  dayTimeLabel: {
    color: THEME.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  dayTimeValue: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayTimeOut: { color: THEME.textMuted },
  dayTimeEmpty: { color: 'rgba(148, 163, 184, 0.45)' },
  headText: { color: THEME.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  code: { color: THEME.cyan, fontSize: 12, fontWeight: '800', marginTop: 2 },
  name: { color: '#fff', fontWeight: '700', fontSize: 14 },
  email: { color: THEME.textMuted, fontSize: 11, marginTop: 2 },
  empMeta: { color: THEME.textMuted, fontSize: 11, marginTop: 2, fontWeight: '600' },
  empty: { color: THEME.textMuted, textAlign: 'center', marginTop: 24, fontSize: 15, paddingHorizontal: 16 },
  status: { color: THEME.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 14, fontWeight: '600' },
});


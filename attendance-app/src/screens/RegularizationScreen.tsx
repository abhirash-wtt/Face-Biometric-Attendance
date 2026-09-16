import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, WfhRequest } from '../services/api';
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

function formatDateLabel(ymd: string) {
  const raw = String(ymd || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return raw || 'Select date';
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
  minDate,
}: {
  value: string;
  onChange: (next: string) => void;
  minDate?: string;
}) {
  const layout = useLayout();
  const [open, setOpen] = useState(false);
  const selected = value || minDate || todayIst();
  const [viewYear, setViewYear] = useState(() => Number(selected.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(selected.slice(5, 7)) - 1);

  useEffect(() => {
    if (!open) return;
    setViewYear(Number(selected.slice(0, 4)));
    setViewMonth(Number(selected.slice(5, 7)) - 1);
  }, [open, selected]);

  const title = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
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
                const disabled = !!minDate && ymd < minDate;
                const on = ymd === selected;
                return (
                  <Pressable
                    key={ymd}
                    disabled={disabled}
                    onPress={() => {
                      onChange(ymd);
                      setOpen(false);
                    }}
                    style={[styles.calDay, on && styles.calDayOn, disabled && styles.calDayDisabled]}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        on && styles.calDayTextOn,
                        disabled && styles.calDayTextDisabled,
                      ]}
                    >
                      {day}
                    </Text>
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
    status === 'approved'
      ? styles.pillApproved
      : status === 'pending'
        ? styles.pillPending
        : status === 'rejected'
          ? styles.pillRejected
          : styles.pillCancelled;
  return (
    <View style={[styles.pill, tone]}>
      <Text style={styles.pillText}>{status}</Text>
    </View>
  );
}

export function RegularizationScreen({ role }: { role: 'admin' | 'user' | '' }) {
  const layout = useLayout();
  const earliest = todayIst();
  const [workDate, setWorkDate] = useState(earliest);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<WfhRequest[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const data = isAdmin ? await api.listWfhRequests() : await api.myWfhRequests();
      setRows(data || []);
      setMessage(`${(data || []).length} request${(data || []).length === 1 ? '' : 's'}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load WFH requests');
    } finally {
      setBusy(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    try {
      setBusy(true);
      await api.createWfhRequest({ work_date: workDate, reason: reason.trim() });
      setReason('');
      setMessage('WFH request submitted');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, action: 'approve' | 'reject') => {
    try {
      setBusy(true);
      if (action === 'approve') await api.approveWfhRequest(id);
      else await api.rejectWfhRequest(id);
      setMessage(action === 'approve' ? 'Request approved' : 'Request rejected');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      setBusy(true);
      await api.cancelWfhRequest(id);
      setMessage('Request cancelled');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[styles.root, { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth }]}
    >
      <Text style={styles.title}>Regularize</Text>
      <Text style={styles.meta}>
        Request Work From Home for today or a future date. After admin approval, geofencing is skipped
        when clocking in/out on that date.
      </Text>

      {!isAdmin && (
        <View style={styles.form}>
          <Text style={styles.section}>New request</Text>
          <DatePickerField value={workDate} onChange={setWorkDate} minDate={earliest} />
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (required)"
            placeholderTextColor="#6d7f96"
            multiline
            style={styles.reason}
            accessibilityLabel="WFH reason"
          />
          <Pressable
            onPress={submit}
            disabled={busy || reason.trim().length < 3}
            accessibilityRole="button"
            style={[styles.btn, (busy || reason.trim().length < 3) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{busy ? '…' : 'Submit request'}</Text>
          </Pressable>
        </View>
      )}
      {isAdmin && (
        <Text style={styles.meta}>
          Employees submit from this Regularize tab after logging in with their employee account
          (Settings → Login). As admin you approve or reject pending requests below.
        </Text>
      )}

      <View style={styles.listHead}>
        <Text style={styles.section}>{isAdmin ? 'All requests' : 'My requests'}</Text>
        <Pressable onPress={load} accessibilityRole="button" style={styles.refresh}>
          <Text style={styles.refreshText}>{busy ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor="#7ee0c5" />}
        ListEmptyComponent={<Text style={styles.empty}>No WFH requests yet</Text>}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const workDateLabel = formatDateLabel(String(item.work_date).slice(0, 10));
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardWho}>
                  <Text style={styles.dateTitle}>{workDateLabel}</Text>
                  {!!item.employee && (
                    <Text style={styles.name}>
                      {item.employee.display_name} ({item.employee.code})
                    </Text>
                  )}
                  <Text style={styles.reasonText}>{item.reason}</Text>
                  {!!item.review_note && (
                    <Text style={styles.note}>Note: {item.review_note}</Text>
                  )}
                </View>
                <StatusPill status={item.status} />
              </View>
              {item.status === 'pending' && isAdmin && (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => review(item.id, 'approve')}
                    style={[styles.actionBtn, styles.approve]}
                  >
                    <Text style={styles.btnText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => review(item.id, 'reject')}
                    style={[styles.actionBtn, styles.reject]}
                  >
                    <Text style={styles.btnText}>Reject</Text>
                  </Pressable>
                </View>
              )}
              {item.status === 'pending' && !isAdmin && (
                <Pressable onPress={() => cancel(item.id)} style={[styles.actionBtn, styles.cancel]}>
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      {!!message && <Text style={styles.status}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: '#07111f', paddingVertical: 16 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  meta: { color: '#9fb0c8', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  form: { marginBottom: 16 },
  section: { color: '#7ee0c5', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  dateLabel: { flex: 1, color: '#f4f7fb', fontSize: 16, fontWeight: '700' },
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
  calTitle: { flex: 1, textAlign: 'center', color: '#f4f7fb', fontSize: 16, fontWeight: '800' },
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
  calDow: {
    width: '14.28%',
    textAlign: 'center',
    color: '#9fb0c8',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 6,
  },
  calDay: {
    width: '14.28%',
    minHeight: 40,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calDayOn: { backgroundColor: '#1f8a70' },
  calDayDisabled: { opacity: 0.35 },
  calDayText: { color: '#f4f7fb', fontSize: 16, fontWeight: '700' },
  calDayTextOn: { color: '#fff' },
  calDayTextDisabled: { color: '#6d7f96' },
  reason: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    color: '#f4f7fb',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  btn: {
    minHeight: TAP_TARGET,
    backgroundColor: '#2d6cdf',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  refresh: {
    minHeight: TAP_TARGET,
    backgroundColor: '#2d6cdf',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  listContent: { paddingBottom: 12 },
  card: {
    backgroundColor: '#102038',
    borderWidth: 1,
    borderColor: '#22344f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardWho: { flex: 1 },
  dateTitle: { color: '#f4f7fb', fontWeight: '800', fontSize: 16 },
  name: { color: '#7ee0c5', fontSize: 14, fontWeight: '700', marginTop: 4 },
  reasonText: { color: '#c5d2e4', fontSize: 15, marginTop: 8, lineHeight: 21 },
  note: { color: '#9fb0c8', fontSize: 14, marginTop: 6, fontStyle: 'italic' },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { fontSize: 13, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  pillApproved: { backgroundColor: '#1f8a70' },
  pillPending: { backgroundColor: '#2d6cdf' },
  pillRejected: { backgroundColor: '#a33b3b' },
  pillCancelled: { backgroundColor: '#3a4a63' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approve: { backgroundColor: '#1f8a70' },
  reject: { backgroundColor: '#a33b3b' },
  cancel: { backgroundColor: '#3a4a63', marginTop: 12 },
  empty: { color: '#9fb0c8', textAlign: 'center', marginTop: 24, fontSize: 15 },
  status: { color: '#c5d2e4', textAlign: 'center', marginTop: 12, fontSize: 15 },
});

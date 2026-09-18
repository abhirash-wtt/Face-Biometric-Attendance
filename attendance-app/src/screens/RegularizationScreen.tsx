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
import { api, RegularizationRequestType, WfhRequest } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

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
  maxDate,
}: {
  value: string;
  onChange: (next: string) => void;
  minDate?: string;
  maxDate?: string;
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
                const disabled =
                  (!!minDate && ymd < minDate) || (!!maxDate && ymd > maxDate);
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
      <Text style={styles.pillText}>{status.toUpperCase()}</Text>
    </View>
  );
}

function typeLabel(type?: RegularizationRequestType) {
  return type === 'mark_present' ? 'On Duty' : 'Work From Home';
}

export function RegularizationScreen({ role }: { role: 'admin' | 'user' | '' }) {
  const layout = useLayout();
  const today = todayIst();
  const [requestType, setRequestType] = useState<RegularizationRequestType>('wfh');
  const [workDate, setWorkDate] = useState(today);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<WfhRequest[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = role === 'admin';
  const isPresentRequest = requestType === 'mark_present';

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const data = isAdmin ? await api.listWfhRequests() : await api.myWfhRequests();
      setRows(data || []);
      setMessage(`${(data || []).length} request${(data || []).length === 1 ? '' : 's'}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load requests');
    } finally {
      setBusy(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    try {
      if (!reason.trim()) {
        setMessage('Reason is required');
        return;
      }
      setBusy(true);
      await api.createWfhRequest({
        work_date: workDate,
        reason: reason.trim(),
        request_type: requestType,
      });
      setReason('');
      setMessage(isPresentRequest ? 'On Duty request submitted' : 'WFH request submitted');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const approve = async (id: string) => {
    try {
      setBusy(true);
      await api.approveWfhRequest(id);
      setMessage('Request approved');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (id: string) => {
    try {
      setBusy(true);
      await api.rejectWfhRequest(id);
      setMessage('Request rejected');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reject failed');
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

  const selectType = (next: RegularizationRequestType) => {
    setRequestType(next);
    const now = todayIst();
    if (next === 'wfh' && workDate < now) setWorkDate(now);
    if (next === 'mark_present' && workDate > now) setWorkDate(now);
  };

  const renderForm = !isAdmin;

  return (
    <View
      style={[styles.root, { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth }]}
    >
      <Text style={styles.title}>Regularize</Text>
      <Text style={styles.meta}>
        Request Work From Home, or ask admin to mark you On Duty if you forgot to clock in or out.
        Approved On Duty requests leave Clock In and Clock Out blank.
      </Text>
      {renderForm && (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>New Request</Text>
          <Text style={styles.label}>Request Type</Text>
          <View style={styles.typeRow}>
            <Pressable
              onPress={() => selectType('mark_present')}
              accessibilityRole="button"
              style={[styles.typeBtn, isPresentRequest && styles.typeBtnOn]}
            >
              <Text style={[styles.typeBtnText, isPresentRequest && styles.typeBtnTextOn]}>
                On Duty
              </Text>
            </Pressable>
            <Pressable
              onPress={() => selectType('wfh')}
              accessibilityRole="button"
              style={[styles.typeBtn, !isPresentRequest && styles.typeBtnOn]}
            >
              <Text style={[styles.typeBtnText, !isPresentRequest && styles.typeBtnTextOn]}>
                Work From Home
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            {isPresentRequest
              ? 'Use this if you forgot Clock In and/or Clock Out. Admin approval marks you Present without filling punch times.'
              : 'Approved WFH dates skip geofencing when you clock in or out.'}
          </Text>
          <Text style={styles.label}>{isPresentRequest ? 'Attendance Date' : 'WFH Date'}</Text>
          <DatePickerField
            value={workDate}
            onChange={setWorkDate}
            minDate={isPresentRequest ? undefined : today}
            maxDate={isPresentRequest ? today : undefined}
          />
          <Text style={styles.label}>Reason</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={
              isPresentRequest
                ? 'Why you missed clock in/out (required)'
                : 'Describe reason (required)'
            }
            placeholderTextColor={THEME.textSubtle}
            multiline
            numberOfLines={3}
            style={styles.reason}
          />
          <Pressable
            disabled={busy || !reason.trim()}
            onPress={submit}
            accessibilityRole="button"
            style={[styles.btn, (busy || !reason.trim()) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{busy ? 'Submitting…' : 'Submit Request'}</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.toolbar}>
        <Text style={styles.listTitle}>{isAdmin ? 'Pending & All Requests' : 'My Requests'}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={THEME.cyan} />}
        ListEmptyComponent={<Text style={styles.empty}>No requests yet</Text>}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const who = item.employee
            ? `${item.employee.display_name} (${item.employee.code})`
            : '';
          const isPending = item.status === 'pending';
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardWho}>
                  <Text style={styles.kind}>{typeLabel(item.request_type)}</Text>
                  <Text style={styles.dateTitle}>{formatDateLabel(item.work_date)}</Text>
                  {!!who && <Text style={styles.name}>{who}</Text>}
                  <Text style={styles.reasonText}>{item.reason}</Text>
                  {!!item.review_note && (
                    <Text style={styles.note}>Note: {item.review_note}</Text>
                  )}
                </View>
                <StatusPill status={item.status} />
              </View>
              {isPending && isAdmin && (
                <View style={styles.actions}>
                  <Pressable
                    disabled={busy}
                    onPress={() => approve(item.id)}
                    accessibilityRole="button"
                    style={[styles.actionBtn, styles.approve]}
                  >
                    <Text style={styles.btnText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => reject(item.id)}
                    accessibilityRole="button"
                    style={[styles.actionBtn, styles.reject]}
                  >
                    <Text style={styles.btnText}>Reject</Text>
                  </Pressable>
                </View>
              )}
              {isPending && !isAdmin && (
                <Pressable
                  disabled={busy}
                  onPress={() => cancel(item.id)}
                  accessibilityRole="button"
                  style={[styles.actionBtn, styles.cancel]}
                >
                  <Text style={styles.btnText}>Cancel Request</Text>
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
  root: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: THEME.bg, paddingVertical: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4, letterSpacing: -0.2 },
  meta: { color: THEME.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  formCard: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: THEME.cyan, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeBtn: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  typeBtnOn: { backgroundColor: THEME.cyan, borderColor: THEME.cyan },
  typeBtnText: { color: THEME.textMuted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  typeBtnTextOn: { color: '#fff' },
  hint: { color: THEME.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  label: { color: THEME.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  listTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dateField: {
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
    marginBottom: 10,
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
  calTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: '800' },
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
  calDow: {
    width: '14.28%',
    textAlign: 'center',
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '800',
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
  calDayOn: { backgroundColor: THEME.cyan },
  calDayDisabled: { opacity: 0.3 },
  calDayText: { color: THEME.textSecondary, fontSize: 14, fontWeight: '700' },
  calDayTextOn: { color: '#fff', fontWeight: '800' },
  calDayTextDisabled: { color: THEME.textSubtle },
  reason: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    marginBottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  btn: {
    minHeight: TAP_TARGET,
    backgroundColor: THEME.cyan,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  listContent: { paddingBottom: 16 },
  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardWho: { flex: 1 },
  kind: {
    color: THEME.cyan,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  name: { color: THEME.cyan, fontSize: 13, fontWeight: '700', marginTop: 4 },
  reasonText: { color: THEME.textSecondary, fontSize: 14, marginTop: 6, lineHeight: 20 },
  note: { color: THEME.textMuted, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pillApproved: { backgroundColor: THEME.presentBg, borderColor: THEME.presentBorder, color: THEME.presentText },
  pillPending: { backgroundColor: THEME.pendingBg, borderColor: THEME.pendingBorder, color: THEME.pendingText },
  pillRejected: { backgroundColor: THEME.rejectedBg, borderColor: THEME.rejectedBorder, color: THEME.rejectedText },
  pillCancelled: { backgroundColor: THEME.absentBg, borderColor: THEME.absentBorder, color: THEME.absentText },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approve: { backgroundColor: THEME.emerald },
  reject: { backgroundColor: THEME.rose },
  cancel: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: THEME.border, marginTop: 12 },
  empty: { color: THEME.textMuted, textAlign: 'center', marginTop: 24, fontSize: 15 },
  status: { color: THEME.textSecondary, textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '600' },
});

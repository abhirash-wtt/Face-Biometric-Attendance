import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api, Employee, EnrollPose, EnrollmentSample, EnrollmentStatus, WorkingMode } from '../services/api';
import { storage } from '../services/storage';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

const WORKING_MODE_OPTIONS: Array<{ value: WorkingMode; label: string }> = [
  { value: 'onsite', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
];

const POSES: Array<{ id: EnrollPose; label: string; prompt: string }> = [
  { id: 'straight', label: 'Straight', prompt: 'Look straight at the camera' },
  { id: 'left', label: 'Left', prompt: 'Turn your head left, then hold still' },
  { id: 'right', label: 'Right', prompt: 'Turn your head right, then hold still' },
];

function posePhrase(pose: EnrollPose) {
  if (pose === 'left') return 'looking left';
  if (pose === 'right') return 'looking right';
  return 'looking straight';
}

function statusMessage(res: EnrollmentStatus | null, name?: string) {
  if (!res) return 'Capture looking straight, left, and right to complete enrollment.';
  if (res.enrollment_complete) {
    return `Enrollment complete${name ? ` for ${name}` : ''}. Clock-in is enabled.`;
  }
  const missing = (res.missing_poses || []).map(posePhrase);
  return `Enrollment incomplete. Still need: ${missing.join(', ') || 'straight, left, right'}.`;
}

function resolveMediaUrl(apiBase: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${apiBase.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

function previewSamples(enrollment: EnrollmentStatus | null): EnrollmentSample[] {
  const samples = enrollment?.samples || [];
  return POSES.map((pose) => {
    const match = samples.find((s) => s.pose === pose.id && s.image_url);
    return match || null;
  }).filter((s): s is EnrollmentSample => !!s);
}

export function EnrollScreen({ active = true }: { active?: boolean }) {
  const layout = useLayout();
  const [q, setQ] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentStatus | null>(null);
  const [enrollPose, setEnrollPose] = useState<EnrollPose>('straight');
  const [message, setMessage] = useState(
    'Select an employee, then capture looking straight, left, and right.',
  );
  const [busy, setBusy] = useState(false);
  const [modeBusyId, setModeBusyId] = useState<string | null>(null);
  const [modeMenuFor, setModeMenuFor] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Array<{ pose: EnrollPose | string; uri: string; label: string }>>([]);
  const captureRef = React.useRef<() => Promise<string>>(async () => {
    throw new Error('Camera is still starting. Wait for the preview, then try again.');
  });
  const [cameraReady, setCameraReady] = useState(false);

  const onCameraReady = useCallback((capture: () => Promise<string>) => {
    captureRef.current = capture;
    setCameraReady(true);
  }, []);

  useEffect(() => {
    if (!active) setCameraReady(false);
  }, [active]);

  const applyEnrollment = (res: EnrollmentStatus | null, autoPose = true) => {
    setEnrollment(res);
    const missing = res?.missing_poses || [];
    if (autoPose && missing.length) setEnrollPose(missing[0]);
  };

  const loadEnrollment = async (employee: Employee, autoPose = true) => {
    const res = await api.enrollmentStatus(employee.id);
    applyEnrollment(res, autoPose);
    setMessage(statusMessage(res, employee.display_name));
    return res;
  };

  const load = async () => {
    try {
      setEmployees(await api.employees(q || undefined));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load employees');
    }
  };

  useEffect(() => {
    (async () => {
      const token = await storage.getToken();
      // Only true admins get the multi-employee enroll UI; BU enrolls like an employee.
      const admin = storage.canEnrollAnyEmployee(storage.roleFromToken(token));
      setIsAdmin(admin);
      if (admin) {
        load();
        return;
      }
      const employeeId = storage.employeeIdFromToken(token);
      if (!employeeId) {
        setMessage('This login is not linked to an employee.');
        return;
      }
      const self: Employee = {
        id: employeeId,
        code: '',
        display_name: 'Your face',
        status: 'active',
      };
      setSelected(self);
      try {
        await loadEnrollment(self);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to load enrollment status');
      }
    })();
  }, []);

  const setWorkingMode = async (item: Employee, working_mode: WorkingMode) => {
    const current = item.working_mode || 'onsite';
    if (current === working_mode || modeBusyId === item.id) {
      setModeMenuFor(null);
      return;
    }
    try {
      setModeBusyId(item.id);
      setModeMenuFor(null);
      const updated = await api.updateEmployee(item.id, { working_mode });
      setEmployees((prev) => prev.map((e) => (e.id === item.id ? { ...e, ...updated } : e)));
      setSelected((prev) => (prev?.id === item.id ? { ...prev, ...updated } : prev));
      setMessage(
        `${updated.display_name}: Working Mode set to ${
          working_mode === 'remote' ? 'Remote' : 'On-site'
        }`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update working mode');
    } finally {
      setModeBusyId(null);
    }
  };

  const resetSamples = async () => {
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    try {
      setBusy(true);
      const res = await api.resetEnroll(selected.id);
      applyEnrollment(res);
      setMessage(
        res.templates_removed
          ? `Reset ${res.templates_removed} sample(s) for ${selected.display_name}. Capture looking straight, left, and right again.`
          : `No samples to reset for ${selected.display_name}. Capture looking straight, left, and right.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
      setResetConfirm(false);
    }
  };

  const captureSample = async () => {
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    try {
      setBusy(true);
      const image_b64 = await captureRef.current();
      const wasComplete = !!enrollment?.enrollment_complete;
      const res = await api.enroll(selected.id, image_b64, 0.95, enrollPose);
      applyEnrollment(res);
      setMessage(`Saved ${posePhrase(enrollPose)} sample. ${statusMessage(res, selected.display_name)}`);
      if (res.enrollment_complete && !wasComplete) setConfirm(true);
      if (isAdmin) load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Enroll failed');
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async () => {
    const samples = previewSamples(enrollment);
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    if (!samples.length) {
      setMessage('No saved face photos to preview yet. Capture at least one pose first (or recapture if samples are older).');
      return;
    }
    try {
      const settings = await storage.getSettings();
      setPreviewUrls(
        samples.map((sample) => ({
          pose: sample.pose || 'straight',
          label: POSES.find((p) => p.id === sample.pose)?.label || String(sample.pose || 'Sample'),
          uri: resolveMediaUrl(settings.apiBase, sample.image_url!),
        })),
      );
      setPreviewOpen(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to open preview');
    }
  };

  const twoColumn = layout.landscape && layout.short;

  const camera = (
    <View
      style={[
        styles.camera,
        twoColumn
          ? styles.cameraColumn
          : { minHeight: layout.short ? 140 : 180, maxHeight: layout.cameraHeight },
      ]}
    >
      <CameraView onReady={onCameraReady} isActive={active} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.inner,
          { padding: layout.gutter, maxWidth: layout.maxContentWidth },
          twoColumn && styles.innerRow,
        ]}
      >
        {twoColumn && camera}
        <View style={styles.controls}>
          <Text style={styles.title}>{isAdmin ? 'Enroll faces' : 'Enroll your face'}</Text>
          {isAdmin ? (
            <View style={styles.searchRow}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search code or name"
                placeholderTextColor={THEME.textSubtle}
                style={[styles.input, styles.searchInput]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={load}
              />
              <Pressable onPress={load} accessibilityRole="button" style={styles.searchBtn}>
                <Text style={styles.searchBtnText}>Search</Text>
              </Pressable>
            </View>
          ) : null}
          {isAdmin ? (
          <FlatList
            style={[styles.list, twoColumn ? styles.listFlexible : { maxHeight: layout.short ? 116 : 168 }]}
            data={employees}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            indicatorStyle="white"
            persistentScrollbar={false}
            ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
            renderItem={({ item }) => {
              const mode = item.working_mode || 'onsite';
              const modeLabel = mode === 'remote' ? 'Remote' : 'On-site';
              const modeDisabled = modeBusyId === item.id;
              const isSelected = selected?.id === item.id;
              const enrolled = !!item.enrollment_complete;
              return (
                <Pressable
                  onPress={() => {
                    setSelected(item);
                    loadEnrollment(item).catch((err) => {
                      setMessage(err instanceof Error ? err.message : 'Unable to load enrollment status');
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={[styles.row, isSelected && styles.rowOn]}
                >
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                  <View style={[styles.enrollPill, enrolled ? styles.enrollPillOn : styles.enrollPillOff]}>
                    <Text style={[styles.enrollPillText, enrolled ? styles.enrollPillTextOn : styles.enrollPillTextOff]}>
                      {enrolled ? 'Complete' : 'Incomplete'}
                    </Text>
                  </View>
                  <Pressable
                    disabled={modeDisabled}
                    onPress={() => setModeMenuFor(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Working Mode, ${modeLabel}`}
                    style={[styles.modeSelect, modeDisabled && styles.modeSelectBusy]}
                  >
                    <Text style={styles.modeSelectText}>{modeLabel}</Text>
                    <Text style={styles.modeChevron}>▾</Text>
                  </Pressable>
                </Pressable>
              );
            }}
          />
          ) : null}
          {selected ? (
            <View style={[styles.enrollBanner, enrollment?.enrollment_complete ? styles.enrollBannerOn : styles.enrollBannerOff]}>
              <Text style={[styles.enrollBannerText, enrollment?.enrollment_complete ? styles.enrollBannerTextOn : styles.enrollBannerTextOff]}>
                {enrollment?.enrollment_complete ? 'Enrollment complete' : 'Enrollment incomplete'}
              </Text>
            </View>
          ) : null}
          {selected ? (
            <View style={styles.poseRow}>
              {POSES.map((pose) => {
                const done = !!enrollment?.captured_poses?.includes(pose.id);
                const on = enrollPose === pose.id;
                return (
                  <Pressable
                    key={pose.id}
                    onPress={() => setEnrollPose(pose.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.poseChip, done && styles.poseChipDone, on && styles.poseChipOn]}
                  >
                    <Text style={[styles.poseChipText, (done || on) && styles.poseChipTextOn]}>{pose.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Text style={styles.prompt}>
            {selected ? POSES.find((p) => p.id === enrollPose)?.prompt : 'Select an employee to start enrollment'}
          </Text>
          {!twoColumn && camera}
          <Pressable
            disabled={busy || !selected || !cameraReady}
            onPress={captureSample}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaPrimary, (busy || !selected || !cameraReady) && styles.ctaBusy]}
          >
            <Text style={styles.ctaText}>
              {busy
                ? 'Saving…'
                : !cameraReady
                  ? 'Starting camera…'
                  : `${enrollment?.enrollment_complete ? 'Recapture' : 'Capture'} ${posePhrase(enrollPose)}`}
            </Text>
          </Pressable>
          <Pressable
            disabled={busy || !selected}
            onPress={openPreview}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaPreview, styles.ctaSpaced, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={[styles.ctaText, styles.ctaPreviewText]}>Preview face samples</Text>
          </Pressable>
          <Pressable
            disabled={busy || !selected}
            onPress={() => setResetConfirm(true)}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaReset, styles.ctaSpaced, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={[styles.ctaText, styles.ctaResetText]}>Reset face samples</Text>
          </Pressable>
          <Text style={styles.status} numberOfLines={3}>
            {message}
          </Text>
        </View>
      </View>
      <Modal
        visible={!!modeMenuFor}
        transparent
        animationType="fade"
        onRequestClose={() => setModeMenuFor(null)}
      >
        <Pressable style={styles.modeMenuBackdrop} onPress={() => setModeMenuFor(null)}>
          <View style={styles.modeMenuCard}>
            <Text style={styles.modeMenuTitle}>Working Mode</Text>
            {modeMenuFor ? (
              <Text style={styles.modeMenuSubtitle} numberOfLines={1}>
                {modeMenuFor.display_name}
              </Text>
            ) : null}
            {WORKING_MODE_OPTIONS.map((opt) => {
              const on = (modeMenuFor?.working_mode || 'onsite') === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => modeMenuFor && setWorkingMode(modeMenuFor, opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.modeMenuOption, on && styles.modeMenuOptionOn]}
                >
                  <Text style={[styles.modeMenuOptionText, on && styles.modeMenuOptionTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Face samples</Text>
            <Text style={styles.previewSubtitle} numberOfLines={1}>
              {selected?.display_name || 'Employee'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.previewRow}
            >
              {previewUrls.map((item) => (
                <View key={`${item.pose}-${item.uri}`} style={styles.previewItem}>
                  <Image source={{ uri: item.uri }} style={styles.previewImage} resizeMode="cover" />
                  <Text style={styles.previewLabel}>{item.label}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setPreviewOpen(false)}
              accessibilityRole="button"
              style={styles.previewClose}
            >
              <Text style={styles.previewCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ConfirmModal
        visible={confirm}
        title="Enrollment complete"
        message={`${selected?.display_name || 'This user'} now has looking straight, left, and right samples. Clock-in is enabled.`}
        confirmLabel="Done"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
      <ConfirmModal
        visible={resetConfirm}
        title="Reset face samples?"
        message={`This will delete all enrolled face samples for ${selected?.display_name || 'this user'}. They will need to capture looking straight, left, and right before clock-in works again.`}
        confirmLabel="Reset"
        onConfirm={resetSamples}
        onCancel={() => setResetConfirm(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  inner: { flex: 1, width: '100%', alignSelf: 'center' },
  innerRow: { flexDirection: 'row', gap: 12 },
  controls: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12, letterSpacing: -0.2 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
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
  searchInput: { flex: 1 },
  searchBtn: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: THEME.cyan, fontWeight: '800', fontSize: 14 },
  list: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  listFlexible: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 10,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowOn: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: THEME.cyan,
  },
  code: {
    color: THEME.cyan,
    width: 72,
    fontWeight: '800',
    fontSize: 13,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    textAlign: 'center',
  },
  name: { color: '#fff', flex: 1, minWidth: 0, fontWeight: '600', fontSize: 15 },
  modeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  modeSelectBusy: { opacity: 0.6 },
  modeSelectText: { color: THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  modeChevron: { color: THEME.textMuted, fontSize: 12, fontWeight: '700' },
  modeMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modeMenuCard: {
    backgroundColor: THEME.cardSolid,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
  },
  modeMenuTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modeMenuSubtitle: { color: THEME.textMuted, marginTop: 4, marginBottom: 12, fontSize: 14 },
  modeMenuOption: {
    minHeight: TAP_TARGET - 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  modeMenuOptionOn: { backgroundColor: THEME.emerald, borderColor: THEME.emerald },
  modeMenuOptionText: { color: THEME.textSecondary, fontWeight: '700', fontSize: 15 },
  modeMenuOptionTextOn: { color: '#fff' },
  empty: { color: THEME.textMuted, paddingVertical: 14, textAlign: 'center' },
  enrollPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  enrollPillOn: { backgroundColor: THEME.presentBg, borderColor: THEME.presentBorder },
  enrollPillOff: { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.35)' },
  enrollPillText: { fontSize: 11, fontWeight: '800' },
  enrollPillTextOn: { color: THEME.presentText },
  enrollPillTextOff: { color: THEME.amberLight },
  enrollBanner: {
    marginTop: 10,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  enrollBannerOn: { backgroundColor: THEME.presentBg, borderColor: THEME.presentBorder },
  enrollBannerOff: { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.35)' },
  enrollBannerText: { fontSize: 13, fontWeight: '800' },
  enrollBannerTextOn: { color: THEME.presentText },
  enrollBannerTextOff: { color: THEME.amberLight },
  poseRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  poseChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poseChipOn: { backgroundColor: 'rgba(6, 182, 212, 0.16)', borderColor: 'rgba(6, 182, 212, 0.45)' },
  poseChipDone: { borderColor: 'rgba(16, 185, 129, 0.45)' },
  poseChipText: { color: THEME.textMuted, fontWeight: '800', fontSize: 13 },
  poseChipTextOn: { color: '#fff' },
  prompt: { color: THEME.cyanLight, marginTop: 8, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  camera: { flex: 1, marginVertical: 10 },
  cameraColumn: { flex: 0.85, marginVertical: 0, minHeight: 0 },
  cta: {
    minHeight: TAP_TARGET + 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: THEME.cyan,
    shadowColor: THEME.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaPreview: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  ctaPreviewText: { color: THEME.cyanLight },
  ctaReset: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  ctaResetText: { color: THEME.rose },
  ctaBusy: { opacity: 0.55 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ctaSpaced: { marginTop: 8 },
  status: { color: THEME.textSecondary, marginTop: 10, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    backgroundColor: THEME.cardSolid,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
  },
  previewTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  previewSubtitle: { color: THEME.textMuted, marginTop: 4, marginBottom: 14, fontSize: 14 },
  previewRow: { gap: 12, paddingRight: 4 },
  previewItem: { width: 148, alignItems: 'center' },
  previewImage: {
    width: 148,
    height: 148,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  previewLabel: { color: THEME.textSecondary, marginTop: 8, fontWeight: '700', fontSize: 13 },
  previewClose: {
    marginTop: 16,
    minHeight: TAP_TARGET - 4,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: { color: THEME.cyan, fontWeight: '800', fontSize: 15 },
});

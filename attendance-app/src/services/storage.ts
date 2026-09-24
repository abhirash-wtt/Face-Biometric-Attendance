import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'access_token';
const SETTINGS_KEY = 'settings';
const QUEUE_KEY = 'offline_queue';

export type AppRole = 'admin' | 'employee' | 'bu' | 'manager' | 'hr' | '';

export type Settings = {
  apiBase: string;
  deviceId: string;
  siteCode: string;
  bootstrapSecret: string;
};

export type QueuedEvent = {
  id: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
};

const defaultSettings: Settings = {
  // Emulator loopback. On a physical phone, set Settings → API URL to http://<PC-LAN-IP>:3000
  apiBase: 'http://10.0.2.2:3000',
  deviceId: 'KIOSK-01',
  siteCode: 'HQ',
  bootstrapSecret: 'bind-device-once',
};

/** Roles with the same privileges as employee (own face / own clock-in only). */
const EMPLOYEE_LIKE_ROLES: ReadonlySet<string> = new Set(['employee', 'manager', 'hr']);

/** In-memory caches so attendance loads do not wait on AsyncStorage every time. */
let tokenCache: string | null | undefined;
let settingsCache: Settings | undefined;

export const storage = {
  async getToken() {
    if (tokenCache !== undefined) return tokenCache;
    tokenCache = await AsyncStorage.getItem(TOKEN_KEY);
    return tokenCache;
  },
  async setToken(token: string | null) {
    tokenCache = token;
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  },
  roleFromToken(token: string | null): AppRole {
    if (!token) return '';
    try {
      const part = token.split('.')[1];
      if (!part) return '';
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (payload.role === 'admin') return 'admin';
      if (payload.role === 'bu') return 'bu';
      if (payload.role === 'manager') return 'manager';
      if (payload.role === 'hr') return 'hr';
      if (payload.role) return 'employee';
      return '';
    } catch {
      return '';
    }
  },
  /** Admin and BU share management privileges (devices, regularization review). */
  isAdminLike(role: AppRole | string | null | undefined): boolean {
    return role === 'admin' || role === 'bu';
  },
  /** Employee, manager, and HR share the same non-management privileges (except attendance). */
  isEmployeeLike(role: AppRole | string | null | undefined): boolean {
    return !!role && EMPLOYEE_LIKE_ROLES.has(role);
  },
  /** Roster / attendance reports: admin, BU, manager, and HR. */
  canAccessAttendance(role: AppRole | string | null | undefined): boolean {
    return role === 'admin' || role === 'bu' || role === 'manager' || role === 'hr';
  },
  /** Only true admins may enroll any employee; BU is limited to their own face. */
  canEnrollAnyEmployee(role: AppRole | string | null | undefined): boolean {
    return role === 'admin';
  },
  employeeIdFromToken(token: string | null): string {
    if (!token) return '';
    try {
      const part = token.split('.')[1];
      if (!part) return '';
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return typeof payload.employee_id === 'string' ? payload.employee_id : '';
    } catch {
      return '';
    }
  },
  /** True for human logins (admin/employee/bu/manager/hr accounts), false for kiosk device tokens. */
  isAccountToken(token: string | null): boolean {
    if (!token) return false;
    try {
      const part = token.split('.')[1];
      if (!part) return false;
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return payload.type !== 'device';
    } catch {
      return false;
    }
  },
  async getRole(): Promise<AppRole> {
    return this.roleFromToken(await this.getToken());
  },
  async canEnroll(): Promise<boolean> {
    const token = await this.getToken();
    if (!this.isAccountToken(token)) return false;
    const role = this.roleFromToken(token);
    if (this.canEnrollAnyEmployee(role)) return true;
    // Employee, manager, HR, and BU get the Enroll tab (own face when linked).
    return this.isEmployeeLike(role) || role === 'bu';
  },
  async canUseRegularization(): Promise<boolean> {
    const token = await this.getToken();
    return this.isAccountToken(token) && !!this.roleFromToken(token);
  },
  /** Single AsyncStorage read for role + capability flags (used on app start / auth change). */
  async getAccessSnapshot() {
    const token = await this.getToken();
    const role = this.roleFromToken(token);
    const account = this.isAccountToken(token);
    return {
      role,
      canWfh: account && !!role,
      canEnroll:
        account &&
        (this.canEnrollAnyEmployee(role) || this.isEmployeeLike(role) || role === 'bu'),
      canAttendance: this.canAccessAttendance(role),
      adminLike: this.isAdminLike(role),
    };
  },
  async getSettings(): Promise<Settings> {
    if (settingsCache) return settingsCache;
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    settingsCache = raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    return settingsCache;
  },
  async setSettings(settings: Settings) {
    settingsCache = settings;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
  async getQueue(): Promise<QueuedEvent[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async enqueue(event: QueuedEvent) {
    const queue = await this.getQueue();
    const next = [...queue, event].slice(-50);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  },
  async setQueue(queue: QueuedEvent[]) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },
};

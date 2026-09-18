import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'access_token';
const SETTINGS_KEY = 'settings';
const QUEUE_KEY = 'offline_queue';

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
  apiBase: 'http://10.0.2.2:3000',
  deviceId: 'KIOSK-01',
  siteCode: 'HQ',
  bootstrapSecret: 'bind-device-once',
};

export const storage = {
  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },
  async setToken(token: string | null) {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  },
  roleFromToken(token: string | null): 'admin' | 'user' | '' {
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'admin') return 'admin';
      if (payload.role) return 'user';
      return '';
    } catch {
      return '';
    }
  },
  employeeIdFromToken(token: string | null): string {
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.employee_id === 'string' ? payload.employee_id : '';
    } catch {
      return '';
    }
  },
  /** True for human logins (admin/user accounts), false for kiosk device tokens. */
  isAccountToken(token: string | null): boolean {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.type !== 'device';
    } catch {
      return false;
    }
  },
  async getRole(): Promise<'admin' | 'user' | ''> {
    return this.roleFromToken(await this.getToken());
  },
  async canEnroll(): Promise<boolean> {
    const token = await this.getToken();
    if (!this.isAccountToken(token)) return false;
    const role = this.roleFromToken(token);
    if (role === 'admin') return true;
    return role === 'user' && !!this.employeeIdFromToken(token);
  },
  async canUseRegularization(): Promise<boolean> {
    const token = await this.getToken();
    return this.isAccountToken(token) && !!this.roleFromToken(token);
  },
  async getSettings(): Promise<Settings> {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  },
  async setSettings(settings: Settings) {
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

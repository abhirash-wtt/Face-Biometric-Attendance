import { storage, QueuedEvent } from './storage';

export type IdentifyResponse = {
  ok: boolean;
  reason?: string;
  employee_id?: string;
  employee_code?: string;
  name?: string;
  similarity: number;
  liveness: number;
  face_crop_url?: string;
  wfh_bypass?: boolean;
  remote_bypass?: boolean;
  thresholds?: { similarity: number; liveness: number };
  top?: Array<{ employee_id: string; display_name: string; cosine_sim: number }>;
};

export type WorkingMode = 'onsite' | 'remote';

export type Employee = {
  id: string;
  code: string;
  display_name: string;
  status: string;
  working_mode?: WorkingMode;
};

export type AttendanceStatusRow = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  email: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: 'Present' | 'Absent';
};

export type WfhRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type WfhRequest = {
  id: string;
  employee_id: string;
  work_date: string;
  reason: string;
  status: WfhRequestStatus;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  employee?: { code: string; display_name: string };
};

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    multipart?: FormData;
    json?: boolean;
  } = {},
): Promise<T> {
  const settings = await storage.getSettings();
  const token = options.token ?? (await storage.getToken());
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.multipart) {
    body = options.multipart as unknown as BodyInit;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${settings.apiBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string | string[] })?.message || res.statusText || 'Request failed';
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return data as T;
}

export const api = {
  request,
  login(email: string, password: string) {
    return request<{ access_token: string; user: { email: string; role: string; employee_id?: string } }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      token: null,
    });
  },
  registerDevice(payload: {
    device_id: string;
    site_code: string;
    bootstrap_secret: string;
    description?: string;
  }) {
    return request<{ access_token: string; device: { device_id: string } }>('/devices/register', {
      method: 'POST',
      body: payload,
    });
  },
  employees(q?: string) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<Employee[]>(`/employees${qs}`);
  },
  updateEmployee(
    id: string,
    payload: { working_mode?: WorkingMode; display_name?: string; status?: string },
  ) {
    return request<Employee>(`/employees/${id}`, { method: 'PATCH', body: payload });
  },
  identify(payload: {
    device_id: string;
    site_code: string;
    gps?: { lat: number; lng: number; accuracy?: number } | null;
    image_b64: string;
    liveness?: number;
  }) {
    return request<IdentifyResponse>('/attend/identify', { method: 'POST', body: payload });
  },
  attendance(payload: Record<string, unknown>) {
    return request('/attendance', { method: 'POST', body: payload });
  },
  attendanceStatus(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<{ date: string; timezone: string; employees: AttendanceStatusRow[] }>(
      `/attendance/status${qs}`,
    );
  },
  enroll(employeeId: string, imageB64: string, liveness?: number) {
    return request<{
      employee_id: string;
      employee_code: string;
      samples_added: number;
      total_templates: number;
      max_templates: number;
    }>('/enroll', {
      method: 'POST',
      body: { employee_id: employeeId, image_b64: imageB64, liveness_score: liveness },
    });
  },
  resetEnroll(employeeId: string) {
    return request<{
      employee_id: string;
      employee_code: string;
      templates_removed: number;
      total_templates: number;
      max_templates: number;
    }>(`/enroll/${employeeId}`, { method: 'DELETE' });
  },
  config() {
    return request<{
      similarity_threshold: number;
      liveness_threshold: number;
      liveness_prompts: string[];
    }>('/config');
  },
  createWfhRequest(payload: { work_date: string; reason: string; employee_id?: string }) {
    return request<WfhRequest>('/wfh-requests', { method: 'POST', body: payload });
  },
  myWfhRequests() {
    return request<WfhRequest[]>('/wfh-requests/mine');
  },
  listWfhRequests(status?: WfhRequestStatus) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<WfhRequest[]>(`/wfh-requests${qs}`);
  },
  approveWfhRequest(id: string, review_note?: string) {
    return request<WfhRequest>(`/wfh-requests/${id}/approve`, {
      method: 'POST',
      body: { review_note },
    });
  },
  rejectWfhRequest(id: string, review_note?: string) {
    return request<WfhRequest>(`/wfh-requests/${id}/reject`, {
      method: 'POST',
      body: { review_note },
    });
  },
  cancelWfhRequest(id: string) {
    return request<WfhRequest>(`/wfh-requests/${id}/cancel`, { method: 'POST', body: {} });
  },
  async flushQueue() {
    const queue = await storage.getQueue();
    const remain: QueuedEvent[] = [];
    for (const item of queue) {
      if (Date.now() - item.createdAt > 24 * 3600 * 1000) continue;
      try {
        await request(item.path, { method: 'POST', body: item.body });
      } catch {
        remain.push(item);
      }
    }
    await storage.setQueue(remain);
    return { flushed: queue.length - remain.length, remaining: remain.length };
  },
};

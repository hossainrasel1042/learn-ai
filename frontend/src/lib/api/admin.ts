

import { apiFetch } from '@/lib/api';

export type AdminRole = 'admin' | 'moderator';
export type AdminStatus = 'active' | 'suspended' | 'removed';

export const ADMIN_PERMISSIONS = [
  'can_manage_members',
  'can_manage_courses',
  'can_view_audit',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export interface AdminMember {
  id: string;
  userId: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  status: AdminStatus;
  createdBy: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminActivityRow {
  id: string;
  courseId: string;
  title: string;
  type: string;
  fileType: string;
  url: string;
  week: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditRow {
  id: string;
  memberId: string;
  event: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  rows: T[];
  total: number;
}





export async function loginAdmin(input: { email: string; password: string }): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>('/admin/auth/login', {
    method: 'POST',
    body: input,
  });
}

export async function logoutAdmin(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/admin/auth/logout', { method: 'POST' });
}

export async function forgotAdminPassword(input: { email: string }): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/admin/auth/forgot', {
    method: 'POST',
    body: input,
  });
}

export async function getAdminMe(): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>('/admin/me');
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/admin/auth/change-password', {
    method: 'POST',
    body: input,
  });
}





export async function listMembers(
  filters?: { status?: AdminStatus; role?: AdminRole; limit?: number; offset?: number },
): Promise<PaginatedResponse<AdminMember>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.role) params.set('role', filters.role);
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  if (filters?.offset != null) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiFetch<PaginatedResponse<AdminMember>>(
    `/admin/members${qs ? `?${qs}` : ''}`,
  );
}


export async function getMember(id: string): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>(
    `/admin/members/${encodeURIComponent(id)}`,
  );
}

export interface CreateMemberInput {
  email: string;
  password: string;
  role: AdminRole;
  permissions?: string[];
}

export async function createMember(input: CreateMemberInput): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>('/admin/members', {
    method: 'POST',
    body: input,
  });
}

export async function deleteMember(id: string): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>(`/admin/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function updateMemberPermissions(
  id: string,
  permissions: string[],
): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>(
    `/admin/members/${encodeURIComponent(id)}/permissions`,
    { method: 'PUT', body: { permissions } },
  );
}


export async function updateMember(
  id: string,
  input: { role?: AdminRole; status?: AdminStatus },
): Promise<{ member: AdminMember }> {
  return apiFetch<{ member: AdminMember }>(
    `/admin/members/${encodeURIComponent(id)}`,
    { method: 'PUT', body: input },
  );
}





export async function getMemberActivity(
  id: string,
  pagination?: { limit?: number; offset?: number },
): Promise<PaginatedResponse<AdminActivityRow>> {
  const params = new URLSearchParams();
  if (pagination?.limit != null) params.set('limit', String(pagination.limit));
  if (pagination?.offset != null) params.set('offset', String(pagination.offset));
  const qs = params.toString();
  return apiFetch<PaginatedResponse<AdminActivityRow>>(
    `/admin/members/${encodeURIComponent(id)}/activity${qs ? `?${qs}` : ''}`,
  );
}

export async function getMemberAudit(
  id: string,
  pagination?: { limit?: number; offset?: number },
): Promise<PaginatedResponse<AdminAuditRow>> {
  const params = new URLSearchParams();
  if (pagination?.limit != null) params.set('limit', String(pagination.limit));
  if (pagination?.offset != null) params.set('offset', String(pagination.offset));
  const qs = params.toString();
  return apiFetch<PaginatedResponse<AdminAuditRow>>(
    `/admin/members/${encodeURIComponent(id)}/audit${qs ? `?${qs}` : ''}`,
  );
}
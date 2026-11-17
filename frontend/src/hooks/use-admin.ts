'use client';



import useSWR from 'swr';

import { ApiError } from '@/lib/api';
import {
  getAdminMe,
  getMemberActivity,
  getMemberAudit,
  listMembers,
  type AdminActivityRow,
  type AdminAuditRow,
  type AdminMember,
  type AdminRole,
  type AdminStatus,
  type PaginatedResponse,
} from '@/lib/api/admin';

interface AdminMeState {
  member: AdminMember | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refresh: () => Promise<unknown>;
}


export function useAdminMe(): AdminMeState {
  const { data, error, isLoading, mutate } = useSWR<{ member: AdminMember } | null>(
    ['admin', 'me'],
    async () => {
      try {
        return await getAdminMe();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          return null;
        }
        throw e;
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 0,








      refreshInterval: 60_000,
    },
  );

  return {
    member: data ? data.member : null,
    isLoading,
    isError: Boolean(error),
    error,
    refresh: async () => mutate(),
  };
}

interface MembersState {
  data: PaginatedResponse<AdminMember> | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useMembers(
  filters?: { status?: AdminStatus; role?: AdminRole; limit?: number; offset?: number },
): MembersState {
  const key = ['admin', 'members', filters ?? null] as const;
  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse<AdminMember>>(
    key,
    () => listMembers(filters),
    { revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    isLoading,
    isError: Boolean(error),
    error,
    refresh: async () => {
      await mutate();
    },
  };
}

interface ActivityState {
  data: PaginatedResponse<AdminActivityRow> | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useMemberActivity(
  memberId: string | null | undefined,
  pagination?: { limit?: number; offset?: number },
): ActivityState {
  const key = memberId ? (['admin', 'activity', memberId, pagination ?? null] as const) : null;
  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse<AdminActivityRow>>(
    key,
    () => getMemberActivity(memberId as string, pagination),
    { revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    isLoading,
    isError: Boolean(error),
    error,
    refresh: async () => {
      await mutate();
    },
  };
}

interface AuditState {
  data: PaginatedResponse<AdminAuditRow> | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useMemberAudit(
  memberId: string | null | undefined,
  pagination?: { limit?: number; offset?: number },
): AuditState {
  const key = memberId ? (['admin', 'audit', memberId, pagination ?? null] as const) : null;
  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse<AdminAuditRow>>(
    key,
    () => getMemberAudit(memberId as string, pagination),
    { revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    isLoading,
    isError: Boolean(error),
    error,
    refresh: async () => {
      await mutate();
    },
  };
}

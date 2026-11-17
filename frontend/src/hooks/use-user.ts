'use client';

import useSWR from 'swr';
import { apiFetch, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

export function useUser() {
    const { data, error, isLoading, mutate } = useSWR<User | null>(
        ['user', 'me'],
        async () => {
            try {


                return await apiFetch<User | null>('/me');
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
        }
    );

    return {
        user: data ?? null,
        isLoading,
        error,
        isError: Boolean(error),
        mutate,
    };
}


import type {
  AwardXpResult,
  BadgesResponse,
  GamificationStats,
  XpHistoryResponse,
  XpSource,
} from '@/types/gamification';
import { CLIENT_API_BASE_URL } from '@/lib/client-api-base';

const API_BASE_URL = CLIENT_API_BASE_URL;

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });




  if (response.status === 204) {
    return undefined as unknown as T;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}





export async function getStats(): Promise<GamificationStats> {
  return apiRequest<GamificationStats>('/gamification/stats');
}





export async function getXpHistory(
  limit = 50,
  cursor?: string | null,
): Promise<XpHistoryResponse> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return apiRequest<XpHistoryResponse>(`/gamification/xp?${qs.toString()}`);
}





export async function getBadges(): Promise<BadgesResponse> {
  return apiRequest<BadgesResponse>('/gamification/badges');
}





export async function awardXp(
  source: XpSource,
  metadata?: Record<string, unknown>,
): Promise<AwardXpResult> {
  return apiRequest<AwardXpResult>('/gamification/award', {
    method: 'POST',



    body: JSON.stringify({ source, metadata }),
  });
}


export const gamificationApi = {
  getStats,
  getXpHistory,
  getBadges,
  awardXp,
};
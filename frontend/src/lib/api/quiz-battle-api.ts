

import type {
    BattleProfile,
    MatchDetailResponse,
    MatchListResponse,
    PlayCourse,
} from '@/types/quiz-battle';
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
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }
    return response.json();
}





export async function getMyBattleProfile(): Promise<{ profile: BattleProfile }> {
    return apiRequest('/quiz-battle/profile');
}





export async function listBattleMatches(
    page = 1,
    pageSize = 20,
): Promise<MatchListResponse> {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return apiRequest(`/quiz-battle/matches?${qs.toString()}`);
}

export async function getBattleMatch(matchId: string): Promise<MatchDetailResponse> {
    return apiRequest(`/quiz-battle/matches/${encodeURIComponent(matchId)}`);
}





export async function listPlayCourses(): Promise<{ courses: PlayCourse[] }> {
    return apiRequest('/quiz-battle/courses');
}





export type BattleNotificationKind =
    | 'matched'
    | 'opponent_answered'
    | 'opponent_left'
    | 'ended';

export interface BattleNotification {
    id: string;
    matchId: string;
    kind: BattleNotificationKind;
    payload: Record<string, unknown>;
    createdAt: string;
    readAt: string | null;
}

export async function listBattleNotifications(
    limit = 50,
): Promise<{ notifications: BattleNotification[] }> {
    const qs = new URLSearchParams({ limit: String(limit) });
    return apiRequest(`/quiz-battle/notifications?${qs.toString()}`);
}

export async function markBattleNotificationRead(
    notificationId: string,
): Promise<{ ok: boolean }> {
    return apiRequest(`/quiz-battle/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'POST',
    });
}




export interface FriendCodeResponse {
    friendCode: string;
}

export async function getFriendCode(): Promise<FriendCodeResponse> {
    return apiRequest('/quiz-battle/friend-code');
}

export async function regenerateFriendCode(): Promise<FriendCodeResponse> {
    return apiRequest('/quiz-battle/friend-code/regenerate', { method: 'POST' });
}

export type BattleInviteNotificationKind =
    | 'invite'
    | 'invite_sent'
    | 'invite_declined'
    | 'invite_unavailable'
    | 'invite_expired'
    | 'invite_accepted';

export interface BattleInviteNotification {
    id: string;
    inviteId: string;
    kind: BattleInviteNotificationKind;
    payload: Record<string, unknown>;
    createdAt: string;
    readAt: string | null;
    inviteStatus?: 'pending' | 'accepted' | 'declined' | 'unavailable' | 'expired' | null;
    inviteExpiresAt?: string | null;
}

export interface SendInviteResponse {
    inviteId: string;
    invitee: { id: string; name: string };
    expiresAt: string;
}

export interface AcceptInviteResponse {
    matchId: string;
    courseId: string;
}

export async function sendBattleInvite(
    courseId: string,
    friendCode: string,
): Promise<SendInviteResponse> {
    return apiRequest('/quiz-battle/invites', {
        method: 'POST',
        body: JSON.stringify({ courseId, friendCode }),
    });
}

export async function acceptBattleInvite(
    inviteId: string,
): Promise<AcceptInviteResponse> {
    return apiRequest(`/quiz-battle/invites/${encodeURIComponent(inviteId)}/accept`, {
        method: 'POST',
    });
}

export async function declineBattleInvite(inviteId: string): Promise<{ ok: boolean }> {
    return apiRequest(`/quiz-battle/invites/${encodeURIComponent(inviteId)}/decline`, {
        method: 'POST',
    });
}

export async function listBattleInviteNotifications(
    limit = 50,
): Promise<{ notifications: BattleInviteNotification[] }> {
    const qs = new URLSearchParams({ limit: String(limit) });
    return apiRequest(`/quiz-battle/invites?${qs.toString()}`);
}

export async function markBattleInviteNotificationRead(
    notificationId: string,
): Promise<{ ok: boolean }> {
    return apiRequest(
        `/quiz-battle/invites/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'POST' },
    );
}
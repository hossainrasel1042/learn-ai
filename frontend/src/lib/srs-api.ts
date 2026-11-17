

import type {
  Card,
  CreateDeckInput,
  Deck,
  DeckDetailResponse,
  DeckListResponse,
  DeckStats,
  DueCardsResponse,
  GenerateCardsInput,
  GenerateCardsResponse,
  Rating,
  ReviewResponse,
} from '@/types/srs';
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





export async function createDeck(input: CreateDeckInput): Promise<{ deck: Deck }> {
  return apiRequest('/srs/decks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listDecks(page = 1, pageSize = 20): Promise<DeckListResponse> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest(`/srs/decks?${qs.toString()}`);
}

export async function getDeck(deckId: string, page = 1, pageSize = 50): Promise<DeckDetailResponse> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest(`/srs/decks/${deckId}?${qs.toString()}`);
}

export async function deleteDeck(deckId: string): Promise<void> {
  await apiRequest<void>(`/srs/decks/${deckId}`, { method: 'DELETE' });
}

export async function generateCards(deckId: string, input: GenerateCardsInput): Promise<GenerateCardsResponse> {
  return apiRequest(`/srs/decks/${deckId}/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getDeckStats(deckId: string): Promise<DeckStats> {
  return apiRequest(`/srs/decks/${deckId}/stats`);
}





export async function getDueCards(deckId?: string, limit = 20): Promise<DueCardsResponse> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (deckId) qs.set('deckId', deckId);
  return apiRequest(`/srs/due?${qs.toString()}`);
}

export async function submitReview(cardId: string, rating: Rating): Promise<ReviewResponse> {
  return apiRequest('/srs/review', {
    method: 'POST',
    body: JSON.stringify({ cardId, rating }),
  });
}

export async function getCard(cardId: string): Promise<{ card: Card }> {
  return apiRequest(`/srs/cards/${cardId}`);
}

export async function deleteCard(cardId: string): Promise<void> {
  await apiRequest<void>(`/srs/cards/${cardId}`, { method: 'DELETE' });
}
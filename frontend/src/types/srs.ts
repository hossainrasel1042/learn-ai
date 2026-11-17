

export type Rating = 0 | 2 | 3 | 4;
export type SourceType = 'course' | 'chat' | 'manual';

export interface Deck {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  userId: string;
  front: string;
  back: string;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
  lastReviewed: string | null;
  createdAt: string;
}

export interface ReviewRecord {
  id: string;
  cardId: string;
  userId: string;
  rating: number;
  prevInterval: number | null;
  newInterval: number | null;
  prevEase: number | null;
  newEase: number | null;
  reviewedAt: string;
}

export interface DeckStats {
  total: number;
  due: number;
  learned: number;
  newCards: number;
  retention: number | null;
  totalReviews: number;
}

export interface DeckListResponse {
  decks: Deck[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeckDetailResponse {
  deck: Deck;
  cards: Card[];
  cardsTotal: number;
  stats: DeckStats;
  page: number;
  pageSize: number;
}

export interface DueCardsResponse {
  cards: Card[];
  total: number;
}

export interface GenerateCardsResponse {
  inserted: number;
  cards: Card[];

  generatedBy?: 'ai' | 'local';
}

export interface ReviewResponse {
  card: Card;
  review: ReviewRecord;
}

export interface CreateDeckInput {
  title: string;
  description?: string;
  sourceType?: SourceType;
  sourceId?: string;
}

export interface GenerateCardsInput {
  sourceType: SourceType;
  sourceId?: string;
  text?: string;
  cardCount?: number;
}


export interface IntervalPreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}
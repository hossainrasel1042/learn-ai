

import { z } from 'zod';
import { settings } from '../config/settings.js';

const uuid = z.string().uuid();

const SOURCE_TYPES = ['course', 'chat', 'manual'];
const RATINGS = [0, 2, 3, 4];






export const CreateDeckRequest = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  sourceId: uuid.optional(),
});


export const GenerateCardsRequest = z.object({
  sourceType: z.enum(SOURCE_TYPES).default('manual'),
  sourceId: uuid.optional(),
  text: z.string().min(50).optional(),
  cardCount: z.number().int().min(1).max(30).default(settings.SRS_DECK_SIZE),
});


export const ReviewRequest = z.object({
  cardId: uuid,
  rating: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});


export const DeckIdParam = z.object({ deckId: uuid });


export const CardIdParam = z.object({ cardId: uuid });


export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});


export const DueQuery = z.object({
  deckId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});





export const FlashcardSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  userId: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  dueAt: z.string(),
  lastReviewed: z.string().nullable(),
  createdAt: z.string(),
});

export const FlashcardDeckSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  cardCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FlashcardReviewSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  userId: z.string(),
  rating: z.number().int(),
  prevInterval: z.number().int().nullable(),
  newInterval: z.number().int().nullable(),
  prevEase: z.number().nullable(),
  newEase: z.number().nullable(),
  reviewedAt: z.string(),
});

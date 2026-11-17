

import { z } from 'zod';


const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;


const weekNumber = z
  .union([
    z.number().int().min(INT4_MIN).max(INT4_MAX),
    z
      .string()
      .regex(/^\d+$/, 'week must be a number')
      .refine(
        (v) => {
          const n = Number(v);
          return Number.isSafeInteger(n) && n >= INT4_MIN && n <= INT4_MAX;
        },
        { message: 'week must be between -2147483648 and 2147483647' },
      ),
    z.literal(''),
  ])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return typeof v === 'string' ? Number(v) : v;
  });


export const MAX_TAGS = 50;


const MAX_TAG_LENGTH = 100;


const tagsArray = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Tags cannot be empty')
      .max(MAX_TAG_LENGTH, `Tags must be at most ${MAX_TAG_LENGTH} characters`),
  )
  .max(MAX_TAGS, `At most ${MAX_TAGS} tags are allowed`);






export const TagBase = z.object({
  name: z.string(),
});


export const TagCreate = TagBase;


export const TagResponse = TagBase.extend({
  id: z.string(),
});






export const CourseBase = z.object({
  name: z.string(),
  courseNo: z.string(),
  description: z.string().optional(),
});


export const CourseCreate = CourseBase;


export const CourseUpdate = z.object({
  name: z.string().optional(),
  courseNo: z.string().optional(),
  description: z.string().optional(),
});


export const CourseResponse = CourseBase.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});






export const COURSE_NO_PATTERN = /^[A-Za-z]{2,4}\d{4}$/;


const COURSE_NO_MESSAGE =
  'Course number must be 2-4 letters followed by 4 digits (e.g. CSE1121)';


export const CourseCreateRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(10, 'Course name must be at least 10 characters')
      .max(100, 'Course name must be at most 100 characters'),
    course_no: z
      .string()
      .trim()
      .regex(COURSE_NO_PATTERN, COURSE_NO_MESSAGE)
      .optional(),
    courseNo: z
      .string()
      .trim()
      .regex(COURSE_NO_PATTERN, COURSE_NO_MESSAGE)
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be at most 500 characters')
      .optional(),
  })




  .refine(
    (v) => Boolean(v.course_no) !== Boolean(v.courseNo),
    {
      message: 'Exactly one of course_no or courseNo is required',
      path: ['course_no'],
    },
  );


export const CourseMaterialUpdateRequest = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  description: z.string().trim().optional(),
  week: weekNumber,
  tags: tagsArray.optional(),
  metadata: z.record(z.any()).optional(),
});


export function normalizeCourseCreate(body) {
  const src = body && typeof body === 'object' ? body : {};
  const courseNo = String(src.course_no ?? src.courseNo ?? '').trim();

  const out = {
    name: String(src.name ?? '').trim(),
    course_no: courseNo,
  };
  const description = typeof src.description === 'string' ? src.description.trim() : '';
  if (description) out.description = description;
  return out;
}


export const MATERIAL_TYPES = ['theory', 'lab'];


export const MATERIAL_FILE_TYPES = ['pdf', 'pptx', 'code'];


export const CourseMaterialUploadFields = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  type: z.enum(MATERIAL_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${MATERIAL_TYPES.join(', ')}` }),
  }),
  file_type: z.enum(MATERIAL_FILE_TYPES, {
    errorMap: () => ({ message: `file_type must be one of: ${MATERIAL_FILE_TYPES.join(', ')}` }),
  }),
  description: z.string().trim().optional(),
  week: weekNumber,
});






export const CourseMaterialBase = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.string(),
  fileType: z.string(),
  week: z.number().int().optional(),
  metadata: z.record(z.any()).optional(),
});


export const CourseMaterialCreate = CourseMaterialBase.extend({
  tags: tagsArray.default([]),
});


export const CourseMaterialUpdate = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  week: z.number().int().optional(),
  tags: tagsArray.optional(),
});


export const CourseMaterialResponse = CourseMaterialBase.extend({
  id: z.string(),
  courseId: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(TagResponse),
});






export class Tag {
  constructor({ id, name } = {}) {
    this.id = id;
    this.name = name;
  }

  toDict() {
    return {
      id: this.id,
      name: this.name,
    };
  }
}


export class Course {
  constructor({ id, name, code, courseNo, description, createdAt, updatedAt } = {}) {
    this.id = id;
    this.name = name;
    this.code = code;
    this.courseNo = courseNo;
    this.description = description;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    this.materials = [];
  }

  toDict() {
    return {
      id: this.id,
      name: this.name,


      code: this.code ?? null,
      courseNo: this.courseNo,
      description: this.description,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      updatedAt:
        this.updatedAt instanceof Date
          ? this.updatedAt.toISOString()
          : this.updatedAt,
    };
  }
}


export class CourseMaterial {
  constructor({
    id,
    courseId,
    title,
    description,
    type,
    fileType,
    url,
    week,
    metadata,
    createdAt,
    updatedAt,
    tags = [],
  } = {}) {
    this.id = id;
    this.courseId = courseId;
    this.title = title;
    this.description = description;
    this.type = type;
    this.fileType = fileType;
    this.url = url;
    this.week = week;

    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    this.tags = tags;
  }

  toDict() {
    return {
      id: this.id,
      courseId: this.courseId,
      title: this.title,
      description: this.description,
      type: this.type,
      fileType: this.fileType,
      url: this.url,
      week: this.week,
      metadata: this.metadata,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      updatedAt:
        this.updatedAt instanceof Date
          ? this.updatedAt.toISOString()
          : this.updatedAt,
      tags: this.tags ? this.tags.map((t) => (t.toDict ? t.toDict() : t)) : [],
    };
  }
}

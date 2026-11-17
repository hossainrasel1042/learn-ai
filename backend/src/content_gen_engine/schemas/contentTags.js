

import { z } from 'zod';





export const PageType = z.enum(['title', 'content', 'code', 'summary', 'exercise']);
export const CalloutType = z.enum(['info', 'warning', 'tip', 'example']);
export const ImagePosition = z.enum(['center', 'left', 'right', 'full']);
export const DiagramType = z.enum(['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie']);





export const HeadingSpec = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  text: z.string(),
});

export const ImageSpec = z.object({
  id: z.string().nullish(),
  prompt: z.string().describe('Prompt for image generation'),
  alt: z.string().describe('Alt text for accessibility'),
  position: ImagePosition.default('center'),
  width: z.string().default('80%'),
  style: z.string().default('educational, clean, minimalist'),
});

export const MermaidSpec = z.object({
  id: z.string().nullish(),
  diagram_type: DiagramType.default('flowchart'),
  code: z.string(),
  caption: z.string().nullish(),
});

export const CodeBlockSpec = z.object({
  language: z.string().default('python'),
  code: z.string(),
  title: z.string().nullish(),
  highlight_lines: z.array(z.number()).nullish(),
});

export const CalloutSpec = z.object({
  callout_type: CalloutType.default('info'),
  title: z.string().nullish(),
  content: z.string(),
});

export const ListItem = z.object({
  text: z.string(),
  sub_items: z.array(z.string()).nullish(),
});

export const ListSpec = z.object({
  list_type: z.union([z.literal('bullet'), z.literal('numbered')]).default('bullet'),
  items: z.array(ListItem),
});

export const TableSpec = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caption: z.string().nullish(),
});

export const CitationSpec = z.object({
  source: z.string(),
  page: z.string().nullish(),
  section: z.string().nullish(),
});





export const PageContent = z.object({
  headings: z.array(HeadingSpec).default([]),
  paragraphs: z.array(z.string()).default([]),
  images: z.array(ImageSpec).default([]),
  diagrams: z.array(MermaidSpec).default([]),
  code_blocks: z.array(CodeBlockSpec).default([]),
  callouts: z.array(CalloutSpec).default([]),
  lists: z.array(ListSpec).default([]),
  tables: z.array(TableSpec).default([]),
  citations: z.array(CitationSpec).default([]),

  element_order: z.array(z.tuple([z.string(), z.number()])).default([]),
});

export const Page = z.object({
  number: z.number(),
  page_type: PageType.default('content'),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  content: PageContent.default(() => ({})),
  speaker_notes: z.string().nullish(),
});





export const DocumentTheme = z.object({
  primary_color: z.string().default('#1a365d'),
  secondary_color: z.string().default('#2c5282'),
  accent_color: z.string().default('#3182ce'),
  font_family: z.string().default('Helvetica'),
  style: z.string().default('modern'),
});

export const DocumentSpec = z.object({
  document_type: z
    .union([z.literal('pdf'), z.literal('pptx'), z.literal('markdown')])
    .default('markdown'),
  title: z.string(),
  subtitle: z.string().nullish(),
  author: z.string().nullish(),
  course: z.string().nullish(),
  date: z.string().nullish(),
  pages: z.array(Page).default([]),
  theme: DocumentTheme.default(() => ({})),
  metadata: z.record(z.any()).default({}),
});






export class TestCase {
  constructor({ input, expectedOutput, expected_output, description = null, isHidden = false, is_hidden = false } = {}) {
    this.input = input;


    this.expected_output = expected_output ?? expectedOutput ?? '';
    this.description = description ?? null;
    this.is_hidden = is_hidden ?? isHidden ?? false;
  }
}


export class CodeSpec {
  constructor({
    language = 'python',
    filename,
    code,
    description,
    test_cases = [],
    dependencies = [],
  } = {}) {
    this.language = language;
    this.filename = filename;
    this.code = code;
    this.description = description;
    this.test_cases = test_cases;
    this.dependencies = dependencies;
  }
}


export class LabSpec {
  constructor({
    title,
    description,
    objectives = [],
    starter_code = null,
    solution_code = null,
    test_cases = [],
    hints = [],
    difficulty = 'medium',
  } = {}) {
    this.title = title;
    this.description = description;
    this.objectives = objectives;
    this.starter_code = starter_code;
    this.solution_code = solution_code;
    this.test_cases = test_cases;
    this.hints = hints;
    this.difficulty = difficulty;
  }
}






export class VisualPlan {
  constructor({ visual_type = 'image', visualType, description, position = null } = {}) {
    this.visual_type = visual_type ?? visualType ?? 'image';
    this.description = description ?? '';
    this.position = position;
  }
}


export class SectionPlan {
  constructor({
    title,
    section_type = 'content',
    sectionType,
    key_points = [],
    keyPoints,
    visuals_needed = [],
    visualsNeeded,
    code_examples = [],
    codeExamples,
  } = {}) {
    this.title = title;
    this.section_type = section_type ?? sectionType ?? 'content';
    this.key_points = key_points ?? keyPoints ?? [];
    this.visuals_needed = visuals_needed ?? visualsNeeded ?? [];
    this.code_examples = code_examples ?? codeExamples ?? [];
  }
}


export class ContentPlan {
  constructor({
    title,
    output_type = 'markdown',
    outputType,
    estimated_pages = 5,
    estimatedPages,
    sections = [],
    visual_theme = null,
    visualTheme,
    target_audience = 'University students',
    targetAudience,
    prerequisites = [],
  } = {}) {
    this.title = title;
    this.output_type = output_type ?? outputType ?? 'markdown';
    this.estimated_pages = estimated_pages ?? estimatedPages ?? 5;
    this.sections = sections ?? [];
    this.visual_theme = visual_theme ?? visualTheme ?? null;
    this.target_audience = target_audience ?? targetAudience ?? 'University students';
    this.prerequisites = prerequisites ?? [];
  }
}

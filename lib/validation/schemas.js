import { z } from 'zod'

// ============================================================
// Zod schemas mirroring the production DB constraints
// (see prisma/schema.prisma for the full schema mirror).
// Use these at every API boundary before data touches Supabase.
// ============================================================

export const uuidSchema = z.string().uuid()

// --- Enums (mirror CHECK constraints) ---
export const topicStatusSchema = z.enum(['locked', 'available', 'learning', 'reviewing', 'mastered'])
export const sessionTypeSchema = z.enum(['learning', 'review'])
export const sourceTypeSchema = z.enum(['personal', 'classroom'])
export const resourceTypeSchema = z.enum(['notes', 'pyq'])
export const memberStatusSchema = z.enum(['invited', 'active', 'removed'])
export const inviteStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked'])
export const voteTypeSchema = z.union([z.literal(1), z.literal(-1)])

// --- Field constraints (mirror CHECK constraints) ---
export const difficultySchema = z.number().int().min(1).max(5)
export const qualityRatingSchema = z.number().int().min(0).max(5)

// --- Entity payloads ---
export const flashcardSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})
export const flashcardsSchema = z.array(flashcardSchema)

// Strict curriculum schema for AI SDK generateObject (no .catch/.default
// coercions — the SDK converts this to the provider's structured-output
// JSON schema, so it must be plain).
export const aiCurriculumSchema = z.object({
  topics: z
    .array(
      z.object({
        slug: z.string().min(1).describe('unique kebab-case id'),
        title: z.string().min(1),
        description: z.string(),
        estimatedMinutes: z.number().int().positive(),
        difficulty: z.number().int().min(1).max(5),
        dependencies: z.array(z.string()).describe('slugs of prerequisite topics'),
      })
    )
    .min(1),
})

// AI flashcards output for generateObject. Keys match the client contract
// (Flashcard.jsx renders card.front / card.back).
export const aiFlashcardsSchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().min(1).describe('short question'),
        back: z.string().min(1).describe('brief answer, 1-3 sentences'),
      })
    )
    .min(1),
})

// AI section outline (generate-topic-content, sectioned mode / P6.4): the
// section plan the model returns in pass 1 before each section is written.
export const topicOutlineSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).describe('short section title, no markdown'),
        intent: z.string().min(1).describe('one line: what this section must cover'),
      })
    )
    .min(1),
})

// Concept ledger (P6.5): compact per-topic subject-memory record extracted after
// generation, keyed to the DAG node. Fed back into neighbor context (P6.3).
export const conceptLedgerSchema = z.object({
  summary: z.string().min(1).describe('1-2 sentence summary of what this topic teaches'),
  concepts_introduced: z.array(z.string()).default([]).describe('key concepts introduced here'),
  terms_defined: z.array(z.string()).default([]).describe('terms explicitly defined here'),
  notation_introduced: z.array(z.string()).default([]).describe('symbols/notation introduced'),
  prerequisites_used: z.array(z.string()).default([]).describe('concepts assumed already known'),
})

// Source-grounded verification result (P6.6): does the lesson stay faithful to
// the retrieved sources?
export const contentVerificationSchema = z.object({
  supported: z.boolean().describe('true if all major factual claims are supported by the sources'),
  issues: z
    .array(
      z.object({
        claim: z.string().describe('the unsupported or incorrect claim'),
        issue: z.string().describe('why it is unsupported or wrong'),
      })
    )
    .default([]),
})

// Project-based learning track (P7.4): a scaffolded hands-on project for a subject.
export const projectTrackSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        checkpoints: z.array(z.string()).default([]),
      })
    )
    .min(1),
})

// Diagnostic placement check (P8.4): a short pre-test whose items are each
// tagged to a concept, so the result seeds `user_concept_state` (P8.1) instead
// of producing a bare score. NOT a graded assessment — P9 owns those.
export const diagnosticSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(5),
        correct_index: z.number().int().min(0).max(4),
        concept: z.string().min(1).describe('the single concept this question tests'),
        topic_title: z.string().default('').describe('the syllabus topic it belongs to, if known'),
      })
    )
    .min(1),
})

export const diagnosticRequestSchema = z.object({
  subjectId: uuidSchema,
  questionCount: z.number().int().min(3).max(20).optional().default(8),
})

// Placement results come back from the client already graded (the check is
// self-assessment and gates nothing), so `correct` is accepted as reported.
export const diagnosticResultSchema = z.object({
  subjectId: uuidSchema,
  answers: z
    .array(
      z.object({
        concept: z.string().min(1).max(200),
        correct: z.boolean(),
      })
    )
    .min(1)
    .max(20),
})

// --- Assessment (P9) ------------------------------------------------------
// Items are generated from concept ledgers and stay tagged to their concept, so
// a miss points at a concept (feeding P8.1) rather than just lowering a score.
export const assessmentItemKindSchema = z.enum(['mcq', 'why', 'worked_example'])

export const aiAssessmentItemsSchema = z.object({
  items: z
    .array(
      z.object({
        kind: assessmentItemKindSchema.catch('mcq'),
        concept: z.string().min(1).describe('the single concept this item tests'),
        difficulty: difficultySchema.catch(3),
        stem: z.string().min(1).describe('the question, or the partially-worked example to complete'),
        // NO min() here on purpose: open "why" items carry no options, and the
        // prompt asks for a mix of kinds — a min(2) would make one open item
        // fail the whole generated batch. Per-kind rules (closed items need ≥2
        // options and an in-range index) are enforced in
        // lib/assessment/items.js#normalizeGeneratedItems, which drops only the
        // offending item.
        options: z.array(z.string().min(1)).max(5).default([]),
        correct_index: z.number().int().min(0).max(4).nullable().default(null),
        answer_key: z.string().default('').describe('model answer for open "why" items'),
        explanation: z.string().default('').describe('why the answer is right, shown after answering'),
      })
    )
    .min(1),
})

export const generateAssessmentRequestSchema = z.object({
  subjectId: uuidSchema,
  topicId: uuidSchema.optional().nullable(),
  itemCount: z.number().int().min(3).max(24).optional().default(8),
})

export const practiceItemsRequestSchema = z.object({
  topicId: uuidSchema,
  limit: z.number().int().min(1).max(10).optional().default(3),
  // Classroom context, when the learner is practising inside a course. Without
  // these, resolveTopicAccess cannot reach a teacher-owned topic and a student
  // gets a 404 on a lesson they are legitimately enrolled in. Optional because
  // the same endpoint serves self-paced subjects, where there is no classroom.
  classroomId: uuidSchema.optional(),
  classroomCourseId: uuidSchema.optional(),
})

// Confidence is the P9.2 calibration signal: "sure and wrong" is the highest-
// value resurfacing signal there is, so it is captured BEFORE the reveal.
export const confidenceSchema = z.enum(['guess', 'unsure', 'sure'])

export const practiceGradeRequestSchema = z.object({
  itemId: uuidSchema,
  chosenIndex: z.number().int().min(0).max(4).nullable().optional().default(null),
  confidence: confidenceSchema.optional().default('unsure'),
})

export const examStartRequestSchema = z.object({
  subjectId: uuidSchema,
  itemCount: z.number().int().min(4).max(40).optional().default(12),
})

// Client-reported exam-session events (P10.3). Advisory: a determined cheater
// can suppress them, so they are recorded and summarized, never gated on.
export const integrityEventSchema = z.object({
  kind: z.enum(['blur', 'hidden', 'fullscreen_exit']),
  at: z.number().int().min(0).optional().default(0),
})

export const examSubmitRequestSchema = z.object({
  attemptId: uuidSchema,
  responses: z
    .array(
      z.object({
        itemId: uuidSchema,
        chosenIndex: z.number().int().min(0).max(4).nullable().optional().default(null),
        confidence: confidenceSchema.optional().default('unsure'),
        ms: z.number().int().min(0).max(3600000).optional().default(0),
      })
    )
    .max(40)
    .default([]),
  integrityEvents: z.array(integrityEventSchema).max(200).optional().default([]),
})

// --- Oral viva (P10.5) ----------------------------------------------------
// Self-paced subjects have no reviewer, so the learner explains their answers
// and the agent scores the explanation. This is the strongest automated
// integrity signal available: it is hard to fake understanding out loud.
export const vivaQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        concept: z.string().min(1),
        question: z.string().min(1).describe('asks the learner to explain their reasoning'),
        expected_points: z.array(z.string()).default([]).describe('what a sound explanation must cover'),
      })
    )
    .min(1),
})

export const vivaScoreSchema = z.object({
  score: z.number().min(0).max(1).describe('0 = no understanding shown, 1 = fully sound explanation'),
  covered: z.array(z.string()).default([]).describe('expected points the learner actually covered'),
  missing: z.array(z.string()).default([]).describe('expected points absent or wrong'),
  feedback: z.string().default('').describe('one or two sentences addressed to the learner'),
})

export const vivaStartRequestSchema = z.object({
  attemptId: uuidSchema,
})

export const vivaSubmitRequestSchema = z.object({
  attemptId: uuidSchema,
  answers: z
    .array(
      z.object({
        concept: z.string().min(1).max(200),
        question: z.string().min(1).max(2000),
        expectedPoints: z.array(z.string().max(500)).max(10).optional().default([]),
        explanation: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(6),
})

export const attemptReviewRequestSchema = z.object({
  attemptId: uuidSchema,
  decision: z.enum(['cleared', 'flagged', 'invalidated']),
  note: z.string().max(2000).optional().default(''),
})

// Interactive artifact (P7.3): a self-contained HTML widget rendered in a
// SANDBOXED iframe (see components/sub-components/ArtifactFrame.jsx).
export const interactiveArtifactSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  html: z
    .string()
    .min(1)
    .describe('a complete self-contained HTML document, inline CSS/JS only, no external resources'),
})

// AI curriculum output (generate-graph): the DAG the model must return.
export const curriculumTopicSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  estimatedMinutes: z.number().int().positive().catch(30),
  difficulty: difficultySchema.catch(3),
  dependencies: z.array(z.string()).default([]),
})
export const curriculumSchema = z.object({
  topics: z.array(curriculumTopicSchema).min(1),
})

// --- API request payloads ---
export const generateGraphRequestSchema = z.object({
  subjectId: uuidSchema,
  seedText: z.string().max(20000).optional().nullable(),
  difficulty: difficultySchema.optional().default(3),
  totalMinutes: z.number().int().positive().max(100000).optional().default(300),
})

export const generateTopicContentRequestSchema = z.object({
  topicId: uuidSchema,
  subjectTitle: z.string().max(500).optional().nullable(),
  topicTitle: z.string().max(500).optional().nullable(),
  topicDescription: z.string().max(5000).optional().nullable(),
  difficulty: difficultySchema.optional(),
  classroomId: uuidSchema.optional().nullable(),
  classroomCourseId: uuidSchema.optional().nullable(),
})

export const doubtChatRequestSchema = z.object({
  topicId: uuidSchema,
  message: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(20000),
      })
    )
    .max(50)
    .optional()
    .default([]),
  classroomId: uuidSchema.optional().nullable(),
  classroomCourseId: uuidSchema.optional().nullable(),
})

const optionalSecret = z
  .union([z.string().trim().min(10).max(300), z.literal(''), z.null()])
  .optional()

export const userSettingsRequestSchema = z.object({
  geminiApiKey: optionalSecret,
  anthropicApiKey: optionalSecret,
  openaiCompatBaseUrl: z
    .union([z.string().trim().url().max(500), z.literal(''), z.null()])
    .optional(),
  openaiCompatApiKey: z
    .union([z.string().trim().min(1).max(300), z.literal(''), z.null()])
    .optional(),
  openaiCompatModels: z
    .union([z.string().trim().max(500), z.literal(''), z.null()])
    .optional(),
})

// --- P11 reminders ---
// `last_reminder_on` is deliberately NOT accepted: it is the once-a-day send
// guard, written only by the sender. See lib/reminders/store.js.
export const notificationPreferencesRequestSchema = z.object({
  reviewReminders: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  // IANA zone name from the browser (Intl.DateTimeFormat().resolvedOptions()).
  timezone: z.string().trim().min(1).max(80).optional(),
  weeklyReviewGoal: z.number().int().min(1).max(500).optional(),
})

export const pushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
  platform: z.enum(['web', 'android']).optional().default('web'),
})

// --- P6.6 learner content reports ---
// Caps mirror the CHECK constraints on public.content_feedback, so a rejected
// value fails here with a readable message instead of as a database error.
export const contentFeedbackReasonSchema = z.enum([
  'inaccurate', 'outdated', 'confusing', 'incomplete', 'broken_diagram', 'bad_reference', 'other',
])

export const contentFeedbackRequestSchema = z.object({
  topicId: z.string().uuid(),
  reason: contentFeedbackReasonSchema,
  quotedText: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
})

// --- P13.2 client error reports ---
// Every field is length-capped: this endpoint is unauthenticated by design (the
// most valuable client errors happen before login), so the schema is the bound
// on what a caller can write into the error sink.
export const clientErrorReportSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  name: z.string().trim().max(100).optional(),
  stack: z.string().max(8000).optional(),
  // Next.js server-component error digest, when the boundary receives one.
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
})

/**
 * Parse `data` with `schema`; returns { data } on success or
 * { error: <message string> } on failure, for easy use in route handlers.
 */
export function parseOr400(schema, data) {
  const result = schema.safeParse(data)
  if (result.success) {
    return { data: result.data }
  }
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ')
  return { error: message }
}

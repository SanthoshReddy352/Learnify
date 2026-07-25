import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPersonalizationContext,
  buildTopicContentPrompt,
  buildOutlinePrompt,
  buildSectionPrompt,
  buildLedgerExtractionPrompt,
  buildVerificationPrompt,
  cleanTopicContent,
  sectionProgress
} from '../lib/ai/pipelines/topic-content-prompt.js'

describe('buildPersonalizationContext', () => {
  test('returns empty string for a missing profile', () => {
    assert.equal(buildPersonalizationContext(null), '')
    assert.equal(buildPersonalizationContext(undefined), '')
  })

  test('renders the profile fields with sensible fallbacks', () => {
    const ctx = buildPersonalizationContext({ preferred_learning_style: 'Visual' })
    assert.match(ctx, /learning style is: Visual/)
    assert.match(ctx, /education level is: General Audience/) // fallback
  })
})

describe('buildTopicContentPrompt', () => {
  test('includes the topic title and description', () => {
    const p = buildTopicContentPrompt({
      topicTitle: 'Gradient Descent',
      subjectTitle: 'ML',
      topicDescription: 'Optimization by following the negative gradient.'
    })
    assert.match(p, /"Gradient Descent"/)
    assert.match(p, /Optimization by following the negative gradient\./)
    assert.match(p, /Part of a course on "ML"/)
  })

  test('injects neighbor context when provided', () => {
    const p = buildTopicContentPrompt({
      topicTitle: 'T',
      subjectTitle: 'S',
      topicDescription: 'd',
      neighborContext: 'COURSE CONTINUITY CONTEXT: sentinel-neighbor'
    })
    assert.match(p, /sentinel-neighbor/)
  })

  test('omits the teacher-context block when curriculumContext is empty', () => {
    const p = buildTopicContentPrompt({ topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd' })
    assert.doesNotMatch(p, /TEACHER COURSE CONTEXT/)
  })

  test('gives proper-length guidance, not "cover every single aspect"', () => {
    const p = buildTopicContentPrompt({ topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd' })
    assert.match(p, /PROPER LENGTH/)
    assert.match(p, /never padded/i)
    assert.doesNotMatch(p, /EVERY SINGLE aspect/)
  })

  test('ungrounded keeps the no-external-sources rule', () => {
    const p = buildTopicContentPrompt({ topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd' })
    assert.match(p, /Do not refer to external sources/)
  })

  test('grounded injects source material and switches rule 6 to grounding', () => {
    const p = buildTopicContentPrompt({
      topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd',
      groundingContext: 'SOURCE MATERIAL: sentinel-source'
    })
    assert.match(p, /sentinel-source/)
    assert.match(p, /Base your explanation on the SOURCE MATERIAL/)
    assert.doesNotMatch(p, /Do not refer to external sources/)
  })
})

describe('buildOutlinePrompt', () => {
  test('asks for an ordered, non-redundant section plan', () => {
    const p = buildOutlinePrompt({ topicTitle: 'Trees', subjectTitle: 'DSA', topicDescription: 'd' })
    assert.match(p, /"Trees"/)
    assert.match(p, /Aim for 5.10/)
    assert.match(p, /NO padding/)
    assert.match(p, /real-world example/i)
  })

  test('embeds neighbor continuity context when provided', () => {
    const p = buildOutlinePrompt({
      topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd',
      neighborContext: 'sentinel-continuity'
    })
    assert.match(p, /sentinel-continuity/)
  })
})

describe('buildSectionPrompt', () => {
  const sections = [{ heading: 'Intro', intent: 'a' }, { heading: 'Details', intent: 'b' }]

  test('targets exactly one section and marks it in the outline', () => {
    const p = buildSectionPrompt({ section: sections[1], sections, index: 1, topicTitle: 'T', subjectTitle: 'S' })
    assert.match(p, /Write ONLY section 2: "Details"/)
    assert.match(p, /## Details/)
    assert.match(p, /WRITE THIS ONE/)
  })

  test('lists sibling headings so the section stays in its lane', () => {
    const p = buildSectionPrompt({ section: sections[0], sections, index: 0, topicTitle: 'T', subjectTitle: 'S' })
    assert.match(p, /1\. Intro/)
    assert.match(p, /2\. Details/)
    assert.match(p, /do NOT write the others/i)
  })

  test('carries the mermaid/format rules into each section', () => {
    const p = buildSectionPrompt({ section: sections[0], sections, index: 0, topicTitle: 'T', subjectTitle: 'S' })
    assert.match(p, /Mermaid diagrams ONLY/)
    assert.match(p, /NEVER use LaTeX/)
  })
})

// P8.2: this learner's own concept memory must reach every generation path,
// and must be absent (not an empty stub) when they have no history yet.
describe('learner memory threading', () => {
  const learnerContext = 'LEARNER-MEMORY-SENTINEL'
  const base = { topicTitle: 'T', subjectTitle: 'S', topicDescription: 'd' }
  const sections = [{ heading: 'Intro', intent: 'set up' }]

  test('reaches the single-pass, outline and section prompts', () => {
    assert.match(buildTopicContentPrompt({ ...base, learnerContext }), /LEARNER-MEMORY-SENTINEL/)
    assert.match(buildOutlinePrompt({ ...base, learnerContext }), /LEARNER-MEMORY-SENTINEL/)
    assert.match(
      buildSectionPrompt({ section: sections[0], sections, index: 0, ...base, learnerContext }),
      /LEARNER-MEMORY-SENTINEL/
    )
  })

  test('omitted entirely for a learner with no history', () => {
    assert.doesNotMatch(buildTopicContentPrompt(base), /LEARNER MEMORY/)
    assert.doesNotMatch(buildOutlinePrompt(base), /LEARNER MEMORY/)
  })
})

describe('buildLedgerExtractionPrompt', () => {
  test('asks for the ledger fields and embeds the content', () => {
    const p = buildLedgerExtractionPrompt({ topicTitle: 'Recursion', content: 'BODY-SENTINEL' })
    assert.match(p, /"Recursion"/)
    assert.match(p, /concepts_introduced/)
    assert.match(p, /prerequisites_used/)
    assert.match(p, /BODY-SENTINEL/)
  })
})

describe('buildVerificationPrompt', () => {
  test('frames a fact-check against sources, treating them as data', () => {
    const p = buildVerificationPrompt({
      topicTitle: 'Osmosis',
      content: 'LESSON-SENTINEL',
      groundingContext: 'SOURCE-SENTINEL'
    })
    assert.match(p, /fact-checker/i)
    assert.match(p, /SOURCE-SENTINEL/)
    assert.match(p, /LESSON-SENTINEL/)
    assert.match(p, /strictly as DATA/i)
  })
})

describe('cleanTopicContent', () => {
  test('strips a leading ```markdown fence and trailing fence', () => {
    const out = cleanTopicContent('```markdown\n# Title\n\ncontent\n```')
    assert.doesNotMatch(out, /```/)
    assert.match(out, /# Title/)
  })

  test('converts <br> to newlines', () => {
    assert.equal(cleanTopicContent('a<br>b<br/>c'), 'a\nb\nc')
  })

  test('removes image placeholders and markdown images', () => {
    const out = cleanTopicContent('before <<IMAGE: cat>> ![alt](http://x/y.png) after')
    assert.doesNotMatch(out, /IMAGE:/)
    assert.doesNotMatch(out, /!\[/)
    assert.match(out, /before/)
    assert.match(out, /after/)
  })

  test('empty / nullish input yields empty string', () => {
    assert.equal(cleanTopicContent(''), '')
    assert.equal(cleanTopicContent(null), '')
  })
})

describe('sectionProgress', () => {
  test('keeps section writing inside the 15%-65% band', () => {
    // Room is deliberately reserved either side: grounding + outline run before,
    // finalize + ledger + verify after. A section must never report 100%.
    for (const total of [1, 3, 7, 12]) {
      for (let i = 0; i < total; i += 1) {
        const pct = sectionProgress(i, total)
        assert.ok(pct >= 15 && pct < 65, `section ${i}/${total} gave ${pct}`)
      }
    }
  })

  test('increases monotonically across sections', () => {
    let prev = -1
    for (let i = 0; i < 8; i += 1) {
      const pct = sectionProgress(i, 8)
      assert.ok(pct >= prev, `progress went backwards at ${i}`)
      prev = pct
    }
  })

  test('starts the band at 15 for the first section', () => {
    assert.equal(sectionProgress(0, 5), 15)
  })

  test('survives a zero or missing total instead of returning NaN', () => {
    // A NaN would be written straight into generation_jobs.progress, which has a
    // 0-100 CHECK constraint, and the write would fail the whole job.
    assert.equal(sectionProgress(0, 0), 15)
    assert.equal(sectionProgress(2, undefined), 15)
  })
})

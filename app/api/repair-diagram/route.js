import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { repairUntilValid, validateMermaid } from '@/lib/ai/mermaid'
import { repairDiagramRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// On-demand diagram repair — what the lesson's "Retry" button calls.
//
// WHY A SERVER ROUND-TRIP FOR A RETRY:
//
// Retry used to re-run the client's own sanitize -> render pipeline on the same
// input. Those are pure functions, so the second attempt reproduced the first
// one's failure exactly, every time — the button could not succeed even in
// principle. A retry is only meaningful if something about the input changes,
// and the only thing that can change it is a model call that sees the error.
//
// The client's render error is the key input: the generation-time validator
// only ever ran mermaid.parse(), and the failures that actually reach learners
// are render() failures that parse() cannot see.
//
// The repaired diagram is written back into the topic when the caller owns it,
// so a diagram is repaired once rather than once per reader. Persistence is
// best-effort and goes through the USER's client — RLS decides, so a classroom
// student silently gets a working diagram for themselves without being able to
// rewrite a lesson owned by someone else.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(repairDiagramRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { code, renderError, topicId } = parsed.data

    // The client's transforms may already have made it renderable (it can fail
    // for reasons that are not the diagram's fault — a transient chunk-load
    // error, say). Re-check before spending a model call.
    const initial = await validateMermaid(code)
    if (initial.valid && !renderError) {
      return NextResponse.json({ success: true, code, repaired: false })
    }

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const { code: repaired, error: repairError } = await repairUntilValid(
      code,
      renderError || initial.error || 'Diagram failed to render in the browser.',
      { userSecrets }
    )

    if (!repaired) {
      return NextResponse.json({
        error: 'This diagram could not be repaired.',
        details: String(repairError || '').slice(0, 300)
      }, { status: 422 })
    }

    if (topicId) {
      await persistRepairedDiagram(supabase, { topicId, original: code, repaired })
    }

    return NextResponse.json({ success: true, code: repaired, repaired: true })
  } catch (error) {
    console.error('Diagram repair failed:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}

// Swap the repaired diagram into the stored lesson. Best-effort throughout: a
// failure here still leaves the caller with a working diagram on screen.
async function persistRepairedDiagram(supabase, { topicId, original, repaired }) {
  try {
    const { data: topic } = await supabase
      .from('topics').select('content').eq('id', topicId).maybeSingle()
    if (!topic?.content) return

    // Match on the diagram body rather than the fenced block: the client sends
    // the code it holds, whose surrounding whitespace need not be byte-identical
    // to what is stored.
    if (!topic.content.includes(original)) return

    const { error } = await supabase
      .from('topics')
      .update({ content: topic.content.replace(original, repaired) })
      .eq('id', topicId)

    // An RLS denial is the expected outcome for a classroom student, not a bug.
    if (error) {
      console.log(`[Mermaid] Repaired diagram not persisted (${error.message})`)
    }
  } catch (error) {
    console.warn('[Mermaid] Could not persist repaired diagram:', error?.message)
  }
}

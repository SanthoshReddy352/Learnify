'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, CheckCircle2, Circle, Loader2, FolderGit2 } from 'lucide-react'
import { toast } from 'sonner'

// Project-based learning track (Plan P7.4): generate a scaffolded project and
// work through its milestones as a checklist. Checkbox state is local for now
// (persistence would need the deferred subjects.project_track column → P14).
export default function ProjectTrackPanel({ subjectId, initialProject = null, className = '' }) {
  const [project, setProject] = useState(initialProject)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState({})

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/generate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate project')
      setProject(data.project)
    } catch (e) {
      toast.error('Could not generate a project: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key) => setChecked((c) => ({ ...c, [key]: !c[key] }))

  if (!project) {
    return (
      <div className={`rounded-xl border border-border border-dashed bg-foreground/5 p-8 flex flex-col items-center text-center ${className}`}>
        <FolderGit2 className="h-9 w-9 mb-3 text-primary/70" />
        <p className="text-sm text-muted-foreground mb-4">
          Learn by building — generate a hands-on project for this subject.
        </p>
        <Button onClick={generate} disabled={loading} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'Designing a project…' : 'Generate a hands-on project'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <FolderGit2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground m-0">{project.title}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{project.summary}</p>

      <ol className="space-y-5">
        {(project.milestones || []).map((m, mi) => (
          <li key={mi} className="border-l-2 border-primary/30 pl-4">
            <h4 className="font-semibold text-foreground m-0">{mi + 1}. {m.title}</h4>
            <p className="text-sm text-muted-foreground mt-1 mb-2">{m.description}</p>
            <ul className="space-y-1">
              {(m.checkpoints || []).map((cp, ci) => {
                const key = `${mi}-${ci}`
                const done = !!checked[key]
                return (
                  <li key={ci}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-pressed={done}
                      className="flex items-start gap-2 text-left text-sm hover:text-foreground transition-colors w-full"
                    >
                      {done
                        ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        : <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <span className={done ? 'line-through text-muted-foreground' : 'text-muted-foreground'}>{cp}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

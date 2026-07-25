'use client'

// Dialogs for the subject workspace, extracted from
// app/(app)/subjects/[id]/page.js. Each dialog is a controlled component:
// all state stays in the page, passed down as explicit props.

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Play, Sparkles, Trash2 } from 'lucide-react'
import ThreeDLoadingBar from '@/components/ThreeDLoadingBar'

function getStatusColor(status) {
  switch (status) {
    case 'locked': return 'text-muted-foreground'
    case 'available': return 'text-primary'
    case 'learning': return 'text-sky-500'
    case 'reviewing': return 'text-orange-500'
    case 'mastered': return 'text-emerald-500'
    default: return 'text-muted-foreground'
  }
}

export function EditSubjectDialog({ open, onOpenChange, isTeacher, value, onChange, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Subject Details</DialogTitle>
          <DialogDescription>{isTeacher ? 'Update your subject title, description, and syllabus. Teacher-authored subjects require both context fields.' : 'Update your subject title, description, and syllabus. These fields stay optional for self-study subjects.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-subject-title">Subject Title</Label>
            <Input
              id="edit-subject-title"
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-subject-description">{isTeacher ? 'Subject Description *' : 'Subject Description'}</Label>
            <Textarea
              id="edit-subject-description"
              placeholder={isTeacher ? 'Explain the scope, learner level, goals, and teacher guidance for this subject...' : 'Optional context about the scope, goals, or learner level for this subject...'}
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50 min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-subject-syllabus">{isTeacher ? 'Syllabus *' : 'Syllabus'}</Label>
            <Textarea
              id="edit-subject-syllabus"
              placeholder={isTeacher ? 'List the chapters, modules, or syllabus points this course should cover...' : 'Optional syllabus, chapter list, or outline...'}
              value={value.syllabus}
              onChange={(e) => onChange({ ...value, syllabus: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50 min-h-[140px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CreateTopicDialog({ open, onOpenChange, value, onChange, onCreate }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Topic</DialogTitle>
          <DialogDescription>Create a new learning topic for this subject.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="topic-title">Topic Title</Label>
            <Input
              id="topic-title"
              placeholder="e.g., Variables and Data Types"
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic-description">Description</Label>
            <Textarea
              id="topic-description"
              placeholder="Brief overview of what this topic covers..."
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50 min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic-content">Content</Label>
            <Textarea
              id="topic-content"
              placeholder="Detailed learning content, notes, or resources..."
              value={value.content}
              onChange={(e) => onChange({ ...value, content: e.target.value })}
              className="bg-background/50 border-border focus:border-primary/50 min-h-[120px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimated-minutes">Estimated Time (minutes)</Label>
              <Input
                id="estimated-minutes"
                type="number"
                min="5"
                max="240"
                value={value.estimated_minutes}
                onChange={(e) => onChange({ ...value, estimated_minutes: parseInt(e.target.value) || 30 })}
                className="bg-background/50 border-border focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={value.difficulty.toString()}
                onValueChange={(v) => onChange({ ...value, difficulty: parseInt(v) })}
              >
                <SelectTrigger className="bg-background/50 border-border focus:border-primary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Very Easy</SelectItem>
                  <SelectItem value="2">2 - Easy</SelectItem>
                  <SelectItem value="3">3 - Medium</SelectItem>
                  <SelectItem value="4">4 - Hard</SelectItem>
                  <SelectItem value="5">5 - Very Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onCreate}>Create Topic</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AIGenerateDialog({ open, onOpenChange, isTeacher, generating, config, onConfigChange, onGenerate }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Curriculum Generator
          </DialogTitle>
          <DialogDescription>
            {isTeacher ? 'Let AI create a complete learning path with topics and dependencies for your subject. Teacher-authored subjects need a description and syllabus first.' : 'Let AI create a complete learning path with topics and dependencies for your subject. The title alone is enough to start, and extra context is optional.'}
          </DialogDescription>
        </DialogHeader>
        {generating ? (
          <ThreeDLoadingBar />
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seed-text">Subject Context & Goals</Label>
              <Textarea
                id="seed-text"
                placeholder="Optional: add goals, priorities, exclusions, or any extra direction for the roadmap."
                value={config.seedText}
                onChange={(e) => onConfigChange({ ...config, seedText: e.target.value })}
                className="bg-background/50 border-border focus:border-primary/50 min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                {isTeacher ? 'Use this for extra guidance beyond the required description and syllabus.' : 'Optional. Add it when you want the roadmap to reflect a specific goal or scope.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-difficulty">Target Difficulty</Label>
                <Select
                  value={config.difficulty.toString()}
                  onValueChange={(v) => onConfigChange({ ...config, difficulty: parseInt(v) })}
                >
                  <SelectTrigger className="bg-background/50 border-border focus:border-primary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Beginner</SelectItem>
                    <SelectItem value="2">2 - Easy</SelectItem>
                    <SelectItem value="3">3 - Intermediate</SelectItem>
                    <SelectItem value="4">4 - Advanced</SelectItem>
                    <SelectItem value="5">5 - Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="total-minutes">Total Study Time (minutes)</Label>
                <Input
                  id="total-minutes"
                  type="number"
                  min="60"
                  max="1000"
                  step="30"
                  value={config.totalMinutes}
                  onChange={(e) => onConfigChange({ ...config, totalMinutes: parseInt(e.target.value) || 300 })}
                  className="bg-background/50 border-border focus:border-primary/50"
                />
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-primary/80">
                💡 AI will generate a complete, comprehensive study plan.
                This process involves creating detailed content for every topic, so effective preparation may take a while.
                Please be patient while we set up your personalized resources.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          {!generating && (
            <Button onClick={onGenerate} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Sparkles className="mr-2 h-5 w-5" />
              Generate Curriculum
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LinkTopicsDialog({ open, onOpenChange, topics, value, onChange, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[95vw] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Link Topics</DialogTitle>
          <DialogDescription>Create a dependency: user must learn Parent before Child.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="parent-topic">Parent Topic (Prerequisite)</Label>
            <Select
              value={value.parentTopicId}
              onValueChange={(v) => onChange({ ...value, parentTopicId: v })}
            >
              <SelectTrigger className="bg-background/50 border-border focus:border-primary/50">
                <SelectValue placeholder="Select prerequisite..." />
              </SelectTrigger>
              <SelectContent>
                {topics.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center text-muted-foreground">
            <ArrowLeft className="h-4 w-4 rotate-[-90deg]" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="child-topic">Child Topic (Locked)</Label>
            <Select
              value={value.childTopicId}
              onValueChange={(v) => onChange({ ...value, childTopicId: v })}
            >
              <SelectTrigger className="bg-background/50 border-border focus:border-primary/50">
                <SelectValue placeholder="Select target topic..." />
              </SelectTrigger>
              <SelectContent>
                {topics.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Create Link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDependencyAlert({ open, onOpenChange, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Connection?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove this dependency? The child topic might become available if it has no other prerequisites.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-foreground/5">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TopicDetailsDialog({ open, onOpenChange, topic, form, onFormChange, onSave, onDelete }) {
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border/10 w-[95vw] sm:max-w-[500px] max-h-[85vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Topic Details</DialogTitle>
          <DialogDescription>View and edit topic information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-topic-title">Topic Title</Label>
            <Input
              id="edit-topic-title"
              value={form.title}
              onChange={(e) => onFormChange({ ...form, title: e.target.value })}
              className="bg-background/50 border-input focus:border-primary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-topic-description">Description</Label>
            <Textarea
              id="edit-topic-description"
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              className="bg-background/50 border-input focus:border-primary/50 min-h-[100px]"
            />
          </div>

          {topic && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                Status: <span className={`uppercase font-bold ${getStatusColor(topic.status)}`}>{topic.status}</span>
              </div>
              {topic.status !== 'locked' && (
                <Button
                  size="sm"
                  onClick={() => router.push(topic.status === 'available' || topic.status === 'learning' ? `/learn/${topic.id}` : `/review/${topic.id}`)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  <Play className="mr-1 h-3 w-3" />
                  {topic.status === 'available' || topic.status === 'learning' ? 'Start Learning' : 'Review'}
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between items-center w-full gap-3 sm:gap-0 mt-6">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(topic)}
            className="w-full sm:w-auto bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 border mt-2 sm:mt-0"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Topic
          </Button>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto order-1 sm:order-none">Cancel</Button>
            <Button onClick={onSave} className="w-full sm:w-auto">Save Changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteTopicAlert({ topic, onOpenChange, onConfirm }) {
  return (
    <AlertDialog open={!!topic} onOpenChange={(open) => !open && onOpenChange(null)}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Topic?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete the topic <span className="font-semibold text-foreground">&quot;{topic?.title}&quot;</span>?
            This will remove all associated content and dependencies. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-foreground/5">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

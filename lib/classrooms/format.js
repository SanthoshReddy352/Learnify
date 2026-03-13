export function formatIst(timestamp, options = {}) {
  if (!timestamp) {
    return 'Never'
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
    ...options
  }).format(new Date(timestamp))
}

export function getProgressStatusMeta(status) {
  switch (status) {
    case 'mastered':
      return {
        label: 'Mastered',
        className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      }
    case 'reviewing':
      return {
        label: 'Reviewing',
        className: 'bg-orange-500/10 text-orange-500 border-orange-500/20'
      }
    case 'learning':
      return {
        label: 'Learning',
        className: 'bg-sky-500/10 text-sky-500 border-sky-500/20'
      }
    case 'available':
      return {
        label: 'Available',
        className: 'bg-primary/10 text-primary border-primary/20'
      }
    default:
      return {
        label: 'Locked',
        className: 'bg-muted text-muted-foreground border-white/10'
      }
  }
}

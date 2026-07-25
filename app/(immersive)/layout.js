// Full-screen immersive shell for learning sessions: no sidebar or header.
export default function ImmersiveLayout({ children }) {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      {children}
    </div>
  )
}

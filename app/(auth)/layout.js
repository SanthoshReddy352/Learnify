// Bare shell for auth pages (login, signup, password flows).
// Pages render their own full-screen centered cards; no sidebar/header.
export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      {children}
    </div>
  )
}

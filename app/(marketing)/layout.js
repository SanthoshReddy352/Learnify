import { Navbar } from '@/components/navbar'

// Landing page shell: top navbar, no dashboard chrome.
export default function MarketingLayout({ children }) {
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <main className="flex-1 w-full animate-in fade-in duration-500 pt-[calc(7rem+env(safe-area-inset-top))] px-4 md:px-8 pb-8">
        {children}
      </main>
    </div>
  )
}

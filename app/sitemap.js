import { createClient } from '@/lib/supabase/client' // Using client-side creator but it works in NextJS app routes too if configured, but sitemap.js is server-side.
// Actually, sitemap.js runs on the server, so we should use a server-compatible client or just fetch if we have the URL and key.
// The existing `lib/supabase/client.js` uses `createBrowserClient` which might not work in `sitemap.js` if it expects window context, though usually it's fine for simple reads if no auth is needed.
// However, `lib/supabase/server.js` uses `cookies()` which is definitely available.
// Let's use `lib/supabase/server.js` to be safe/correct for server components/functions.

import { createClient as createServerClient } from '@/lib/supabase/server'

export default async function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://learnify.com' // Replace with actual production URL or env var
  const supabase = await createServerClient()

  // Static routes
  const routes = [
    '',
    '/login',
    '/signup',
    '/community',
    '/dashboard',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: route === '' ? 1 : 0.8,
  }))

  // Dynamic routes: Public Subjects
  const { data: subjects, error } = await supabase
    .from('subjects')
    .select('id, updated_at')
    .eq('is_public', true)

  if (error) {
    console.error('Sitemap: Error fetching subjects', error)
    return routes
  }

  const subjectRoutes = subjects.map((subject) => ({
    url: `${baseUrl}/subjects/${subject.id}`,
    lastModified: new Date(subject.updated_at),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...routes, ...subjectRoutes]
}

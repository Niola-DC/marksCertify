// ============================================================
// MARKSCERTIFY — Dashboard Shell
// File: /app/dashboard/DashboardShell.js
//
// Sidebar + topbar chrome for every /dashboard/* route. Guards
// the route (redirects to /login if there's no session) and
// exposes the session + institution info to child pages via context.
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, FileBadge2, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SessionContext } from './SessionContext'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/certificates', label: 'Certificates', icon: FileBadge2 },
]

export default function DashboardShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [institution, setInstitution] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }
      setSession(data.session)
      setChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        router.replace('/login')
      } else {
        setSession(newSession)
      }
    })

    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!session) return
    fetch('/api/dashboard/stats', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.institution) setInstitution(json.institution)
      })
      .catch(() => {})
  }, [session])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (checking || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={{ session, institution }}>
      <div className="min-h-screen flex bg-[#F7F7F8]">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col px-4 py-6">
          <div className="flex items-center gap-2 px-2 mb-8">
            <div className="h-8 w-8 rounded-md bg-[#0D0D0D] flex items-center justify-center">
              <span className="text-[#B8962E] text-sm font-bold">M</span>
            </div>
            <span className="text-lg font-semibold text-zinc-900">MarksCertify</span>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#0D0D0D] text-white'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-[#B8962E]' : 'text-zinc-400'} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-zinc-200">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut size={18} />
              Log Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-4">
            <h1 className="text-lg font-semibold text-zinc-900">
              {pathname === '/dashboard/certificates' ? 'Certificates' : 'Dashboard'}
            </h1>
            {institution && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-900">{institution.name}</p>
                  <p className="text-xs text-zinc-400 capitalize">{institution.planTier} plan</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-[#B8962E]/15 flex items-center justify-center text-sm font-semibold text-[#B8962E]">
                  {institution.name?.[0]?.toUpperCase() || '?'}
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </SessionContext.Provider>
  )
}

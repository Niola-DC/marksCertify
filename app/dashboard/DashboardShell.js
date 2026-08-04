// ============================================================
// MARKSCERTIFY — Dashboard Shell
// File: /app/dashboard/DashboardShell.js
//
// Sidebar + topbar chrome for every /dashboard/* route. Guards
// the route (redirects to /login if there's no session) and
// exposes the session + institution info to child pages via context.
// Sidebar collapses to an off-canvas drawer below the md breakpoint.
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, FileBadge2, Users, Building2, Settings, LogOut, Menu, X, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SessionContext } from './SessionContext'
import ConfirmModal from './components/ConfirmModal'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/certificates', label: 'Certificates', icon: FileBadge2 },
  { href: '/dashboard/cohorts', label: 'Cohorts', icon: Users },
  { href: '/dashboard/profile', label: 'Profile', icon: Building2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

// An outage longer than this means the session/token may have gone stale
// while offline (or the user's laptop slept) — safer to force a clean
// re-login than to silently resume on state that might no longer be valid.
const STALE_OUTAGE_MS = 30 * 1000

export default function DashboardShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [institution, setInstitution] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [offline, setOffline] = useState(false)
  const offlineSinceRef = useRef(null)

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
      // A dropped connection can make Supabase's background token refresh
      // fail and briefly report no session — that's a connectivity problem,
      // not a real sign-out, and the offline toast already covers it. Only
      // treat it as a real sign-out once we know we're actually online.
      if (!newSession) {
        if (!offlineSinceRef.current) router.replace('/login')
      } else {
        setSession(newSession)
      }
    })

    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Floating network-status toast: shows the moment the browser goes
  // offline instead of letting stale/failed requests surface a confusing
  // "Invalid session" error. A brief blip just clears the toast on
  // reconnect and leaves whatever the user was doing untouched; an outage
  // longer than STALE_OUTAGE_MS forces a clean reload into /login instead,
  // since the session may no longer be trustworthy by then.
  useEffect(() => {
    function handleOffline() {
      offlineSinceRef.current = Date.now()
      setOffline(true)
    }
    function handleOnline() {
      const outageMs = offlineSinceRef.current ? Date.now() - offlineSinceRef.current : 0
      offlineSinceRef.current = null
      setOffline(false)
      if (outageMs > STALE_OUTAGE_MS) {
        window.location.href = '/login'
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

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
      <div className="h-screen flex bg-[#F7F7F8] overflow-hidden">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — off-canvas drawer on mobile, pinned full-height on md+ */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col px-4 py-6 transform transition-transform duration-200 md:static md:h-screen md:translate-x-0 md:z-auto ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-2 mb-8">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-[#0D0D0D] flex items-center justify-center">
                <span className="text-[#B8962E] text-sm font-bold">M</span>
              </div>
              <span className="text-lg font-semibold text-zinc-900">MarksCertify</span>
            </div>
            <button className="md:hidden text-zinc-400" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
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
              onClick={() => setShowLogoutConfirm(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut size={18} />
              Log Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <header className="shrink-0 flex items-center justify-between border-b border-zinc-200 bg-white px-4 sm:px-8 py-4">
            <div className="flex items-center gap-3">
              <button className="md:hidden text-zinc-500" onClick={() => setSidebarOpen(true)}>
                <Menu size={22} />
              </button>
              <h1 className="text-lg font-semibold text-zinc-900">
                {NAV_ITEMS.find((item) =>
                  item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
                )?.label || 'Dashboard'}
              </h1>
            </div>
            {institution && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-zinc-900">{institution.name}</p>
                  <p className="text-xs text-zinc-400 capitalize">{institution.planTier} plan</p>
                </div>
                <div className="h-9 w-9 shrink-0 rounded-full bg-[#B8962E]/15 flex items-center justify-center text-sm font-semibold text-[#B8962E]">
                  {institution.name?.[0]?.toUpperCase() || '?'}
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</main>
        </div>
      </div>

      {showLogoutConfirm && (
        <ConfirmModal
          title="Log Out"
          message="Are you sure you want to log out?"
          confirmLabel="Yes, Log Out"
          cancelLabel="Cancel"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={handleLogout}
        />
      )}

      {offline && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
          <WifiOff size={16} className="shrink-0 text-red-400" />
          Network connection lost. Try connecting to a network.
        </div>
      )}
    </SessionContext.Provider>
  )
}

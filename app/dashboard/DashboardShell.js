// ============================================================
// MARKSCERTIFY — Dashboard Shell
// File: /app/dashboard/DashboardShell.js
//
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, FileBadge2, Building2, Settings, LogOut, Menu, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SessionContext } from './SessionContext'
import ConfirmModal from './components/ConfirmModal'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/certificates', label: 'Certificates', icon: FileBadge2 },
  { href: '/dashboard/profile', label: 'Profile', icon: Building2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function DashboardShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [institution, setInstitution] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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
                {NAV_ITEMS.find((item) => item.href === pathname)?.label || 'Dashboard'}
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
    </SessionContext.Provider>
  )
}

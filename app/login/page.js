// ============================================================
// MARKSCERTIFY — Admin Login
// File: /app/login/page.js
// ============================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import AuthVisualPanel from '../components/AuthVisualPanel'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [resetMessage, setResetMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  function handleForgotPassword() {
    setResetMessage("Password reset isn't available yet — contact support to regain access.")
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Welcome back!</h1>
          <p className="text-sm text-zinc-500 mb-8">Enter your credentials to access your account</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email address" placeholder="Enter your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700" htmlFor="password">Password</label>
                <button type="button" onClick={handleForgotPassword} className="text-xs text-[#B8962E] font-medium">
                  forgot password
                </button>
              </div>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border border-zinc-200 rounded-md px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#B8962E]"
              />
            </div>

            {resetMessage && <p className="text-xs text-zinc-500">{resetMessage}</p>}

            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Remember for 30 days
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-md bg-[#0D0D0D] py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loading ? 'Signing in…' : 'Login'}
            </button>

            <p className="text-center text-sm text-zinc-500 mt-2">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-[#B8962E] font-medium">Sign Up</Link>
            </p>
          </form>
        </div>
      </div>

      <AuthVisualPanel
        heading="Trust, verified instantly"
        subheading="Every certificate scans to a public trust page — no login required, no waiting for a call-back."
      />
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        {...props}
        className="border border-zinc-200 rounded-md px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#B8962E]"
      />
    </label>
  )
}

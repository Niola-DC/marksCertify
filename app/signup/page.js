// ============================================================
// MARKSCERTIFY — Institution Signup
// File: /app/signup/page.js
// ============================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import AuthVisualPanel from '../components/AuthVisualPanel'

export default function SignupPage() {
  const router = useRouter()
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolName, email, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Signup failed.')

      if (json.session) {
        await supabase.auth.setSession(json.session)
        router.push('/dashboard')
      } else {
        router.push('/login')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Get Started Now</h1>
          <p className="text-sm text-zinc-500 mb-8">Set up your institution on MarksCertify.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="School Name" placeholder="Enter your school name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required />
            <Field label="Email address" placeholder="Enter your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Field label="Password" placeholder="At least 6 characters" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="rounded border-zinc-300"
              />
              I agree to the terms &amp; policy
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !agreed}
              className="mt-2 rounded-md bg-[#0D0D0D] py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loading ? 'Creating account…' : 'Signup'}
            </button>

            <p className="text-center text-sm text-zinc-500 mt-2">
              Have an account?{' '}
              <Link href="/login" className="text-[#B8962E] font-medium">Sign In</Link>
            </p>
          </form>
        </div>
      </div>

      <AuthVisualPanel
        heading="Credential infrastructure for African institutions"
        subheading="Generate, distribute, and verify certificates at scale — with a portable, verifiable record for every earner."
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

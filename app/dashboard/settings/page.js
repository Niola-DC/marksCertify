// ============================================================
// MARKSCERTIFY — Account Settings
// File: /app/dashboard/settings/page.js
//
// The logged-in admin's own account: avatar, phone number, and
// password. Distinct from /dashboard/profile, which is the
// institution's public-facing details.
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useSessionContext } from '../SessionContext'
import { supabase } from '../../lib/supabaseClient'

export default function SettingsPage() {
  const { session } = useSessionContext()

  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [phoneNumber, setPhoneNumber] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneMessage, setPhoneMessage] = useState(null)
  const [phoneError, setPhoneError] = useState(null)

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  const avatarInputRef = useRef(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const [passwordError, setPasswordError] = useState(null)

  useEffect(() => {
    fetchAccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchAccount() {
    setLoading(true)
    fetch('/api/account/profile', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setAccount(json.account)
        setPhoneNumber(json.account.phoneNumber || '')
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSavePhone(e) {
    e.preventDefault()
    setSavingPhone(true)
    setPhoneMessage(null)
    setPhoneError(null)

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phoneNumber }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save.')
      setAccount(json.account)
      setPhoneMessage('Saved.')
    } catch (err) {
      setPhoneError(err.message)
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed.')
      setAccount((prev) => ({ ...prev, avatarUrl: json.url }))
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const res = await fetch('/api/account/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to remove.')
      setAccount((prev) => ({ ...prev, avatarUrl: null }))
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault()
    setPasswordMessage(null)
    setPasswordError(null)

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setPasswordSaving(true)
    try {
      // Re-authenticate with the current password before allowing the change.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: currentPassword,
      })
      if (verifyError) throw new Error('Current password is incorrect.')

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw new Error(updateError.message)

      setPasswordMessage('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading settings…</p>
  }

  if (!account) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-600">{loadError || 'Failed to load account.'}</p>
        <button
          onClick={fetchAccount}
          className="self-start rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Account settings */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-5">
        <h2 className="text-base font-semibold text-zinc-900">Account Settings</h2>

        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden">
            {avatarUploading ? (
              <Loader2 size={18} className="animate-spin text-zinc-400" />
            ) : account.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-zinc-400">
                {account.fullName?.[0]?.toUpperCase() || account.email?.[0]?.toUpperCase() || '?'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="rounded-md bg-[#B8962E]/10 px-4 py-2 text-sm font-medium text-[#B8962E] disabled:opacity-50"
            >
              Change Photo
            </button>
            {account.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarUploading}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarSelect}
            className="hidden"
          />
        </div>
        {avatarError && <p className="text-sm text-red-600">{avatarError}</p>}

        <form onSubmit={handleSavePhone} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Email address
            <input
              value={account.email || ''}
              disabled
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-400 bg-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Phone number
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+234 800 000 0000"
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-[#B8962E]"
            />
          </label>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={savingPhone}
              className="rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingPhone ? 'Saving…' : 'Save'}
            </button>
            {phoneMessage && <p className="text-sm text-green-700">{phoneMessage}</p>}
            {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
          </div>
        </form>
      </div>

      {/* Security */}
      <form onSubmit={handleUpdatePassword} className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-zinc-900">Security</h2>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Current Password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#B8962E]"
            />
          </label>
        </div>

        {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
        {passwordMessage && <p className="text-sm text-green-700">{passwordMessage}</p>}

        <button
          type="submit"
          disabled={passwordSaving}
          className="self-start rounded-md bg-[#0D0D0D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {passwordSaving ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

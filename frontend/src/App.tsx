import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import SessionDetail from './pages/SessionDetail'
import ProjectDetail from './pages/ProjectDetail'
import PortsPage from './pages/PortsPage'
import AuthGate from './pages/AuthGate'

export default function App() {
  // null = checking, true = authed, false = needs gate
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      setAuthed(true)
      return
    }
    const stored = localStorage.getItem('ow_token')
    if (!stored) {
      setAuthed(false)
      return
    }
    // Re-validate stored token against current backend.
    // If backend restarted (new code), this returns 403 → force re-auth.
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: stored }),
    }).then(r => {
      if (r.ok) {
        setAuthed(true)
      } else {
        localStorage.removeItem('ow_token')
        setAuthed(false)
      }
    }).catch(() => setAuthed(true)) // network error — show app, let it fail naturally
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <span className="text-[#2a2a2a] font-mono text-xs">connecting…</span>
      </div>
    )
  }

  if (!authed) {
    return <AuthGate onSuccess={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f0f0f0]">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/ports" element={<PortsPage />} />
      </Routes>
    </div>
  )
}

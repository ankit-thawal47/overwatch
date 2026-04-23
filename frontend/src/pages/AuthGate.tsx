import { useEffect, useRef, useState } from 'react'

interface Props {
  onSuccess: () => void
}

export default function AuthGate({ onSuccess }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-submit if ?code= is in the URL (shared link with token embedded)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlCode = params.get('code')
    if (urlCode) {
      submit(urlCode)
    } else {
      inputRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(token: string) {
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      if (res.ok) {
        localStorage.setItem('ow_token', token.trim())
        // Remove ?code= from URL before entering the app
        const url = new URL(window.location.href)
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.toString())
        onSuccess()
      } else {
        setError('invalid code — check the terminal')
        setLoading(false)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    } catch {
      setError('connection failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8 select-none">
          <div className="font-mono text-[#22c55e]/70 text-xl tracking-[0.5em] uppercase">overwatch</div>
          <div className="font-mono text-[#22c55e]/25 text-[10px] tracking-[0.3em] mt-1">-- session monitor --</div>
        </div>

        <div className="border border-[#1e1e1e] rounded-lg p-6 bg-[#111]">
          <p className="text-[#6b7280] text-xs font-mono uppercase tracking-widest mb-4 text-center">
            access code
          </p>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit(code)}
            placeholder="from your terminal"
            autoComplete="off"
            autoCorrect="off"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-3 py-2.5 text-sm text-[#f0f0f0] placeholder-[#2a2a2a] focus:outline-none focus:border-[#22c55e]/30 font-mono text-center tracking-widest"
          />
          {error && (
            <p className="text-[#ef4444] text-xs font-mono mt-2 text-center">{error}</p>
          )}
          <button
            onClick={() => submit(code)}
            disabled={loading || !code.trim()}
            className="w-full mt-3 py-2 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#f0f0f0] hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          >
            {loading ? '…' : 'enter'}
          </button>
        </div>

        <p className="text-[#2a2a2a] text-[10px] font-mono text-center mt-4">
          run <span className="text-[#374151]">make dev</span> and check your terminal
        </p>

        <p className="text-[#2a2a2a] text-[10px] font-mono text-center mt-6">
          made with <span className="text-[#e11d48]/50">♥</span> by{' '}
          <a
            href="https://www.linkedin.com/in/ankit-thawal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#374151] hover:text-[#6b7280] transition-colors underline underline-offset-2"
          >
            ankit
          </a>
        </p>
      </div>
    </div>
  )
}

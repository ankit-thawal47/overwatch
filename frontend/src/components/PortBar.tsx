import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Port } from '../lib/api'
import { getWsClient } from '../lib/ws'

interface PortBadgeProps {
  port: Port
}

function PortBadge({ port }: PortBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        className="font-mono text-xs px-2 py-1 rounded border border-[#1e40af] text-[#60a5fa] bg-[#1e40af]/10 hover:bg-[#1e40af]/20 transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        :{port.port}
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[160px]">
          <div className="bg-[#222222] border border-[#2a2a2a] rounded-md px-3 py-2 text-xs shadow-lg">
            <div className="text-[#f0f0f0] font-medium mb-1">:{port.port}</div>
            {port.process_name && (
              <div className="text-[#6b7280]">Process: {port.process_name}</div>
            )}
            {port.pid && (
              <div className="text-[#6b7280]">PID: {port.pid}</div>
            )}
            {port.matched_project && (
              <div className="text-[#22c55e]">{port.matched_project}</div>
            )}
            {port.process_cwd && (
              <div className="text-[#374151] text-xs truncate max-w-[200px]">{port.process_cwd}</div>
            )}
          </div>
          <div className="w-2 h-2 bg-[#222222] border-r border-b border-[#2a2a2a] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  )
}

export default function PortBar() {
  const [ports, setPorts] = useState<Port[]>([])

  useEffect(() => {
    api.listActivePorts().then(setPorts).catch(console.error)
    const ws = getWsClient()
    const unsub = ws.onEvent('ports_changed', (data) => {
      const d = data as { ports: Port[] }
      if (d?.ports) {
        setPorts(d.ports.filter((p) => p.pid != null))
      }
    })
    return unsub
  }, [])

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f]/95 backdrop-blur border-t border-[#2a2a2a] px-6 py-2 z-40">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        <Link to="/ports" className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#f0f0f0] transition-colors flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse inline-block" />
          Active Ports
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {ports.length === 0 ? (
            <span className="text-xs text-[#374151]">None</span>
          ) : (
            ports.map((p) => <PortBadge key={p.port} port={p} />)
          )}
        </div>
        <div className="ml-auto text-[10px] font-mono text-[#374151] flex-shrink-0">
          made with <span className="text-[#e11d48]/60">♥</span> by{' '}
          <a
            href="https://www.linkedin.com/in/ankit-thawal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#22c55e]/70 hover:text-[#22c55e] transition-colors underline underline-offset-2"
          >
            ankit
          </a>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Port } from '../lib/api'
import { getWsClient } from '../lib/ws'

export default function PortsPage() {
  const [ports, setPorts] = useState<Port[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.listPorts().then(setPorts).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const ws = getWsClient()
    const unsub = ws.onEvent('ports_changed', (data) => {
      const d = data as { ports: Port[] }
      if (d?.ports) setPorts(d.ports)
    })
    return unsub
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-[#6b7280] hover:text-[#f0f0f0] text-sm">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#f0f0f0]">Active Ports</h1>
      </div>

      {loading ? (
        <pre className="text-[#2a2a2a] text-xs font-mono leading-snug select-none">{
`╔══════════════════════╗
║  scanning ports...   ║
╚══════════════════════╝`
        }</pre>
      ) : ports.length === 0 ? (
        <pre className="text-[#252525] text-xs font-mono leading-snug select-none">{
`╔══════════════════════╗
║  no active ports     ║
╚══════════════════════╝`
        }</pre>
      ) : (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                <th className="text-left px-4 py-3 text-[#6b7280] font-medium">Port</th>
                <th className="text-left px-4 py-3 text-[#6b7280] font-medium">Protocol</th>
                <th className="text-left px-4 py-3 text-[#6b7280] font-medium">Process</th>
                <th className="text-left px-4 py-3 text-[#6b7280] font-medium">PID</th>
                <th className="text-left px-4 py-3 text-[#6b7280] font-medium">Project</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => (
                <tr key={p.port} className="border-b border-[#2a2a2a] last:border-0 hover:bg-[#222222]">
                  <td className="px-4 py-3 font-mono text-[#60a5fa]">:{p.port}</td>
                  <td className="px-4 py-3 text-[#6b7280] uppercase text-xs">{p.protocol}</td>
                  <td className="px-4 py-3 text-[#f0f0f0]">
                    {p.process_name ?? <span className="text-[#374151]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {p.pid ?? <span className="text-[#374151]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.matched_project ? (
                      <span className="text-[#22c55e] text-xs">{p.matched_project}</span>
                    ) : (
                      <span className="text-[#374151]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { ToolUse } from '../lib/api'

interface Props {
  toolUse: ToolUse
}

function toolColor(tool: string): { bg: string; text: string } {
  const t = tool.toLowerCase()
  if (t === 'bash') return { bg: '#818cf8/20', text: '#818cf8' }
  if (['read', 'glob', 'grep'].includes(t)) return { bg: '#3b82f6/20', text: '#60a5fa' }
  if (['write', 'edit', 'multiedit'].includes(t)) return { bg: '#f97316/20', text: '#fb923c' }
  if (['webfetch', 'websearch'].includes(t)) return { bg: '#0d9488/20', text: '#2dd4bf' }
  return { bg: '#6b7280/20', text: '#9ca3af' }
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v)
      if (k === 'new_string' || k === 'content') {
        const lines = val.split('\n')
        if (lines.length > 3) {
          return `${k}: ${lines.slice(0, 3).join('\n')}\n…(${lines.length - 3} more lines)`
        }
        return `${k}: ${val}`
      }
      const truncated = val.length > 80 ? val.slice(0, 80) + '…' : val
      return `${k}: ${truncated}`
    })
    .join('\n')
}

const MAX_REMOVED = 20
const MAX_ADDED = 20

function renderDiff(oldStr: string, newStr: string, filePath?: string): { jsx: React.ReactNode; totalLines: number } {
  const removedLines = oldStr.split('\n')
  const addedLines = newStr.split('\n')

  const removedTruncated = removedLines.length > MAX_REMOVED
  const addedTruncated = addedLines.length > MAX_ADDED

  const shownRemoved = removedLines.slice(0, MAX_REMOVED)
  const shownAdded = addedLines.slice(0, MAX_ADDED)

  const totalLines = removedLines.length + addedLines.length

  const jsx = (
    <div className="font-mono text-xs">
      {filePath && (
        <div className="px-3 py-1.5 text-[#9ca3af] border-b border-[#2a2a2a] truncate">
          {filePath}
        </div>
      )}
      <div className="px-3 py-1 border-b border-[#2a2a2a] text-[#4b5563]">
        {'─'.repeat(40)}
      </div>
      <div>
        {shownRemoved.map((line, i) => (
          <div key={`r-${i}`} className="flex bg-[#3b0000] px-3 py-0.5 whitespace-pre-wrap break-all">
            <span className="text-[#f87171] select-none mr-2 flex-shrink-0">-</span>
            <span className="text-[#f87171]">{line}</span>
          </div>
        ))}
        {removedTruncated && (
          <div className="px-3 py-0.5 text-[#6b7280] bg-[#3b0000] italic">
            …{removedLines.length - MAX_REMOVED} more removed lines
          </div>
        )}
      </div>
      <div className="px-3 py-0.5 text-[#4b5563] border-y border-[#2a2a2a]">···</div>
      <div>
        {shownAdded.map((line, i) => (
          <div key={`a-${i}`} className="flex bg-[#002200] px-3 py-0.5 whitespace-pre-wrap break-all">
            <span className="text-[#4ade80] select-none mr-2 flex-shrink-0">+</span>
            <span className="text-[#4ade80]">{line}</span>
          </div>
        ))}
        {addedTruncated && (
          <div className="px-3 py-0.5 text-[#6b7280] bg-[#002200] italic">
            …{addedLines.length - MAX_ADDED} more added lines
          </div>
        )}
      </div>
    </div>
  )

  return { jsx, totalLines }
}

export default function ToolUseCard({ toolUse }: Props) {
  const outputLines = (toolUse.output ?? '').split('\n').length
  const [outputExpanded, setOutputExpanded] = useState(outputLines <= 5)
  const [copied, setCopied] = useState(false)

  const isEditTool = toolUse.tool === 'Edit' || toolUse.tool === 'MultiEdit'
  const input = toolUse.input as Record<string, unknown>
  const hasOldNew = isEditTool &&
    typeof input.old_string === 'string' &&
    typeof input.new_string === 'string'

  const diffResult = hasOldNew
    ? renderDiff(
        input.old_string as string,
        input.new_string as string,
        typeof input.file_path === 'string' ? input.file_path : undefined
      )
    : null

  const [diffExpanded, setDiffExpanded] = useState(
    diffResult ? diffResult.totalLines <= 10 : false
  )

  const { text: labelColor } = toolColor(toolUse.tool)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(toolUse.output ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div
      className={`
        my-2 rounded-md border overflow-hidden text-xs
        ${toolUse.is_error ? 'border-l-2 border-[#ef4444] border-r-[#2a2a2a] border-t-[#2a2a2a] border-b-[#2a2a2a]' : 'border-[#2a2a2a]'}
        bg-[#111111]
      `}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border-b border-[#2a2a2a]">
        <span className="font-semibold" style={{ color: labelColor }}>
          {toolUse.tool}
        </span>
        <div className="flex items-center gap-2">
          {hasOldNew && diffResult && (
            <button
              onClick={() => setDiffExpanded(!diffExpanded)}
              className="text-[#6b7280] hover:text-[#f0f0f0] text-xs transition-colors"
            >
              {diffExpanded ? '▲ Collapse diff' : `▼ Diff (${diffResult.totalLines} lines)`}
            </button>
          )}
          {toolUse.output && (
            <button
              onClick={() => setOutputExpanded(!outputExpanded)}
              className="text-[#6b7280] hover:text-[#f0f0f0] text-xs transition-colors"
            >
              {outputExpanded ? '▲ Collapse' : `▼ Output (${outputLines} lines)`}
            </button>
          )}
        </div>
      </div>

      {hasOldNew && diffResult ? (
        diffExpanded ? (
          <div className="border-b border-[#2a2a2a]">
            {diffResult.jsx}
          </div>
        ) : null
      ) : (
        Object.keys(toolUse.input).length > 0 && (
          <div className="px-3 py-2 border-b border-[#2a2a2a] font-mono text-[#9ca3af] whitespace-pre-wrap break-words">
            {formatInput(toolUse.input)}
          </div>
        )
      )}

      {isEditTool && !hasOldNew && Object.keys(toolUse.input).length > 0 && (
        <div className="px-3 py-2 border-b border-[#2a2a2a] font-mono text-[#9ca3af] whitespace-pre-wrap break-words">
          {formatInput(toolUse.input)}
        </div>
      )}

      {toolUse.output && outputExpanded && (
        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 text-[#6b7280] hover:text-[#f0f0f0] text-xs transition-colors z-10"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <pre className="px-3 py-2 font-mono text-[#9ca3af] overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto text-xs">
            {toolUse.output}
          </pre>
        </div>
      )}
    </div>
  )
}

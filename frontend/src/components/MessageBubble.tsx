import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('sql', sql)
import { Message } from '../lib/api'
import ToolUseCard from './ToolUseCard'

interface Props {
  message: Message
  hideTools?: boolean
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Extract a single XML tag value, e.g. <command-name>foo</command-name> → "foo"
function extractTag(content: string, tag: string): string | null {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}

// Classify special Claude Code internal messages so we don't show them as raw USER blobs
type Classification =
  | { kind: 'normal' }
  | { kind: 'slash_command'; name: string; output: string | null }
  | { kind: 'caveat' }          // <local-command-caveat> wrappers
  | { kind: 'empty' }

function classify(content: string): Classification {
  if (!content.trim()) return { kind: 'empty' }

  // Slash command block: contains <command-name> tag
  if (content.includes('<command-name>')) {
    const name = extractTag(content, 'command-name') ?? extractTag(content, 'command-message') ?? '/'
    const output = extractTag(content, 'local-command-stdout')
    return { kind: 'slash_command', name, output }
  }

  // Caveat wrapper injected before local command output
  if (content.includes('<local-command-caveat>')) return { kind: 'caveat' }

  // Bare stdout line (e.g. <local-command-stdout>Bye!</local-command-stdout>)
  if (content.includes('<local-command-stdout>')) {
    const output = extractTag(content, 'local-command-stdout')
    return { kind: 'slash_command', name: '', output }
  }

  return { kind: 'normal' }
}

export default function MessageBubble({ message, hideTools = false }: Props) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // ── System messages ────────────────────────────────────────────────────────
  if (isSystem) {
    return (
      <div className="my-1 text-center">
        <span className="text-[10px] text-[#2d3748] italic font-mono">
          {message.content.slice(0, 120)}
        </span>
      </div>
    )
  }

  // ── User messages ──────────────────────────────────────────────────────────
  if (isUser) {
    const cls = classify(message.content)

    // Completely skip empty tool-result placeholders
    if (cls.kind === 'empty' && message.tool_uses.length === 0) return null

    // Skip caveat wrappers — they're noise
    if (cls.kind === 'caveat') return null

    // Slash command (e.g. /exit, /compact) — render as a small inline badge
    if (cls.kind === 'slash_command') {
      return (
        <div className="flex items-center gap-2 py-1.5 my-0.5 pl-4">
          <span className="text-[10px] font-mono text-[#2d3748]">
            {cls.name
              ? <><span className="text-[#374151]">↩</span> <span className="text-[#4a5568]">{cls.name}</span></>
              : null
            }
            {cls.output && (
              <span className="ml-2 text-[#374151]">→ {cls.output}</span>
            )}
          </span>
        </div>
      )
    }

    // Normal user message
    return (
      <div className="flex gap-3 py-3 border-b border-[#1a1a1a] pl-3 sm:pl-4 border-l-2 border-l-[#4b5563] bg-[#1a1a1a]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest font-mono text-[#4b5563]">user</span>
            {message.timestamp && (
              <span className="text-[10px] text-[#4b5563] font-mono">{formatTime(message.timestamp)}</span>
            )}
          </div>
          <div className="text-sm text-[#f0f0f0] whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    )
  }

  // ── Assistant messages ─────────────────────────────────────────────────────

  // Skip completely empty assistant messages (no text, no tools)
  if (!message.content && message.tool_uses.length === 0) return null

  return (
    <div className="flex gap-3 py-3 border-b border-[#1a1a1a] pl-3 sm:pl-4 border-l-2 border-l-[#1e3a5f]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest font-mono text-[#4b5563]">claude</span>
          {message.timestamp && (
            <span className="text-[10px] text-[#4b5563] font-mono">{formatTime(message.timestamp)}</span>
          )}
        </div>

        {message.content && (
          <div className="prose prose-sm prose-invert max-w-none text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isBlock = !!match
                  if (isBlock) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    )
                  }
                  return <code className="bg-[#2a2a2a] px-1 py-0.5 rounded text-[#fb923c] text-xs font-mono" {...props}>{children}</code>
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!hideTools && message.tool_uses.length > 0 && (
          <div className="mt-2">
            {message.tool_uses.map((tu) => (
              <ToolUseCard key={tu.id} toolUse={tu} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

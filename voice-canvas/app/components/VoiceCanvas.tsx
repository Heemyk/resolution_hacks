'use client'

import { useState, useRef, useEffect } from 'react'

type ArtifactType = 'diagram' | 'chart' | 'component'
type Status = 'idle' | 'listening' | 'processing'

interface Artifact {
  id: string
  type: ArtifactType
  title: string
  content: string
}

interface TranscriptEntry {
  id: string
  text: string
  pending: boolean
}

const DEMO_ARTIFACTS: Artifact[] = [
  {
    id: '1',
    type: 'diagram',
    title: 'User Login Flow',
    content: `flowchart TD
  A[User] --> B[Login Page]
  B --> C{Credentials valid?}
  C -->|Yes| D[Dashboard]
  C -->|No| E[Show Error]
  E --> B`,
  },
  {
    id: '2',
    type: 'chart',
    title: 'Monthly Active Users',
    content: `{
  "type": "bar",
  "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
  "data": [1200, 1900, 1500, 2400, 2100, 3200]
}`,
  },
  {
    id: '3',
    type: 'component',
    title: 'Signup Form',
    content: `<div class="flex flex-col gap-4 p-6
  bg-white rounded-xl shadow-sm max-w-sm">
  <input placeholder="Email address"
    class="border rounded-lg px-4 py-2" />
  <input type="password" placeholder="Password"
    class="border rounded-lg px-4 py-2" />
  <button class="bg-violet-600 text-white
    rounded-lg py-2 font-medium">
    Create account
  </button>
</div>`,
  },
]

const DEMO_TRANSCRIPT: TranscriptEntry[] = [
  { id: '1', text: 'Show me a flowchart of how a user logs in', pending: false },
  { id: '2', text: 'Now show me a bar chart of monthly active users', pending: false },
  { id: '3', text: 'Give me a signup form component', pending: false },
]

export default function VoiceCanvas() {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    return () => timeoutsRef.current.forEach(clearTimeout)
  }, [])

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timeoutsRef.current.push(id)
  }

  const runDemo = () => {
    setStatus('listening')
    setTranscript([])
    setArtifacts([])

    DEMO_TRANSCRIPT.forEach((entry, i) => {
      const base = i * 3200
      schedule(() => {
        setTranscript(prev => [...prev, { ...entry, pending: true }])
      }, base)
      schedule(() => {
        setTranscript(prev =>
          prev.map(t => t.id === entry.id ? { ...t, pending: false } : t)
        )
        setStatus('processing')
      }, base + 1200)
      schedule(() => {
        setArtifacts(prev => [...prev, DEMO_ARTIFACTS[i]])
        setStatus(i === DEMO_TRANSCRIPT.length - 1 ? 'idle' : 'listening')
      }, base + 2000)
    })
  }

  const handleMic = () => {
    if (status !== 'idle') {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      setStatus('idle')
    } else {
      runDemo()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <MicIconSm className="text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">Voice Canvas</span>
        </div>
        <StatusPill status={status} />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Transcript sidebar */}
        <aside className="w-72 flex flex-col bg-white border-r border-gray-200 shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Transcript
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-400 text-center leading-relaxed">
                  Press speak to start
                </p>
              </div>
            ) : (
              transcript.map(entry => (
                <TranscriptRow key={entry.id} entry={entry} />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {artifacts.length === 0 ? (
            <EmptyCanvas />
          ) : (
            <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-min">
              {artifacts.map((artifact, i) => (
                <ArtifactCard key={artifact.id} artifact={artifact} index={i} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="shrink-0 flex flex-col items-center gap-3 py-5 bg-white border-t border-gray-200 px-6">
        {status === 'listening' && <Waveform />}
        <MicButton status={status} onClick={handleMic} />
        <p className="text-[11px] text-gray-400">
          {status === 'idle'
            ? 'Press to speak'
            : status === 'listening'
            ? 'Listening…'
            : 'Generating…'}
        </p>
      </footer>
    </div>
  )
}

function StatusPill({ status }: { status: Status }) {
  const config = {
    idle: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Ready', bg: 'bg-gray-50 border-gray-200' },
    listening: { dot: 'bg-green-500 animate-pulse', text: 'text-green-700', label: 'Listening', bg: 'bg-green-50 border-green-200' },
    processing: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-700', label: 'Generating', bg: 'bg-amber-50 border-amber-200' },
  }
  const c = config[status]
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${c.bg}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
    </div>
  )
}

function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  return (
    <div className="flex gap-2.5 items-start animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${entry.pending ? 'bg-violet-400 animate-pulse' : 'bg-violet-500'}`} />
      <p className={`text-sm leading-relaxed transition-colors ${entry.pending ? 'text-gray-400' : 'text-gray-700'}`}>
        {entry.text}
      </p>
    </div>
  )
}

function EmptyCanvas() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.442 2.798H4.24c-1.47 0-2.443-1.799-1.442-2.798L4.2 15.3" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">Canvas is empty</p>
        <p className="text-xs text-gray-400 mt-0.5">Speak to generate diagrams, charts &amp; components</p>
      </div>
    </div>
  )
}

const TYPE_CONFIG = {
  diagram: {
    label: 'Diagram',
    badge: 'text-sky-600 bg-sky-50 border-sky-200',
    header: 'bg-sky-50/50',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  chart: {
    label: 'Chart',
    badge: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    header: 'bg-emerald-50/50',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  component: {
    label: 'Component',
    badge: 'text-violet-600 bg-violet-50 border-violet-200',
    header: 'bg-violet-50/50',
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
}

function ArtifactCard({ artifact, index }: { artifact: Artifact; index: number }) {
  const config = TYPE_CONFIG[artifact.type]
  return (
    <div
      className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-400"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${config.header}`}>
        <h3 className="text-sm font-semibold text-gray-800">{artifact.title}</h3>
        <span className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium ${config.badge}`}>
          {config.icon}
          {config.label}
        </span>
      </div>
      <div className="p-4 bg-gray-50 min-h-[120px]">
        <pre className="text-[11px] text-gray-500 font-mono leading-relaxed whitespace-pre-wrap break-all">
          {artifact.content}
        </pre>
      </div>
    </div>
  )
}

function Waveform() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] bg-violet-500 rounded-full"
          style={{
            height: `${8 + Math.sin(i * 0.8) * 6 + Math.cos(i * 1.3) * 4}px`,
            animation: `waveBar 0.9s ease-in-out infinite`,
            animationDelay: `${i * 0.04}s`,
          }}
        />
      ))}
    </div>
  )
}

function MicButton({ status, onClick }: { status: Status; onClick: () => void }) {
  const active = status !== 'idle'
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold
        transition-all duration-150 active:scale-95
        ${active
          ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-200'
          : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-200'
        }
      `}
    >
      {active && (
        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
      )}
      <MicIconSm className="text-white" />
      {active ? 'Stop' : 'Speak'}
    </button>
  )
}

function MicIconSm({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="currentColor" viewBox="0 0 20 20">
      <path d="M7 4a3 3 0 016 0v4a3 3 0 01-6 0V4z" />
      <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
    </svg>
  )
}

import { useState, useEffect, useRef } from 'react'
import GraphPanel from './components/GraphPanel'
import './App.css'

function RainCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const cols = Math.floor(canvas.width / 22)
    const drops = Array.from({ length: cols }, () => Math.random() * -80)
    const chars = '01アイウカキクサシスタチツナニヌ∴∵∶∷⌁⌂⌇'.split('')
    let raf
    const draw = () => {
      ctx.fillStyle = 'rgba(5, 10, 15, 0.06)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      drops.forEach((y, i) => {
        const c = chars[Math.floor(Math.random() * chars.length)]
        ctx.fillStyle = `rgba(61, 214, 214, ${Math.random() * 0.35 + 0.03})`
        ctx.font = '13px "Share Tech Mono", monospace'
        ctx.fillText(c, i * 22, y * 22)
        if (Math.random() > 0.978) drops[i] = 0
        drops[i] += 0.4
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="rain-canvas" />
}

function InferPanel({ data, onClose }) {
  const [think, setThink] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('connecting') // connecting | thinking | answering | done | error
  const answerRef = useRef(null)
  const thinkRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/infer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes: data.nodes, edges: data.edges }),
        })
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        setStatus('thinking')

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop()
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue
            const msg = JSON.parse(part.slice(6))
            if (msg.type === 'think') {
              setStatus('thinking')
              setThink(t => t + msg.text)
              setTimeout(() => thinkRef.current?.scrollTo(0, thinkRef.current.scrollHeight), 0)
            } else if (msg.type === 'answer') {
              setStatus('answering')
              setAnswer(t => t + msg.text)
              setTimeout(() => answerRef.current?.scrollTo(0, answerRef.current.scrollHeight), 0)
            } else if (msg.type === 'error') {
              setStatus('error')
              setAnswer(msg.text)
            }
          }
        }
        if (!cancelled) setStatus('done')
      } catch (e) {
        if (!cancelled) { setStatus('error'); setAnswer(e.message) }
      }
    }
    run()
    return () => { cancelled = true }
  }, [data])

  const statusLabel = {
    connecting: '// CONNECTING...',
    thinking:   '// REASONING...',
    answering:  '// GENERATING...',
    done:       '// COMPLETE',
    error:      '// ERROR',
  }[status]

  return (
    <div className="infer-panel">
      <div className="infer-header">
        <span className="infer-title">INFERENCE ENGINE</span>
        <div className="infer-header-r">
          <span className={`infer-status ${status}`}>{statusLabel}</span>
          <button className="infer-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {think && (
        <div className="infer-section">
          <div className="infer-sec-label">// REASONING CHAIN</div>
          <div className="infer-think" ref={thinkRef}>{think}</div>
        </div>
      )}

      {answer && (
        <div className="infer-section">
          <div className="infer-sec-label">// ANALYSIS REPORT</div>
          <div className="infer-answer" ref={answerRef}>
            {answer}
            {status === 'answering' && <span className="infer-cursor">▮</span>}
          </div>
        </div>
      )}

      {status === 'connecting' && (
        <div className="infer-loading">
          <span className="infer-dot" /><span className="infer-dot" /><span className="infer-dot" />
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [text, setText] = useState('')
  const [graphData, setGraphData] = useState(null)
  const [graphKey, setGraphKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [showInfer, setShowInfer] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const analyze = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setGraphData(null)
    setShowInfer(false)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'CONN_REFUSED')
      }
      setGraphData(await res.json())
      setGraphKey(k => k + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const dots = '.'.repeat((tick % 3) + 1).padEnd(3, ' ')

  return (
    <div className="app">
      <RainCanvas />
      <div className="noise" />
      <div className="scanlines" />

      <header className="header">
        <div className="h-left">
          <div className="logo">INTEL<span className="logo-c">HUB</span></div>
          <span className="h-div">//</span>
          <span className="h-label">entity_graph.sys</span>
        </div>
        <div className="h-right">
          <span className="sys-tick">{String(tick).padStart(4, '0')}</span>
          <span className="sys-dot" />
          <span className="sys-status">ONLINE</span>
        </div>
      </header>

      <div className="main">
        {!graphData ? (
          <div className="input-panel">
            <div className="prompt-bar">
              <span className="p-sym">›</span>
              <span className="p-cmd">INPUT_TEXT</span>
              <span className="p-cur">▮</span>
              <span className="p-meta">{text.length} chr</span>
            </div>
            <div className="ta-wrap">
              <textarea
                className="textarea"
                placeholder="// paste any text — news, articles, reports, anything..."
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze() }}
                spellCheck={false}
              />
              <div className="ta-gutter">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i}>{String(i + 1).padStart(2, '0')}</span>
                ))}
              </div>
            </div>
            <div className="actions">
              <span className="hint">ctrl+enter to execute</span>
              <button
                className={`btn-exec${loading ? ' busy' : ''}`}
                onClick={analyze}
                disabled={loading || !text.trim()}
              >
                {loading ? `[ ANALYZING${dots}]` : '[ EXECUTE ]'}
              </button>
            </div>
            {error && (
              <div className="err-box">
                <span className="err-tag">ERR</span>
                <span className="err-msg">{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="graph-wrapper">
            <div className="graph-bar">
              <button className="btn-back" onClick={() => { setGraphData(null); setShowInfer(false) }}>
                ‹ BACK
              </button>
              <div className="graph-meta">
                <span className="meta-val">{graphData.nodes?.length}</span>
                <span className="meta-key">NODES</span>
                <span className="meta-div">·</span>
                <span className="meta-val">{graphData.edges?.length}</span>
                <span className="meta-key">EDGES</span>
                <span className="meta-div">·</span>
                <span className="meta-ok">[ OK ]</span>
              </div>
              <button
                className={`btn-infer${showInfer ? ' active' : ''}`}
                onClick={() => setShowInfer(v => !v)}
              >
                {showInfer ? '[ HIDE INFERENCE ]' : '[ INFERENCE ]'}
              </button>
            </div>

            <div className="graph-body">
              <GraphPanel data={graphData} />
              {showInfer && (
                <InferPanel
                  key={graphKey}
                  data={graphData}
                  onClose={() => setShowInfer(false)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

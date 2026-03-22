import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import GraphPanel from './components/GraphPanel'
import './App.css'

const ERROR_HINTS = [
  [/fetch|CONN_REFUSED|Failed to fetch|NetworkError/i, '确认后端已启动：cd backend && uvicorn main:app --port 8000'],
  [/50000|过长/i,                                       '文本超过长度限制，请缩短后重试'],
  [/格式错误|JSON|format/i,                             '可尝试缩短文本，或在 .env 中调高 max_tokens'],
  [/timeout|TIMEOUT|timed out/i,                        '请求超时，检查网络或后端状态'],
  [/401|403|Unauthorized|Forbidden/i,                   '检查 .env 中的 LLM_API_KEY 是否正确'],
  [/429|rate.?limit/i,                                  'API 调用频率超限，稍等片刻再试'],
]
const getHint = (msg) => {
  for (const [pat, hint] of ERROR_HINTS) if (pat.test(msg)) return hint
  return null
}

const LOAD_STAGES = [
  'PARSING TEXT',
  'EXTRACTING ENTITIES',
  'MAPPING RELATIONS',
  'BUILDING GRAPH',
]

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

function InferPanel({ data, onClose, width = 380 }) {
  const [think, setThink] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('connecting')
  const [copied, setCopied] = useState(false)
  const bodyRef = useRef(null)

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
              setTimeout(() => bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight), 0)
            } else if (msg.type === 'answer') {
              setStatus('answering')
              setAnswer(t => t + msg.text)
              setTimeout(() => bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight), 0)
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

  const copyAnswer = () => {
    if (!answer) return
    navigator.clipboard.writeText(answer).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const statusLabel = {
    connecting: '// CONNECTING...',
    thinking:   '// REASONING...',
    answering:  '// GENERATING...',
    done:       '// COMPLETE',
    error:      '// ERROR',
  }[status]

  return (
    <div className="infer-panel" style={{ width }}>
      <div className="infer-header">
        <span className="infer-title">INFERENCE ENGINE</span>
        <div className="infer-header-r">
          <span className={`infer-status ${status}`}>{statusLabel}</span>
          {answer && (
            <button className="infer-copy" onClick={copyAnswer}>
              {copied ? 'COPIED' : 'COPY'}
            </button>
          )}
          <button className="infer-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="infer-body" ref={bodyRef}>
        {think && (
          <div className="infer-section">
            <div className="infer-sec-label">// REASONING CHAIN</div>
            <div className="infer-think">{think}</div>
          </div>
        )}

        {answer && (
          <div className="infer-section">
            <div className="infer-sec-label">// ANALYSIS REPORT</div>
            <div className="infer-answer">
              <ReactMarkdown>{answer}</ReactMarkdown>
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
  const [loadStage, setLoadStage] = useState(0)
  const [loadElapsed, setLoadElapsed] = useState(0)
  const [inferWidth, setInferWidth] = useState(380)
  const resizing = useRef(false)
  const resizeStart = useRef({ x: 0, w: 380 })

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!loading) { setLoadStage(0); setLoadElapsed(0); return }
    const elapsedT = setInterval(() => setLoadElapsed(v => v + 1), 1000)
    const stageT = setInterval(() => setLoadStage(v => Math.min(v + 1, LOAD_STAGES.length - 1)), 5000)
    return () => { clearInterval(elapsedT); clearInterval(stageT) }
  }, [loading])

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

  const onResizeStart = (e) => {
    resizing.current = true
    resizeStart.current = { x: e.clientX, w: inferWidth }
    const onMove = (ev) => {
      if (!resizing.current) return
      const delta = resizeStart.current.x - ev.clientX
      setInferWidth(Math.max(280, Math.min(640, resizeStart.current.w + delta)))
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const exportPNG = () => {
    const svgEl = document.querySelector('.graph-svg')
    if (!svgEl) return
    const W = svgEl.clientWidth, H = svgEl.clientHeight
    const svgStr = new XMLSerializer().serializeToString(svgEl)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#050a0f'
    ctx.fillRect(0, 0, W, H)
    const img = new Image()
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.download = 'intel-hub-graph.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = url
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = 'intel-hub-graph.json'
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }

  const lineCount = Math.max(12, text.split('\n').length + 2)
  const stageProgress = ((loadStage + 1) / LOAD_STAGES.length) * 85

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
        {loading ? (
          <div className="loading-panel">
            <div className="loading-stage">// {LOAD_STAGES[loadStage]}...</div>
            <div className="loading-bar">
              <div className="loading-fill" style={{ width: `${stageProgress}%` }} />
            </div>
            <div className="loading-meta">{loadElapsed}s · {text.length} chars</div>
          </div>
        ) : !graphData ? (
          <div className="input-panel">
            <div className="prompt-bar">
              <span className="p-sym">›</span>
              <span className="p-cmd">INPUT_TEXT</span>
              <span className="p-cur">▮</span>
              <span className="p-meta">{text.length} chr</span>
            </div>
            <div className="ta-wrap">
              <div className="ta-gutter">
                {Array.from({ length: lineCount }, (_, i) => (
                  <span key={i}>{String(i + 1).padStart(2, '0')}</span>
                ))}
              </div>
              <textarea
                className="textarea"
                placeholder="// paste any text — news, articles, reports, anything..."
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze() }}
                spellCheck={false}
              />
            </div>
            <div className="actions">
              <span className="hint">ctrl+enter to execute</span>
              <button
                className="btn-exec"
                onClick={analyze}
                disabled={!text.trim()}
              >
                [ EXECUTE ]
              </button>
            </div>
            {error && (
              <div className="err-box">
                <div className="err-row">
                  <span className="err-tag">ERR</span>
                  <span className="err-msg">{error}</span>
                </div>
                {getHint(error) && (
                  <div className="err-hint">› {getHint(error)}</div>
                )}
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
              <div className="graph-bar-r">
                <button className="btn-export" onClick={exportPNG}>PNG</button>
                <button className="btn-export" onClick={exportJSON}>JSON</button>
                <button
                  className={`btn-infer${showInfer ? ' active' : ''}`}
                  onClick={() => setShowInfer(v => !v)}
                >
                  {showInfer ? '[ HIDE INFERENCE ]' : '[ INFERENCE ]'}
                </button>
              </div>
            </div>

            <div className="graph-body">
              <GraphPanel data={graphData} />
              {showInfer && (
                <>
                  <div className="infer-resize-handle" onMouseDown={onResizeStart} />
                  <InferPanel
                    key={graphKey}
                    data={graphData}
                    onClose={() => setShowInfer(false)}
                    width={inferWidth}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

// Rain World cold palette — cyan dominant, all variations of the same hue family
const TYPE_COLORS = {
  Person:       '#3dd6d6',  // main cyan
  Organization: '#5aabb8',  // steel teal
  Location:     '#3d7a90',  // slate
  Event:        '#aacfdc',  // cold white
  Concept:      '#208888',  // deep teal
  Product:      '#7ab8cc',  // ice
  Other:        '#253848',  // dark ghost
}
const getColor = (type) => TYPE_COLORS[type] || TYPE_COLORS.Other

const S = 20 // node half-size (square)

export default function GraphPanel({ data }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [showLabels, setShowLabels] = useState(true)

  useEffect(() => {
    if (!data || !svgRef.current) return

    const nodes = data.nodes.map(n => ({ ...n }))
    const edges = data.edges.map(e => ({ ...e }))

    const el = svgRef.current
    const W = el.parentElement.clientWidth
    const H = el.parentElement.clientHeight

    d3.select(el).selectAll('*').remove()

    const svg = d3.select(el).attr('width', W).attr('height', H)
    const defs = svg.append('defs')

    // Grid bg
    defs.append('pattern').attr('id', 'grid').attr('width', 40).attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse')
      .call(p => {
        p.append('path').attr('d', 'M40 0L0 0 0 40').attr('fill', 'none')
          .attr('stroke', '#0d1a26').attr('stroke-width', 0.5)
      })

    // Dot accent every 4 cells
    defs.append('pattern').attr('id', 'dotsub').attr('width', 160).attr('height', 160)
      .attr('patternUnits', 'userSpaceOnUse')
      .call(p => {
        [[0,0],[160,0],[0,160],[160,160],[80,80]].forEach(([x,y]) =>
          p.append('circle').attr('cx', x).attr('cy', y).attr('r', 1.2).attr('fill', '#162436')
        )
      })

    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#grid)')
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#dotsub)')

    // Arrow marker
    defs.append('marker').attr('id', 'arr').attr('viewBox', '0 -4 8 8')
      .attr('refX', 26).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#1e3348')

    const g = svg.append('g')

    svg.call(d3.zoom().scaleExtent([0.1, 5])
      .on('zoom', e => g.attr('transform', e.transform)))

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(160))
      .force('charge', d3.forceManyBody().strength(-550))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(S + 36))

    simRef.current = sim

    // Edges
    const link = g.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', '#162436').attr('stroke-width', 1)
      .attr('marker-end', 'url(#arr)')

    // Edge labels
    const eLabel = g.append('g').selectAll('text').data(edges).join('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9).attr('font-family', '"Share Tech Mono", monospace')
      .attr('fill', '#2a4460').attr('letter-spacing', 1)
      .attr('pointer-events', 'none')
      .text(d => d.label)

    // Nodes
    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'crosshair')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (e, d) => { e.stopPropagation(); setSelected(s => s?.id === d.id ? null : d) })

    // Node body: square with cut top-right corner via polygon
    node.append('polygon')
      .attr('points', d => {
        const c = getColor(d.type)
        return `${-S},${-S} ${S-6},${-S} ${S},${-S+6} ${S},${S} ${-S},${S}`
      })
      .attr('fill', '#050a0f')
      .attr('stroke', d => getColor(d.type))
      .attr('stroke-width', 1)

    // Cut-corner accent line
    node.append('line')
      .attr('x1', S - 6).attr('y1', -S)
      .attr('x2', S).attr('y2', -S + 6)
      .attr('stroke', d => getColor(d.type))
      .attr('stroke-width', 1).attr('opacity', 0.5)

    // Node label
    node.append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('font-size', 10).attr('font-family', '"Share Tech Mono", monospace')
      .attr('fill', d => getColor(d.type))
      .attr('letter-spacing', 0.5).attr('pointer-events', 'none')
      .text(d => d.label.length > 7 ? d.label.slice(0, 7) : d.label)

    // Type indicator — tiny top-left corner dot
    node.append('rect')
      .attr('x', -S).attr('y', -S).attr('width', 3).attr('height', 3)
      .attr('fill', d => getColor(d.type))

    svg.on('click', () => setSelected(null))

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      eLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 7)
        .attr('visibility', showLabels ? 'visible' : 'hidden')
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, [data])

  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll('text')
      .filter(function() { return d3.select(this).attr('font-size') === '9' })
      .attr('visibility', showLabels ? 'visible' : 'hidden')
  }, [showLabels])

  const types = [...new Set(data?.nodes?.map(n => n.type) || [])]

  return (
    <div className="graph-panel">
      <div className="legend">
        {types.map(t => (
          <span key={t} className="legend-item" style={{ borderColor: getColor(t) }}>
            <span className="legend-dot" style={{ background: getColor(t) }} />
            {t.toUpperCase()}
          </span>
        ))}
      </div>

      <button className="ctrl-btn" onClick={() => setShowLabels(v => !v)}>
        {showLabels ? 'LABELS:ON' : 'LABELS:OFF'}
      </button>

      <svg ref={svgRef} className="graph-svg" />

      {selected && (
        <div className="detail-panel">
          <div className="d-type" style={{ color: getColor(selected.type) }}>
            {selected.type.toUpperCase()}
          </div>
          <div className="d-name">{selected.label}</div>
          <div className="d-sec">// RELATIONS</div>
          {data.edges
            .filter(e => {
              const s = e.source?.id ?? e.source
              const t = e.target?.id ?? e.target
              return s === selected.id || t === selected.id
            })
            .map((e, i) => {
              const srcId = e.source?.id ?? e.source
              const tgtId = e.target?.id ?? e.target
              const other = srcId === selected.id
                ? data.nodes.find(n => n.id === tgtId)
                : data.nodes.find(n => n.id === srcId)
              return (
                <div key={i} className="d-rel">
                  <span style={{ color: getColor(other?.type) }}>{other?.label}</span>
                  <span className="d-arr">{srcId === selected.id ? '→' : '←'}</span>
                  <span className="d-lbl">{e.label}</span>
                </div>
              )
            })
          }
        </div>
      )}
    </div>
  )
}

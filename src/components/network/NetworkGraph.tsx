'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface GraphNode {
  id: string
  name: string
  organization: string
  tier: number
  category: string
  relationshipStrength: number
  strategicValue: number
  status: string
  val: number
  x?: number
  y?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
  strength: number
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

const TIER_NODE_COLORS: Record<number, string> = {
  1: '#f59e0b', // amber-500
  2: '#3b82f6', // blue-500
  3: '#9ca3af', // gray-400
}

export function NetworkGraph() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  useEffect(() => {
    fetch('/api/network/graph')
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: 500,
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D) => {
    const x = node.x || 0
    const y = node.y || 0
    const size = node.val * 1.5
    const color = TIER_NODE_COLORS[node.tier] || '#9ca3af'

    // Node circle
    ctx.beginPath()
    ctx.arc(x, y, size, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    // Border for hovered node
    if (hoveredNode?.id === node.id) {
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    ctx.font = `${Math.max(8, size * 0.8)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#374151'
    const label = node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name
    ctx.fillText(label, x, y + size + 2)
  }, [hoveredNode])

  if (!data) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-gray-400">Loading network graph...</p>
      </div>
    )
  }

  if (data.nodes.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-gray-400">No contacts to visualize</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rounded-lg border bg-white overflow-hidden relative">
      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 rounded bg-white/90 border px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500" /> Tier 1</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" /> Tier 2</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400" /> Tier 3</div>
      </div>

      {/* Hovered node info */}
      {hoveredNode && (
        <div className="absolute bottom-3 left-3 z-10 rounded bg-white/95 border px-3 py-2 text-xs max-w-64">
          <p className="font-semibold text-gray-900">{hoveredNode.name}</p>
          {hoveredNode.organization && <p className="text-gray-500">{hoveredNode.organization}</p>}
          <p className="text-gray-400 mt-1">
            Tier {hoveredNode.tier} &middot; {hoveredNode.category} &middot; RS: {hoveredNode.relationshipStrength.toFixed(1)}
          </p>
        </div>
      )}

      <ForceGraph2D
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject as never}
        nodePointerAreaPaint={((node: never, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as GraphNode
          const size = (n.val || 3) * 1.5
          ctx.beginPath()
          ctx.arc(n.x || 0, n.y || 0, size + 4, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
        }) as never}
        linkColor={((link: never) => {
          const l = link as { type?: string }
          return l.type === 'same_org' ? 'rgba(156,163,175,0.15)' : 'rgba(59,130,246,0.3)'
        }) as never}
        linkWidth={((link: never) => {
          const l = link as { strength?: number }
          return (l.strength || 1) * 0.5
        }) as never}
        onNodeHover={(node) => setHoveredNode(node as GraphNode | null)}
        onNodeClick={(node) => {
          const n = node as GraphNode
          router.push(`/contacts/${n.id}`)
        }}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  )
}

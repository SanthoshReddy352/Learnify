'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  addEdge
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useTheme } from 'next-themes'

// Modern Neon/Dark Theme Colors (unchanged for status indicators)
const nodeColors = {
  locked: '#71717a',      // Zinc-500 (Neutral Gray)
  available: '#18181b',   // Zinc-900 (High contrast Black/Dark for availability)
  learning: '#0ea5e9',    // Sky-500
  reviewing: '#f97316',   // Orange-500
  mastered: '#10b981',    // Emerald-500
}

export default function GraphVisualizer({
  topics,
  dependencies,
  onNodeClick,
  onEdgeClick,
  onConnect,
  onPaneContextMenu,
  readOnly = false,
  hideMiniMap = false
}) {
  const { resolvedTheme } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [rfInstance, setRfInstance] = useState(null)
  
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    if (!topics || topics.length === 0) return

    // Create nodes from topics
    const newNodes = topics.map((topic, index) => {
      const color = nodeColors[topic.status] || nodeColors.locked
      
      const cols = Math.ceil(Math.sqrt(topics.length))
      const x = (index % cols) * 280
      const y = Math.floor(index / cols) * 180

      const isLocked = topic.status === 'locked'

      // Theme-aware styles
      const nodeBg = isDark ? '#18181b' : '#ffffff'
      
      // Node Color (Text)
      const nodeColor = isLocked 
        ? (isDark ? '#52525b' : '#a1a1aa') // Zinc-600 (Dark) / Zinc-400 (Light) - Faded for locked
        : (isDark ? '#fafafa' : '#000000') // White (Dark) / Pure Black (Light) - Sharp for active
      
      // Node Border
      let nodeBorder = color
      if (isLocked) {
        nodeBorder = isDark ? '#27272a' : '#e4e4e7' // Subtle border for locked
      } else if (topic.status === 'available') {
        nodeBorder = isDark ? '#e4e4e7' : '#000000' // White border (Dark) / Pure Black border (Light) for available
      }

      // Shadow logic
      const shadow = isLocked 
        ? 'none'
        : (isDark 
            ? `0 0 15px ${color === '#18181b' ? '#ffffff' : color}20, inset 0 0 20px ${color === '#18181b' ? '#ffffff' : color}05` // White glow for available in dark mode
            : `0 4px 12px -2px ${color === '#18181b' ? '#000000' : color}20, 0 2px 6px -1px rgba(0,0,0,0.05)`) 

      // Label text color logic
      const labelColor = isLocked ? undefined : (topic.status === 'available' ? (isDark ? '#e4e4e7' : '#18181b') : color)

      return {
        id: topic.id,
        type: 'default',
        position: { x, y },
        data: {
          ...topic, 
          label: (
            <div className="flex flex-col h-full justify-between">
              <div className="font-bold text-sm tracking-tight leading-snug line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {topic.title}
              </div>
              <div className="space-y-1 mt-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${isLocked ? 'text-zinc-400' : ''}`} style={{ color: labelColor }}>
                    {topic.status}
                  </span>
                  {topic.difficulty && (
                    <span className="text-[10px] text-zinc-400 font-medium">
                      Lvl {topic.difficulty}
                    </span>
                  )}
                </div>
                {topic.next_review_at && (topic.status === 'reviewing' || topic.status === 'mastered') && (
                  <div className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: '#ef4444' }}>
                    <span className="w-1 h-1 rounded-full bg-red-500"></span>
                    {new Date(topic.next_review_at) <= new Date() ? 'Review Due' : `Next: ${new Date(topic.next_review_at).toLocaleDateString('en-GB')}`}
                  </div>
                )}
              </div>
            </div>
          ),
        },
        style: {
          background: nodeBg,
          color: nodeColor,
          border: `1px ${isLocked ? 'dashed' : 'solid'} ${nodeBorder}`, // Dashed border for locked
          borderRadius: '12px',
          width: 220,
          padding: '16px',
          fontSize: '14px',
          fontWeight: isDark ? 'normal' : '500',
          boxShadow: shadow,
          transition: 'all 0.3s ease',
          opacity: isLocked ? (isDark ? 0.6 : 0.7) : 1, // Lower opacity for locked
        },
      }
    })

    // Create edges from dependencies
    const newEdges = dependencies.map((dep) => ({
      id: dep.id,
      source: dep.depends_on_topic_id,
      target: dep.topic_id,
      type: 'smoothstep',
      animated: true,
      style: { stroke: isDark ? '#6b7280' : '#a1a1aa', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isDark ? '#6b7280' : '#a1a1aa',
      },
    }))

    setNodes(newNodes)
    setEdges(newEdges)

    if (rfInstance && newNodes.length > 0) {
      setTimeout(() => {
        rfInstance.fitView({ padding: 0.3, duration: 800 })
      }, 100)
    }
  }, [topics, dependencies, rfInstance, isDark]) // Re-run when theme changes

  const onNodeClickHandler = useCallback(
    (event, node) => {
      if (onNodeClick) {
        onNodeClick(node)
      }
    },
    [onNodeClick]
  )

  const onEdgeClickHandler = useCallback(
    (event, edge) => {
      if (onEdgeClick) {
        onEdgeClick(edge.id)
      }
    },
    [onEdgeClick]
  )

  return (
    <div className="w-full h-full bg-background rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickHandler}
        onEdgeClick={onEdgeClickHandler}
        onPaneContextMenu={onPaneContextMenu}
        onInit={setRfInstance}
        fitView
        minZoom={0.1}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        proOptions={{ hideAttribution: true }}
      >
        {!hideMiniMap && (
          <MiniMap
            pannable
            zoomable
            nodeBorderRadius={12}
            className={isDark ? '!bg-zinc-950/90' : '!bg-white/90'}
          />
        )}
        <Background
          color={isDark ? "#3f3f46" : "#a1a1aa"} // Zinc-400 for better visibility in light mode
          gap={16}
          size={1}
          style={{ backgroundColor: 'transparent' }} // Transparent to let parent bg-background show through
        />
      </ReactFlow>
    </div>
  )
}

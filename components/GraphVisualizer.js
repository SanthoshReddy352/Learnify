'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

const nodeColors = {
  locked: '#6b7280',      // gray
  available: '#3b82f6',   // blue
  learning: '#eab308',    // yellow
  reviewing: '#22c55e',   // green
  mastered: '#a855f7',    // purple
}

export default function GraphVisualizer({ topics, dependencies, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (!topics || topics.length === 0) return

    // Create nodes from topics
    const newNodes = topics.map((topic, index) => {
      const color = nodeColors[topic.status] || nodeColors.locked
      
      // Simple grid layout
      const cols = Math.ceil(Math.sqrt(topics.length))
      const x = (index % cols) * 250
      const y = Math.floor(index / cols) * 150

      return {
        id: topic.id,
        type: 'default',
        position: { x, y },
        data: {
          label: (
            <div className="px-3 py-2 text-center">
              <div className="font-semibold text-sm" style={{ fontFamily: 'Montserrat' }}>
                {topic.title}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {topic.status}
              </div>
            </div>
          ),
        },
        style: {
          background: color,
          color: '#ffffff',
          border: `2px solid ${color}`,
          borderRadius: '8px',
          width: 200,
          fontSize: '12px',
          boxShadow: topic.status !== 'locked' ? `0 0 20px ${color}40` : 'none',
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
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6b7280',
      },
    }))

    setNodes(newNodes)
    setEdges(newEdges)
  }, [topics, dependencies])

  const onNodeClickHandler = useCallback(
    (event, node) => {
      if (onNodeClick) {
        onNodeClick(node.id)
      }
    },
    [onNodeClick]
  )

  return (
    <div className="w-full h-full bg-background rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickHandler}
        fitView
        attributionPosition="bottom-left"
      >
        <Background
          color="#3f3f46"
          gap={16}
          size={1}
          style={{ backgroundColor: '#1a1a1a' }}
        />
        <Controls className="bg-card border border-border" />
        <MiniMap
          className="bg-card border border-border"
          nodeColor={(node) => node.style?.background || '#6b7280'}
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>
    </div>
  )
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { NetworkNode, NetworkEdge } from '@shared/types';
import * as d3 from 'd3';

type Position2D = [number, number, number]; // [x, y, 0] for 2D

interface NetworkGraphProps {
  data: {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
  };
}

interface NodeInstance {
  position: Position2D;
  size: number;
  isHighlighted: boolean;
  isMainUser: boolean;
}

interface EdgeInstance {
  start: Position2D;
  end: Position2D;
  isHighlighted: boolean;
}

// Extend D3's SimulationNodeDatum for our custom node type
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  data: NetworkNode['data'];
}

// Custom link type for D3 force simulation
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string;
  target: string;
  type: 'follows' | 'mutual';
}

// Performance monitoring component
const PerformanceMonitor: React.FC = () => {
  const [fps, setFps] = useState(0);
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const updateFPS = () => {
      const currentTime = performance.now();
      frameCount++;
      
      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(updateFPS);
    };
    
    const handle = requestAnimationFrame(updateFPS);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <Html position={[-10, 10, 0]}>
      <div className="bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-600">
        {fps} FPS
      </div>
    </Html>
  );
};

// Individual Node component
const Node: React.FC<{
  position: Position2D;
  size: number;
  isHighlighted: boolean;
  isMainUser: boolean;
  onHover: (hovered: boolean) => void;
}> = React.memo(({ position, size, isHighlighted, isMainUser, onHover }) => {
  const scale = isMainUser ? size * 3 : size;
  
  return (
    <mesh
      position={position}
      scale={[scale, scale, 1]}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    >
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial
        color={isMainUser ? '#ef4444' : isHighlighted ? '#3b82f6' : '#4f46e5'}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
});

// Nodes visualization component
const Nodes: React.FC<{ 
  nodes: NodeInstance[]; 
  onHover: (index: number, hovered: boolean) => void 
}> = React.memo(({ nodes, onHover }) => {
  return (
    <group>
      {nodes.map((node, i) => (
        <Node
          key={i}
          position={node.position}
          size={node.size}
          isHighlighted={node.isHighlighted}
          isMainUser={node.isMainUser}
          onHover={(hovered) => onHover(i, hovered)}
        />
      ))}
    </group>
  );
});

// Edge visualization component
const Edges: React.FC<{ edges: EdgeInstance[] }> = React.memo(({ edges }) => {
  return (
    <group>
      {edges.map((edge, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([...edge.start, ...edge.end])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={edge.isHighlighted ? '#3b82f6' : '#94a3b8'}
            opacity={edge.isHighlighted ? 0.8 : 0.15}
            transparent
            linewidth={edge.isHighlighted ? 2 : 1}
          />
        </line>
      ))}
    </group>
  );
});

/**
 * Network graph visualization component
 * Renders nodes (users) and edges (connections) in 2D space with interactive features
 */
const NetworkGraph: React.FC<NetworkGraphProps> = ({ data }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [webGLAvailable, setWebGLAvailable] = useState(true);
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState(new Map<string, Position2D>());
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink>>();

  // Create a map of nodes for quick lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, NetworkNode>();
    data.nodes.forEach(node => map.set(node.id, node));
    return map;
  }, [data.nodes]);

  // Filter out edges where either source or target node doesn't exist
  const validEdges = useMemo(() => {
    return data.edges.filter(edge => 
      nodeMap.has(edge.source) && nodeMap.has(edge.target)
    );
  }, [data.edges, nodeMap]);

  // Check WebGL availability and initialize data
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      if (!gl) {
        setWebGLAvailable(false);
        setWebGLError('WebGL is not available in your browser');
        return;
      }

      // Convert nodes to simulation format
      const simNodes: SimNode[] = data.nodes.map(node => ({
        id: node.id,
        data: node.data,
        x: undefined,
        y: undefined,
        vx: undefined,
        vy: undefined,
        index: undefined,
        fx: undefined,
        fy: undefined
      }));

      // Convert edges to simulation format
      const simLinks: SimLink[] = validEdges.map(edge => ({
        source: edge.source,
        target: edge.target,
        type: edge.type,
        index: undefined
      }));

      // Initialize force simulation
      const simulation = d3.forceSimulation<SimNode>(simNodes)
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(0, 0))
        .force('collision', d3.forceCollide().radius(5))
        .force('x', d3.forceX().strength(0.1))
        .force('y', d3.forceY().strength(0.1));

      // Add link force after creating the links
      simulation.force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(100)
      );

      simulationRef.current = simulation;

      // Update positions on tick
      simulation.on('tick', () => {
        const newPositions = new Map<string, Position2D>();
        simNodes.forEach((node) => {
          if (typeof node.x === 'number' && typeof node.y === 'number') {
            newPositions.set(node.id, [node.x / 30, node.y / 30, 0]);
          }
        });
        setNodePositions(newPositions);
      });

      // Reheat simulation periodically to prevent stagnation
      const reheating = setInterval(() => {
        simulation.alpha(0.3).restart();
      }, 5000);

      return () => {
        clearInterval(reheating);
        simulation.stop();
      };

    } catch (e) {
      console.error('Error initializing visualization:', e);
      setWebGLAvailable(false);
      setWebGLError(e instanceof Error ? e.message : 'Unknown WebGL error');
    }
  }, [data, validEdges]);

  // Get connected nodes for highlighting
  const getConnectedNodes = (nodeId: string): Set<string> => {
    const connected = new Set<string>();
    validEdges.forEach(edge => {
      if (edge.source === nodeId) {
        connected.add(edge.target);
      } else if (edge.target === nodeId) {
        connected.add(edge.source);
      }
    });
    return connected;
  };

  // Prepare data for rendering
  const { nodeInstances, edgeInstances } = useMemo(() => {
    const nodes = data.nodes.map(node => {
      const position = nodePositions.get(node.id) || [0, 0, 0] as Position2D;
      const connections = getConnectedNodes(node.id).size;
      const isHighlighted = hoveredNode === node.id || 
        (hoveredNode !== null && getConnectedNodes(hoveredNode).has(node.id));
      const isMainUser = node.id === data.nodes[0].id; // Assuming first node is main user

      return {
        position,
        size: Math.max(1, Math.sqrt(connections) * 0.4),
        isHighlighted,
        isMainUser,
      };
    });

    const edges = validEdges.map(edge => {
      const start = nodePositions.get(edge.source) || [0, 0, 0] as Position2D;
      const end = nodePositions.get(edge.target) || [0, 0, 0] as Position2D;
      const isHighlighted = hoveredNode !== null && 
        (edge.source === hoveredNode || edge.target === hoveredNode);

      return {
        start,
        end,
        isHighlighted,
      };
    });

    return { nodeInstances: nodes, edgeInstances: edges };
  }, [data.nodes, validEdges, nodePositions, hoveredNode]);

  // Render node information tooltip
  const renderNodeTooltip = () => {
    if (!hoveredNode) return null;
    
    const node = nodeMap.get(hoveredNode);
    if (!node) return null;

    const connectedNodes = getConnectedNodes(hoveredNode);
    const position = nodePositions.get(hoveredNode);
    if (!position) return null;
    
    return (
      <Html position={position}>
        <div className="bg-white/90 backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg text-sm min-w-[200px] transform translate-x-4">
          <div className="font-medium text-gray-900">{node.data.displayName || node.data.handle}</div>
          <div className="text-gray-500">@{node.data.handle}</div>
          <div className="mt-2 text-gray-600">
            <div>Connections: {connectedNodes.size}</div>
          </div>
        </div>
      </Html>
    );
  };

  if (!webGLAvailable) {
    return (
      <div className="w-full h-full bg-gray-50">
        <div className="p-4 text-center text-gray-600">
          {webGLError || 'Unable to render network visualization'}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Canvas
        style={{ background: '#f8fafc' }}
        orthographic
        camera={{
          position: [0, 0, 100],
          zoom: 20,
          up: [0, 1, 0],
          near: 0.1,
          far: 1000
        }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <PerformanceMonitor />
        
        {/* Add OrbitControls configured for 2D movement */}
        <OrbitControls
          enableRotate={false}
          enableDamping={true}
          dampingFactor={0.1}
          minZoom={1}
          maxZoom={50}
          zoomSpeed={1}
          panSpeed={1}
        />
        
        {/* Scene */}
        <group>
          <Edges edges={edgeInstances} />
          <Nodes 
            nodes={nodeInstances}
            onHover={(index: number, hovered: boolean) => {
              setHoveredNode(hovered ? data.nodes[index].id : null);
            }}
          />
          {renderNodeTooltip()}
        </group>
      </Canvas>
    </div>
  );
};

export default NetworkGraph;

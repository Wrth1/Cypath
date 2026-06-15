import React, { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { loadAndParseGraph, type NetworkGraph, type GraphNode } from './graphParser';
import { Pathfinder } from './pathfinder';
import { Bot, Send, Sparkles, Navigation } from 'lucide-react';

function App() {
  const [graphData, setGraphData] = useState<NetworkGraph | null>(null);
  const [pathfinder, setPathfinder] = useState<Pathfinder | null>(null);

  const [knownNodes, setKnownNodes] = useState<GraphNode[]>([]);
  const [targetNode, setTargetNode] = useState<GraphNode | null>(null);
  const [recommendedPath, setRecommendedPath] = useState<GraphNode[]>([]);
  const hoverNodeRef = useRef<GraphNode | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GraphNode[]>([]);
  const [activeSearchContext, setActiveSearchContext] = useState<'known' | 'target' | null>(null);

  const [chatMessages, setChatMessages] = useState<{ sender: 'bot' | 'user', text: string }[]>([
    { sender: 'bot', text: "Hello! I am the Adaptive Learning Path recommender. What cybersecurity topics are you currently familiar with?" }
  ]);
  const [chatInput, setChatInput] = useState('');

  const graphRef = useRef<any>(null);

  useEffect(() => {
    async function init() {
      try {
        const data = await loadAndParseGraph(
          '/data/web_labels.json',
          '/data/web_clusters.json',
          '/data/web_similarities.json'
        );
        setGraphData(data);
        setPathfinder(new Pathfinder(data));
      } catch (err) {
        console.error("Error loading graph data:", err);
      }
    }
    init();
  }, []);



  // Handle Search
  useEffect(() => {
    if (searchQuery.length > 1 && graphData) {
      const lowerQ = searchQuery.toLowerCase();
      const matches = graphData.nodes
        .filter(n => n.label.toLowerCase().includes(lowerQ))
        .slice(0, 10);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery, graphData]);

  const handleSelectSuggestion = (node: GraphNode) => {
    if (activeSearchContext === 'known') {
      if (!knownNodes.find(n => n.id === node.id)) {
        setKnownNodes([...knownNodes, node]);
      }
    } else if (activeSearchContext === 'target') {
      setTargetNode(node);
    }
    setSearchQuery('');
    setSuggestions([]);
    setActiveSearchContext(null);
  };

  const generatePath = () => {
    if (!pathfinder || knownNodes.length === 0 || !targetNode) return;

    const knownIds = knownNodes.map(n => n.id);
    const path = pathfinder.findShortestPath(knownIds, targetNode.id);
    setRecommendedPath(path);

    // Zoom to path if we have one
    if (path.length > 0 && graphRef.current) {
      // Small delay to ensure render
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50, (node: any) => path.some(p => p.id === (node as any).id));
      }, 200);

      // Auto-reply in chat
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: `I've generated a learning path to reach ${targetNode.label}. It will take you through ${path.length - 1} intermediary concepts based on industry knowledge dependencies.` }
      ]);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setChatMessages(prev => [...prev, { sender: 'user', text: chatInput }]);
    const input = chatInput;
    setChatInput('');

    // Simple mock logic for the chatbot
    setTimeout(() => {
      const lowerInput = input.toLowerCase();
      if (lowerInput.includes('know') || lowerInput.includes('familiar')) {
        setChatMessages(prev => [...prev, { sender: 'bot', text: "Great. Please select those topics in the 'Current Knowledge' panel on the left so I can map your baseline." }]);
      } else if (lowerInput.includes('want to learn') || lowerInput.includes('target')) {
        setChatMessages(prev => [...prev, { sender: 'bot', text: "Excellent goal. Select that topic under 'Target Interest' and click Generate Path." }]);
      } else {
        setChatMessages(prev => [...prev, { sender: 'bot', text: "The graph on the screen represents cybersecurity topics. Nodes closer together are highly related. I can help find the optimal learning trajectory between any two topics." }]);
      }
    }, 1000);
  };

  // Color mapping based on clusters
  const getClusterColor = (clusterId: number | null) => {
    if (clusterId === null) return '#9ca3af'; // gray
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
    return colors[clusterId % colors.length];
  };

  const pathNodesSet = useMemo(() => new Set(recommendedPath.map(n => n.id)), [recommendedPath]);
  const pathEdgesSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < recommendedPath.length - 1; i++) {
      const a = recommendedPath[i].id;
      const b = recommendedPath[i + 1].id;
      set.add(`${a}-${b}`);
      set.add(`${b}-${a}`);
    }
    return set;
  }, [recommendedPath]);
  const knownNodesSet = useMemo(() => new Set(knownNodes.map(n => n.id)), [knownNodes]);

  const { orphanNodes, orphanEdges } = useMemo(() => {
    if (!graphData) return { orphanNodes: new Set<number>(), orphanEdges: new Set<string>() };

    const sizes = new Map<number, number>();
    graphData.nodes.forEach(n => {
      if (n.clusterId !== null) {
        sizes.set(n.clusterId, (sizes.get(n.clusterId) || 0) + 1);
      }
    });

    const orphans = new Set<number>();
    graphData.nodes.forEach(n => {
      if (n.clusterId === null || sizes.get(n.clusterId) === 1) {
        orphans.add(n.id);
      }
    });

    // Find max edge for each orphan in one pass
    const maxEdges = new Map<number, { edge: any, weight: number }>();
    graphData.edges.forEach(e => {
      const sourceId = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const targetId = typeof e.target === 'object' ? (e.target as any).id : e.target;

      if (orphans.has(sourceId)) {
        const current = maxEdges.get(sourceId);
        if (!current || e.weight > current.weight) {
          maxEdges.set(sourceId, { edge: e, weight: e.weight });
        }
      }
      if (orphans.has(targetId)) {
        const current = maxEdges.get(targetId);
        if (!current || e.weight > current.weight) {
          maxEdges.set(targetId, { edge: e, weight: e.weight });
        }
      }
    });

    const edges = new Set<string>();
    maxEdges.forEach(v => {
      const sourceId = typeof v.edge.source === 'object' ? (v.edge.source as any).id : v.edge.source;
      const targetId = typeof v.edge.target === 'object' ? (v.edge.target as any).id : v.edge.target;
      edges.add(`${sourceId}-${targetId}`);
      edges.add(`${targetId}-${sourceId}`);
    });

    return { orphanNodes: orphans, orphanEdges: edges };
  }, [graphData]);

  // Configure D3 physics using cluster and orphan data
  useEffect(() => {
    if (graphData && graphRef.current) {
      // Gentle generic repulsion, we rely on the link forces to push distinct clusters apart
      graphRef.current.d3Force('charge')?.strength(-50);

      const linkForce = graphRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance((link: any) => {
          const sourceNode = typeof link.source === 'object' ? link.source : graphData.nodes[link.source];
          const targetNode = typeof link.target === 'object' ? link.target : graphData.nodes[link.target];
          if (!sourceNode || !targetNode) return 100;

          const isOrphan = orphanNodes.has(sourceNode.id) || orphanNodes.has(targetNode.id);
          const sameCluster = sourceNode.clusterId !== null && sourceNode.clusterId === targetNode.clusterId;

          if (isOrphan) return 30; // standard distance
          if (sameCluster) return 10; // pull clusters tight

          // Use weight to determine repulsion (cross-cluster nodes push far apart)
          // Lower similarity weight -> pushes them much further apart
          return 100 + (1 - link.weight) * 1000;
        });

        linkForce.strength((link: any) => {
          const sourceNode = typeof link.source === 'object' ? link.source : graphData.nodes[link.source];
          const targetNode = typeof link.target === 'object' ? link.target : graphData.nodes[link.target];
          if (!sourceNode || !targetNode) return 0.1;

          const isOrphan = orphanNodes.has(sourceNode.id) || orphanNodes.has(targetNode.id);
          const sameCluster = sourceNode.clusterId !== null && sourceNode.clusterId === targetNode.clusterId;

          if (isOrphan) return 0.05; // extremely weak so it doesn't disturb the massive clusters
          if (sameCluster) return link.weight * 2; // only use weight to determine attraction IF same cluster

          return 0.3; // weak constant strength so the massive distance acts as a push
        });
      }
    }
  }, [graphData, orphanNodes]);

  const leftSidebar = useMemo(() => (
    <div className="glass-panel sidebar">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
        <Navigation size={20} color="#3b82f6" />
        Cygraph
      </h2>

      <div className="input-group select-wrapper">
        <label>1. Current Knowledge (Select Multiple)</label>
        <div style={{ marginBottom: '0.5rem' }}>
          {knownNodes.map(node => (
            <span key={node.id} className="pill">
              {node.label}
              <button onClick={() => setKnownNodes(knownNodes.filter(n => n.id !== node.id))}>×</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          className="node-search-input"
          placeholder="Search familiar topics..."
          value={activeSearchContext === 'known' ? searchQuery : ''}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setActiveSearchContext('known');
          }}
          onFocus={() => setActiveSearchContext('known')}
        />
        {activeSearchContext === 'known' && suggestions.length > 0 && (
          <div className="suggestions-list">
            {suggestions.map(s => (
              <div key={s.id} className="suggestion-item" onClick={() => handleSelectSuggestion(s)}>
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="input-group select-wrapper">
        <label>2. Target Interest (Select One)</label>
        {targetNode && (
          <div style={{ marginBottom: '0.5rem' }}>
            <span className="pill" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.5)' }}>
              {targetNode.label}
              <button style={{ color: '#fcd34d' }} onClick={() => setTargetNode(null)}>×</button>
            </span>
          </div>
        )}
        <input
          type="text"
          className="node-search-input"
          placeholder="Search target goal..."
          value={activeSearchContext === 'target' ? searchQuery : ''}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setActiveSearchContext('target');
          }}
          onFocus={() => setActiveSearchContext('target')}
        />
        {activeSearchContext === 'target' && suggestions.length > 0 && (
          <div className="suggestions-list">
            {suggestions.map(s => (
              <div key={s.id} className="suggestion-item" onClick={() => handleSelectSuggestion(s)}>
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn"
        onClick={generatePath}
        disabled={knownNodes.length === 0 || !targetNode}
        style={{ marginTop: '1rem' }}
      >
        <Sparkles size={18} /> Generate Learning Path
      </button>

      {recommendedPath.length > 0 && (
        <div className="path-results">
          <label>Recommended Syllabus</label>
          <div style={{ marginTop: '1rem' }}>
            {recommendedPath.map((step, idx) => (
              <div key={step.id} className="path-step">
                <div className="step-number" style={idx === 0 ? { background: '#22c55e' } : idx === recommendedPath.length - 1 ? { background: '#f59e0b' } : {}}>
                  {idx + 1}
                </div>
                <div className="step-content">
                  <div className="step-title">{step.label}</div>
                  <div className="step-desc">
                    {idx === 0 ? 'Current Base Knowledge' : idx === recommendedPath.length - 1 ? 'Target Goal Achieved' : 'Prerequisite Concept'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  ), [knownNodes, targetNode, recommendedPath, searchQuery, suggestions, activeSearchContext]);

  const rightSidebar = useMemo(() => (
    <div className="glass-panel sidebar sidebar-right">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Bot size={20} color="#3b82f6" />
        AI Assistant
      </h2>

      <div className="chat-container">
        <div className="chat-messages">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.sender}`}>
              {msg.text}
            </div>
          ))}
        </div>

        <form className="chat-input-wrapper" onSubmit={handleChatSubmit}>
          <input
            type="text"
            className="chat-input"
            placeholder="Ask about the curriculum..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className="chat-send-btn">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  ), [chatMessages, chatInput]);

  if (!graphData) {
    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner"></div>
        <span style={{ marginLeft: '1rem', color: '#fff' }}>Constructing Knowledge Graph...</span>
      </div>
    );
  }

  return (
    <>
      {leftSidebar}

      {/* CENTER - GRAPH VIEW */}
      <div className="graph-container">
        <div className="graph-overlay-title">
          <h1>Cybersecurity Knowledge Graph</h1>
          <p>Interactive map of domains, tools, and vulnerabilities</p>
        </div>

        <ForceGraph2D
          ref={graphRef}
          graphData={{
            nodes: graphData.nodes,
            links: graphData.edges
          }}
          nodeLabel="label"
          nodeColor={(node: any) => {
            if (hoverNodeRef.current && hoverNodeRef.current.id === node.id) return '#fff';
            if (recommendedPath.length > 0) {
              return pathNodesSet.has(node.id) ? '#fff' : 'rgba(156, 163, 175, 0.2)';
            }
            if (knownNodesSet.has(node.id)) return '#22c55e';
            if (targetNode?.id === node.id) return '#f59e0b';
            if (orphanNodes.has(node.id)) return '#fff'; // Make lone nodes white
            return getClusterColor(node.clusterId);
          }}
          nodeRelSize={5}
          nodePointerAreaPaint={(node: any, color: string, ctx: any) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI, false); // generous hit area (12px radius)
            ctx.fill();
          }}
          linkVisibility={(link: any) => {
            const sourceNode = typeof link.source === 'object' ? link.source : graphData.nodes[link.source];
            const targetNode = typeof link.target === 'object' ? link.target : graphData.nodes[link.target];
            if (!sourceNode || !targetNode) return false;

            const sourceId = sourceNode.id;
            const targetId = targetNode.id;

            if (recommendedPath.length > 0) {
              return pathEdgesSet.has(`${sourceId}-${targetId}`);
            }

            // Show intra-cluster edges
            if (sourceNode.clusterId !== null && sourceNode.clusterId === targetNode.clusterId && !orphanNodes.has(sourceId)) {
              return true;
            }

            // Show highest weight edge for orphans
            if (orphanEdges.has(`${sourceId}-${targetId}`)) {
              return true;
            }

            // Hide cross-cluster dense hairball lines
            return false;
          }}
          linkColor={(link: any) => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (recommendedPath.length > 0) return 'rgba(255, 255, 255, 0.5)';

            // Bright highlight if hovered
            if (hoverNodeRef.current && (sourceId === hoverNodeRef.current.id || targetId === hoverNodeRef.current.id)) {
              return 'rgba(255, 255, 255, 0.9)';
            }

            if (orphanEdges.has(`${sourceId}-${targetId}`)) return 'rgba(255, 255, 255, 0.1)';
            return 'rgba(255, 255, 255, 0.1)';
          }}
          linkWidth={(link: any) => {
            if (recommendedPath.length > 0) {
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              return pathEdgesSet.has(`${sourceId}-${targetId}`) ? 2 : 0.5;
            }
            return 1;
          }}
          cooldownTicks={150}
          enableNodeDrag={false}
          backgroundColor="transparent"
          onNodeHover={(node: any) => {
            hoverNodeRef.current = node || null;
            // Force a canvas redraw without reheating the physics simulation
            // The canvas will repaint based on the new ref value without moving nodes!
          }}
          onNodeClick={(node: any) => {
            // Only center the node so the user doesn't lose context, do not arbitrarily zoom in.
            graphRef.current?.centerAt(node.x, node.y, 1000);
          }}
        />
      </div>

      {rightSidebar}
    </>
  );
}

export default App;

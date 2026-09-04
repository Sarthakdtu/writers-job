import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  Network,
  X,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Maximize2,
  Users,
  BookOpen,
  ArrowLeft,
  AlertTriangle,
  MousePointerClick
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { useTheme } from '../../context/ThemeContext';

const hexToRgba = (hex, alpha) => {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const readPalette = () => {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    accent: v('--accent') || '#8c5a32',
    accentHover: v('--accent-hover') || '#734624',
    border: v('--border-color') || '#e2d7c3',
    borderSubtle: v('--border-subtle') || '#ebd8bd',
    textMain: v('--text-main') || '#3b2d24',
    textMuted: v('--text-muted') || '#786455',
    textDim: v('--text-dim') || '#a38f7d'
  };
};

const nodeRadius = (degree) => 10 + Math.min(degree * 2, 12);

const graphId = (x) => (x && typeof x === 'object' ? x.id : x);

const CharBubble = ({ char, sizeClass = 'h-9 w-9' }) => (
  <div
    className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-full bg-[var(--accent)] ring-2 ring-[var(--accent)] flex items-center justify-center`}
    title={char?.name || ''}
  >
    <span className="text-xs font-bold text-white">{char?.name ? char.name.charAt(0).toUpperCase() : '?'}</span>
    {char?.image_url && (
      <img
        src={char.image_url}
        alt={char?.name || ''}
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    )}
  </div>
);

export const CharacterMapView = () => {
  const { activeStory, setActiveTab, focusMode } = useStory();
  const { theme } = useTheme();

  const [mapData, setMapData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [pairNodeIds, setPairNodeIds] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [minWeight, setMinWeight] = useState(1);
  const [showIsolated, setShowIsolated] = useState(true);
  const [imgTick, setImgTick] = useState(0);

  const graphRef = useRef(null);
  const wrapRef = useRef(null);
  const imgCacheRef = useRef(new Map());
  const [dims, setDims] = useState({ width: 0, height: 600 });

  const palette = readPalette();

  const loadMap = useCallback(async () => {
    if (!activeStory) return;
    setLoading(true);
    setError(null);
    setPairNodeIds([]);
    setSelectedEdgeId(null);
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/character-map`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setMapData({ nodes: data.nodes || [], edges: data.edges || [] });
    } catch (err) {
      console.error('Failed to load character map:', err);
      setError(err.message || 'Could not load the character map.');
    } finally {
      setLoading(false);
    }
  }, [activeStory?.id]);

  useEffect(() => {
    loadMap();
  }, [loadMap]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () =>
      setDims((d) => ({ width: el.clientWidth || d.width, height: el.clientHeight || d.height }));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    mapData.nodes.forEach((n) => {
      if (!n.image_url || n.__img) return;
      if (imgCacheRef.current.has(n.image_url)) {
        n.__img = imgCacheRef.current.get(n.image_url);
        return;
      }
      const img = new Image();
      img.onload = () => {
        n.__img = img;
        imgCacheRef.current.set(n.image_url, img);
        setImgTick((t) => t + 1);
      };
      img.src = n.image_url;
      n.__img = img;
    });
  }, [mapData, imgTick]);

  const nodesById = useMemo(
    () => Object.fromEntries(mapData.nodes.map((n) => [n.id, n])),
    [mapData]
  );

  const maxWeight = useMemo(
    () => mapData.edges.reduce((m, e) => Math.max(m, e.weight), 1),
    [mapData]
  );

  const visibleEdges = useMemo(
    () => mapData.edges.filter((e) => e.weight >= minWeight),
    [mapData, minWeight]
  );
  const visibleEdgeIds = useMemo(() => new Set(visibleEdges.map((e) => e.id)), [visibleEdges]);
  const visibleEdgeById = useMemo(
    () => Object.fromEntries(visibleEdges.map((e) => [e.id, e])),
    [visibleEdges]
  );

  const firstNodeId = pairNodeIds.length > 0 ? pairNodeIds[0] : null;
  const secondNodeId = pairNodeIds.length > 1 ? pairNodeIds[1] : null;
  const isPairMode = pairNodeIds.length === 2;

  const visibleNodes = useMemo(() => {
    if (showIsolated) return mapData.nodes;
    const linked = new Set();
    visibleEdges.forEach((e) => {
      linked.add(e.source);
      linked.add(e.target);
    });
    if (firstNodeId) linked.add(firstNodeId);
    return mapData.nodes.filter((n) => linked.has(n.id));
  }, [mapData, showIsolated, visibleEdges, firstNodeId]);

  const graphData = useMemo(
    () => ({ nodes: visibleNodes, links: visibleEdges }),
    [visibleNodes, visibleEdges]
  );

  const selectedNode = firstNodeId ? nodesById[firstNodeId] || null : null;

  const pairEdgeIds = useMemo(() => {
    if (!isPairMode) return new Set();
    const [a, b] = pairNodeIds;
    const s = new Set();
    for (const e of visibleEdges) {
      const su = graphId(e.source);
      const t = graphId(e.target);
      if ((su === a && t === b) || (su === b && t === a)) s.add(e.id);
    }
    return s;
  }, [isPairMode, pairNodeIds, visibleEdges]);

  const pairActive = isPairMode && pairEdgeIds.size > 0;

  const selectedNodeConnected = useMemo(() => {
    if (!firstNodeId) return new Set();
    const s = new Set([firstNodeId]);
    visibleEdges.forEach((e) => {
      if (graphId(e.source) === firstNodeId) s.add(graphId(e.target));
      if (graphId(e.target) === firstNodeId) s.add(graphId(e.source));
    });
    return s;
  }, [firstNodeId, visibleEdges]);
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !visibleEdgeIds.has(selectedEdgeId)) return null;
    return visibleEdgeById[selectedEdgeId];
  }, [selectedEdgeId, visibleEdgeIds, visibleEdgeById]);

  useEffect(() => {
    if (selectedEdgeId && !visibleEdgeIds.has(selectedEdgeId)) setSelectedEdgeId(null);
  }, [selectedEdgeId, visibleEdgeIds]);

  const bookGroups = useMemo(() => {
    if (!selectedEdge) return [];
    const groups = [];
    const byBook = {};
    selectedEdge.interactions.forEach((it) => {
      const key = it.book_id || 'none';
      if (!byBook[key]) byBook[key] = { book_id: key, book_title: it.book_title || 'Unknown Book', items: [] };
      byBook[key].items.push(it);
    });
    Object.keys(byBook).forEach((key) => groups.push(byBook[key]));
    return groups;
  }, [selectedEdge]);

  const fitTrigger = `${mapData.nodes.length}:${visibleEdges.length}:${showIsolated}`;

  useEffect(() => {
    if (!mapData.nodes.length || !graphRef.current) return;
    graphRef.current.d3Force('link', null);
    graphRef.current.d3Force('center', null);
  }, [mapData]);

  useEffect(() => {
    if (!graphData.nodes.length || !graphRef.current) return;
    const t = setTimeout(() => {
      graphRef.current && graphRef.current.zoomToFit(500, 90);
    }, 80);
    return () => clearTimeout(t);
  }, [fitTrigger]);

  const fitView = () => {
    graphRef.current && graphRef.current.zoomToFit(400, 90);
  };

  const handleNodeClick = (node) => {
    setSelectedEdgeId(null);
    if (pairNodeIds.length === 0) {
      setPairNodeIds([node.id]);
    } else if (pairNodeIds.length === 1) {
      if (pairNodeIds[0] === node.id) {
        setPairNodeIds([]);
        return;
      }
      setPairNodeIds([pairNodeIds[0], node.id]);
    } else {
      setPairNodeIds([node.id]);
    }
  };

  const handleLinkClick = (link) => {
    setSelectedEdgeId(link.id);
    setPairNodeIds([]);
  };

  const handleBackgroundClick = () => {
    setPairNodeIds([]);
    setSelectedEdgeId(null);
  };

  const isEdgeActive = (link) => {
    if (selectedEdgeId) return selectedEdgeId === link.id;
    if (isPairMode) return pairEdgeIds.has(link.id);
    if (pairNodeIds.length === 1) {
      return graphId(link.source) === firstNodeId || graphId(link.target) === firstNodeId;
    }
    return hoveredEdgeId === link.id;
  };

  const isEdgeVisible = (link) => {
    if (selectedEdgeId) return selectedEdgeId === link.id;
    if (isPairMode) return pairEdgeIds.has(link.id);
    if (pairNodeIds.length === 1) {
      return graphId(link.source) === firstNodeId || graphId(link.target) === firstNodeId;
    }
    return false;
  };

  const linkColorFn = (link) => {
    if (!isEdgeVisible(link)) return 'rgba(0,0,0,0)';
    return isEdgeActive(link) || hoveredEdgeId === link.id
      ? palette.accent
      : hexToRgba(palette.accent, 0.4);
  };

  const linkWidthFn = (link) => {
    if (!isEdgeVisible(link)) return 0;
    const base = 0.8 + Math.min((link.weight || 1) * 0.75, 3.4);
    return base + (isEdgeActive(link) || hoveredEdgeId === link.id ? 2.4 : 0);
  };

  const isNodeDimmed = (node) => {
    if (pairNodeIds.length === 1) return !selectedNodeConnected.has(node.id);
    return false;
  };

  const drawNode = (node, ctx, globalScale) => {
    const dim = isNodeDimmed(node);
    const r = nodeRadius(node.degree || 0);
    const label = (node.name || node.id || '').slice(0, 26);
    const isHighlighted =
      pairNodeIds.includes(node.id) || hoveredNodeId === node.id;
    ctx.save();
    ctx.globalAlpha = dim ? 0.2 : 1;
    if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI);
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = palette.accent;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = pairNodeIds.includes(node.id) ? palette.accentHover : palette.accent;
    ctx.fill();
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = palette.border;
    ctx.stroke();
    const img = node.__img;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, r - 1 / globalScale, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.font = `${Math.round(r / globalScale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText((label.charAt(0) || '?').toUpperCase(), node.x, node.y);
    }
    ctx.font = `600 ${12 / globalScale}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette.textMain;
    ctx.fillText(label, node.x, node.y + r + 4 / globalScale);
    ctx.restore();
  };

  const paintNodePointer = (node, color, ctx, globalScale) => {
    const r = nodeRadius(node.degree || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI);
    ctx.fill();
  };

  const nodeLabelFn = (node) =>
    `${node.name || node.id}${node.role ? ` · ${node.role}` : ''}  (${node.degree || 0} bond${node.degree === 1 ? '' : 's'})`;

  const linkLabelFn = (link) => {
    const a = nodesById[graphId(link.source)];
    const b = nodesById[graphId(link.target)];
    const relLabel = link.relationship_label ? ` · ${link.relationship_label}` : '';
    const beatLabel = link.weight > 0 ? `${link.weight} shared beat${link.weight === 1 ? '' : 's'}` : 'declared relationship';
    return `${a?.name || link.source} ↔ ${b?.name || link.target}${relLabel} — ${beatLabel}`;
  };

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  const hasCharacters = mapData.nodes.length > 0;
  const hasEdges = visibleEdges.length > 0;
  const panelOpen = !!selectedEdge;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="literary-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
              <Network className="h-4 w-4" />
              <span>Character Map</span>
            </div>
            <h1 className="font-prose text-3xl md:text-4xl font-bold text-[var(--text-main)]">
              The Web of {activeStory.title}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-2 max-w-2xl">
              A living graph of who meets whom. Bonds are hidden by default for clarity — click one
              character, then another, to reveal the bond between them, then click that bond to see
              its interactions broken down by book and chapter.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-center">
              <div className="font-prose text-2xl font-bold text-[var(--accent)]">{mapData.nodes.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Characters</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-center">
              <div className="font-prose text-2xl font-bold text-[var(--accent)]">{visibleEdges.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Bonds</div>
            </div>
          </div>
        </div>
      </div>

      {/* Graph Card */}
      <div className="literary-card rounded-2xl p-4 md:p-5 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--text-dim)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">
              Min shared beats
            </span>
            <input
              type="range"
              min={1}
              max={Math.max(maxWeight, 1)}
              step={1}
              value={minWeight}
              onChange={(e) => setMinWeight(Number(e.target.value))}
              className="w-28 cursor-pointer accent-[var(--accent)]"
              title="Hide bonds with fewer shared plot beats"
            />
            <span className="w-6 text-xs font-bold text-[var(--accent)] font-mono">{minWeight}</span>
          </div>

          <button
            onClick={() => setShowIsolated((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            title={showIsolated ? 'Hide characters with no bonds' : 'Show characters with no bonds'}
          >
            {showIsolated ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showIsolated ? 'Hide isolated' : 'Show isolated'}
          </button>

          <button
            onClick={fitView}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            title="Zoom to fit all characters"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit view
          </button>

          <div className="ml-auto hidden lg:flex items-center gap-4 text-[10px] text-[var(--text-dim)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-6 rounded bg-[var(--accent)]/30" />
              Bond thickness = shared beats
            </span>
            <span className="flex items-center gap-1.5">
              <MousePointerClick className="h-3 w-3" />
              Click a bond to explore it
            </span>
          </div>
        </div>

        {/* Graph Area */}
        <div ref={wrapRef} className="relative h-[600px] w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-card)]/70 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                Weaving the character web...
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-card)]/70 backdrop-blur-sm p-6">
              <div className="max-w-sm rounded-xl border border-red-500/30 bg-[var(--bg-card)] p-4 text-center shadow-lg">
                <AlertTriangle className="mx-auto h-6 w-6 text-red-500" />
                <p className="mt-2 text-xs text-[var(--text-muted)]">{error}</p>
                <button
                  onClick={loadMap}
                  className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && !hasCharacters && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-card)]/70 backdrop-blur-sm p-6">
              <div className="max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center shadow-lg">
                <Users className="mx-auto h-8 w-8 text-[var(--accent)]" />
                <p className="mt-3 font-prose text-base font-bold text-[var(--text-main)]">
                  No characters yet
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Build your roster first, then the map will show how these people cross paths.
                </p>
                <button
                  onClick={() => setActiveTab('characters')}
                  className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  Open Character Roster
                </button>
              </div>
            </div>
          )}

          {!loading && !error && hasCharacters && (
            <ForceGraph2D
              key={`${theme}-charmap`}
              ref={graphRef}
              width={Math.max(dims.width, 300)}
              height={Math.max(dims.height, 300)}
              graphData={graphData}
              nodeId="id"
              nodeLabel={nodeLabelFn}
              nodeCanvasObject={drawNode}
              nodeCanvasObjectMode={() => 'replace'}
              nodePointerAreaPaint={paintNodePointer}
              linkSource="source"
              linkTarget="target"
              linkLabel={linkLabelFn}
              linkColor={linkColorFn}
              linkWidth={linkWidthFn}
              linkDirectionalParticles={(l) =>
                selectedEdgeId === l.id || (isPairMode && pairEdgeIds.has(l.id)) ? 4 : 0
              }
              linkDirectionalParticleWidth={1.8}
              linkDirectionalParticleSpeed={0.008}
              linkDirectionalParticleColor={palette.accent}
              onNodeClick={handleNodeClick}
              onNodeHover={(n) => setHoveredNodeId(n ? n.id : null)}
              onLinkClick={handleLinkClick}
              onLinkHover={(l) => setHoveredEdgeId(l ? l.id : null)}
              onBackgroundClick={handleBackgroundClick}
              cooldownTime={5000}
              cooldownTicks={120}
              warmupTicks={15}
              d3AlphaDecay={0.05}
              d3VelocityDecay={0.4}
              chargeStrength={-450}
              d3ForceCollide={(node) => nodeRadius(node.degree || 0) * 2 + 22}
              minZoom={0.15}
              maxZoom={6}
              backgroundColor="transparent"
            />
          )}

          {/* Selection chip: single node (pending) or pair */}
          {pairNodeIds.length === 1 && selectedNode && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/90 px-3 py-2 shadow-lg backdrop-blur animate-in fade-in">
              <CharBubble char={selectedNode} sizeClass="h-8 w-8" />
              <div>
                <div className="text-sm font-bold text-[var(--text-main)]">{selectedNode.name}</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {selectedNode.role || 'Character'} · {selectedNodeConnected.size - 1} bond{selectedNodeConnected.size - 1 === 1 ? '' : 's'}
                </div>
                <div className="text-[10px] italic text-[var(--accent)]">
                  Now click a second character to trace their bond
                </div>
              </div>
              <button
                onClick={() => setPairNodeIds([])}
                className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {isPairMode && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/90 px-3 py-2 shadow-lg backdrop-blur animate-in fade-in">
              <CharBubble char={nodesById[firstNodeId]} sizeClass="h-8 w-8" />
              <span className="text-sm font-bold text-[var(--text-main)]">
                {nodesById[firstNodeId]?.name || firstNodeId}
              </span>
              <span className="text-xs text-[var(--text-dim)]">↔</span>
              <CharBubble char={nodesById[secondNodeId]} sizeClass="h-8 w-8" />
              <span className="text-sm font-bold text-[var(--text-main)]">
                {nodesById[secondNodeId]?.name || secondNodeId}
              </span>
              <div className="flex flex-col items-start pl-1 border-l border-[var(--border-subtle)]">
                {pairActive ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)]">
                    {pairEdgeIds.size} bond{pairEdgeIds.size === 1 ? '' : 's'} highlighted
                  </span>
                ) : (
                  <span className="text-[10px] italic text-[var(--text-dim)]">
                    No direct bond between these two
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-muted)]">
                  {pairActive ? 'All other edges hidden' : 'Try another pair'}
                </span>
              </div>
              <button
                onClick={() => setPairNodeIds([])}
                className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* No-bonds hint */}
          {!loading && !error && hasCharacters && !hasEdges && !selectedEdge && (
            <div className="absolute top-3 right-3 left-3 z-10 flex items-center justify-center">
              <div className="max-w-xl rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)]/80 px-4 py-2.5 text-center text-xs text-[var(--text-muted)] shadow-sm backdrop-blur animate-in fade-in">
                No interactions yet — give two or more characters a{' '}
                <button
                  onClick={() => setActiveTab('outliner')}
                  className="font-semibold text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)] cursor-pointer"
                >
                  shared plot beat
                </button>{' '}
                in the Book Outliner and their bond will draw itself here.
              </div>
            </div>
          )}
        </div>

        {/* Legend footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-[var(--text-dim)]">
          <span>
            Drag characters to rearrange · scroll to zoom · click empty space to deselect · click
            one character then another to reveal their bond · click the bond to explore its plot
            beats grouped by book and chapter.
          </span>
          <span className="font-mono">
            {visibleNodes.length} shown · {visibleEdges.length} bonds
          </span>
        </div>
      </div>

      {/* Slide-in Interaction Panel */}
      <div
        className={`fixed right-0 z-50 w-[400px] max-w-[92vw] border-l border-[var(--border-color)] bg-[var(--bg-panel)]/95 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out ${
          focusMode ? 'top-0 h-full' : 'top-14 h-[calc(100vh-3.5rem)]'
        } ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        } ${panelOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!panelOpen}
      >
        {selectedEdge && (
          <div className="flex h-full flex-col">
            {/* Panel header */}
            <div className="relative border-b border-[var(--border-subtle)] p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                <Network className="h-3.5 w-3.5" />
                <span>Character Bond</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <CharBubble char={nodesById[graphId(selectedEdge.source)]} sizeClass="h-10 w-10" />
                <span className="font-prose text-lg font-bold text-[var(--text-main)]">
                  {nodesById[graphId(selectedEdge.source)]?.name || graphId(selectedEdge.source)}
                </span>
                <span className="text-xs text-[var(--text-dim)]">↔</span>
                <CharBubble char={nodesById[graphId(selectedEdge.target)]} sizeClass="h-10 w-10" />
                <span className="font-prose text-lg font-bold text-[var(--text-main)]">
                  {nodesById[graphId(selectedEdge.target)]?.name || graphId(selectedEdge.target)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {selectedEdge.relationship_label ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2 py-1 text-[10px] font-bold text-white border border-[var(--accent)]">
                    {selectedEdge.relationship_label}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-light)] px-2 py-1 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)]">
                  <BookOpen className="h-3 w-3" />
                  {selectedEdge.weight} shared beat{selectedEdge.weight === 1 ? '' : 's'}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">
                  across {bookGroups.length} book{bookGroups.length === 1 ? '' : 's'}
                </span>
              </div>
              <button
                onClick={() => setSelectedEdgeId(null)}
                className="absolute top-4 right-4 rounded-md p-1.5 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                title="Close (click a bond to reopen)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {bookGroups.length === 0 && (
                <p className="text-xs italic text-[var(--text-dim)]">
                  No interactions recorded for this pair yet.
                </p>
              )}

              {bookGroups.map((group) => (
                <div key={group.book_id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {group.book_title}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-dim)]">Book {group.book_id}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-dim)]">
                      {group.items.length} ×
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((it, idx) => (
                      <div
                        key={`${group.book_id}-${idx}`}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3"
                      >
                        {it.chapter ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)] border border-[var(--border-subtle)]">
                            <BookOpen className="h-3 w-3" />
                            Ch. {it.chapter.id} · {it.chapter.title}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-dim)] border border-[var(--border-subtle)]">
                            Chapter unlinked
                          </span>
                        )}
                        <p className="mt-1.5 font-prose text-sm font-bold text-[var(--text-main)] leading-snug">
                          {it.beat_title}
                        </p>
                        {it.beat_description && (
                          <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed line-clamp-4">
                            {it.beat_description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Panel footer */}
            <div className="border-t border-[var(--border-subtle)] p-4 text-[10px] text-[var(--text-dim)]">
              Bonds are derived from plot beats shared by both characters. Tune the "Min shared
              beats" filter to focus on stronger relationships.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
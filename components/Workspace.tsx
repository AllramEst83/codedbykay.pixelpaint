import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Check, Minus, Plus, Lightbulb, LightbulbOff, Maximize, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProjectData, Cell } from '../types';
import { saveProject } from '../services/storage';

interface WorkspaceProps {
  project: ProjectData;
  onExit: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ project, onExit }) => {
  // State
  const [grid, setGrid] = useState<Cell[]>(project.grid);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [completedPercent, setCompletedPercent] = useState(0);
  const [showHighlight, setShowHighlight] = useState(true);
  const [isOverHighlightedTile, setIsOverHighlightedTile] = useState(false);
  
  // Refs for gesture handling
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paletteScrollRef = useRef<HTMLDivElement>(null);
  
  // Cache for multi-touch pointers
  const evCache = useRef<React.PointerEvent[]>([]);
  const prevDiff = useRef<number>(-1);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const totalDragDistance = useRef(0);
  
  // Refs to track current zoom and pan for wheel handler (avoid stale closures)
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  
  // Performance optimization: track if we need to redraw
  const needsRedraw = useRef(true);
  const animationFrameId = useRef<number | null>(null);
  const isAnimating = useRef(false);
  
  // State for palette scrolling
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  
  // Check if palette can scroll
  const checkPaletteScroll = useCallback(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = paletteContainer;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1); // -1 for rounding
  }, []);
  
  // Check scroll on mount and when palette changes
  useEffect(() => {
    checkPaletteScroll();
    const paletteContainer = paletteScrollRef.current;
    if (paletteContainer) {
      paletteContainer.addEventListener('scroll', checkPaletteScroll);
      // Also check on resize
      window.addEventListener('resize', checkPaletteScroll);
      return () => {
        paletteContainer.removeEventListener('scroll', checkPaletteScroll);
        window.removeEventListener('resize', checkPaletteScroll);
      };
    }
  }, [checkPaletteScroll, project.palette.length]);
  
  // Auto-scroll to selected color when it changes
  useEffect(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    
    // Find the selected color button and scroll it into view
    const selectedButton = paletteContainer.querySelector(`[data-color-index="${selectedColorIndex}"]`) as HTMLElement;
    if (selectedButton) {
      selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedColorIndex]);
  
  // Scroll palette left/right
  const scrollPaletteLeft = () => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    paletteContainer.scrollBy({ left: -200, behavior: 'smooth' });
  };
  
  const scrollPaletteRight = () => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    paletteContainer.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // Constants
  const BASE_CELL_SIZE = 20; // Pixels per cell at zoom 1
  
  // Calculate completion
  useEffect(() => {
    const filled = grid.filter(c => c.filled).length;
    const total = grid.length;
    setCompletedPercent(Math.round((filled / total) * 100));
    
    // Auto-save every few changes (debounced effectively by this effect running on grid change)
    const timer = setTimeout(() => {
      saveProject({ ...project, grid, pixelSize: BASE_CELL_SIZE }); // Update saved state
    }, 1000);
    return () => clearTimeout(timer);
  }, [grid, project]);

  // Canvas Drawing Logic - Optimized to only draw visible cells
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#f8fafc'; // Slate-50
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply transformations
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw Grid Area
    const cellSize = BASE_CELL_SIZE;
    const totalWidth = project.width * cellSize;
    const totalHeight = project.height * cellSize;

    // Calculate visible area in grid coordinates
    const invZoom = 1 / zoom;
    const viewLeft = (-pan.x) * invZoom;
    const viewTop = (-pan.y) * invZoom;
    const viewRight = viewLeft + (canvas.width * invZoom);
    const viewBottom = viewTop + (canvas.height * invZoom);

    // Calculate which cells are visible
    const startCol = Math.max(0, Math.floor(viewLeft / cellSize));
    const endCol = Math.min(project.width - 1, Math.ceil(viewRight / cellSize));
    const startRow = Math.max(0, Math.floor(viewTop / cellSize));
    const endRow = Math.min(project.height - 1, Math.ceil(viewBottom / cellSize));

    // Draw white background for the visible image area
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);
    
    // Optimize: batch similar operations together
    // Only show numbers when cells are large enough to be readable (reduce text rendering overhead)
    const cellPixelSize = cellSize * zoom;
    const shouldShowNumbers = cellPixelSize > 16; // Only show text when cells are >16px on screen
    const shouldShowHighlights = zoom > 0.3;
    
    // First pass: draw all filled cells (batch by color to reduce fillStyle changes)
    const colorBatches = new Map<number, Array<{x: number, y: number}>>();
    const highlightCells: Array<{x: number, y: number}> = [];
    const borderCells: Array<{x: number, y: number, shouldHighlight: boolean}> = [];
    const textCells: Array<{x: number, y: number, text: string, shouldHighlight: boolean}> = [];
    
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const i = row * project.width + col;
        if (i < 0 || i >= grid.length) continue;
        
        const x = col * cellSize;
        const y = row * cellSize;
        const cell = grid[i];

        if (cell.filled) {
          // Batch filled cells by color
          if (!colorBatches.has(cell.colorIndex)) {
            colorBatches.set(cell.colorIndex, []);
          }
          colorBatches.get(cell.colorIndex)!.push({x, y});
        } else {
          // Highlight active color targets
          const isTarget = cell.colorIndex === selectedColorIndex;
          const shouldHighlight = isTarget && showHighlight;

          if (shouldHighlight && shouldShowHighlights) {
            highlightCells.push({x, y});
          }

          // Collect cells that need borders and text
          if (shouldShowNumbers) {
            borderCells.push({x, y, shouldHighlight});
            textCells.push({
              x, 
              y, 
              text: `${cell.colorIndex + 1}`, 
              shouldHighlight
            });
          }
        }
      }
    }
    
    // Render filled cells batch by color
    for (const [colorIndex, cells] of colorBatches) {
      ctx.fillStyle = project.palette[colorIndex];
      for (const {x, y} of cells) {
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
    
    // Render highlights
    if (highlightCells.length > 0) {
      ctx.fillStyle = '#e0e7ff';
      for (const {x, y} of highlightCells) {
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
    
    // Render borders (if zoomed in)
    if (shouldShowNumbers && borderCells.length > 0) {
      ctx.lineWidth = 1 / zoom;
      
      // Batch borders by style
      const highlightBorders = borderCells.filter(c => c.shouldHighlight);
      const normalBorders = borderCells.filter(c => !c.shouldHighlight);
      
      if (highlightBorders.length > 0) {
        ctx.strokeStyle = '#c7d2fe';
        for (const {x, y} of highlightBorders) {
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
      
      if (normalBorders.length > 0) {
        ctx.strokeStyle = '#f1f5f9';
        for (const {x, y} of normalBorders) {
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
    }
    
    // Render text (most expensive operation - batch by style)
    if (shouldShowNumbers && textCells.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Render highlighted text
      const highlightTexts = textCells.filter(c => c.shouldHighlight);
      if (highlightTexts.length > 0) {
        ctx.fillStyle = '#4338ca';
        ctx.font = 'bold 10px sans-serif';
        for (const {x, y, text} of highlightTexts) {
          ctx.fillText(text, x + cellSize/2, y + cellSize/2);
        }
      }
      
      // Render normal text
      const normalTexts = textCells.filter(c => !c.shouldHighlight);
      if (normalTexts.length > 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        for (const {x, y, text} of normalTexts) {
          ctx.fillText(text, x + cellSize/2, y + cellSize/2);
        }
      }
    }
    
    // Draw Border around the whole thing
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2 / zoom; // Keep border thin visually
    ctx.strokeRect(0, 0, totalWidth, totalHeight);

    ctx.restore();
    
    needsRedraw.current = false;

  }, [grid, project, zoom, pan, selectedColorIndex, showHighlight]);

  // Optimized Render Loop - only redraw when needed
  useEffect(() => {
    needsRedraw.current = true;
  }, [grid, zoom, pan, selectedColorIndex, showHighlight]);
  
  useEffect(() => {
    const renderLoop = () => {
      if (needsRedraw.current || isAnimating.current) {
        draw();
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    
    animationFrameId.current = requestAnimationFrame(renderLoop);
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [draw]);

  // Initial centering
  useEffect(() => {
    if (containerRef.current) {
       const { width, height } = containerRef.current.getBoundingClientRect();
       const contentWidth = project.width * BASE_CELL_SIZE;
       const contentHeight = project.height * BASE_CELL_SIZE;
       
       // Center it
       setPan({
         x: (width - contentWidth)/2,
         y: (height - contentHeight)/2
       });
       needsRedraw.current = true;
    }
  }, []);

  // Check if cursor is over a highlighted tile
  const checkIfOverHighlightedTile = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsOverHighlightedTile(false);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Transform coordinate back to grid space
    const gridX = (clickX - pan.x) / zoom;
    const gridY = (clickY - pan.y) / zoom;

    const col = Math.floor(gridX / BASE_CELL_SIZE);
    const row = Math.floor(gridY / BASE_CELL_SIZE);

    if (col >= 0 && col < project.width && row >= 0 && row < project.height) {
      const index = row * project.width + col;
      const cell = grid[index];
      
      // Check if this is a highlighted tile (unfilled cell matching selected color)
      const isHighlighted = !cell.filled && 
                            cell.colorIndex === selectedColorIndex && 
                            showHighlight;
      setIsOverHighlightedTile(isHighlighted);
    } else {
      setIsOverHighlightedTile(false);
    }
  };

  // Event Handlers
  const handleTap = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Transform coordinate back to grid space
    const gridX = (clickX - pan.x) / zoom;
    const gridY = (clickY - pan.y) / zoom;

    const col = Math.floor(gridX / BASE_CELL_SIZE);
    const row = Math.floor(gridY / BASE_CELL_SIZE);

    if (col >= 0 && col < project.width && row >= 0 && row < project.height) {
      const index = row * project.width + col;
      const cell = grid[index];

      // Interaction Logic
      if (!cell.filled) {
        if (cell.colorIndex === selectedColorIndex) {
          // Correct color!
          const newGrid = [...grid];
          newGrid[index] = { ...cell, filled: true };
          setGrid(newGrid);
        } else {
          // Incorrect color feedback could go here
        }
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    evCache.current.push(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    setIsDragging(true);
    isAnimating.current = true; // Start continuous rendering during interaction
    setIsOverHighlightedTile(false); // Reset cursor when starting to drag
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    
    // Only reset total drag if we are starting a fresh interaction (1 finger)
    // If a second finger lands, we are continuing the interaction
    if (evCache.current.length === 1) {
       totalDragDistance.current = 0;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Update the event in the cache
    const index = evCache.current.findIndex(ev => ev.pointerId === e.pointerId);
    if (index > -1) {
      evCache.current[index] = e;
    }

    // 2. Handle Pinch (2 pointers)
    if (evCache.current.length === 2) {
      const p1 = evCache.current[0];
      const p2 = evCache.current[1];
      
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      const curDiff = Math.hypot(dx, dy);

      if (prevDiff.current > 0) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        
        // Calculate the midpoint between the two fingers (pinch center)
        const pinchCenterX = (p1.clientX + p2.clientX) / 2 - rect.left;
        const pinchCenterY = (p1.clientY + p2.clientY) / 2 - rect.top;
        
        // Calculate zoom factor based on distance change
        const delta = curDiff - prevDiff.current;
        const zoomSensitivity = 0.005;
        const zoomFactor = 1 + (delta * zoomSensitivity);
        
        let newZoom = zoom * zoomFactor;
        newZoom = Math.max(0.1, Math.min(newZoom, 5));
        
        // Calculate the point in world coordinates before zoom
        const worldX = (pinchCenterX - pan.x) / zoom;
        const worldY = (pinchCenterY - pan.y) / zoom;
        
        // Calculate new pan to keep the pinch center fixed
        const newPanX = pinchCenterX - worldX * newZoom;
        const newPanY = pinchCenterY - worldY * newZoom;
        
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
        needsRedraw.current = true;
      }
      prevDiff.current = curDiff;
    } 
    // 3. Handle Drag/Pan (1 pointer)
    else if (evCache.current.length === 1 && isDragging) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      needsRedraw.current = true;
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      
      totalDragDistance.current += Math.abs(dx) + Math.abs(dy);
    }
  };

  // Handle mouse move for cursor detection (separate from pointer events for better desktop support)
  const handleMouseMove = (e: React.MouseEvent) => {
    // Only check cursor when not dragging
    if (!isDragging && evCache.current.length === 0) {
      checkIfOverHighlightedTile(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Remove from cache
    const index = evCache.current.findIndex(ev => ev.pointerId === e.pointerId);
    if (index > -1) {
      evCache.current.splice(index, 1);
    }
    
    e.currentTarget.releasePointerCapture(e.pointerId);

    // If fewer than 2 pointers, reset pinch diff
    if (evCache.current.length < 2) {
      prevDiff.current = -1;
    }
    
    // If no pointers left, stop dragging
    if (evCache.current.length === 0) {
      setIsDragging(false);
      isAnimating.current = false; // Stop continuous rendering
      needsRedraw.current = true; // One final redraw

      // If moved less than threshold pixels total during the press, treat as click
      if (totalDragDistance.current < 15) {
        handleTap(e.clientX, e.clientY);
      }
    } else if (evCache.current.length === 1) {
      // If we went from 2 fingers to 1, re-sync the last position to avoid a jump
      // in the single-finger drag logic
      lastPointerPos.current = { x: evCache.current[0].clientX, y: evCache.current[0].clientY };
    }
  };

  // Zoom controls
  const zoomIn = () => {
    setZoom(z => Math.min(z * 1.2, 5));
    needsRedraw.current = true;
  };
  const zoomOut = () => {
    setZoom(z => Math.max(z / 1.2, 0.2));
    needsRedraw.current = true;
  };

  // Mouse wheel zoom handler - attached directly to DOM to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Use refs to get current values (avoid stale closures)
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      // Calculate zoom factor (negative deltaY = zoom in, positive = zoom out)
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, currentZoom * zoomFactor));

      // Calculate the point in world coordinates before zoom
      const worldX = (mouseX - currentPan.x) / currentZoom;
      const worldY = (mouseY - currentPan.y) / currentZoom;

      // Calculate new pan to keep the point under the cursor in the same place
      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
      needsRedraw.current = true;
    };

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []); // Empty deps - using refs for current values
  
  const handleCenter = () => {
    const container = containerRef.current;
    if (!container) return;
    
    const { width: cW, height: cH } = container.getBoundingClientRect();
    const contentW = project.width * BASE_CELL_SIZE;
    const contentH = project.height * BASE_CELL_SIZE;
    
    // Calculate scale to fit with some margin
    const margin = 40;
    const scaleX = (cW - margin) / contentW;
    const scaleY = (cH - margin) / contentH;
    
    // Fit entire image, clamped to reasonable limits
    let newZoom = Math.min(scaleX, scaleY);
    newZoom = Math.max(0.1, Math.min(newZoom, 5)); 

    const newPanX = (cW - contentW * newZoom) / 2;
    const newPanY = (cH - contentH * newZoom) / 2;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
    needsRedraw.current = true;
  };

  // Determine progress of current color
  const getColorProgress = (idx: number) => {
    const total = project.grid.filter(c => c.colorIndex === idx).length;
    const filled = project.grid.filter(c => c.colorIndex === idx && c.filled).length;
    return total === 0 ? 100 : Math.round((filled / total) * 100);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 relative overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <button onClick={onExit} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex flex-col items-center">
           <h1 className="font-bold text-slate-800 text-sm md:text-base">Pixel Art</h1>
           <div className="text-xs text-slate-500">{completedPercent}% Complete</div>
        </div>
        <div className="w-16 flex justify-end">
            <button 
              onClick={() => setShowHighlight(!showHighlight)}
              className={`p-2 rounded-full transition-colors ${showHighlight ? 'bg-yellow-100 text-yellow-600' : 'text-slate-400 hover:bg-slate-100'}`}
              title={showHighlight ? "Hide hints" : "Show hints"}
            >
              {showHighlight ? <Lightbulb size={20} className="fill-current" /> : <LightbulbOff size={20} />}
            </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden relative touch-none bg-slate-100"
      >
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || window.innerWidth}
          height={containerRef.current?.clientHeight || window.innerHeight}
          className={`absolute inset-0 touch-none ${isOverHighlightedTile ? 'cursor-pointer' : 'cursor-move'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => {
            setIsOverHighlightedTile(false);
            handlePointerUp(e);
          }}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setIsOverHighlightedTile(false)}
          style={{ touchAction: 'none' }} 
        />
        
        {/* Floating Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white rounded-lg shadow-md border border-slate-200 p-1">
          <button onClick={zoomIn} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Zoom In">
            <Plus size={20} />
          </button>
          <button onClick={handleCenter} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Fit to Screen">
            <Maximize size={20} />
          </button>
          <button onClick={zoomOut} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Zoom Out">
            <Minus size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Palette */}
      <div className="bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 pb-safe">
        <div className="flex items-stretch">
          {/* Left scroll button - hidden on mobile, visible on desktop */}
          <button
            onClick={scrollPaletteLeft}
            disabled={!canScrollLeft}
            className="hidden md:flex items-center justify-center w-12 bg-white hover:bg-slate-50 border-r border-slate-200 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
            aria-label="Scroll palette left"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          
          <div 
            ref={paletteScrollRef}
            className="flex gap-4 overflow-x-auto no-scrollbar p-4 snap-x flex-1"
          >
          {project.palette.map((color, idx) => {
            const isSelected = idx === selectedColorIndex;
            const progress = getColorProgress(idx);
            const isComplete = progress === 100;

            return (
              <button
                key={idx}
                data-color-index={idx}
                onClick={() => setSelectedColorIndex(idx)}
                className={`
                  flex-shrink-0 relative
                  flex flex-col items-center justify-center gap-1.5
                  w-14 h-20 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] snap-start
                  border-2
                  ${isSelected 
                    ? 'bg-indigo-50 border-indigo-600 shadow-lg -translate-y-2' 
                    : 'bg-transparent border-transparent hover:bg-slate-50'
                  }
                  ${isComplete ? 'opacity-60 grayscale-[0.3]' : ''}
                `}
              >
                {/* Color Swatch */}
                <div 
                  className={`w-9 h-9 rounded-full shadow-sm border border-black/10 flex items-center justify-center transition-transform duration-300 ${isSelected ? 'scale-110' : ''}`}
                  style={{ backgroundColor: color }}
                >
                  {isComplete && <Check size={16} className="text-white drop-shadow-md" strokeWidth={3} />}
                </div>
                
                {/* Number */}
                <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-700' : 'text-slate-500'}`}>
                  {idx + 1}
                </span>

                {/* Progress bar under button */}
                <div className="absolute bottom-2 w-8 h-1 bg-slate-200 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-green-500 transition-all duration-500 ease-out"
                     style={{ width: `${progress}%` }}
                   />
                </div>
              </button>
            );
          })}
          </div>
          
          {/* Right scroll button - hidden on mobile, visible on desktop */}
          <button
            onClick={scrollPaletteRight}
            disabled={!canScrollRight}
            className="hidden md:flex items-center justify-center w-12 bg-white hover:bg-slate-50 border-l border-slate-200 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
            aria-label="Scroll palette right"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
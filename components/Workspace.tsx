import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Check, Minus, Plus, Lightbulb, LightbulbOff, Maximize } from 'lucide-react';
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
  
  // Refs for gesture handling
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Cache for multi-touch pointers
  const evCache = useRef<React.PointerEvent[]>([]);
  const prevDiff = useRef<number>(-1);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const totalDragDistance = useRef(0);

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

  // Canvas Drawing Logic
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

    // Draw white background for the image area
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);
    
    // Draw cells
    for (let i = 0; i < grid.length; i++) {
      const col = i % project.width;
      const row = Math.floor(i / project.width);
      const x = col * cellSize;
      const y = row * cellSize;
      const cell = grid[i];

      if (cell.filled) {
        ctx.fillStyle = project.palette[cell.colorIndex];
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        // Highlight active color targets
        const isTarget = cell.colorIndex === selectedColorIndex;
        const shouldHighlight = isTarget && showHighlight;

        if (shouldHighlight) {
            // Light highlight to show user where to click
            ctx.fillStyle = '#e0e7ff'; // Indigo-50-ish
            ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Draw number if zoomed in enough
        if (zoom > 0.8) {
           ctx.lineWidth = 1 / zoom; // Scale border thickness
           
           // Highlight border slightly if target
           ctx.strokeStyle = shouldHighlight ? '#c7d2fe' : '#f1f5f9';
           ctx.strokeRect(x, y, cellSize, cellSize);
           
           // Draw number text
           // If target, bold and dark blue. If not, grey.
           ctx.fillStyle = shouldHighlight ? '#4338ca' : '#94a3b8';
           ctx.font = shouldHighlight ? 'bold 10px sans-serif' : '10px sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           
           // Display 1-based index for human friendliness
           ctx.fillText(`${cell.colorIndex + 1}`, x + cellSize/2, y + cellSize/2);
        } else if (zoom > 0.3) {
            // When zoomed out but not super far, just show hint of grid
           if (shouldHighlight) {
               ctx.fillStyle = '#e0e7ff';
               ctx.fillRect(x, y, cellSize, cellSize);
           }
        }
      }
    }
    
    // Draw Border around the whole thing
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2 / zoom; // Keep border thin visually
    ctx.strokeRect(0, 0, totalWidth, totalHeight);

    ctx.restore();

  }, [grid, project, zoom, pan, selectedColorIndex, showHighlight]);

  // Render Loop
  useEffect(() => {
    const animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
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
    }
  }, []);

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
        // Calculate zoom delta
        const delta = curDiff - prevDiff.current;
        const zoomSensitivity = 0.005; // Adjust sensitivity
        
        let newZoom = zoom + (delta * zoomSensitivity * zoom);
        newZoom = Math.max(0.1, Math.min(newZoom, 5));
        
        setZoom(newZoom);
        // Note: We aren't adjusting pan during pinch here for simplicity, 
        // which makes it zoom relative to the origin (top-left) of current view
        // Ideally we would zoom towards the midpoint of p1 and p2.
      }
      prevDiff.current = curDiff;
    } 
    // 3. Handle Drag/Pan (1 pointer)
    else if (evCache.current.length === 1 && isDragging) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      
      totalDragDistance.current += Math.abs(dx) + Math.abs(dy);
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
  const zoomIn = () => setZoom(z => Math.min(z * 1.2, 5));
  const zoomOut = () => setZoom(z => Math.max(z / 1.2, 0.2));
  
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
  };

  // Determine progress of current color
  const getColorProgress = (idx: number) => {
    const total = project.grid.filter(c => c.colorIndex === idx).length;
    const filled = project.grid.filter(c => c.colorIndex === idx && c.filled).length;
    return total === 0 ? 100 : Math.round((filled / total) * 100);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
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
      <div ref={containerRef} className="flex-1 overflow-hidden relative touch-none bg-slate-100">
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || window.innerWidth}
          height={containerRef.current?.clientHeight || window.innerHeight}
          className="absolute inset-0 cursor-move touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
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
        <div className="flex gap-4 overflow-x-auto no-scrollbar p-4 px-6 snap-x">
          {project.palette.map((color, idx) => {
            const isSelected = idx === selectedColorIndex;
            const progress = getColorProgress(idx);
            const isComplete = progress === 100;

            return (
              <button
                key={idx}
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
      </div>
    </div>
  );
};
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Check, Minus, Plus, Lightbulb, LightbulbOff, Maximize, ChevronLeft, ChevronRight, Moon, Sun, Loader2 } from 'lucide-react';
import { ProjectData, Cell } from '../types';
import { saveProject } from '../services/storage';
import { useTheme } from '../contexts/ThemeContext';
import * as PIXI from 'pixi.js';

interface WorkspaceProps {
  project: ProjectData;
  onExit: () => void;
}

// Constants
const BASE_CELL_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const Workspace: React.FC<WorkspaceProps> = ({ project, onExit }) => {
  const { theme, toggleTheme } = useTheme();
  
  // State - minimal state, use refs for frequently changing values
  const [grid, setGrid] = useState<Cell[]>(project.grid);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(0);
  const [completedPercent, setCompletedPercent] = useState(0);
  const [showHighlight, setShowHighlight] = useState(true);
  const [pixiReady, setPixiReady] = useState(false);
  
  // Cursor state as ref (avoid React re-renders for cursor changes)
  const isOverHighlightedTileRef = useRef(false);
  
  // Palette scrolling state
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const paletteScrollRef = useRef<HTMLDivElement>(null);
  
  // Transform refs (use refs to avoid re-renders during pan/zoom)
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const containerSizeRef = useRef({ width: 800, height: 600 });
  
  // PixiJS refs
  const appRef = useRef<PIXI.Application | null>(null);
  const gridContainerRef = useRef<PIXI.Container | null>(null);
  const backgroundGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const filledGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const highlightGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const borderGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const textContainerRef = useRef<PIXI.Container | null>(null);
  const outerBorderGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const numberTexturesRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const pixiInitializedRef = useRef(false);
  
  // Dirty flags for selective re-rendering
  const dirtyFlags = useRef({
    filled: true,      // Redraw when cells are filled
    highlight: true,   // Redraw when selection changes
    text: true,        // Redraw visible text
    transform: true,   // Update container position/scale
  });
  
  // Cached data refs
  const gridRef = useRef(grid);
  const selectedColorIndexRef = useRef(selectedColorIndex);
  const showHighlightRef = useRef(showHighlight);
  const themeRef = useRef(theme);
  
  // Gesture handling refs
  const evCache = useRef<React.PointerEvent[]>([]);
  const prevDiff = useRef<number>(-1);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const totalDragDistance = useRef(0);
  const isDraggingRef = useRef(false);
  
  // Animation frame ref
  const rafIdRef = useRef<number | null>(null);
  
  // Keep refs in sync with state
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { selectedColorIndexRef.current = selectedColorIndex; }, [selectedColorIndex]);
  useEffect(() => { showHighlightRef.current = showHighlight; }, [showHighlight]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Theme colors (memoized)
  const colors = useMemo(() => ({
    background: theme === 'dark' ? 0x0f172a : 0xf8fafc,
    gridBackground: theme === 'dark' ? 0x1e293b : 0xffffff,
    highlight: theme === 'dark' ? 0x312e81 : 0xe0e7ff,
    highlightBorder: theme === 'dark' ? 0x4f46e5 : 0xc7d2fe,
    normalBorder: theme === 'dark' ? 0x334155 : 0xf1f5f9,
    outerBorder: theme === 'dark' ? 0x475569 : 0xcbd5e1,
  }), [theme]);

  // Generate number textures - only for actual palette colors (faster loading)
  const generateNumberTextures = useCallback((app: PIXI.Application) => {
    const maxNum = project.palette.length; // Only create textures we need
    const textureMap = new Map<string, PIXI.Texture>();
    
    // Reuse text styles for all numbers
    const styles = {
      normalLight: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x94a3b8 }),
      highlightLight: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x4338ca, fontWeight: 'bold' }),
      normalDark: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x64748b }),
      highlightDark: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x818cf8, fontWeight: 'bold' }),
    };
    
    // Create a reusable text object for efficiency
    const pixiText = new PIXI.Text({ text: '1', style: styles.normalLight });
    
    for (let i = 1; i <= maxNum; i++) {
      pixiText.text = `${i}`;
      
      for (const [styleName, style] of Object.entries(styles)) {
        pixiText.style = style;
        const texture = app.renderer.generateTexture(pixiText);
        textureMap.set(`${i}-${styleName}`, texture);
      }
    }
    
    pixiText.destroy();
    numberTexturesRef.current = textureMap;
  }, [project.palette.length]);

  // Initialize PixiJS
  useEffect(() => {
    if (!pixiContainerRef.current || pixiInitializedRef.current) return;

    const initPixi = async () => {
      pixiInitializedRef.current = true;
      
      const container = containerRef.current;
      const initialWidth = container?.clientWidth || window.innerWidth;
      const initialHeight = container?.clientHeight || window.innerHeight;
      containerSizeRef.current = { width: initialWidth, height: initialHeight };
      
      const app = new PIXI.Application();
      
      await app.init({
        width: initialWidth,
        height: initialHeight,
        backgroundColor: colors.background,
        antialias: false, // Disable for performance
        resolution: Math.min(window.devicePixelRatio || 1, 2), // Cap resolution
        autoDensity: true,
        powerPreference: 'high-performance',
      });
      
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      
      pixiContainerRef.current?.appendChild(canvas);
      appRef.current = app;
      
      // Create grid container for transforms
      const gridContainer = new PIXI.Container();
      app.stage.addChild(gridContainer);
      gridContainerRef.current = gridContainer;
      
      // Create layers in order (bottom to top)
      const backgroundGraphics = new PIXI.Graphics();
      const filledGraphics = new PIXI.Graphics();
      const highlightGraphics = new PIXI.Graphics();
      const borderGraphics = new PIXI.Graphics();
      const textContainer = new PIXI.Container();
      const outerBorderGraphics = new PIXI.Graphics();
      
      textContainer.cullable = true;
      
      gridContainer.addChild(backgroundGraphics);
      gridContainer.addChild(filledGraphics);
      gridContainer.addChild(highlightGraphics);
      gridContainer.addChild(borderGraphics);
      gridContainer.addChild(textContainer);
      gridContainer.addChild(outerBorderGraphics);
      
      backgroundGraphicsRef.current = backgroundGraphics;
      filledGraphicsRef.current = filledGraphics;
      highlightGraphicsRef.current = highlightGraphics;
      borderGraphicsRef.current = borderGraphics;
      textContainerRef.current = textContainer;
      outerBorderGraphicsRef.current = outerBorderGraphics;
      
      // Generate textures
      generateNumberTextures(app);
      
      // Draw static background (only once)
      const totalWidth = project.width * BASE_CELL_SIZE;
      const totalHeight = project.height * BASE_CELL_SIZE;
      backgroundGraphics.rect(0, 0, totalWidth, totalHeight);
      backgroundGraphics.fill(colors.gridBackground);
      
      // Draw outer border (static)
      outerBorderGraphics.setStrokeStyle({ width: 2, color: colors.outerBorder });
      outerBorderGraphics.rect(0, 0, totalWidth, totalHeight);
      outerBorderGraphics.stroke();
      
      // Initial centering
      const margin = 40;
      const scaleX = (initialWidth - margin) / totalWidth;
      const scaleY = (initialHeight - margin) / totalHeight;
      let newZoom = Math.min(scaleX, scaleY);
      newZoom = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));
      
      zoomRef.current = newZoom;
      panRef.current = {
        x: (initialWidth - totalWidth * newZoom) / 2,
        y: (initialHeight - totalHeight * newZoom) / 2
      };
      
      // Mark all as dirty for initial render
      dirtyFlags.current = { filled: true, highlight: true, text: true, transform: true };
      
      setPixiReady(true);
      
      // Start render loop
      startRenderLoop();
    };
    
    initPixi();
    
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        pixiInitializedRef.current = false;
      }
    };
  }, []);

  // Optimized render loop using requestAnimationFrame
  const startRenderLoop = useCallback(() => {
    const render = () => {
      const gridContainer = gridContainerRef.current;
      const filledGraphics = filledGraphicsRef.current;
      const highlightGraphics = highlightGraphicsRef.current;
      const borderGraphics = borderGraphicsRef.current;
      const textContainer = textContainerRef.current;
      const outerBorderGraphics = outerBorderGraphicsRef.current;
      
      if (!gridContainer || !filledGraphics || !highlightGraphics || !borderGraphics || !textContainer || !outerBorderGraphics) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }
      
      const zoom = zoomRef.current;
      const pan = panRef.current;
      const containerSize = containerSizeRef.current;
      const grid = gridRef.current;
      const selectedColorIndex = selectedColorIndexRef.current;
      const showHighlight = showHighlightRef.current;
      const isDark = themeRef.current === 'dark';
      
      // Always update transform (very cheap)
      gridContainer.position.set(pan.x, pan.y);
      gridContainer.scale.set(zoom);
      
      // Update outer border width based on zoom
      if (dirtyFlags.current.transform) {
        outerBorderGraphics.clear();
        outerBorderGraphics.setStrokeStyle({ width: 2 / zoom, color: isDark ? 0x475569 : 0xcbd5e1 });
        outerBorderGraphics.rect(0, 0, project.width * BASE_CELL_SIZE, project.height * BASE_CELL_SIZE);
        outerBorderGraphics.stroke();
        dirtyFlags.current.transform = false;
      }
      
      // Calculate visible area
      const cellSize = BASE_CELL_SIZE;
      const totalWidth = project.width * cellSize;
      const totalHeight = project.height * cellSize;
      const invZoom = 1 / zoom;
      
      const viewLeft = Math.max(0, (-pan.x) * invZoom);
      const viewTop = Math.max(0, (-pan.y) * invZoom);
      const viewRight = Math.min(totalWidth, viewLeft + (containerSize.width * invZoom));
      const viewBottom = Math.min(totalHeight, viewTop + (containerSize.height * invZoom));
      
      const startCol = Math.max(0, Math.floor(viewLeft / cellSize) - 1);
      const endCol = Math.min(project.width - 1, Math.ceil(viewRight / cellSize) + 1);
      const startRow = Math.max(0, Math.floor(viewTop / cellSize) - 1);
      const endRow = Math.min(project.height - 1, Math.ceil(viewBottom / cellSize) + 1);
      
      // LOD
      const cellPixelSize = cellSize * zoom;
      const shouldShowText = cellPixelSize > 14;
      const shouldShowBorders = cellPixelSize > 6;
      
      // Redraw filled cells if dirty
      if (dirtyFlags.current.filled) {
        filledGraphics.clear();
        
        const filledByColor = new Map<number, Array<{x: number, y: number}>>();
        
        for (let i = 0; i < grid.length; i++) {
          const cell = grid[i];
          if (cell.filled) {
            const col = i % project.width;
            const row = Math.floor(i / project.width);
            if (!filledByColor.has(cell.colorIndex)) {
              filledByColor.set(cell.colorIndex, []);
            }
            filledByColor.get(cell.colorIndex)!.push({ 
              x: col * cellSize, 
              y: row * cellSize 
            });
          }
        }
        
        for (const [colorIndex, cells] of filledByColor) {
          const colorHex = parseInt(project.palette[colorIndex].replace('#', ''), 16);
          for (const { x, y } of cells) {
            filledGraphics.rect(x, y, cellSize, cellSize);
          }
          filledGraphics.fill(colorHex);
        }
        
        dirtyFlags.current.filled = false;
      }
      
      // Redraw highlights and borders if dirty or scrolled
      if (dirtyFlags.current.highlight || dirtyFlags.current.text) {
        highlightGraphics.clear();
        borderGraphics.clear();
        
        // Hide all text sprites
        for (const child of textContainer.children) {
          (child as PIXI.Sprite).visible = false;
        }
        
        const highlightCells: Array<{x: number, y: number, colorIndex: number}> = [];
        const normalCells: Array<{x: number, y: number, colorIndex: number}> = [];
        
        // Only process visible cells
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const i = row * project.width + col;
            if (i < 0 || i >= grid.length) continue;
            
            const cell = grid[i];
            if (cell.filled) continue;
            
            const x = col * cellSize;
            const y = row * cellSize;
            const isTarget = cell.colorIndex === selectedColorIndex;
            const shouldHighlightCell = isTarget && showHighlight;
            
            if (shouldHighlightCell) {
              highlightCells.push({ x, y, colorIndex: cell.colorIndex });
            } else {
              normalCells.push({ x, y, colorIndex: cell.colorIndex });
            }
          }
        }
        
        // Draw highlights
        if (highlightCells.length > 0) {
          for (const { x, y } of highlightCells) {
            highlightGraphics.rect(x, y, cellSize, cellSize);
          }
          highlightGraphics.fill(isDark ? 0x312e81 : 0xe0e7ff);
        }
        
        // Draw borders
        if (shouldShowBorders) {
          const borderWidth = Math.max(0.5, 1 / zoom);
          
          if (highlightCells.length > 0) {
            borderGraphics.setStrokeStyle({ width: borderWidth, color: isDark ? 0x4f46e5 : 0xc7d2fe });
            for (const { x, y } of highlightCells) {
              borderGraphics.rect(x, y, cellSize, cellSize);
            }
            borderGraphics.stroke();
          }
          
          if (normalCells.length > 0) {
            borderGraphics.setStrokeStyle({ width: borderWidth, color: isDark ? 0x334155 : 0xf1f5f9 });
            for (const { x, y } of normalCells) {
              borderGraphics.rect(x, y, cellSize, cellSize);
            }
            borderGraphics.stroke();
          }
        }
        
        // Draw text sprites
        if (shouldShowText) {
          const textureMap = numberTexturesRef.current;
          let spriteIndex = 0;
          
          const getSprite = () => {
            if (spriteIndex < textContainer.children.length) {
              return textContainer.children[spriteIndex++] as PIXI.Sprite;
            }
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            textContainer.addChild(sprite);
            spriteIndex++;
            return sprite;
          };
          
          for (const { x, y, colorIndex } of highlightCells) {
            const textureKey = `${colorIndex + 1}-${isDark ? 'highlightDark' : 'highlightLight'}`;
            const texture = textureMap.get(textureKey);
            if (texture) {
              const sprite = getSprite();
              sprite.texture = texture;
              sprite.position.set(x + cellSize / 2, y + cellSize / 2);
              sprite.visible = true;
            }
          }
          
          for (const { x, y, colorIndex } of normalCells) {
            const textureKey = `${colorIndex + 1}-${isDark ? 'normalDark' : 'normalLight'}`;
            const texture = textureMap.get(textureKey);
            if (texture) {
              const sprite = getSprite();
              sprite.texture = texture;
              sprite.position.set(x + cellSize / 2, y + cellSize / 2);
              sprite.visible = true;
            }
          }
        }
        
        dirtyFlags.current.highlight = false;
        dirtyFlags.current.text = false;
      }
      
      rafIdRef.current = requestAnimationFrame(render);
    };
    
    rafIdRef.current = requestAnimationFrame(render);
  }, [project.width, project.height, project.palette]);

  // Mark dirty when grid changes
  // Note: We DON'T set filled dirty because:
  // 1. New fills are drawn immediately via immediatelyDrawFilledCell()
  // 2. Filled cells from initial load are already drawn
  // We only mark highlight/text dirty to update unfilled cells display
  useEffect(() => {
    dirtyFlags.current.highlight = true;
    dirtyFlags.current.text = true;
  }, [grid]);

  // Mark dirty when selection/highlight changes
  useEffect(() => {
    dirtyFlags.current.highlight = true;
    dirtyFlags.current.text = true;
  }, [selectedColorIndex, showHighlight]);

  // Update background color when theme changes
  useEffect(() => {
    if (appRef.current && backgroundGraphicsRef.current) {
      appRef.current.renderer.background.color = colors.background;
      
      backgroundGraphicsRef.current.clear();
      backgroundGraphicsRef.current.rect(0, 0, project.width * BASE_CELL_SIZE, project.height * BASE_CELL_SIZE);
      backgroundGraphicsRef.current.fill(colors.gridBackground);
      
      dirtyFlags.current.highlight = true;
      dirtyFlags.current.text = true;
      dirtyFlags.current.transform = true;
    }
  }, [colors, project.width, project.height]);

  // Regenerate textures when theme changes
  useEffect(() => {
    if (appRef.current && numberTexturesRef.current.size > 0) {
      for (const texture of numberTexturesRef.current.values()) {
        texture.destroy(true);
      }
      numberTexturesRef.current.clear();
      generateNumberTextures(appRef.current);
      dirtyFlags.current.text = true;
    }
  }, [theme, generateNumberTextures]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && appRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          containerSizeRef.current = { width: clientWidth, height: clientHeight };
          appRef.current.renderer.resize(clientWidth, clientHeight);
          dirtyFlags.current.text = true;
        }
      }
    };
    
    handleResize();
    const timer1 = setTimeout(handleResize, 100);
    const timer2 = setTimeout(handleResize, 500);
    
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate completion
  useEffect(() => {
    const filled = grid.filter(c => c.filled).length;
    setCompletedPercent(Math.round((filled / grid.length) * 100));
    
    const timer = setTimeout(() => {
      saveProject({ ...project, grid, pixelSize: BASE_CELL_SIZE });
    }, 1000);
    return () => clearTimeout(timer);
  }, [grid, project]);

  // Palette scroll handlers
  const checkPaletteScroll = useCallback(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = paletteContainer;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    checkPaletteScroll();
    const paletteContainer = paletteScrollRef.current;
    if (paletteContainer) {
      paletteContainer.addEventListener('scroll', checkPaletteScroll);
      window.addEventListener('resize', checkPaletteScroll);
      return () => {
        paletteContainer.removeEventListener('scroll', checkPaletteScroll);
        window.removeEventListener('resize', checkPaletteScroll);
      };
    }
  }, [checkPaletteScroll, project.palette.length]);

  useEffect(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;
    
    const selectedButton = paletteContainer.querySelector(`[data-color-index="${selectedColorIndex}"]`) as HTMLElement;
    if (selectedButton) {
      selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedColorIndex]);

  const scrollPaletteLeft = () => {
    paletteScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollPaletteRight = () => {
    paletteScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // Screen to grid coordinate conversion
  const screenToGrid = useCallback((clientX: number, clientY: number) => {
    const container = pixiContainerRef.current;
    if (!container) return null;
    
    const rect = container.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    
    const gridX = (screenX - panRef.current.x) / zoomRef.current;
    const gridY = (screenY - panRef.current.y) / zoomRef.current;
    
    const col = Math.floor(gridX / BASE_CELL_SIZE);
    const row = Math.floor(gridY / BASE_CELL_SIZE);
    
    if (col >= 0 && col < project.width && row >= 0 && row < project.height) {
      return { col, row, index: row * project.width + col };
    }
    return null;
  }, [project.width, project.height]);

  // Check if over highlighted tile - directly manipulate DOM cursor (no React re-render)
  const checkIfOverHighlightedTile = useCallback((clientX: number, clientY: number) => {
    const container = pixiContainerRef.current;
    if (!container) return;
    
    const result = screenToGrid(clientX, clientY);
    let isHighlighted = false;
    
    if (result) {
      const cell = gridRef.current[result.index];
      isHighlighted = !cell.filled && cell.colorIndex === selectedColorIndexRef.current && showHighlightRef.current;
    }
    
    // Only update DOM if changed
    if (isHighlighted !== isOverHighlightedTileRef.current) {
      isOverHighlightedTileRef.current = isHighlighted;
      container.style.cursor = isHighlighted ? 'pointer' : 'move';
    }
  }, [screenToGrid]);

  // Immediately draw a filled cell to PixiJS (instant visual feedback)
  const immediatelyDrawFilledCell = useCallback((col: number, row: number, colorIndex: number) => {
    const filledGraphics = filledGraphicsRef.current;
    if (!filledGraphics) return;
    
    const x = col * BASE_CELL_SIZE;
    const y = row * BASE_CELL_SIZE;
    const colorHex = parseInt(project.palette[colorIndex].replace('#', ''), 16);
    
    // Draw immediately without clearing
    filledGraphics.rect(x, y, BASE_CELL_SIZE, BASE_CELL_SIZE);
    filledGraphics.fill(colorHex);
  }, [project.palette]);

  // Handle tap/click
  const handleTap = useCallback((clientX: number, clientY: number) => {
    const result = screenToGrid(clientX, clientY);
    if (result) {
      const cell = gridRef.current[result.index];
      if (!cell.filled && cell.colorIndex === selectedColorIndexRef.current) {
        // Immediately draw the filled cell for instant visual feedback
        immediatelyDrawFilledCell(result.col, result.row, cell.colorIndex);
        
        // Mark highlight as dirty to remove the highlight from this cell
        dirtyFlags.current.highlight = true;
        dirtyFlags.current.text = true;
        
        // Update React state (for persistence and completion tracking)
        setGrid(prev => {
          const newGrid = [...prev];
          newGrid[result.index] = { ...cell, filled: true };
          return newGrid;
        });
      }
    }
  }, [screenToGrid, immediatelyDrawFilledCell]);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    evCache.current.push(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    
    // Reset cursor directly
    isOverHighlightedTileRef.current = false;
    if (pixiContainerRef.current) {
      pixiContainerRef.current.style.cursor = 'move';
    }
    
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    
    if (evCache.current.length === 1) {
      totalDragDistance.current = 0;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const index = evCache.current.findIndex(ev => ev.pointerId === e.pointerId);
    if (index > -1) {
      evCache.current[index] = e;
    }

    // Pinch zoom
    if (evCache.current.length === 2) {
      const p1 = evCache.current[0];
      const p2 = evCache.current[1];
      
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      const curDiff = Math.hypot(dx, dy);

      if (prevDiff.current > 0) {
        const container = pixiContainerRef.current;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        const pinchCenterX = (p1.clientX + p2.clientX) / 2 - rect.left;
        const pinchCenterY = (p1.clientY + p2.clientY) / 2 - rect.top;
        
        const delta = curDiff - prevDiff.current;
        const zoomFactor = 1 + (delta * 0.005);
        
        let newZoom = zoomRef.current * zoomFactor;
        newZoom = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));
        
        const worldX = (pinchCenterX - panRef.current.x) / zoomRef.current;
        const worldY = (pinchCenterY - panRef.current.y) / zoomRef.current;
        
        panRef.current = {
          x: pinchCenterX - worldX * newZoom,
          y: pinchCenterY - worldY * newZoom
        };
        zoomRef.current = newZoom;
        
        dirtyFlags.current.text = true;
        dirtyFlags.current.transform = true;
      }
      prevDiff.current = curDiff;
    }
    // Pan
    else if (evCache.current.length === 1 && isDraggingRef.current) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      
      panRef.current = {
        x: panRef.current.x + dx,
        y: panRef.current.y + dy
      };
      
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      totalDragDistance.current += Math.abs(dx) + Math.abs(dy);
      
      dirtyFlags.current.text = true;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current && evCache.current.length === 0) {
      checkIfOverHighlightedTile(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const index = evCache.current.findIndex(ev => ev.pointerId === e.pointerId);
    if (index > -1) {
      evCache.current.splice(index, 1);
    }
    
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (evCache.current.length < 2) {
      prevDiff.current = -1;
    }
    
    if (evCache.current.length === 0) {
      isDraggingRef.current = false;

      if (totalDragDistance.current < 15) {
        handleTap(e.clientX, e.clientY);
      }
    } else if (evCache.current.length === 1) {
      lastPointerPos.current = { x: evCache.current[0].clientX, y: evCache.current[0].clientY };
    }
  };

  // Zoom controls
  const zoomIn = () => {
    const center = containerSizeRef.current;
    const centerX = center.width / 2;
    const centerY = center.height / 2;
    
    const newZoom = Math.min(zoomRef.current * 1.2, MAX_ZOOM);
    const worldX = (centerX - panRef.current.x) / zoomRef.current;
    const worldY = (centerY - panRef.current.y) / zoomRef.current;
    
    panRef.current = { x: centerX - worldX * newZoom, y: centerY - worldY * newZoom };
    zoomRef.current = newZoom;
    dirtyFlags.current.text = true;
    dirtyFlags.current.transform = true;
  };

  const zoomOut = () => {
    const center = containerSizeRef.current;
    const centerX = center.width / 2;
    const centerY = center.height / 2;
    
    const newZoom = Math.max(zoomRef.current / 1.2, MIN_ZOOM);
    const worldX = (centerX - panRef.current.x) / zoomRef.current;
    const worldY = (centerY - panRef.current.y) / zoomRef.current;
    
    panRef.current = { x: centerX - worldX * newZoom, y: centerY - worldY * newZoom };
    zoomRef.current = newZoom;
    dirtyFlags.current.text = true;
    dirtyFlags.current.transform = true;
  };

  // Mouse wheel zoom
  useEffect(() => {
    const container = pixiContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * zoomFactor));

      const worldX = (mouseX - panRef.current.x) / zoomRef.current;
      const worldY = (mouseY - panRef.current.y) / zoomRef.current;

      panRef.current = { x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom };
      zoomRef.current = newZoom;
      
      dirtyFlags.current.text = true;
      dirtyFlags.current.transform = true;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleCenter = () => {
    const { width: cW, height: cH } = containerSizeRef.current;
    const contentW = project.width * BASE_CELL_SIZE;
    const contentH = project.height * BASE_CELL_SIZE;
    
    const margin = 40;
    const scaleX = (cW - margin) / contentW;
    const scaleY = (cH - margin) / contentH;
    
    let newZoom = Math.min(scaleX, scaleY);
    newZoom = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));

    zoomRef.current = newZoom;
    panRef.current = {
      x: (cW - contentW * newZoom) / 2,
      y: (cH - contentH * newZoom) / 2
    };
    
    dirtyFlags.current.text = true;
    dirtyFlags.current.transform = true;
  };

  const getColorProgress = (idx: number) => {
    const total = project.grid.filter(c => c.colorIndex === idx).length;
    const filled = project.grid.filter(c => c.colorIndex === idx && c.filled).length;
    return total === 0 ? 100 : Math.round((filled / total) * 100);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 relative overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <button onClick={onExit} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex flex-col items-center">
          <h1 className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base">Pixel Art</h1>
          <div className="text-xs text-slate-500 dark:text-slate-400">{completedPercent}% Complete</div>
        </div>
        <div className="w-32 flex justify-end gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            title={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            onClick={() => setShowHighlight(!showHighlight)}
            className={`p-2 rounded-full transition-colors ${showHighlight ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-500' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            title={showHighlight ? "Hide hints" : "Show hints"}
          >
            {showHighlight ? <Lightbulb size={20} className="fill-current" /> : <LightbulbOff size={20} />}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden relative touch-none bg-slate-100 dark:bg-slate-900"
      >
        {/* Loading Spinner - shows until PixiJS is ready */}
        {!pixiReady && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={40} className="animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Loading canvas...</span>
            </div>
          </div>
        )}
        
        <div
          ref={pixiContainerRef}
          className="absolute inset-0 touch-none cursor-move"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => {
            // Reset cursor directly
            if (pixiContainerRef.current) {
              pixiContainerRef.current.style.cursor = 'move';
            }
            isOverHighlightedTileRef.current = false;
            handlePointerUp(e);
          }}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            if (pixiContainerRef.current) {
              pixiContainerRef.current.style.cursor = 'move';
            }
            isOverHighlightedTileRef.current = false;
          }}
          style={{ touchAction: 'none' }}
        />
        
        {/* Floating Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-1 z-10">
          <button onClick={zoomIn} className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Zoom In">
            <Plus size={20} />
          </button>
          <button onClick={handleCenter} className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Fit to Screen">
            <Maximize size={20} />
          </button>
          <button onClick={zoomOut} className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Zoom Out">
            <Minus size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Palette */}
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] z-20 pb-safe">
        <div className="flex items-stretch">
          <button
            onClick={scrollPaletteLeft}
            disabled={!canScrollLeft}
            className="hidden md:flex items-center justify-center w-12 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-r border-slate-200 dark:border-slate-700 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-800"
            aria-label="Scroll palette left"
          >
            <ChevronLeft size={20} className="text-slate-600 dark:text-slate-300" />
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
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 dark:border-indigo-500 shadow-lg -translate-y-2' 
                      : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
                    }
                    ${isComplete ? 'opacity-60 grayscale-[0.3]' : ''}
                  `}
                >
                  <div 
                    className={`w-9 h-9 rounded-full shadow-sm border border-black/10 flex items-center justify-center transition-transform duration-300 ${isSelected ? 'scale-110' : ''}`}
                    style={{ backgroundColor: color }}
                  >
                    {isComplete && <Check size={16} className="text-white drop-shadow-md" strokeWidth={3} />}
                  </div>
                  
                  <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {idx + 1}
                  </span>

                  <div className="absolute bottom-2 w-8 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 dark:bg-green-600 transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          
          <button
            onClick={scrollPaletteRight}
            disabled={!canScrollRight}
            className="hidden md:flex items-center justify-center w-12 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-l border-slate-200 dark:border-slate-700 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-800"
            aria-label="Scroll palette right"
          >
            <ChevronRight size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </div>
    </div>
  );
};

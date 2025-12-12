import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Check, Minus, Plus, Lightbulb, LightbulbOff, Maximize, ChevronLeft, ChevronRight, Moon, Sun, Loader2, HelpCircle, Square, Paintbrush, Search, Image, X } from 'lucide-react';
import { ProjectData, Cell } from '../types';
import { saveProject } from '../services/storage';
import { useTheme } from '../contexts/ThemeContext';
import { InstructionsModal } from './InstructionsModal';
import * as PIXI from 'pixi.js';
import confetti from 'canvas-confetti';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

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
  const [showInstructions, setShowInstructions] = useState(false);
  const [completedColors, setCompletedColors] = useState<Set<number>>(new Set());
  const [hiddenColors, setHiddenColors] = useState<Set<number>>(new Set());
  const [brushSize, setBrushSize] = useState<number>(1); // Brush size in cells (1, 2, or 3)
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

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
  const incorrectFilledGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const highlightGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const borderGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const textContainerRef = useRef<PIXI.Container | null>(null);
  const outerBorderGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const numberTexturesRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const pixiInitializedRef = useRef(false);

  // Paint/Pan mode refs
  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const paintedCellsInStrokeRef = useRef<Set<number>>(new Set());
  const containerRectRef = useRef<DOMRect | null>(null);
  const cellIndexToTextSpriteRef = useRef<Map<number, PIXI.Sprite>>(new Map());

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
  const brushSizeRef = useRef(brushSize);

  // Gesture handling refs
  const evCache = useRef<React.PointerEvent[]>([]);
  const prevDiff = useRef<number>(-1);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const totalDragDistance = useRef(0);
  const isDraggingRef = useRef(false);

  // Animation frame ref
  const rafIdRef = useRef<number | null>(null);

  // Track programmatic color changes to prevent scrolling
  const isProgrammaticColorChangeRef = useRef(false);

  // Debounce completion calculation
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { selectedColorIndexRef.current = selectedColorIndex; }, [selectedColorIndex]);
  useEffect(() => { showHighlightRef.current = showHighlight; }, [showHighlight]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

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

    // Reuse text styles for all numbers - improved contrast for better visibility
    const styles = {
      normalLight: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x475569, fontWeight: '600' }), // slate-600, darker for better contrast
      highlightLight: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x4f46e5, fontWeight: 'bold' }), // indigo-600, vibrant but readable
      normalDark: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0xcbd5e1, fontWeight: '600' }), // slate-300, lighter for better contrast
      highlightDark: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0xa5b4fc, fontWeight: 'bold' }), // indigo-300, bright and readable
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
      // Use actual container dimensions, ensuring we don't exceed viewport
      const initialWidth = container?.clientWidth || Math.min(window.innerWidth, window.visualViewport?.width || window.innerWidth);
      const initialHeight = container?.clientHeight || Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
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


      // Create layers in order (bottom to top) -> Optimized order for performance
      // highlights and borders are BEHIND filled cells so we don't need to clear/redraw them when filling
      const backgroundGraphics = new PIXI.Graphics();
      const highlightGraphics = new PIXI.Graphics();
      const borderGraphics = new PIXI.Graphics();
      const filledGraphics = new PIXI.Graphics();
      const incorrectFilledGraphics = new PIXI.Graphics();
      const textContainer = new PIXI.Container();
      const outerBorderGraphics = new PIXI.Graphics();

      textContainer.cullable = true;

      gridContainer.addChild(backgroundGraphics);
      gridContainer.addChild(highlightGraphics);
      gridContainer.addChild(borderGraphics);
      gridContainer.addChild(filledGraphics);
      gridContainer.addChild(incorrectFilledGraphics);
      gridContainer.addChild(textContainer); // Keep text on top for readability
      gridContainer.addChild(outerBorderGraphics);

      backgroundGraphicsRef.current = backgroundGraphics;
      filledGraphicsRef.current = filledGraphics;
      incorrectFilledGraphicsRef.current = incorrectFilledGraphics;
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
      const incorrectFilledGraphics = incorrectFilledGraphicsRef.current;
      const highlightGraphics = highlightGraphicsRef.current;
      const borderGraphics = borderGraphicsRef.current;
      const textContainer = textContainerRef.current;
      const outerBorderGraphics = outerBorderGraphicsRef.current;

      if (!gridContainer || !filledGraphics || !incorrectFilledGraphics || !highlightGraphics || !borderGraphics || !textContainer || !outerBorderGraphics) {
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
        incorrectFilledGraphics.clear();

        // Separate correct and incorrect fills for batching
        const correctFilledByColor = new Map<number, Array<{ x: number, y: number }>>();
        const incorrectFilledByColor = new Map<number, Array<{ x: number, y: number, correctColorIndex: number }>>();

        for (let i = 0; i < grid.length; i++) {
          const cell = grid[i];
          if (cell.filled && cell.filledColorIndex !== undefined) {
            const col = i % project.width;
            const row = Math.floor(i / project.width);
            const isCorrect = cell.filledColorIndex === cell.colorIndex;

            if (isCorrect) {
              // Correct fill - solid color
              if (!correctFilledByColor.has(cell.filledColorIndex)) {
                correctFilledByColor.set(cell.filledColorIndex, []);
              }
              correctFilledByColor.get(cell.filledColorIndex)!.push({
                x: col * cellSize,
                y: row * cellSize
              });
            } else {
              // Incorrect fill - transparent color
              if (!incorrectFilledByColor.has(cell.filledColorIndex)) {
                incorrectFilledByColor.set(cell.filledColorIndex, []);
              }
              incorrectFilledByColor.get(cell.filledColorIndex)!.push({
                x: col * cellSize,
                y: row * cellSize,
                correctColorIndex: cell.colorIndex
              });
            }
          }
        }

        // Draw correct fills (solid)
        for (const [colorIndex, cells] of correctFilledByColor) {
          const colorHex = parseInt(project.palette[colorIndex].replace('#', ''), 16);
          for (const { x, y } of cells) {
            filledGraphics.rect(x, y, cellSize, cellSize);
          }
          filledGraphics.fill(colorHex);
        }

        // Draw incorrect fills (40% opacity)
        for (const [colorIndex, cells] of incorrectFilledByColor) {
          const colorHex = parseInt(project.palette[colorIndex].replace('#', ''), 16);
          for (const { x, y } of cells) {
            incorrectFilledGraphics.rect(x, y, cellSize, cellSize);
          }
          incorrectFilledGraphics.fill({ color: colorHex, alpha: 0.4 });
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
        cellIndexToTextSpriteRef.current.clear();

        const highlightCells: Array<{ x: number, y: number, colorIndex: number, index: number }> = [];
        const normalCells: Array<{ x: number, y: number, colorIndex: number, index: number }> = [];
        const incorrectFilledCells: Array<{ x: number, y: number, colorIndex: number, index: number }> = [];

        // Only process visible cells
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const i = row * project.width + col;
            if (i < 0 || i >= grid.length) continue;

            const cell = grid[i];
            const x = col * cellSize;
            const y = row * cellSize;

            // Check if this is an incorrectly filled cell (needs to show number)
            if (cell.filled && cell.filledColorIndex !== undefined && cell.filledColorIndex !== cell.colorIndex) {
              incorrectFilledCells.push({ x, y, colorIndex: cell.colorIndex, index: i });
              continue;
            }

            // Skip correctly filled cells
            if (cell.filled) continue;

            const isTarget = cell.colorIndex === selectedColorIndex;
            const shouldHighlightCell = isTarget && showHighlight;

            if (shouldHighlightCell) {
              highlightCells.push({ x, y, colorIndex: cell.colorIndex, index: i });
            } else {
              normalCells.push({ x, y, colorIndex: cell.colorIndex, index: i });
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

          for (const { x, y, colorIndex, index } of highlightCells) {
            const textureKey = `${colorIndex + 1}-${isDark ? 'highlightDark' : 'highlightLight'}`;
            const texture = textureMap.get(textureKey);
            if (texture) {
              const sprite = getSprite();
              sprite.texture = texture;
              sprite.position.set(x + cellSize / 2, y + cellSize / 2);
              sprite.visible = true;
              cellIndexToTextSpriteRef.current.set(index, sprite);
            }
          }

          for (const { x, y, colorIndex, index } of normalCells) {
            const textureKey = `${colorIndex + 1}-${isDark ? 'normalDark' : 'normalLight'}`;
            const texture = textureMap.get(textureKey);
            if (texture) {
              const sprite = getSprite();
              sprite.texture = texture;
              sprite.position.set(x + cellSize / 2, y + cellSize / 2);
              sprite.visible = true;
              cellIndexToTextSpriteRef.current.set(index, sprite);
            }
          }

          // Draw numbers for incorrectly filled cells
          for (const { x, y, colorIndex, index } of incorrectFilledCells) {
            const textureKey = `${colorIndex + 1}-${isDark ? 'normalDark' : 'normalLight'}`;
            const texture = textureMap.get(textureKey);
            if (texture) {
              const sprite = getSprite();
              sprite.texture = texture;
              sprite.position.set(x + cellSize / 2, y + cellSize / 2);
              sprite.visible = true;
              cellIndexToTextSpriteRef.current.set(index, sprite);
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
    if (appRef.current) {
      // Destroy old textures
      if (numberTexturesRef.current.size > 0) {
        for (const texture of numberTexturesRef.current.values()) {
          texture.destroy(true);
        }
      }
      numberTexturesRef.current.clear();

      // Clear all text sprites to remove references to destroyed textures
      if (textContainerRef.current) {
        textContainerRef.current.removeChildren();
      }

      // Generate new textures
      generateNumberTextures(appRef.current);
      dirtyFlags.current.text = true;
    }
  }, [theme, generateNumberTextures]);

  // Escape key handler for lightbox
  useEffect(() => {
    if (!showLightbox) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLightbox(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showLightbox]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && appRef.current) {
        // Cache the container rect for handlePointerMove
        containerRectRef.current = containerRef.current.getBoundingClientRect();

        // Use visual viewport if available (accounts for mobile browser UI)
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const { clientWidth, clientHeight } = containerRef.current;

        // Ensure we don't exceed viewport dimensions
        const width = Math.min(clientWidth, viewportWidth);
        const height = Math.min(clientHeight, viewportHeight);

        if (width > 0 && height > 0) {
          containerSizeRef.current = { width, height };
          appRef.current.renderer.resize(width, height);
          dirtyFlags.current.text = true;
        }
      }
    };

    // Update rect on scroll (without resizing canvas)
    const handleScroll = () => {
      if (containerRef.current) {
        containerRectRef.current = containerRef.current.getBoundingClientRect();
      }
    };

    handleResize();
    const timer1 = setTimeout(handleResize, 100);
    const timer2 = setTimeout(handleResize, 500);

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true }); // Add scroll listener
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll); // Cleanup
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
      resizeObserver.disconnect();
    };
  }, []);

  // Initialize completed and hidden colors on mount (for saved projects)
  useEffect(() => {
    const initialCompleted = new Set<number>();
    const initialHidden = new Set<number>();

    for (let idx = 0; idx < project.palette.length; idx++) {
      const totalForColor = grid.filter(c => c.colorIndex === idx).length;
      const correctlyFilledForColor = grid.filter(c => c.colorIndex === idx && c.filledColorIndex === idx).length;
      if (totalForColor > 0 && correctlyFilledForColor === totalForColor) {
        initialCompleted.add(idx);
        initialHidden.add(idx);
      }
    }

    setCompletedColors(initialCompleted);
    setHiddenColors(initialHidden);
  }, []); // Only run on mount

  // Trigger burst confetti animation for color completion
  const triggerColorCompletionAnimation = useCallback((colorIndex: number, colorHex: string) => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;

    // Find the color button element
    const colorButton = paletteContainer.querySelector(`[data-color-index="${colorIndex}"]`) as HTMLElement;
    if (!colorButton) return;

    // Get button position relative to viewport
    const rect = colorButton.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Convert to normalized coordinates (0-1) for canvas-confetti
    const originX = centerX / window.innerWidth;
    const originY = centerY / window.innerHeight;

    // Burst confetti animation
    confetti({
      particleCount: 75,
      spread: 70,
      origin: { x: originX, y: originY },
      startVelocity: 35,
      colors: [colorHex],
      ticks: 100,
      gravity: 0.8,
      decay: 0.92,
      zIndex: 9999,
    });
  }, []);

  // Calculate completion (debounced and optimized with single-pass calculation)
  useEffect(() => {
    // Clear any pending timeout
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }

    // Debounce completion calculation to avoid running on every grid change
    completionTimeoutRef.current = setTimeout(() => {
      // Single-pass calculation instead of multiple filters
      const stats = {
        total: grid.length,
        correctlyFilled: 0,
        byColor: new Map<number, { total: number, filled: number }>()
      };

      // Single pass through grid to calculate all stats
      grid.forEach(cell => {
        if (cell.filledColorIndex === cell.colorIndex) {
          stats.correctlyFilled++;
        }

        const colorStats = stats.byColor.get(cell.colorIndex) || { total: 0, filled: 0 };
        colorStats.total++;
        if (cell.filledColorIndex === cell.colorIndex) {
          colorStats.filled++;
        }
        stats.byColor.set(cell.colorIndex, colorStats);
      });

      // Calculate overall completion percent
      const percent = Math.round((stats.correctlyFilled / stats.total) * 100);
      setCompletedPercent(percent);

      // Check individual color completion using pre-calculated stats
      const newCompletedColors = new Set<number>();
      for (let idx = 0; idx < project.palette.length; idx++) {
        const colorStats = stats.byColor.get(idx);
        if (colorStats && colorStats.total > 0 && colorStats.filled === colorStats.total) {
          newCompletedColors.add(idx);
        }
      }

      // Detect newly completed colors and trigger animation
      setCompletedColors(prevCompleted => {
        const newlyCompleted = new Set<number>();
        newCompletedColors.forEach(colorIdx => {
          if (!prevCompleted.has(colorIdx)) {
            newlyCompleted.add(colorIdx);
          }
        });

        // Trigger animation for newly completed colors
        if (newlyCompleted.size > 0) {
          newlyCompleted.forEach(colorIdx => {
            triggerColorCompletionAnimation(colorIdx, project.palette[colorIdx]);
          });
          // Hide newly completed colors
          setHiddenColors(prevHidden => {
            const newHidden = new Set(prevHidden);
            newlyCompleted.forEach(colorIdx => newHidden.add(colorIdx));
            return newHidden;
          });
        }

        return newCompletedColors;
      });

      // Check if puzzle is completed (100% correctly filled)
      const isCompleted = stats.correctlyFilled === stats.total && stats.total > 0;
      const wasCompleted = project.completed === true;

      // Trigger confetti when completion reaches 100% for the first time
      let confettiInterval: NodeJS.Timeout | null = null;
      if (isCompleted && !wasCompleted) {
        // Show completion message
        setShowCompletionMessage(true);
        
        // Create confetti animation that rains from top to bottom
        const duration = 3000; // 3 seconds
        const animationEnd = Date.now() + duration;
        const defaults = {
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          zIndex: 9999,
          gravity: 1,
          decay: 0.9
        };

        function randomInRange(min: number, max: number) {
          return Math.random() * (max - min) + min;
        }

        // Confetti from multiple positions at the top of the screen
        confettiInterval = setInterval(function () {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            if (confettiInterval) clearInterval(confettiInterval);
            return;
          }

          const particleCount = 50 * (timeLeft / duration);

          // Confetti raining from top (y: 0 means top of screen)
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: 0 }
          });
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.4, 0.6), y: 0 }
          });
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: 0 }
          });
        }, 250);

        // Hide completion message 1 second after confetti ends
        setTimeout(() => {
          setShowCompletionMessage(false);
        }, duration + 1000); // 4 seconds total (3s confetti + 1s fade)
      }

      const timer = setTimeout(() => {
        saveProject({ ...project, grid, pixelSize: BASE_CELL_SIZE, completed: isCompleted });
      }, 1000);

      // Note: confettiInterval will naturally complete after 3 seconds, so no explicit cleanup needed
      // The timer will be cleaned up if the effect re-runs before it completes
    }, 300); // Debounce 300ms after last grid change

    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, [grid, project, triggerColorCompletionAnimation]);

  // Palette scroll handlers
  const checkPaletteScroll = useCallback(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;

    const { scrollLeft, scrollWidth, clientWidth } = paletteContainer;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Handle selected color being hidden - switch to next available color
  useEffect(() => {
    if (hiddenColors.has(selectedColorIndex)) {
      // Find next available color after current index (or wrap around)
      let nextAvailableColor = -1;

      // Try to find next available color after current index
      for (let i = selectedColorIndex + 1; i < project.palette.length; i++) {
        if (!hiddenColors.has(i)) {
          nextAvailableColor = i;
          break;
        }
      }

      // If not found, wrap around and search from start
      if (nextAvailableColor === -1) {
        for (let i = 0; i < selectedColorIndex; i++) {
          if (!hiddenColors.has(i)) {
            nextAvailableColor = i;
            break;
          }
        }
      }

      if (nextAvailableColor !== -1) {
        // Mark as programmatic change to prevent scrolling
        isProgrammaticColorChangeRef.current = true;
        setSelectedColorIndex(nextAvailableColor);
      }
    }
  }, [hiddenColors, selectedColorIndex, project.palette]);

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
  }, [checkPaletteScroll, project.palette.length, hiddenColors]);

  useEffect(() => {
    const paletteContainer = paletteScrollRef.current;
    if (!paletteContainer) return;

    // Skip scrolling if this is a programmatic change (due to color being hidden)
    if (isProgrammaticColorChangeRef.current) {
      isProgrammaticColorChangeRef.current = false;
      return;
    }

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

    // FAST PATH: Use cached rect
    let rect = containerRectRef.current;
    if (!rect) {
      rect = container.getBoundingClientRect();
      containerRectRef.current = rect;
    }

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
  const immediatelyDrawFilledCell = useCallback((col: number, row: number, appliedColorIndex: number, isCorrect: boolean) => {
    const filledGraphics = filledGraphicsRef.current;
    const incorrectFilledGraphics = incorrectFilledGraphicsRef.current;
    if (!filledGraphics || !incorrectFilledGraphics) return;

    const x = col * BASE_CELL_SIZE;
    const y = row * BASE_CELL_SIZE;
    const colorHex = parseInt(project.palette[appliedColorIndex].replace('#', ''), 16);

    if (isCorrect) {
      // Draw solid fill for correct color
      filledGraphics.rect(x, y, BASE_CELL_SIZE, BASE_CELL_SIZE);
      filledGraphics.fill(colorHex);
    } else {
      // Draw transparent fill for incorrect color
      incorrectFilledGraphics.rect(x, y, BASE_CELL_SIZE, BASE_CELL_SIZE);
      incorrectFilledGraphics.fill({ color: colorHex, alpha: 0.3 });
    }
  }, [project.palette]);

  // Helper to fill a single cell with the selected color
  const fillCellAtIndex = useCallback((index: number, col: number, row: number): boolean => {
    const cell = gridRef.current[index];
    const selectedColor = selectedColorIndexRef.current;

    // If cell already has the same color applied, do nothing
    if (cell.filledColorIndex === selectedColor) {
      return false;
    }

    // If cell is already correctly filled, don't allow overwriting
    if (cell.filled && cell.filledColorIndex === cell.colorIndex) {
      return false;
    }

    const isCorrect = cell.colorIndex === selectedColor;

    // Immediately draw the filled cell for instant visual feedback
    immediatelyDrawFilledCell(col, row, selectedColor, isCorrect);

    // FAST PATH: Handle text visibility immediately
    const textSprite = cellIndexToTextSpriteRef.current.get(index);
    if (textSprite) {
      // If fill is correct, hide the number.
      // If fill is INCORRECT, ensure the number is VISIBLE (hint stays).
      textSprite.visible = !isCorrect;
    }

    // If we are painting (dragging), we batch updates in handlePointerUp.
    // So don't trigger React state update (and subsequent heavy re-renders) here.
    if (isPaintingRef.current) {
      return true;
    }

    // Mark as dirty to update display (for Taps)
    dirtyFlags.current.highlight = true;
    dirtyFlags.current.text = true;
    if (cell.filled) dirtyFlags.current.filled = true;

    // Update React state (for persistence and completion tracking)
    setGrid(prev => {
      const newGrid = [...prev];
      newGrid[index] = {
        ...cell,
        filled: true,
        filledColorIndex: selectedColor
      };
      return newGrid;
    });

    return true;
  }, [immediatelyDrawFilledCell]);

  // Helper to fill cells in a brush area
  // brushSize 1 = 1x1, brushSize 2 = 2x2, brushSize 3 = 3x3
  // For odd sizes: centered on clicked cell
  // For even sizes: starts from clicked cell (top-left of brush area)
  const fillCellsWithBrush = useCallback((centerCol: number, centerRow: number): Set<number> => {
    const brushSize = brushSizeRef.current;
    const selectedColor = selectedColorIndexRef.current;
    const filledIndices = new Set<number>();

    // Calculate brush area bounds
    const offset = brushSize % 2 === 0 ? 0 : Math.floor(brushSize / 2);
    const startCol = Math.max(0, centerCol - offset);
    const endCol = Math.min(project.width - 1, startCol + brushSize - 1);
    const startRow = Math.max(0, centerRow - offset);
    const endRow = Math.min(project.height - 1, startRow + brushSize - 1);

    // Fill all cells in the brush area
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * project.width + col;
        const cell = gridRef.current[index];

        // Skip if cell already has the same color applied
        if (cell.filledColorIndex === selectedColor) {
          continue;
        }

        // Skip if cell is already correctly filled (don't allow overwriting)
        if (cell.filled && cell.filledColorIndex === cell.colorIndex) {
          continue;
        }

        const isCorrect = cell.colorIndex === selectedColor;

        // Immediately draw the filled cell for instant visual feedback
        immediatelyDrawFilledCell(col, row, selectedColor, isCorrect);

        // Handle text visibility immediately
        const textSprite = cellIndexToTextSpriteRef.current.get(index);
        if (textSprite) {
          textSprite.visible = !isCorrect;
        }

        filledIndices.add(index);
      }
    }

    return filledIndices;
  }, [immediatelyDrawFilledCell, project.width, project.height]);

  // Handle tap/click - allows filling any cell (with brush size)
  const handleTap = useCallback((clientX: number, clientY: number) => {
    const result = screenToGrid(clientX, clientY);
    if (result) {
      const brushSize = brushSizeRef.current;
      if (brushSize === 1) {
        // Single cell fill
        fillCellAtIndex(result.index, result.col, result.row);
      } else {
        // Multi-cell brush fill
        const filledIndices = fillCellsWithBrush(result.col, result.row);
        if (filledIndices.size > 0) {
          setGrid(prev => {
            const newGrid = [...prev];
            const selectedColor = selectedColorIndexRef.current;
            filledIndices.forEach(index => {
              const cell = newGrid[index];
              if (!cell.filled || cell.filledColorIndex !== cell.colorIndex) {
                newGrid[index] = {
                  ...cell,
                  filled: true,
                  filledColorIndex: selectedColor
                };
              }
            });
            return newGrid;
          });
          dirtyFlags.current.highlight = true;
          dirtyFlags.current.text = true;
          dirtyFlags.current.filled = true;
        }
      }
    }
  }, [screenToGrid, fillCellAtIndex, fillCellsWithBrush]);

  // Check if a cell is a valid paint starting cell (unfilled and matches selected color)
  const isValidPaintStartCell = useCallback((index: number): boolean => {
    const cell = gridRef.current[index];
    return !cell.filled && cell.colorIndex === selectedColorIndexRef.current;
  }, []);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    evCache.current.push(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;

    // Reset mode flags
    isPaintingRef.current = false;
    isPanningRef.current = false;
    paintedCellsInStrokeRef.current.clear();

    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (evCache.current.length === 1) {
      totalDragDistance.current = 0;

      // Check if we're starting on a valid paint cell
      const result = screenToGrid(e.clientX, e.clientY);
      if (result && isValidPaintStartCell(result.index)) {
        // Enter paint mode and fill the starting cell(s) with brush size
        isPaintingRef.current = true;
        const brushSize = brushSizeRef.current;
        
        if (brushSize === 1) {
          // Single cell fill
          paintedCellsInStrokeRef.current.add(result.index);
          fillCellAtIndex(result.index, result.col, result.row);
        } else {
          // Multi-cell brush fill
          const filledIndices = fillCellsWithBrush(result.col, result.row);
          filledIndices.forEach(index => {
            paintedCellsInStrokeRef.current.add(index);
          });
        }

        if (pixiContainerRef.current) {
          pixiContainerRef.current.style.cursor = 'crosshair';
        }
      } else {
        // Enter pan mode
        isPanningRef.current = true;

        if (pixiContainerRef.current) {
          pixiContainerRef.current.style.cursor = 'move';
        }
      }
    }

    // Reset cursor state
    isOverHighlightedTileRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const index = evCache.current.findIndex(ev => ev.pointerId === e.pointerId);
    if (index > -1) {
      evCache.current[index] = e;
    }

    // Pinch zoom (two fingers)
    if (evCache.current.length === 2) {
      // Cancel paint mode when second finger added
      isPaintingRef.current = false;
      isPanningRef.current = false;

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
    // Single pointer drag
    else if (evCache.current.length === 1 && isDraggingRef.current) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;

      // Paint mode - fill cells under pointer (with brush size)
      if (isPaintingRef.current) {
        const result = screenToGrid(e.clientX, e.clientY);
        if (result) {
          const brushSize = brushSizeRef.current;
          if (brushSize === 1) {
            // Single cell fill
            if (!paintedCellsInStrokeRef.current.has(result.index)) {
              paintedCellsInStrokeRef.current.add(result.index);
              fillCellAtIndex(result.index, result.col, result.row);
            }
          } else {
            // Multi-cell brush fill - add all cells in brush area
            const filledIndices = fillCellsWithBrush(result.col, result.row);
            filledIndices.forEach(index => {
              if (!paintedCellsInStrokeRef.current.has(index)) {
                paintedCellsInStrokeRef.current.add(index);
              }
            });
          }
        }
        totalDragDistance.current += Math.abs(dx) + Math.abs(dy);
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
      }
      // Pan mode - move canvas
      else if (isPanningRef.current) {
        panRef.current = {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy
        };

        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        totalDragDistance.current += Math.abs(dx) + Math.abs(dy);

        dirtyFlags.current.text = true;
      }
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

      // Apply all batched paint updates after stroke ends
      if (isPaintingRef.current && paintedCellsInStrokeRef.current.size > 0) {
        // Capture data synchronously to prevent issues with ref clearing
        const cellsToUpdate = new Set(paintedCellsInStrokeRef.current);
        const colorToFill = selectedColorIndexRef.current;

        setGrid(prev => {
          const newGrid = [...prev];
          cellsToUpdate.forEach(index => {
            const cell = newGrid[index];
            // Only fill if not already correctly filled
            if (!cell.filled || cell.filledColorIndex !== cell.colorIndex) {
              newGrid[index] = {
                ...cell,
                filled: true,
                filledColorIndex: colorToFill
              };
            }
          });
          return newGrid;
        });
        dirtyFlags.current.filled = true; // Force redraw of filled graphics for consistency
        dirtyFlags.current.highlight = true;
        dirtyFlags.current.text = true;
      }

      // Handle tap: only when in pan mode (didn't start on correct cell) and minimal drag
      // Paint mode already fills on pointer down, so no tap needed there
      if (isPanningRef.current && totalDragDistance.current < 15) {
        handleTap(e.clientX, e.clientY);
      }

      // Reset mode flags
      isPaintingRef.current = false;
      isPanningRef.current = false;
      paintedCellsInStrokeRef.current.clear();

      // Reset cursor
      if (pixiContainerRef.current) {
        pixiContainerRef.current.style.cursor = 'move';
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
    const total = grid.filter(c => c.colorIndex === idx).length;
    // Only count correctly filled cells (where filledColorIndex matches colorIndex)
    const correctlyFilled = grid.filter(c => c.colorIndex === idx && c.filledColorIndex === idx).length;
    return total === 0 ? 100 : Math.round((correctlyFilled / total) * 100);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 relative overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <button onClick={onExit} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex flex-col items-center">
          <h1 className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base">Pixel Art</h1>
          <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">{completedPercent}% Complete</div>
        </div>
        <div className="w-32 flex justify-end gap-2">
          <button
            onClick={() => setShowInstructions(true)}
            className="p-2 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400"
            title="Show instructions"
            aria-label="Show instructions"
          >
            <HelpCircle size={20} />
          </button>
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
        className="flex-1 overflow-hidden relative touch-none bg-slate-100 dark:bg-slate-900 min-h-0"
        style={{ maxHeight: '100%' }}
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

        {/* Completion Message Overlay */}
        {showCompletionMessage && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="animate-fadeInScale">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 dark:from-indigo-500 dark:to-purple-500 text-white px-8 py-6 rounded-2xl shadow-2xl border-2 border-white/20 backdrop-blur-sm">
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-2 drop-shadow-lg">
                  Bazinga!
                </h2>
                <p className="text-lg md:text-xl text-center text-white/95 drop-shadow-md">
                  You completed this image
                </p>
              </div>
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

        {/* Image Preview Controls */}
        <div className="absolute top-4 left-4 flex flex-col gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-1 z-10">
          <div className="px-2 py-1 flex items-center justify-center border-b border-slate-200 dark:border-slate-700 relative">
            <Image size={16} className="text-slate-500 dark:text-slate-400" />
            {showPreview && (
              <button
                onClick={() => setShowPreview(false)}
                className="absolute right-1 p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title="Collapse preview"
                aria-label="Collapse preview"
              >
                <X size={12} className="text-slate-500 dark:text-slate-400" />
              </button>
            )}
          </div>
          {showPreview ? (
            <button
              onClick={() => setShowLightbox(true)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors group relative"
              title="Click to view full image"
            >
              <div className="w-24 h-24 rounded overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 shadow-sm group-hover:border-indigo-400 dark:group-hover:border-indigo-500 transition-colors">
                <img
                  src={project.originalImage}
                  alt="Preview"
                  className="w-full h-full object-cover cursor-pointer"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-black/20 rounded transition-colors pointer-events-none">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 rounded-full p-2 shadow-lg">
                  <Image size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={() => setShowPreview(true)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors relative group"
              title="Show preview"
            >
              <div className="w-8 h-8 rounded overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 shadow-sm">
                <img
                  src={project.originalImage}
                  alt="Preview thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                <Image size={12} className="text-white drop-shadow-md" />
              </div>
            </button>
          )}
        </div>

        {/* Floating Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-1 z-10">
          <div className="px-2 py-1 flex items-center justify-center border-b border-slate-200 dark:border-slate-700">
            <Search size={16} className="text-slate-500 dark:text-slate-400" />
          </div>
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

        {/* Brush Size Controls */}
        <div className="absolute top-4 right-4 mt-44 flex flex-col gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-1 z-10">
          <div className="px-2 py-1 flex items-center justify-center border-b border-slate-200 dark:border-slate-700">
            <Paintbrush size={16} className="text-slate-500 dark:text-slate-400" />
          </div>
          <button
            onClick={() => setBrushSize(1)}
            className={`p-2 flex items-center justify-center rounded transition-colors ${
              brushSize === 1
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="1 pixel brush"
          >
            <Square size={12} fill="currentColor" />
          </button>
          <button
            onClick={() => setBrushSize(2)}
            className={`p-2 flex items-center justify-center rounded transition-colors ${
              brushSize === 2
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="4 pixels brush (2x2)"
          >
            <div className="grid grid-cols-2 gap-0.5">
              <Square size={6} fill="currentColor" />
              <Square size={6} fill="currentColor" />
              <Square size={6} fill="currentColor" />
              <Square size={6} fill="currentColor" />
            </div>
          </button>
          <button
            onClick={() => setBrushSize(3)}
            className={`p-2 flex items-center justify-center rounded transition-colors ${
              brushSize === 3
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="9 pixels brush (3x3)"
          >
            <div className="grid grid-cols-3 gap-0.5">
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
              <Square size={5} fill="currentColor" />
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Palette */}
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] z-20">
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
            {project.palette
              .map((color, idx) => ({ color, idx }))
              .filter(({ idx }) => !hiddenColors.has(idx))
              .map(({ color, idx }) => {
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

                    <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
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

      {/* Instructions Modal */}
      <InstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      {/* Lightbox Viewer */}
      <Lightbox
        open={showLightbox}
        close={() => setShowLightbox(false)}
        slides={[{ src: project.originalImage }]}
        plugins={[Zoom]}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
        }}
        zoom={{
          maxZoomPixelRatio: 5,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true,
        }}
      />
    </div>
  );
};

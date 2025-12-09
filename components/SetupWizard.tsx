import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Grid3X3, Wand2, Loader2, Palette, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { processImage } from '../services/imageEngine';
import { ProjectData } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface SetupWizardProps {
  imageFile: File;
  onBack: () => void;
  onComplete: (project: ProjectData) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ imageFile, onBack, onComplete }) => {
  const { theme } = useTheme();
  const [density, setDensity] = useState(150); // Default higher for better recognition
  const [maxColors, setMaxColors] = useState(32); // Default palette size
  const [loading, setLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [previewProject, setPreviewProject] = useState<ProjectData | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Initial file load
    const reader = new FileReader();
    reader.onload = (e) => {
      setDataUrl(e.target?.result as string);
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    if (!dataUrl) return;
    
    // Debounce the processing so slider is smooth
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await processImage(dataUrl, density, maxColors);
        setPreviewProject(result);
      } catch (e) {
        console.error('Image processing failed:', e);
        setError(e instanceof Error ? e.message : 'Failed to process image. Please try a smaller image or different settings.');
        setPreviewProject(null);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [dataUrl, density, maxColors]);

  // Render preview to canvas when project updates
  useEffect(() => {
    if (previewProject && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const { width, height, palette, grid } = previewProject;
      // We render the preview at a larger scale per cell for better visibility
      // Calculate scale to make preview recognizable while maintaining pixel art feel
      const targetDisplaySize = 600; // Target max dimension for display
      const maxDimension = Math.max(width, height);
      const scale = Math.max(3, Math.floor(targetDisplaySize / maxDimension));
      
      canvasRef.current.width = width * scale;
      canvasRef.current.height = height * scale;
      
      // Enable smoothing for better visual quality in preview
      ctx.imageSmoothingEnabled = false; // Keep pixelated look
      ctx.imageSmoothingQuality = 'low';

      // Set background based on theme
      ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff'; // Slate-800 : White
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      grid.forEach((cell, i) => {
         const col = i % width;
         const row = Math.floor(i / width);
         ctx.fillStyle = palette[cell.colorIndex];
         ctx.fillRect(col * scale, row * scale, scale, scale);
      });
    }
  }, [previewProject, theme]);

  const handleStart = () => {
    if (previewProject) {
      setIsStarting(true);
      // Small delay to allow spinner to render before heavy sync ops
      setTimeout(() => {
        onComplete(previewProject);
      }, 50);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 max-w-5xl mx-auto p-4 md:p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-600 dark:text-slate-300">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Customize Puzzle</h2>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 md:overflow-hidden md:min-h-0">
        {/* Preview Area */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center p-4 relative shadow-inner min-h-[300px] md:min-h-0">
           {loading && (
             <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
             </div>
           )}
           
           {error ? (
             <div className="flex flex-col items-center gap-3 text-center px-4">
               <AlertCircle size={48} className="text-red-500" />
               <div className="text-red-600 dark:text-red-400 font-medium">Processing Failed</div>
               <div className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{error}</div>
               <button 
                 onClick={onBack}
                 className="mt-2 px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
               >
                 Try Another Image
               </button>
             </div>
           ) : previewProject ? (
              <canvas 
                ref={canvasRef}
                className="max-w-full max-h-full object-contain shadow-lg bg-white dark:bg-slate-800"
                style={{
                  aspectRatio: `${previewProject.width} / ${previewProject.height}`
                }}
              />
           ) : (
             <div className="text-slate-400 dark:text-slate-500">Processing image...</div>
           )}
        </div>

        {/* Controls */}
        <div className="md:w-80 flex flex-col gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0 md:overflow-y-auto">
          {/* Grid Density */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              <Grid3X3 size={18} />
              Detail Level
            </label>
            <input 
              type="range" 
              min="50" 
              max="300" 
              step="5"
              value={density} 
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
              <span>Blocky</span>
              <span>Detailed</span>
            </div>
          </div>

          {/* Palette Size */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              <Palette size={18} />
              Palette Size
            </label>
            <input 
              type="range" 
              min="2" 
              max="200" 
              step="1"
              value={maxColors} 
              onChange={(e) => setMaxColors(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
              <span>Simpler</span>
              <span>More Colors</span>
            </div>
            <div className="text-center text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-1">
              {maxColors} Colors
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-700">
             <div className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
               <span className="text-slate-500 dark:text-slate-400">Grid Size</span>
               <span className="font-medium dark:text-slate-300">{previewProject ? `${previewProject.width} x ${previewProject.height}` : '-'}</span>
             </div>
             <div className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
               <span className="text-slate-500 dark:text-slate-400">Colors Found</span>
               <span className="font-medium dark:text-slate-300">{previewProject ? previewProject.palette.length : '-'}</span>
             </div>
          </div>
          
          <div className="md:mt-auto pt-4 pb-2 md:pb-0">
             <Button 
               fullWidth 
               size="lg" 
               onClick={handleStart} 
               disabled={!previewProject || loading || isStarting}
               className="flex items-center justify-center gap-2 shadow-lg"
             >
               {isStarting ? (
                 <>
                   <Loader2 className="animate-spin" size={18} />
                   Starting...
                 </>
               ) : (
                 <>
                   <Wand2 size={18} />
                   Start Coloring
                 </>
               )}
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
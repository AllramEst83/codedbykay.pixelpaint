import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Grid3X3, Wand2, Loader2, Palette } from 'lucide-react';
import { Button } from './Button';
import { processImage } from '../services/imageEngine';
import { ProjectData } from '../types';

interface SetupWizardProps {
  imageFile: File;
  onBack: () => void;
  onComplete: (project: ProjectData) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ imageFile, onBack, onComplete }) => {
  const [density, setDensity] = useState(80); // Default higher for better quality
  const [maxColors, setMaxColors] = useState(32); // Default palette size
  const [loading, setLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [previewProject, setPreviewProject] = useState<ProjectData | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
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
      try {
        const result = await processImage(dataUrl, density, maxColors);
        setPreviewProject(result);
      } catch (e) {
        console.error(e);
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
      // We render the preview at a fixed scale per cell for sharpness, 
      // but CSS handles the actual display size/aspect ratio.
      const scale = 5; 
      canvasRef.current.width = width * scale;
      canvasRef.current.height = height * scale;

      grid.forEach((cell, i) => {
         const col = i % width;
         const row = Math.floor(i / width);
         ctx.fillStyle = palette[cell.colorIndex];
         ctx.fillRect(col * scale, row * scale, scale, scale);
      });
    }
  }, [previewProject]);

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
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-slate-800">Customize Puzzle</h2>
        <div className="w-10" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 pb-6">
        {/* Preview Area */}
        <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center p-4 relative shadow-inner min-h-[400px]">
           {loading && (
             <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
             </div>
           )}
           
           {previewProject ? (
              <canvas 
                ref={canvasRef}
                className="max-w-full max-h-[70vh] object-contain shadow-lg bg-white"
                style={{
                  aspectRatio: `${previewProject.width} / ${previewProject.height}`
                }}
              />
           ) : (
             <div className="text-slate-400">Processing image...</div>
           )}
        </div>

        {/* Controls */}
        <div className="md:w-80 flex flex-col bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          {/* Grid Density */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
              <Grid3X3 size={18} />
              Detail Level
            </label>
            <input 
              type="range" 
              min="32" 
              max="150" 
              step="2"
              value={density} 
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>Blocky</span>
              <span>Detailed</span>
            </div>
          </div>

          {/* Palette Size */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
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
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>Simpler</span>
              <span>More Colors</span>
            </div>
            <div className="text-center text-sm font-medium text-indigo-600 mt-1">
              {maxColors} Colors
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100 mb-6">
             <div className="flex justify-between text-sm py-2 border-b border-slate-100">
               <span className="text-slate-500">Grid Size</span>
               <span className="font-medium">{previewProject ? `${previewProject.width} x ${previewProject.height}` : '-'}</span>
             </div>
             <div className="flex justify-between text-sm py-2 border-b border-slate-100">
               <span className="text-slate-500">Colors Found</span>
               <span className="font-medium">{previewProject ? previewProject.palette.length : '-'}</span>
             </div>
          </div>
          
          <div className="pt-4 border-t border-slate-200">
             <Button 
               fullWidth 
               size="lg" 
               onClick={handleStart} 
               disabled={!previewProject || loading || isStarting}
               className="flex items-center justify-center gap-2"
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
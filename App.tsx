import React, { useState, useEffect } from 'react';
import { Palette, Trash2, ArrowRight, Moon, Sun, CheckCircle2 } from 'lucide-react';
import { AppView, ProjectData } from './types';
import { ImageUploader } from './components/ImageUploader';
import { SetupWizard } from './components/SetupWizard';
import { Workspace } from './components/Workspace';
import { Button } from './components/Button';
import { getProjects, saveProject, deleteProject } from './services/storage';
import { useTheme } from './contexts/ThemeContext';

// Get app version from Vite build
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0';

function App() {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<AppView>('HOME');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([]);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);

  useEffect(() => {
    if (view === 'HOME') {
      setSavedProjects(getProjects());
    }
  }, [view]);

  // Handler: User selects an image
  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    setView('SETUP');
    setAutoOpenPicker(false); // Reset the flag when a file is selected
  };

  // Handler: Setup complete, start workspace
  const handleSetupComplete = (project: ProjectData) => {
    saveProject(project);
    setCurrentProject(project);
    setView('WORKSPACE');
  };

  // Handler: Load existing project
  const handleLoadProject = (project: ProjectData) => {
    setCurrentProject(project);
    setView('WORKSPACE');
  };

  // Handler: Delete project
  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this puzzle?")) {
      deleteProject(id);
      setSavedProjects(prev => prev.filter(p => p.id !== id));
    }
  };

  // View Routing
  if (view === 'WORKSPACE' && currentProject) {
    return (
      <Workspace 
        project={currentProject} 
        onExit={() => {
          setView('HOME');
          setCurrentProject(null);
        }} 
      />
    );
  }

  if (view === 'SETUP' && selectedFile) {
    return (
      <SetupWizard 
        imageFile={selectedFile} 
        onBack={() => {
          setSelectedFile(null);
          setAutoOpenPicker(true);
          setView('HOME');
        }} 
        onComplete={handleSetupComplete}
      />
    );
  }

  // Home View
  return (
    <div className="h-full w-full bg-slate-50 dark:bg-slate-900 p-4 md:p-8 flex flex-col items-center overflow-y-auto">
      <div className="max-w-3xl w-full space-y-8">
        
        {/* Theme Toggle */}
        <div className="flex justify-end">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        
        {/* Header */}
        <div className="text-center space-y-2 py-8">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600 dark:bg-indigo-500 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 mb-4">
             <Palette className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            PixelPaint
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
            v{APP_VERSION}
          </p>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
            Turn your favorite memories into relaxing color-by-number pixel art puzzles.
          </p>
        </div>

        {/* Action Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-1">
             <ImageUploader 
               onImageSelected={handleImageSelected} 
               autoOpen={autoOpenPicker}
               onAutoOpenAttempted={() => setAutoOpenPicker(false)}
             />
          </div>
        </div>

        {/* Recent Projects */}
        {savedProjects.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 px-1">Your Works in Progress</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {savedProjects.map(project => {
                const percent = Math.round((project.grid.filter(c => c.filled).length / project.grid.length) * 100);
                const isCompleted = project.completed === true || percent === 100;
                
                return (
                  <div 
                    key={project.id}
                    onClick={() => handleLoadProject(project)}
                    className={`group relative bg-white dark:bg-slate-800 rounded-xl border p-4 flex gap-4 cursor-pointer hover:shadow-md transition-all ${
                      isCompleted 
                        ? 'border-green-300 dark:border-green-700 hover:border-green-400 dark:hover:border-green-600' 
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-20 h-20 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden relative">
                       <img 
                         src={project.originalImage} 
                         className={`w-full h-full object-cover ${isCompleted ? 'opacity-60' : 'opacity-80'}`}
                         alt="Thumbnail"
                       />
                       <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                         {isCompleted ? (
                           <CheckCircle2 className="text-green-500 dark:text-green-400 w-8 h-8 drop-shadow-lg" strokeWidth={2.5} />
                         ) : (
                           <span className="text-xs font-bold text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                             {percent}%
                           </span>
                         )}
                       </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {new Date(project.createdAt).toLocaleDateString()}
                        </h3>
                        {isCompleted && (
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            Done
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {project.width} x {project.height} Grid
                      </p>
                      <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${isCompleted ? 'bg-green-500 dark:bg-green-600' : 'bg-green-500 dark:bg-green-600'}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    {/* Delete */}
                    <button 
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="absolute top-2 right-2 p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                    
                    <div className="absolute bottom-4 right-4 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight size={20} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-8">
           Images are processed locally and saved to your browser.
        </div>

      </div>
    </div>
  );
}

export default App;

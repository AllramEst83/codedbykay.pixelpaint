import React, { useState, useEffect } from 'react';
import { Palette, Trash2, ArrowRight } from 'lucide-react';
import { AppView, ProjectData } from './types';
import { ImageUploader } from './components/ImageUploader';
import { SetupWizard } from './components/SetupWizard';
import { Workspace } from './components/Workspace';
import { Button } from './components/Button';
import { getProjects, saveProject, deleteProject } from './services/storage';

function App() {
  const [view, setView] = useState<AppView>('HOME');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([]);

  useEffect(() => {
    if (view === 'HOME') {
      setSavedProjects(getProjects());
    }
  }, [view]);

  // Handler: User selects an image
  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    setView('SETUP');
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
        onBack={() => setView('HOME')} 
        onComplete={handleSetupComplete}
      />
    );
  }

  // Home View
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-3xl w-full space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2 py-8">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 mb-4">
             <Palette className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            PixelPaint
          </h1>
          <p className="text-lg text-slate-600 max-w-lg mx-auto">
            Turn your favorite memories into relaxing color-by-number pixel art puzzles.
          </p>
        </div>

        {/* Action Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-1">
             <ImageUploader onImageSelected={handleImageSelected} />
          </div>
        </div>

        {/* Recent Projects */}
        {savedProjects.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-800 px-1">Your Works in Progress</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {savedProjects.map(project => {
                const percent = Math.round((project.grid.filter(c => c.filled).length / project.grid.length) * 100);
                
                return (
                  <div 
                    key={project.id}
                    onClick={() => handleLoadProject(project)}
                    className="group relative bg-white rounded-xl border border-slate-200 p-4 flex gap-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="w-20 h-20 shrink-0 bg-slate-100 rounded-lg overflow-hidden relative">
                       <img 
                         src={project.originalImage} 
                         className="w-full h-full object-cover opacity-80" 
                         alt="Thumbnail"
                       />
                       <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                         <span className="text-xs font-bold text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                           {percent}%
                         </span>
                       </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-center">
                      <h3 className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {project.width} x {project.height} Grid
                      </p>
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-green-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    {/* Delete */}
                    <button 
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                    
                    <div className="absolute bottom-4 right-4 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight size={20} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className="text-center text-slate-400 text-sm py-8">
           Images are processed locally and saved to your browser.
        </div>

      </div>
    </div>
  );
}

export default App;

import React, { useRef, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelected: (file: File) => void;
  autoOpen?: boolean;
  onAutoOpenAttempted?: () => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, autoOpen = false, onAutoOpenAttempted }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoOpened = useRef(false);

  useEffect(() => {
    if (autoOpen && inputRef.current && !hasAutoOpened.current) {
      hasAutoOpened.current = true;
      
      // Small delay to ensure component is fully mounted
      setTimeout(() => {
        inputRef.current?.click();
        
        // Wait for dialog to close (when window regains focus)
        const handleFocus = () => {
          // Small delay to allow onChange to fire first if file was selected
          setTimeout(() => {
            onAutoOpenAttempted?.();
            hasAutoOpened.current = false; // Reset for next time
          }, 100);
          window.removeEventListener('focus', handleFocus);
        };
        
        window.addEventListener('focus', handleFocus);
      }, 100);
    }
  }, [autoOpen, onAutoOpenAttempted]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      onImageSelected(file);
    } else {
      alert("Please upload a valid image file.");
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group cursor-pointer
        border-2 border-dashed rounded-xl p-8 md:p-12
        flex flex-col items-center justify-center text-center
        transition-all duration-200 ease-in-out
        ${isDragging 
          ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 scale-[1.02]' 
          : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-700 bg-white dark:bg-slate-800'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      
      <div className={`
        p-4 rounded-full mb-4 transition-colors
        ${isDragging ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}
      `}>
        <Upload size={32} />
      </div>
      
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
        Upload a Photo
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
        Click to browse or drag and drop an image here.
      </p>
    </div>
  );
};

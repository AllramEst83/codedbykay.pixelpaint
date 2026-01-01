import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Crop, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { Button } from './Button';

interface ImageCropperProps {
  imageFile: File;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageFile, onCrop, onCancel }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  // Debug: Log when component mounts
  useEffect(() => {
    console.log('ImageCropper mounted', { imageFile: imageFile?.name });
  }, []);

  // Load image
  useEffect(() => {
    try {
      setError(null);
      const reader = new FileReader();
      reader.onerror = () => {
        setError('Failed to read image file');
      };
      reader.onload = (e) => {
        try {
          const src = e.target?.result as string;
          if (!src) {
            setError('Failed to load image');
            return;
          }
          setImageSrc(src);
          
          // Load image to get dimensions
          const img = new Image();
          img.onerror = () => {
            setError('Failed to load image');
          };
          img.onload = () => {
            if (img.width > 0 && img.height > 0) {
              setImageSize({ width: img.width, height: img.height });
            } else {
              setError('Invalid image dimensions');
            }
          };
          img.src = src;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process image');
        }
      };
      reader.readAsDataURL(imageFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  }, [imageFile]);

  // Initialize crop when both image and container are ready
  useEffect(() => {
    if (imageSize.width > 0 && imageSize.height > 0 && containerSize.width > 0 && containerSize.height > 0 && !initializedRef.current) {
      initializeCrop(imageSize.width, imageSize.height);
      initializedRef.current = true;
    }
  }, [imageSize, containerSize, initializeCrop]);

  // Reset initialization flag when image changes
  useEffect(() => {
    initializedRef.current = false;
  }, [imageFile]);

  // Measure container size
  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    };
    
    // Initial measurement with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateContainerSize, 0);
    
    // Also try after a short delay in case the first attempt is too early
    const timeoutId2 = setTimeout(updateContainerSize, 100);
    
    window.addEventListener('resize', updateContainerSize);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      window.removeEventListener('resize', updateContainerSize);
    };
  }, []);

  const getSquareSize = useCallback((): number => {
    if (containerSize.width === 0 || containerSize.height === 0) return 400;
    return Math.min(containerSize.width - 64, containerSize.height - 200, 600) * 0.8;
  }, [containerSize]);

  const initializeCrop = useCallback((imgWidth: number, imgHeight: number) => {
    const squareSize = getSquareSize();
    if (squareSize === 0) return;
    
    // Calculate initial scale to fit image in square (cover mode)
    const scaleX = squareSize / imgWidth;
    const scaleY = squareSize / imgHeight;
    const initialScale = Math.max(scaleX, scaleY) * 1.1; // Slightly larger to allow cropping
    
    setScale(initialScale);
    setPosition({ x: 0, y: 0 });
  }, [getSquareSize]);

  const updatePosition = (clientX: number, clientY: number) => {
    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;
    
    // Constrain position to keep image within square bounds
    const squareSize = getSquareSize();
    const img = imageRef.current;
    if (!img) return;
    
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    
    const maxX = Math.max(0, (scaledWidth - squareSize) / 2);
    const maxY = Math.max(0, (scaledHeight - squareSize) / 2);
    
    setPosition({
      x: Math.max(-maxX, Math.min(maxX, newX)),
      y: Math.max(-maxY, Math.min(maxY, newY))
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return; // Only handle single touch
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    updatePosition(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(5, scale * delta));
    
    // Constrain position after zoom
    const squareSize = getSquareSize();
    const img = imageRef.current;
    if (!img) return;
    
    const scaledWidth = img.width * newScale;
    const scaledHeight = img.height * newScale;
    
    const maxX = Math.max(0, (scaledWidth - squareSize) / 2);
    const maxY = Math.max(0, (scaledHeight - squareSize) / 2);
    
    setScale(newScale);
    setPosition({
      x: Math.max(-maxX, Math.min(maxX, position.x)),
      y: Math.max(-maxY, Math.min(maxY, position.y))
    });
  };

  const handleZoomIn = () => {
    const newScale = Math.min(5, scale * 1.2);
    setScale(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, scale * 0.8);
    setScale(newScale);
  };

  const handleCrop = () => {
    if (!imageSrc || !canvasRef.current || !imageRef.current || !containerRef.current) return;
    
    const squareSize = getSquareSize();
    const img = imageRef.current;
    const container = containerRef.current;
    
    // Container center
    const containerCenterX = container.clientWidth / 2;
    const containerCenterY = container.clientHeight / 2;
    
    // Square bounds in container coordinates
    const squareLeft = containerCenterX - squareSize / 2;
    const squareTop = containerCenterY - squareSize / 2;
    const squareRight = containerCenterX + squareSize / 2;
    const squareBottom = containerCenterY + squareSize / 2;
    
    // Image position and size in container coordinates
    const imageCenterX = containerCenterX + position.x;
    const imageCenterY = containerCenterY + position.y;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    const imageLeft = imageCenterX - scaledWidth / 2;
    const imageTop = imageCenterY - scaledHeight / 2;
    
    // Calculate intersection of square and image in container coordinates
    const intersectLeft = Math.max(squareLeft, imageLeft);
    const intersectTop = Math.max(squareTop, imageTop);
    const intersectRight = Math.min(squareRight, imageLeft + scaledWidth);
    const intersectBottom = Math.min(squareBottom, imageTop + scaledHeight);
    
    // Convert intersection to image coordinates
    const cropX = (intersectLeft - imageLeft) / scale;
    const cropY = (intersectTop - imageTop) / scale;
    const cropWidth = (intersectRight - intersectLeft) / scale;
    const cropHeight = (intersectBottom - intersectTop) / scale;
    
    // Use the smaller dimension to ensure square
    const cropSize = Math.min(cropWidth, cropHeight);
    
    // Ensure crop area is within image bounds
    const finalCropX = Math.max(0, Math.min(img.width - cropSize, cropX));
    const finalCropY = Math.max(0, Math.min(img.height - cropSize, cropY));
    const finalCropSize = Math.min(cropSize, img.width - finalCropX, img.height - finalCropY);
    
    // Create canvas and draw cropped image
    const canvas = canvasRef.current;
    canvas.width = finalCropSize;
    canvas.height = finalCropSize;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      finalCropX, finalCropY, finalCropSize, finalCropSize,
      0, 0, finalCropSize, finalCropSize
    );
    
    // Convert canvas to blob and create File
    canvas.toBlob((blob) => {
      if (blob) {
        const croppedFile = new File([blob], imageFile.name, { type: imageFile.type || 'image/png' });
        onCrop(croppedFile);
      }
    }, imageFile.type || 'image/png', 0.95);
  };

  const squareSize = getSquareSize();
  const isValidSquareSize = squareSize > 0;

  // Always render the component structure, even if image isn't loaded yet
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc', padding: '1.5rem', overflow: 'hidden' }}>
      {/* Header - always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
        <button 
          onClick={onCancel} 
          style={{ padding: '0.5rem', borderRadius: '9999px', backgroundColor: '#e2e8f0', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={24} />
        </button>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
          Crop Image to Square
        </h2>
        <div style={{ width: '2.5rem' }} /> {/* Spacer for centering */}
      </div>

      {/* Cropper Area */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          position: 'relative', 
          overflow: 'hidden', 
          backgroundColor: '#f1f5f9', 
          borderRadius: '0.75rem', 
          border: '1px solid #e2e8f0', 
          minHeight: '400px',
          cursor: isDragging ? 'grabbing' : 'grab', 
          touchAction: 'none' 
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {imageSrc && imageSize.width > 0 && imageSize.height > 0 && (
          <>
            {/* Image - render first so it's behind overlay */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop preview"
              className="absolute select-none"
              style={{
                width: `${imageSize.width * scale}px`,
                height: `${imageSize.height * scale}px`,
                left: `calc(50% + ${position.x}px)`,
                top: `calc(50% + ${position.y}px)`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
              draggable={false}
              onError={(e) => {
                console.error('Failed to load image:', e);
              }}
            />
            
            {/* Overlay and border - only render when squareSize is valid */}
            {isValidSquareSize && (
              <>
                {/* Overlay with square cutout - using 4 rectangles */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  {/* Top overlay */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      left: 0,
                      top: 0,
                      right: 0,
                      height: `calc(50% - ${squareSize / 2}px)`,
                    }}
                  />
                  {/* Bottom overlay */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      left: 0,
                      bottom: 0,
                      right: 0,
                      height: `calc(50% - ${squareSize / 2}px)`,
                    }}
                  />
                  {/* Left overlay */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      left: 0,
                      top: `calc(50% - ${squareSize / 2}px)`,
                      bottom: `calc(50% - ${squareSize / 2}px)`,
                      width: `calc(50% - ${squareSize / 2}px)`,
                    }}
                  />
                  {/* Right overlay */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      right: 0,
                      top: `calc(50% - ${squareSize / 2}px)`,
                      bottom: `calc(50% - ${squareSize / 2}px)`,
                      width: `calc(50% - ${squareSize / 2}px)`,
                    }}
                  />
                </div>
                
                {/* Square border */}
                <div
                  className="absolute border-2 border-white dark:border-slate-200 shadow-lg pointer-events-none z-20"
                  style={{
                    width: squareSize,
                    height: squareSize,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.3)',
                  }}
                />
              </>
            )}
          </>
        )}
        {!imageSrc && !error && (
          <div style={{ color: '#94a3b8', textAlign: 'center' }}>
            Loading image...
          </div>
        )}
        {error && (
          <div style={{ color: '#ef4444', textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Error</div>
            <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>
            <button
              onClick={onCancel}
              style={{ padding: '0.5rem 1rem', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
            >
              Go Back
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#475569' }}>
          <Move size={16} />
          <span>Drag to pan</span>
          <span style={{ margin: '0 0.5rem' }}>•</span>
          <ZoomIn size={16} />
          <span>Scroll to zoom</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleZoomOut}
            style={{ padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: 'white', border: '1px solid #e2e8f0', cursor: 'pointer' }}
            title="Zoom out"
          >
            <ZoomOut size={20} />
          </button>
          <div style={{ fontSize: '0.875rem', fontWeight: '500', minWidth: '60px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </div>
          <button
            onClick={handleZoomIn}
            style={{ padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: 'white', border: '1px solid #e2e8f0', cursor: 'pointer' }}
            title="Zoom in"
          >
            <ZoomIn size={20} />
          </button>
          <Button
            onClick={handleCrop}
            size="lg"
            className="ml-2 flex items-center gap-2"
          >
            <Crop size={18} />
            Crop
          </Button>
        </div>
      </div>

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

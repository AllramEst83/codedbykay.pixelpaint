import { RGB, ProjectData } from '../types';

export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const rgbToHex = ({ r, g, b }: RGB): string => {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
};

const hexToRgb = (hex: string): RGB => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

// Fast color distance calculation (squared Euclidean distance)
const getColorDistanceSq = (c1: RGB, c2: RGB) => {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
};

// Optimized k-means clustering with pixel sampling for performance
const quantizeColors = (pixels: RGB[], k: number): RGB[] => {
  if (pixels.length === 0 || k <= 0) return [];
  if (pixels.length <= k) {
    // Return unique colors if we have fewer pixels than desired colors
    const unique = new Map<string, RGB>();
    pixels.forEach(p => {
      const key = `${p.r},${p.g},${p.b}`;
      if (!unique.has(key)) {
        unique.set(key, p);
      }
    });
    return Array.from(unique.values()).slice(0, k);
  }

  // Sample pixels for faster processing (max 10000 pixels)
  const sampleSize = Math.min(10000, pixels.length);
  const step = Math.max(1, Math.floor(pixels.length / sampleSize));
  const sampledPixels: RGB[] = [];
  for (let i = 0; i < pixels.length; i += step) {
    sampledPixels.push(pixels[i]);
  }

  // Initialize centroids using k-means++ initialization (on sampled pixels)
  const centroids: RGB[] = [];
  
  // First centroid: random pixel from sample
  centroids.push({ ...sampledPixels[Math.floor(Math.random() * sampledPixels.length)] });
  
  // Subsequent centroids: choose pixels far from existing centroids (on sample only)
  for (let i = 1; i < k; i++) {
    let maxDist = 0;
    let farthestPixel = sampledPixels[0];
    
    // Only check sampled pixels for speed
    for (const pixel of sampledPixels) {
      let minDistToCentroid = Infinity;
      for (const centroid of centroids) {
        const dist = getColorDistanceSq(pixel, centroid);
        if (dist < minDistToCentroid) {
          minDistToCentroid = dist;
        }
      }
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        farthestPixel = pixel;
      }
    }
    centroids.push({ ...farthestPixel });
  }

  // K-means iterations (reduced to 5 for speed, using sampled pixels)
  const maxIterations = 5;
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign sampled pixels to nearest centroid
    const clusterSums: Array<{ r: number; g: number; b: number; count: number }> = 
      Array(k).fill(null).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    
    for (const pixel of sampledPixels) {
      let minDist = Infinity;
      let nearestCluster = 0;
      for (let i = 0; i < centroids.length; i++) {
        const dist = getColorDistanceSq(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = i;
        }
      }
      clusterSums[nearestCluster].r += pixel.r;
      clusterSums[nearestCluster].g += pixel.g;
      clusterSums[nearestCluster].b += pixel.b;
      clusterSums[nearestCluster].count++;
    }

    // Update centroids
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusterSums[i].count === 0) continue;
      
      const newCentroid = {
        r: Math.round(clusterSums[i].r / clusterSums[i].count),
        g: Math.round(clusterSums[i].g / clusterSums[i].count),
        b: Math.round(clusterSums[i].b / clusterSums[i].count)
      };
      
      if (getColorDistanceSq(newCentroid, centroids[i]) > 1) {
        changed = true;
        centroids[i] = newCentroid;
      }
    }
    
    if (!changed) break;
  }

  return centroids;
};

export const processImage = async (
  imageUrl: string,
  targetDensity: number,
  maxColors: number = 32
): Promise<ProjectData> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      // Calculate dimensions maintaining aspect ratio based on max dimension
      let width, height;
      const aspectRatio = img.width / img.height;
      
      if (img.width > img.height) {
        // Landscape
        width = Math.floor(targetDensity);
        height = Math.floor(targetDensity / aspectRatio);
      } else {
        // Portrait
        height = Math.floor(targetDensity);
        width = Math.floor(targetDensity * aspectRatio);
      }

      // Ensure at least 1 pixel
      width = Math.max(1, width);
      height = Math.max(1, height);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Use default smoothing (bilinear/bicubic) for better color averaging
      // This reduces aliasing artifacts when downscaling
      ctx.imageSmoothingEnabled = true; 
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // 1. Extract pixel colors as RGB objects
      const pixels: RGB[] = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }

      // 2. Use k-means clustering for optimal color quantization
      const LIMIT = Math.min(Math.max(2, maxColors), 200); // Clamp between 2 and 200
      const quantizedPalette = quantizeColors(pixels, LIMIT);
      
      if (quantizedPalette.length === 0) {
        reject(new Error("Color quantization failed"));
        return;
      }

      // 3. Convert palette to hex strings
      const paletteHex = quantizedPalette.map(rgb => rgbToHex(rgb));

      // 4. Map each pixel to its nearest quantized color (optimized with early exit)
      const cells: Array<{ colorIndex: number; filled: boolean }> = [];
      const paletteLength = quantizedPalette.length;
      
      for (const pixel of pixels) {
        let minDist = Infinity;
        let nearestIndex = 0;
        
        // Use squared distance for speed (no sqrt needed)
        for (let i = 0; i < paletteLength; i++) {
          const dist = getColorDistanceSq(pixel, quantizedPalette[i]);
          if (dist < minDist) {
            minDist = dist;
            nearestIndex = i;
            // Early exit if we find an exact match
            if (minDist === 0) break;
          }
        }
        
        cells.push({
          colorIndex: nearestIndex,
          filled: false
        });
      }

      // 5. Sort Palette by Luminosity for better visual organization
      const paletteWithIndices = paletteHex.map((hex, index) => ({ hex, originalIndex: index }));
      paletteWithIndices.sort((a, b) => {
         const getLum = (hex: string) => {
            const rgb = hexToRgb(hex);
            return 0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b;
         }
         return getLum(b.hex) - getLum(a.hex);
      });

      const sortedPalette = paletteWithIndices.map(p => p.hex);
      
      // 6. Create index remapping: oldIndex -> newIndex
      const indexRemap = new Map<number, number>();
      paletteWithIndices.forEach((item, newIndex) => {
        indexRemap.set(item.originalIndex, newIndex);
      });

      // 7. Remap cell indices to match sorted palette
      const sortedCells = cells.map(cell => ({
        colorIndex: indexRemap.get(cell.colorIndex) ?? 0,
        filled: false
      }));

      // 5. Create a thumbnail for storage
      const thumbCanvas = document.createElement('canvas');
      const thumbMax = 300;
      let thumbW = img.width;
      let thumbH = img.height;
      if (thumbW > thumbH && thumbW > thumbMax) {
          thumbH = Math.floor((thumbH / thumbW) * thumbMax);
          thumbW = thumbMax;
      } else if (thumbH > thumbMax) {
          thumbW = Math.floor((thumbW / thumbH) * thumbMax);
          thumbH = thumbMax;
      }
      thumbCanvas.width = thumbW;
      thumbCanvas.height = thumbH;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
          thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);
      }
      // Use PNG to preserve color accuracy without compression artifacts
      const thumbnailDataUrl = thumbCanvas.toDataURL('image/png');

      resolve({
        id: crypto.randomUUID(),
        name: 'New Project',
        originalImage: thumbnailDataUrl, // Store compressed thumbnail
        createdAt: Date.now(),
        width,
        height,
        palette: sortedPalette,
        grid: sortedCells,
        pixelSize: 0 
      });
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};
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

const getColorDistance = (c1: RGB, c2: RGB) => {
  return Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2);
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

      // 1. Extract raw colors
      let rawColors: string[] = [];
      
      // Quantization factor (Lower = more colors/fidelity, Higher = flatter/posterized)
      const Q = 5; 

      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(data[i] / Q) * Q;
        const g = Math.round(data[i + 1] / Q) * Q;
        const b = Math.round(data[i + 2] / Q) * Q;
        // Ignore alpha for now, assume opaque

        const hex = rgbToHex({ r, g, b });
        rawColors.push(hex);
      }

      // 2. Limit Palette to maxColors
      const colorCounts: Record<string, number> = {};
      rawColors.forEach(c => colorCounts[c] = (colorCounts[c] || 0) + 1);
      
      let uniqueColors = Object.keys(colorCounts);
      const LIMIT = Math.min(Math.max(2, maxColors), 200); // Clamp between 2 and 200

      if (uniqueColors.length > LIMIT) {
          // Sort by frequency (descending)
          const topColors = uniqueColors.sort((a, b) => colorCounts[b] - colorCounts[a]).slice(0, LIMIT);
          const topColorsRgb = topColors.map(hex => ({ hex, rgb: hexToRgb(hex) }));

          // Remap function cache
          const mapCache: Record<string, string> = {};
          
          const findNearest = (targetHex: string) => {
              if (mapCache[targetHex]) return mapCache[targetHex];
              if (topColors.includes(targetHex)) return targetHex;

              const targetRgb = hexToRgb(targetHex);
              let minStart = Infinity;
              let nearest = topColors[0];

              for (const tc of topColorsRgb) {
                  const d = getColorDistance(targetRgb, tc.rgb);
                  if (d < minStart) {
                      minStart = d;
                      nearest = tc.hex;
                  }
              }
              mapCache[targetHex] = nearest;
              return nearest;
          };

          // Remap all raw pixels to their nearest allowed color
          rawColors = rawColors.map(findNearest);
          uniqueColors = topColors;
      }

      // 3. Sort Palette (Luminosity)
      const sortedPalette = uniqueColors.sort((a, b) => {
         const getLum = (hex: string) => {
            const rgb = hexToRgb(hex);
            return 0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b;
         }
         return getLum(b) - getLum(a);
      });

      // 4. Map pixels to palette indices
      const cells = rawColors.map(hex => ({
        colorIndex: sortedPalette.indexOf(hex),
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
      // Use JPEG with 0.7 quality for compression
      const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

      resolve({
        id: crypto.randomUUID(),
        name: 'New Project',
        originalImage: thumbnailDataUrl, // Store compressed thumbnail
        createdAt: Date.now(),
        width,
        height,
        palette: sortedPalette,
        grid: cells,
        pixelSize: 0 
      });
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Cell {
  colorIndex: number; // Index in the palette (the "correct" color for this cell)
  filled: boolean;
  filledColorIndex?: number; // The color actually applied (undefined = not filled)
}

export interface ProjectData {
  id: string;
  name: string;
  originalImage: string; // Data URL
  createdAt: number;
  width: number;
  height: number;
  palette: string[]; // Hex codes
  grid: Cell[]; // 1D array of width * height
  pixelSize: number; // For rendering logic
  completed?: boolean; // Whether the puzzle is fully completed
}

export type AppView = 'HOME' | 'SETUP' | 'WORKSPACE';

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PixelPaint - Color by Number

Turn your favorite memories into relaxing color-by-number pixel art puzzles. Upload your own photos and transform them into interactive, paint-by-number experiences that you can complete right in your browser.

## ✨ Features

- **Image Upload**: Upload any image and convert it to a color-by-number puzzle
- **Customizable Setup**: Configure grid size and color palette during setup
- **Interactive Workspace**:
  - Zoom and pan for detailed work
  - Color palette selection
  - Progress tracking with completion percentage
  - Highlight mode to show which cells match your selected color
- **Local Storage**: All projects are saved locally in your browser - your images never leave your device
- **Project Management**: View, resume, and delete your saved puzzles
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd codedbykay.pixelpaint
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run the development server**:

   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to `http://localhost:3000` (or the port shown in your terminal)

## 📦 Build for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory. You can preview the production build locally with:

```bash
npm run preview
```

## 🛠️ Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Canvas API** - Image processing and rendering

## 📁 Project Structure

```
├── components/          # React components
│   ├── Button.tsx      # Reusable button component
│   ├── ImageUploader.tsx # Image upload interface
│   ├── SetupWizard.tsx  # Puzzle configuration wizard
│   └── Workspace.tsx    # Main painting workspace
├── services/            # Business logic
│   ├── imageEngine.ts  # Image processing and color quantization
│   └── storage.ts      # Local storage management
├── scripts/            # Build scripts
│   └── increment-version.js # Version management
├── App.tsx             # Main application component
├── types.ts            # TypeScript type definitions
└── vite.config.ts      # Vite configuration
```

## 🔒 Privacy

PixelPaint processes all images locally in your browser. Your photos are never uploaded to any server - everything happens client-side using the Canvas API. Projects are saved to your browser's local storage.

## 📝 License

This project is private and proprietary.

## 🎨 How It Works

1. **Upload**: Select an image from your device
2. **Setup**: Configure the grid size and color palette
3. **Process**: The app analyzes your image and creates a color-by-number grid
4. **Paint**: Use the interactive workspace to fill in cells by matching colors
5. **Save**: Your progress is automatically saved locally

---

Made with ❤️ by codedbykay

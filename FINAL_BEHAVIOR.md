# Final Behavior Documentation

## Complete Cell State and Rendering Logic

### Cell States

A cell can be in one of three states:

1. **Unfilled**
   - No color applied
   - Shows number
   - Shows highlight if matches selected color (when highlight mode is on)
   - Shows border

2. **Correctly Filled**
   - `filledColorIndex === colorIndex` (correct color applied)
   - Shows opaque color (100% alpha)
   - **Number is hidden** (color completely fills the cell)
   - No highlight
   - No border (covered by opaque fill)

3. **Incorrectly Filled**
   - `filledColorIndex !== colorIndex` (wrong color applied)
   - Shows transparent color (15% alpha)
   - **Number is visible through transparent color** ✓
   - Shows highlight if matches selected color (when highlight mode is on)
   - Shows border

### Visual Appearance

```
Unfilled Cell (e.g., should be color 3):
┌───────┐
│   3   │  ← Number visible, white/light background
└───────┘

Correctly Filled Cell (color 3 applied to cell that needs color 3):
┌───────┐
│ ████  │  ← Opaque color, no number visible
└───────┘

Incorrectly Filled Cell (color 5 applied to cell that needs color 3):
┌───────┐
│ ▓▓3▓▓ │  ← Transparent color overlay, number visible through it
└───────┘
```

### Interaction Behavior

#### Applying Color
- **Tap/Click**: Apply selected color to single cell
  - If cell is unfilled: Apply color
  - If cell has same color: No effect (no-op)
  - If cell has different color: Replace with new color

#### Painting (Drag)
- **Start on matching cell**: Enter paint mode
  - Drag paints all cells cursor passes over
  - Cursor: crosshair
  - Can paint any cell (correct or incorrect)
  
- **Start on non-matching cell/empty**: Enter pan mode
  - Drag moves canvas
  - Cursor: grab/grabbing
  - No painting occurs

#### Color Replacement
- Colors always **replace**, never mix
- Each cell displays exactly **one color**
- Old color is completely removed when new color is applied

### Progress Tracking

- **Color Progress**: Only counts cells with correct color
  - `filledColorIndex === colorIndex && filled === true`
  
- **Overall Progress**: Only counts correctly filled cells
  - Total: 100% when all cells have correct color

### Transparency Values

- **Correct Fill**: 100% opaque (alpha = 1.0)
- **Incorrect Fill**: 15% opaque (alpha = 0.15)
  - Low enough to clearly see numbers
  - High enough to provide color feedback

### Number Visibility Rules

| Cell State | Color Alpha | Number Visible? |
|------------|-------------|-----------------|
| Unfilled | N/A | ✓ Yes |
| Incorrectly Filled | 0.15 (15%) | ✓ Yes |
| Correctly Filled | 1.0 (100%) | ✗ No |

## Design Rationale

### Why Show Numbers on Incorrect Fills?
1. **Error Visibility**: Users can immediately see what the cell should be
2. **Easy Correction**: No need to remember or look up what number was there
3. **Reduced Frustration**: Clear path to fixing mistakes
4. **Learning Aid**: Users learn which colors go where

### Why Hide Numbers on Correct Fills?
1. **Visual Reward**: Clean, completed look for correct cells
2. **Progress Indication**: Clear distinction between done and not done
3. **Less Clutter**: Reduces visual noise as puzzle progresses
4. **Satisfying Completion**: Completed areas look polished

### Why 15% Alpha for Incorrect Fills?
- **10% or lower**: Too faint, hard to see the color
- **15%**: Sweet spot - visible color hint, readable numbers
- **20% or higher**: Numbers become harder to read
- **100%**: Would hide numbers (defeats the purpose)

## Edge Cases Handled

1. **Reapplying Same Color**: No-op, no state change
2. **Color on Color**: New color replaces old (no mixing)
3. **Correct → Incorrect**: Becomes transparent, shows number
4. **Incorrect → Correct**: Becomes opaque, hides number
5. **Incorrect → Different Incorrect**: Replaces color, number stays visible
6. **Paint Stroke Over Filled**: Can paint over any cell, correct or incorrect
7. **Zoom Levels**: Numbers only show when zoom is high enough (LOD optimization)

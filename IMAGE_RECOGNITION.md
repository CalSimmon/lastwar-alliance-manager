# Image Recognition & OCR

## Overview

The application uses Tesseract OCR (via `gosseract`) to extract player data from Last War: Survival screenshots. Three upload endpoints each follow the same two-phase strategy:

1. **Row-based extraction** (primary) — the image is segmented into individual player rows using edge-based separator detection, then each name and value cell is OCR'd independently with `PSM_SINGLE_LINE`. This is more accurate because a single row has far less noise than the full image.
2. **Full-image OCR fallback** — if row-based extraction returns too few valid records, the original full-image Tesseract pass is used instead.

All image processing uses Go's standard library only (`image`, `image/color`, `image/draw`, `image/png`). No OpenCV, libvips, ImageMagick, or other external image libraries are required.

---

## Upload Pipelines

### 1. VS Points (`/api/vs-points/process-screenshot`)

**Screenshot layout (759 × 1348 px typical):**

```
┌──────────────────────────────────────────────┐
│  Title bar                   (~5% height)    │
│  Day tabs  Mon Tue Wed Thu Fri Sat  (~6%)    │
│  Column headers              (~5%)           │
├──────────────────────────────────────────────┤
│  Row  │ Avatar+rank │ Name       │  Points   │  ← data rows
│       │   0–?%      │ ?%–70%     │  70–100%  │    (~68% of height)
│  ...  │             │            │           │
├──────────────────────────────────────────────┤
│  Bottom button               (~10%)          │
└──────────────────────────────────────────────┘
```

**Processing flow:**

```
extractVSPointsDataFromImage(imageData)
    │
    ├─ detectDayFromTabRegion()       ← colour-sample the day tab strip
    │
    ├─ analyzeScreenshot()            ← compute DataRegion, RowHeight, EstimatedRows
    │
    ├─ extractVSPointsByRows()        ← PRIMARY (row-based)
    │      │
    │      ├─ convertToGrayscale()   ← once, reused for all rows
    │      ├─ findRowBoundaries()    ← separator-line scan → exact row [top,bottom] pairs
    │      └─ per row:
    │           ├─ detectAvatarEndX() ← avatar/text boundary → nameStartX
    │           ├─ crop name region  [nameStartX .. 70%] × [0 .. 55% of rowH]
    │           ├─ crop points region [70% .. 100%] × full rowH
    │           ├─ scaleImage(3×) + OCR PSM_SINGLE_LINE (name)
    │           └─ scaleImage(3×) + OCR PSM_SINGLE_LINE, digits whitelist (points)
    │
    ├─ quality check: ≥3 records, no \n in names, no UI label matches
    │
    └─ extractVSPointsFullImage()     ← FALLBACK (full-image OCR + parseVSPointsText)
```

**Quality gate before accepting row-based results:**
- At least 3 records extracted
- No name contains a newline or carriage return
- No name matches known UI labels: `commander`, `ranking`, `points`, `nova sapphire`, `reset reapers`

---

### 2. Power Rankings (`/api/power-history/process-screenshot`)

**Screenshot layout (approximate):**

```
┌──────────────────────────────────────────────┐
│  Title / tabs / headers      (~17% height)   │
├──────────────────────────────────────────────┤
│  Row  │ Avatar+rank │  Name      │  Power    │
│       │   0–35%     │ 35–80%     │  80–100%  │
│  ...  │             │            │           │
├──────────────────────────────────────────────┤
│  Bottom button               (~10%)          │
└──────────────────────────────────────────────┘
```

**Processing flow:**

```
extractPowerDataFromImage(imageData)
    │
    ├─ image.Decode() + analyzeScreenshot()
    │
    ├─ extractPowerByRows()           ← PRIMARY (row-based)
    │      │
    │      ├─ convertToGrayscale()
    │      ├─ findRowBoundaries()
    │      └─ per row:
    │           ├─ detectAvatarEndX() ← cap at 35% of width
    │           ├─ crop name region  [avatarEnd .. 80%] × [0 .. 60% of rowH]
    │           ├─ crop power region [80% .. 100%] × full rowH
    │           ├─ OCR PSM_SINGLE_LINE (name)
    │           └─ OCR PSM_SINGLE_LINE, digits whitelist (power)
    │           └─ validate: power ≥ 1,000,000
    │
    ├─ quality gate: ≥3 valid records
    │
    └─ full-image OCR fallback        ← preprocessImageForOCR → PSM_AUTO/BLOCK/SPARSE
           └─ parsePowerRankingsText() ← multi-pattern regex + OCR char substitution
```

---

### 3. Member List (`/api/members/import-screenshot`)

**Screenshot layout (approximate):**

```
┌──────────────────────────────────────────────┐
│  Headers / tabs              (~17% height)   │
├──────────────────────────────────────────────┤
│  Row  │ Rank badge │  Player name  │  ...    │
│       │  R5/R4/…   │               │         │
│  ...  │            │               │         │
├──────────────────────────────────────────────┤
│  Bottom UI                   (~10%)          │
└──────────────────────────────────────────────┘
```

**Processing flow:**

```
importMemberScreenshot(imageData)
    │
    ├─ image.Decode() + analyzeScreenshot()
    │
    ├─ extractMembersByRows()         ← PRIMARY (row-based)
    │      │
    │      ├─ convertToGrayscale()
    │      ├─ findRowBoundaries()
    │      └─ per row:
    │           ├─ crop full row width (rank badge text included)
    │           ├─ scaleImage(3×) + OCR PSM_SINGLE_LINE
    │           └─ collect line text → join with "\n"
    │
    ├─ quality gate: ≥2 R[1-5] tokens in combined text
    │
    ├─ full-image OCR fallback        ← preprocessImageForOCR → PSM_AUTO/BLOCK/SPARSE
    │
    └─ rank-regex parser
           ├─ find R1–R5 tokens per line
           ├─ strip power numbers, punctuation
           ├─ fuzzy-match against DB members (Levenshtein similarity)
           └─ return: detected, changed-rank, new, to-remove lists
```

---

## Edge-Detection Helpers

All three pipelines share four pure-Go helper functions defined in `main.go`:

### `sobelMagnitude(gray *image.Gray, x, y int) uint8`
Returns the Sobel gradient magnitude (L1 norm, clamped 0–255) at pixel `(x, y)`. Pixels outside image bounds are clamped to the nearest edge pixel.

### `regionEdgeDensity(gray *image.Gray, x0, y0, x1, y1 int) float64`
Mean Sobel magnitude over rectangle `[x0,x1) × [y0,y1)`. Range `[0.0, 255.0]`. Used to measure how "complex" (avatar) vs. "plain" (text background) a column slice is.

### `findRowBoundaries(gray *image.Gray, top, bottom, minRowH int) [][2]int`
Scans every horizontal scanline between `top` and `bottom`. A scanline is a **separator** if its pixel-brightness variance is below 30 (near-uniform colour) and mean brightness is below 245 (not pure white). Contiguous non-separator bands become rows. Returns `[][2]int` of `{rowTop, rowBottom}` pairs.

Falls back to even division if no separators are found (e.g. screenshots without visible grid lines).

### `detectAvatarEndX(gray *image.Gray, rowTop, rowBottom, maxAvatarX int) int`
Slides a vertical window left-to-right across the row. When mean Sobel edge density first transitions from high (≥ 18, avatar artwork) to low (< 8, plain text background), that x position is returned as the avatar/text boundary. `maxAvatarX` is a hard cap so the detector never eats into the name column.

---

## Preprocessing Pipeline (full-image fallback)

When row-based extraction returns too few records, the original full-image pipeline runs:

| Step | Function | Purpose |
|------|----------|---------|
| 1 | `analyzeScreenshot` | Compute `DataRegion`, `RowHeight`, `EstimatedRows` |
| 2 | `cropToDataRegion` | Remove title bar, tabs, headers, bottom button |
| 3 | `convertToGrayscale` | Single colour channel |
| 4 | `enhanceContrast` | Histogram equalisation |
| 5 | `applyAdaptiveThreshold` | Local binarisation (block 25 px, or 15 px for dense rows) |
| 6 | `invertImage` | Black text on white background for Tesseract |
| 7 | `scaleImage` | 3× upscale via nearest-neighbour |

---

## Data Structures

```go
type ImageRegion struct {
    Name   string
    Top    int  // Y top edge
    Bottom int  // Y bottom edge
    Left   int  // X left edge
    Right  int  // X right edge
}

type ScreenshotAttributes struct {
    Width          int
    Height         int
    TitleBarRegion *ImageRegion
    TabsRegion     *ImageRegion
    HeaderRegion   *ImageRegion
    DataRegion     *ImageRegion  // ← where player rows live
    ButtonRegion   *ImageRegion
    RowHeight      int           // estimated (used only as fallback)
    EstimatedRows  int           // estimated (used only as fallback)
}
```

---

## Requirements

### Production (Docker / Linux)
```dockerfile
# Alpine 3.21 — only English data required
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng
```

### Development (Windows)
The preprocessing helpers use only Go stdlib and compile without CGO. The `gosseract` OCR client requires CGO + Tesseract C headers; build inside Docker for full functionality.

### Go dependencies
| Package | Purpose |
|---------|---------|
| `image`, `image/color`, `image/draw`, `image/png` | Image decode/encode/manipulation |
| `bytes` | Buffer management |
| `github.com/otiai10/gosseract/v2` | Tesseract OCR bindings (CGO) |

---

## Logging

Each pipeline emits structured log lines for debugging:

```
VS OCR: edge detection found 10 rows in data region (was estimating 10)
Row 1: Name='Reddy sri', Points=4812500
Row 2: Name='rahuld', Points=3976200
...
Power OCR: row-based extraction succeeded with 10 records
Power row 1: Name='Gary6126', Power=77421000
...
Members OCR: edge detection found 12 rows in data region
Members row 1: "R4 CoolPlayer"
Members row 2: "R3 AnotherOne"
...

## Distinct Attributes Detected

When analyzing a screenshot, the system identifies and processes these distinct visual elements:

### 1. **Title Bar Region**
- Location: Top 5-7% of image  
- Contains: "STRENGTH RANKING" text
- Background: Dark color
- Processing: Removed before OCR (UI element, not data)

### 2. **Tab Buttons**
- Location: Below title bar (~5-8% of height)
- Contains: "Power", "Kills", "Donation" buttons
- Styling: Orange/gray tabs with highlighted active tab
- Processing: Removed before OCR (UI navigation, not data)

### 3. **Column Headers**
- Location: Below tabs (~5% of height)
- Contains: "Ranking", "Commander", "Power" labels
- Background: Light brown/beige
- Processing: Removed before OCR (UI labels, not data)

### 4. **Data Rows Region** ⭐ PRIMARY FOCUS
- Location: Middle section (between headers and bottom button)
- Contains per row:
  - **Ranking Number**: Position in list (e.g., 7, 8, 9, 10)
  - **Player Icon**: Small square avatar image
  - **Rank Badge**: R5, R4, R3, R2, R1 (orange badge icons)
  - **Player Name**: Commander name (e.g., "dvdAlbert91", "Nutty Tx", "WoodWould")
  - **Power Value**: Large numbers (e.g., "50914631", "49758621")
- Background: Alternating colors with occasional highlighting
- Row Height: Auto-detected based on image dimensions
- Processing: **Enhanced and focused for OCR**

### 5. **Bottom Button Region**
- Location: Bottom 8-10% of image
- Contains: Back arrow navigation button
- Processing: Removed before OCR (UI control, not data)

## Image Preprocessing Pipeline

The system applies these enhancements sequentially:

### Step 1: Region Analysis
```
analyzeScreenshot(img) → ScreenshotAttributes
```
- Detects image dimensions
- Calculates region boundaries
- Estimates row height and count
- Logs analysis results for debugging

### Step 2: Region Cropping
```
cropToDataRegion(img, region) → Cropped Image
```
- Removes title bar, tabs, headers, and bottom button
- Focuses only on the data rows
- Reduces noise and OCR errors from UI elements

### Step 3: Grayscale Conversion
```
convertToGrayscale(img) → Gray Image
```
- Simplifies image to single color channel
- Improves OCR accuracy
- Reduces processing time

### Step 4: Contrast Enhancement
```
enhanceContrast(img) → Enhanced Image
```
- Applies histogram equalization
- Makes text more distinct from background
- Improves readability of faded or low-contrast screenshots

### Step 5: Adaptive Thresholding
```
applyAdaptiveThreshold(img, blockSize) → Binary Image
```
- Converts to black/white binary image
- Uses local mean for each pixel region
- Adapts to varying lighting/background colors
- Block size adjusts based on row density (25px standard, 15px for dense text)

### Step 6: Image Inversion
```
invertImage(img) → Inverted Image  
```
- Ensures black text on white background
- Tesseract OCR performs best with this format

### Result
The preprocessed image is then passed to Tesseract OCR with optimized settings:
- Page segmentation mode: PSM_AUTO
- Character whitelist: A-Z, a-z, 0-9, and basic punctuation
- Output: Clean text containing only player names and power values

## Technical Details

### Data Structures

```go
type ImageRegion struct {
    Name   string  // Region identifier
    Top    int     // Y-coordinate of top edge
    Bottom int     // Y-coordinate of bottom edge  
    Left   int     // X-coordinate of left edge
    Right  int     // X-coordinate of right edge
}

type ScreenshotAttributes struct {
    Width          int          // Total image width
    Height         int          // Total image height
    TitleBarRegion *ImageRegion // Title area
    TabsRegion     *ImageRegion // Tab buttons area
    HeaderRegion   *ImageRegion // Column headers area
    DataRegion     *ImageRegion // Player data rows ⭐
    ButtonRegion   *ImageRegion // Bottom navigation area
    RowHeight      int          // Estimated height per row
    EstimatedRows  int          // Expected number of visible rows
}
```

### Function Flow

```
User uploads screenshot
    ↓
extractPowerDataFromImage(imageData)
    ↓
preprocessImageForOCR(imageData)
    ├→ analyzeScreenshot()
    ├→ cropToDataRegion()
    ├→ convertToGrayscale()
    ├→ enhanceContrast()
    ├→ applyAdaptiveThreshold()
    └→ invertImage()
    ↓
Tesseract OCR (gosseract library)
    ↓
parsePowerRankingsText(text)
    ├→ Pattern matching: "R4 Gary6126 73716853"
    ├→ Pattern matching: "Anjel87 57250482"
    ├→ Validation: name length 3-30, power 1M-10B
    └→ Deduplication: skip duplicate names
    ↓
Fuzzy matching with database members
    └→ Levenshtein-like similarity scoring
    ↓
Records saved to database
```

## Advantages of Image Preprocessing

### Before Preprocessing ❌
- OCR attempts to read entire screenshot
- Gets confused by UI elements, buttons, titles
- Low contrast text missed or misread
- Background colors interfere with text detection
- Icons/badges mistaken for characters
- Lower accuracy, more manual corrections needed

### After Preprocessing ✅
- Focuses only on relevant data region
- UI clutter removed completely
- High contrast black-on-white text
- Even lighting across entire image
- Clear text boundaries
- Significantly higher OCR accuracy

## Requirements

### On Linux (Production)
```bash
sudo apt install tesseract-ocr tesseract-ocr-all
sudo apt install libtesseract-dev libleptonica-dev
```

### On Windows (Development)
The image processing uses Go's standard library (`image`, `image/color`, `image/draw`) which works without CGO. However, Tesseract OCR requires CGO:

```bash
# Install MinGW-w64 or TDM-GCC for CGO support
# Then test:
go env CGO_ENABLED  # Should show: 1

# If CGO is disabled, development on Windows won't compile
# Deploy to Linux server for full functionality
```

### Dependencies
- `image` - Standard Go image decoding/encoding
- `image/color` - Color model support
- `image/draw` - Image composition
- `image/png` - PNG encoding for processed images
- `bytes` - Buffer management for image data
- `github.com/otiai10/gosseract/v2` - Tesseract OCR bindings (requires CGO)

## Usage Example

1. Take a screenshot of the Power Rankings screen in Last War: Survival
2. Navigate to Settings page in the Alliance Manager
3. Click the "📷 Image Upload" tab
4. Upload the screenshot
5. Click "🔍 Process Image with OCR"
6. The system will:
   - Analyze the screenshot structure
   - Crop to data region
   - Enhance for optimal OCR
   - Extract player names and power values
   - Match to database members (with fuzzy matching)
   - Save records to power history

## Logging & Debugging

The system logs detailed information at each stage:

```
[INFO] Screenshot Analysis: 1080x1920, DataRegion: (0,250) to (1080,1650), Est. Rows: 10
[INFO] Cropped image from (0,0)-(1080,1920) to (0,0)-(1080,1400)
[INFO] Image preprocessed: 1080x1920 -> 1080x1400
[INFO] OCR extracted text:
7 dvdAlbert91 50914631
8 Nutty Tx 49758621
9 WoodWould 49359118
...
---END OCR---
[INFO] Parsed: dvdAlbert91 -> 50914631
[INFO] ✓ Fuzzy matched 'dvdAlbert' to 'dvdAlbert91' (score: 92%)
```

## Future Enhancements

Potential improvements for even better accuracy:

1. **Template Matching**: Detect rank badges (R3, R4) visually to verify text OCR
2. **Icon Detection**: Use player icons to help identify row boundaries
3. **Multi-language Support**: Add language packs for non-English game versions
4. **Confidence Scoring**: Report OCR confidence per record
5. **Auto-rotation**: Detect and correct tilted/rotated screenshots
6. **Batch Processing**: Upload multiple screenshots at once
7. **Machine Learning**: Train a model to specifically recognize Last War UI fonts

---

**Result**: The image recognition system automatically filters out UI elements and enhances the relevant data before OCR, dramatically improving accuracy and reducing manual corrections needed.

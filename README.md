# ImageTrimmer

ImageTrimmer is a lightweight, browser-based image editor for cropping,
resizing, rotating, and adjusting images. Image files are processed locally in
your browser; they are not uploaded to a server. An optional Chrome extension
opens the editor in its own tab.

## Features

- Crop with preview, pixel-coordinate inputs, optional pixel snapping, and
  straightening.
- Resize in pixels or percentages, with aspect ratio locked by default.
- Rotate and flip images; adjust brightness/contrast, levels, curves, and color
  mode; paint with a brush.
- Pan and zoom the preview, toggle pixel rulers, and switch between light and
  dark themes.
- Export as PNG, JPEG, or WebP; rename downloads and undo or redo applied
  changes.
- Keep image editing in the browser, with no upload or backend service.

See the [user guide](docs/PROJECT_GUIDE.md) for step-by-step instructions,
keyboard shortcuts, exporting, and tips for using the editor in narrow windows.

## Tech stack

- Vue 3 and TypeScript
- Vite
- Browser image APIs, including `ImageBitmap` and Canvas 2D
- Node.js built-in test runner, ESLint, and Stylelint

## Requirements

- Node.js 22.18+ or 24.12+
- npm

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local development URL after startup.

## Common commands

```sh
npm run build           # Type-check and create the production web build
npm run lint            # Run ESLint and Stylelint
npm run type-check      # Run Vue/TypeScript type-checking only
npm run build-only      # Create the production web build without type-checking
npm run preview         # Preview the production build locally
npm run build:extension # Build the unpacked Chrome extension
```

## Tests

The project uses Node.js's built-in test runner (`node:test`) with TypeScript
test files. Run the complete test suite from the repository root:

```sh
node --test
```

Node discovers the test files under `src/`, including component, composable,
and image-processing tests. There is currently no `npm test` script; use
`node --test` directly.

The suite covers:

- Image operations and validation: crop geometry and controls, resizing,
  rotation/flip, brush strokes, brightness/contrast, Levels, Curves, color
  modes, and export.
- Editor navigation and display: zoom, animated zoom, panning, wheel zoom,
  pixel rulers, keyboard shortcuts, and crop overlays.
- Tool and component behavior: base controls, editor header and tool rail,
  floating-tool actions, draggable dialogs, tool drafts, and close guards.
- Document behavior: image import/edit state, undo/redo history, bitmap
  lifecycle, and discard-changes protection.

To run only relevant tests, pass one or more test-file paths:

```sh
node --test src/lib/__tests__/crop.test.ts src/lib/__tests__/cropOverlay.test.ts
node --test src/lib/__tests__/resize.test.ts src/lib/__tests__/export.test.ts
node --test src/lib/__tests__/useImageDocument.test.ts
```

The automated suite verifies logic and selected component behavior. It is not
a full browser end-to-end or visual regression suite. For UI, responsive, or
image-preview changes, also run `npm run dev` and manually verify the relevant
workflow in a browser. For image-processing changes, include landscape and
portrait images, transparency, and invalid inputs as applicable; for layout
changes, check narrow desktop widths and confirm all actions remain reachable.

## Chrome extension

1. Run `npm run build:extension`.
2. Visit `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the generated `dist-extension` folder.
4. Pin ImageTrimmer and click its toolbar button to open the editor in a new tab.

The extension uses the editor's local file picker and standard browser
downloads. It does not access images on websites or request website
permissions. Reload the extension after rebuilding.

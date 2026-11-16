# ImageTrimmer user guide

ImageTrimmer lets you make common image edits in your browser. This guide explains
how to open an image, use the editing tools, and download your result.

## Contents

- [Getting started](#getting-started)
- [Understanding the editor](#understanding-the-editor)
- [Transform the image](#transform-the-image)
  - [Crop](#crop)
  - [Straighten](#straighten)
  - [Resize](#resize)
  - [Rotate and flip](#rotate-and-flip)
- [Adjust color and tone](#adjust-color-and-tone)
  - [Brightness and Contrast](#brightness-and-contrast)
  - [Levels](#levels)
  - [Curves](#curves)
  - [Color mode](#color-mode)
- [Paint with the brush](#paint-with-the-brush)
  - [Brush](#brush)
- [Pick a color](#pick-a-color)
- [Navigate the image](#navigate-the-image)
  - [Zoom and pan](#zoom-and-pan)
  - [Pixel rulers and motion](#pixel-rulers-and-motion)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Undo, redo, and cancel edits](#undo-redo-and-cancel-edits)
- [Rename and export](#rename-and-export)
- [Floating toolbars on narrow windows](#floating-toolbars-on-narrow-windows)
- [Privacy and image formats](#privacy-and-image-formats)
- [Use the Chrome extension](#use-the-chrome-extension)

## Getting started

1. Open ImageTrimmer in a supported desktop browser.
2. Select **Import image** from the left toolbar and choose an image file from
   your device.
3. Choose a tool from the left toolbar to start editing.
4. Apply each tool's changes, then select **Export** to download the finished
   image.

The image appears in the center preview. If no image is loaded, image-editing
tools are unavailable. Importing another image or closing the current one while
there are unapplied edits prompts you to keep editing or discard those edits.

## Understanding the editor

- **Top bar:** Shows the current filename and provides pixel-ruler, animation,
  theme, and close-image controls. Select the filename, extension, or pen icon
  to rename it. Open the theme control to choose Light, Dark, or Auto, which
  follows your operating system's appearance setting.
- **Left toolbar:** Contains image import and export, undo and redo, editing
  tools, and zoom controls. On a short window, some tools may be grouped under
  **More tools**.
- **Preview:** Shows the image and interactive overlays, such as the crop
  selection or brush strokes.
- **Floating toolbars:** Crop, Straighten, Resize, and Rotate controls appear above the
  preview. Drag the dotted grip to move one.
- **Dialogs:** Color adjustments and Export open a dialog. Use its **Apply**,
  **Download**, or **Cancel** controls to finish.

Tool changes that would discard pending edits ask you to confirm first.
Previews are not permanently applied until you choose the tool's apply action.

## Transform the image

Use the **Crop**, **Straighten**, **Resize**, and **Rotate image** buttons on
the left toolbar to change the image's framing, dimensions, or orientation. Each opens a
floating toolbar above the preview. Preview the change, then apply it or
cancel it before choosing another tool.

### Crop

1. Select **Crop** from the left toolbar.
2. Drag on the image to draw a crop selection. Drag inside the selection to
   move it, or drag an edge or corner handle to change its size.
3. Use the crop toolbar to enter exact **X**, **Y**, **Width**, and **Height**
   values in source-image pixels. The crop must stay inside the image and have
   a width and height of at least one pixel.
4. Optionally select **Snap to pixel** to align the crop to whole pixels. This
   preference applies to Crop and is unchanged by Straighten.
   Hold **Shift** while drawing to constrain the selection to a square. Hold
   **Shift** while resizing from a corner to make a square around the opposite
   corner. You can press or release Shift while dragging to toggle the
   constraint.
5. To rotate the crop preview while framing it, use the angle slider or enter
   an angle in degrees. The crop is fitted to the rotated image automatically.
6. Select **Apply crop** (or press **Enter**) to commit, or **Cancel** (or
   **Escape**) to discard the preview.

Focus a crop handle and use the arrow keys to adjust it by one pixel. Crop
dimensions shown in the toolbar may be rounded for display; the actual
selection retains its precision unless pixel snapping is enabled. Hold
**Shift** while using a handle's arrow keys to keep the crop square.

### Straighten

Use **Straighten** to level a tilted horizon, wall, or other line that should be
horizontal. It is separate from the angle slider in Crop, which still works as
before.

1. Select **Straighten** from the left toolbar.
2. Set a reference line by clicking two distinct points along an edge that
   should be level, or press and drag from the first point to the second, then
   release. The order of the points does not matter. Pointer movement of
   3 pixels or less counts as a click; a longer drag whose line is shorter
   than 8 displayed pixels is rejected, so retry with the points farther
   apart. For keyboard placement, focus the image, use the arrow keys to
   position each point, and press **Enter** after each one; hold **Shift** with
   an arrow key to move farther.
3. The Angle slider, degree field, and **Apply straighten** are available as soon
   as Straighten opens. You can set a manual angle and apply directly without a
   reference line; the automatic crop fits inside the rotated image.
   Setting the second valid point only records the line; it does not rotate the
   image or start framing. Select the **Straighten** icon in the toolbar (it stays
   disabled until the line is complete and is not already level) to level the
   measured line and initialize a crop inside the rotated image. If you rotated
   the preview manually first, the line is still measured against the image itself.
   The frame has four corner handles, used only to rotate
   the image around its stable center; dragging inside or outside the crop does
   nothing (use the Crop tool for a custom crop). There are no side-resize handles. The Crop **Snap to pixel** preference does not
   affect Straighten. Corner rotation fits the crop inside the rotated image.
   Nothing is committed until **Apply straighten**.
4. Fine-tune the angle with the slider, degree field, or four rotation
   handles. Focus a corner handle and press **Left** or **Right** for
   0.1-degree steps; add **Shift** for 1-degree steps. The crop
   fits inside the rotated image automatically as the angle changes. The measured line remains attached to the image. Rotation always previews the tool-entry
   image, without accumulating blur. The **Straighten** icon stays available
   during framing, disabled while the measured line is level. Manual angle
   changes away from level enable it again. Select it to restore the measured
   correction; the crop fits within the rotated image automatically.
5. **Apply straighten** stays visible during measurement and framing. It is
   enabled only when the current valid crop or angle changes the resulting image.
   A reference line alone is not an edit to apply. Returning to the full frame
   at 0° disables Apply, even after earlier edits. Invalid angles and active
   processing or framing drags block Apply.
   Select **Apply straighten** (or press **Enter** in an angle control) to commit,
   or **Cancel** (or **Escape**) to discard the preview. Cancel and reopen
   Straighten to start over. The image changes only when you apply.

The correction is the shortest turn, between -90 and 90 degrees. Transparent
areas are preserved. The automatic crop retains the original proportions; use
the Crop tool for custom framing. Crop's own angle remains limited to ±45° and
continues fitting its selection automatically.
Applying is a single edit that **Undo** reverts in one step.

### Resize

1. Select **Resize** from the left toolbar.
2. Enter the new width or height in pixels or percentages. The other dimension
   updates to preserve the original aspect ratio while the lock is on.
3. Select the lock control to unlock the aspect ratio and set width and height
   independently.
4. Select **Apply resize** (or press **Enter**) to apply, or **Cancel** (or
   **Escape**) to discard the entered dimensions.

Percentages are based on the image size when the Resize toolbar opens. Output
dimensions are rounded to whole pixels and each side must be between 1 and
16,384 pixels. If processing fails, the error appears in the toolbar and your
entered dimensions remain available.

### Rotate and flip

1. Select **Rotate image** from the left toolbar.
2. Use the clockwise or counterclockwise buttons to preview quarter-turns.
   Use the horizontal or vertical flip buttons to mirror the image.
3. Select **Apply rotation** to commit the preview, or **Cancel** (or
   **Escape**) to discard it.

Rotation and flips can be combined and are saved as one edit. Four quarter-turns
return the image to its original orientation.

## Paint with the brush

The **Brush** tool lets you draw colored strokes directly on the image.

### Brush

1. Select **Brush** from the left toolbar.
2. Set the stroke **Thickness** in pixels and choose a **Color** in the
   floating toolbar.
3. Draw on the image to add strokes.
4. If you make a mistake before applying, use **Undo** to remove pending
   strokes one at a time. Select **Apply** to commit the strokes or **Cancel**
   to discard them.

Brush strokes are part of the image edit once applied and can then be undone
with the editor's regular undo control.

## Pick a color

1. Select **Eyedropper** in the Adjustment tools group, immediately after Color mode.
2. Move over the preview to inspect a magnified pixel, then click to sample it.
   The floating toolbar shows the color swatch and its selectable hex value.
3. Select **Copy** to copy the displayed hex value. If copying is unavailable,
   select the hex text and copy it manually.
4. Sample another pixel to replace the current selection, or select **Close**
   to leave the tool.

The Eyedropper samples the current preview, including visible color
adjustments, rotation, and flips. Fully opaque pixels are shown as `#RRGGBB`;
pixels with transparency include alpha as `#RRGGBBAA`. Sampling does not change
the image or add an edit to history.

## Adjust color and tone

The adjustment buttons in the left toolbar open dialogs. Make changes while
watching the preview, then select **Apply** to commit the result or **Cancel**
or **Escape** to close without applying it.

### Brightness and Contrast

Use the **Brightness/Contrast** button to lighten or darken the image and
change the difference between light and dark areas. Adjust either control and
review the live preview before applying.

### Levels

Choose **Levels** to adjust the image's dark tones, midtones, and bright tones.
Use the histogram and controls to set the black point, midtone gamma, and white
point while checking the preview.

### Curves

Choose **Curves** for more targeted tonal adjustments. Select the composite RGB
curve or an individual red, green, or blue channel. Add and move points on the
graph; use the keyboard or numeric fields to edit a selected point precisely.

### Color mode

Choose **Color mode** to convert the image to grayscale or black-and-white.
Grayscale keeps transparent areas transparent. Black-and-white conversion uses
a threshold and composites transparent areas onto white.

While an adjustment or Export dialog is open, the image preview is not
interactive and other editing tools are temporarily unavailable.

## Navigate the image

### Zoom and pan

- Use the **Zoom in** and **Zoom out** buttons in the left toolbar, or the zoom
  panel over the preview, to change magnification.
- Choose **Fit to window** to fit the image into the available preview area,
  or **Actual size** to view it at 100%.
- Select **Pan** in the left toolbar and drag the image to reposition it. While
  using Crop, you can also hold **Space** and drag to pan without leaving the
  tool.
- Hold **Ctrl** (Windows/Linux) or **Command** (macOS) while scrolling to zoom.
  The same modifier with **+** or **-** also zooms.

Zoom ranges from 1% to 3200%. Fit-to-window can enlarge small images as well as
shrink large ones. Releasing a moving drag can continue the pan with momentum;
reduced-motion preferences disable this effect.

### Pixel rulers and motion

Select **Pixel rulers** in the top bar to show or hide rulers that measure the
current image in pixels. Rulers are not included in exported images.

Use the animated zoom and pan button in the top bar to enable or disable
navigation animations. Your preference is saved; the system's reduced-motion
setting always takes precedence and disables animation.

## Keyboard shortcuts

Shortcuts that use the platform modifier mean **Ctrl** on Windows/Linux and
**Command (⌘)** on macOS.

| Shortcut | Action |
| --- | --- |
| Ctrl/Command + scroll | Zoom in or out around the pointer |
| Ctrl/Command + `+` or `=` | Zoom in |
| Ctrl/Command + `-` | Zoom out |
| Ctrl/Command + **Z** | Undo the last applied edit |
| Ctrl/Command + **Y** or Ctrl/Command + **Shift + Z** | Redo the last undone edit |
| **Space** + drag while Crop is active | Pan the preview |
| **Shift** while drawing or resizing a crop | Constrain the crop to a square |
| Arrow keys on a focused crop handle | Resize the crop by one pixel |
| **Shift** + arrow keys on a focused crop handle | Resize while keeping the crop square |
| Arrow keys on the focused Eyedropper preview | Move the sampling point by one image pixel |
| **Shift** + arrow keys on the focused Eyedropper preview | Move the sampling point by ten image pixels |
| **Enter** or **Space** on the focused Eyedropper preview | Sample the current pixel |
| **Enter** while Crop, Straighten, Resize, or Rotate controls are focused | Apply the current edit (on the Straighten icon, re-level the guide without applying) |
| **Escape** while an edit tool or dialog is active | Cancel the current preview or close the dialog |
| Arrow keys on a toolbar or dialog grip | Move the toolbar or dialog |
| **Shift** + arrow keys on a toolbar or dialog grip | Move it by a larger step |
| **Home** or double-click a toolbar/dialog grip | Reset its position |

Keyboard shortcuts do not trigger while typing in text, number, or selection
fields. Crop-handle and grip shortcuts work when those controls have keyboard
focus. In adjustment and export dialogs, use the visible **Apply** or
**Download** button to confirm the action; **Escape** cancels.

## Undo, redo, and cancel edits

Select **Undo** or **Redo** in the left toolbar. Keyboard shortcuts are
**Ctrl+Z** / **Ctrl+Y** on Windows and Linux, or **Command+Z** /
**Command+Y** on macOS. Redo also works with **Shift+Z** and the platform's
modifier key.

Only applied edits are added to history; previews do not count. History keeps
the three most recent applied edits. Opening another image clears that
image's history. There is no command to reset the entire document to the
imported image, so use Undo to step back through applied changes.

## Rename and export

Select the filename, its extension, or the pen icon in the top bar to edit the
name. Only the filename can be changed; the extension is chosen by the export
format. Press **Enter** or click away to save, or press **Escape** to cancel.
Renaming changes the download name, not the source file.

1. Select **Export** in the left toolbar.
2. Choose **PNG**, **JPEG**, or **WebP**. For JPEG and WebP, optionally choose
   a quality preset.
3. Review the encoded preview and file size.
4. Select **Download** to save the exported image, or **Cancel** or **Escape**
   to close without downloading.

PNG is lossless. JPEG and WebP quality presets affect encoding quality; they
are not a percentage of the original file size. JPEG transparency is replaced
with white; PNG and WebP preserve transparency. Re-encoding does not guarantee
a smaller file. Export downloads the full image dimensions and does not
overwrite the source image.

The browser cannot confirm that a download has finished. ImageTrimmer warns when
you try to leave or replace an image with edits that have not been downloaded.

## Floating toolbars on narrow windows

Toolbars stay on one line: their controls do not wrap into multiple rows and
have no internal scrollbars. The optional angle
slider in standard Crop hides on narrower windows; its numeric angle field remains available.

For Crop, Straighten, Resize, Rotate, and Eyedropper, when the browser window is narrower than a
toolbar, part of the toolbar can extend beyond the window edge. The dotted grip
is kept within reach, but that does **not** mean every control remains visible.

Drag the grip to reposition the toolbar. You can also focus the grip and use
the arrow keys; hold **Shift** for larger steps. Press **Home** or double-click
the grip to restore its opening position. Resizing the window keeps the
toolbar near its current position and only moves it as needed to keep the grip
reachable; the toolbar is not automatically recentered when the window grows.

The Levels and Curves dialogs use compact layouts on smaller windows. If a
dialog's fields do not all fit vertically, scroll within the dialog; its title
and Apply/Cancel actions remain available. Movable dialogs can also be dragged
by their grip.

## Privacy and image formats

ImageTrimmer processes the image in your browser. It does not upload image data
or metadata to a server. Choosing an image uses the browser's file picker, and
export uses a normal browser download.

PNG and WebP retain transparency. JPEG does not support transparency, so
transparent areas are composited onto white. Unsupported source formats
default to PNG when exporting.

## Use the Chrome extension

The optional unpacked Chrome extension opens ImageTrimmer in a new browser tab.
To install it for local use:

1. Build it with `npm run build:extension` from the project directory.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the generated `dist-extension` folder.
4. Pin ImageTrimmer and select its toolbar button to open a new editor tab.

The extension uses the same local file picker and browser download as the web
app. It does not read images from websites or request website-access
permissions. Reload it from `chrome://extensions` after rebuilding.

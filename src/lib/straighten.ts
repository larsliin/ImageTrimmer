import { largestCropInsideRotatedImage, type CropRect, type Point } from './crop.ts';
import type { Size } from './zoom';

export const MAX_LEVEL_ANGLE = 90;
export const MIN_LEVEL_LINE_DISPLAY_PIXELS = 8;

// Keep a one-pixel margin so smoothing at the rotated edge never leaves partly transparent border pixels.
const EDGE_MARGIN = 1;

export function isValidLevelAngle(angle: number): boolean {
    return Number.isFinite(angle) && Math.abs(angle) <= MAX_LEVEL_ANGLE;
}

// Rotation (degrees, clockwise-positive like canvas) that makes the line a-b horizontal.
// The shortest correction is used, so the result is within Â±90Â° and independent of point order.
export function levelingAngle(a: Point, b: Point): number {
    let lineAngle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (lineAngle > 90) lineAngle -= 180;
    else if (lineAngle <= -90) lineAngle += 180;
    const correction = Math.round(-lineAngle * 100) / 100;
    return correction === 0 ? 0 : correction;
}

// Points are in source pixels; `display` is the on-screen (CSS pixel) size of the whole image.
export function levelLineProblem(a: Point, b: Point, source: Size, display: Size): string | null {
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || source.width <= 0 || source.height <= 0) {
        return 'The points are not valid.';
    }
    if (a.x === b.x && a.y === b.y) return 'Choose a second point that is different from the first.';
    const length = Math.hypot((b.x - a.x) * display.width / source.width, (b.y - a.y) * display.height / source.height);
    return length < MIN_LEVEL_LINE_DISPLAY_PIXELS
        ? `Choose a second point at least ${MIN_LEVEL_LINE_DISPLAY_PIXELS} pixels away from the first.`
        : null;
}

// Largest centered crop of the source-sized frame that contains only image pixels after rotating by `angle`.
export function straightenCrop(source: Size, angle: number): CropRect {
    if (angle === 0) return { x: 0, y: 0, width: source.width, height: source.height };
    const margin = Math.min(EDGE_MARGIN, Math.floor((Math.min(source.width, source.height) - 1) / 2));
    const inner = largestCropInsideRotatedImage(
        { width: source.width - 2 * margin, height: source.height - 2 * margin },
        angle,
    );
    return { ...inner, x: inner.x + margin, y: inner.y + margin };
}

// Source pixels to the cropped preview, using the same clockwise, center-based transform as drawStraightened.
export function sourceToStraightenedPoint(point: Point, source: Size, angle: number, crop: CropRect): Point {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = point.x - source.width / 2;
    const y = point.y - source.height / 2;
    return {
        x: x * cos - y * sin + source.width / 2 - crop.x,
        y: x * sin + y * cos + source.height / 2 - crop.y,
    };
}

// Inverse of sourceToStraightenedPoint for the uncropped (source-sized) preview frame.
export function straightenedToSourcePoint(point: Point, source: Size, angle: number): Point {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = point.x - source.width / 2;
    const y = point.y - source.height / 2;
    return {
        x: x * cos + y * sin + source.width / 2,
        y: -x * sin + y * cos + source.height / 2,
    };
}

// The one transform behind both the live preview and the applied edit; always starts from the unrotated source.
export function drawStraightened(
    context: CanvasRenderingContext2D,
    source: ImageBitmap,
    angleDegrees: number,
    crop: CropRect,
) {
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.translate(-crop.x, -crop.y);
    context.translate(source.width / 2, source.height / 2);
    context.rotate(angleDegrees * Math.PI / 180);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    context.restore();
}

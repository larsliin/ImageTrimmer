import type { Size } from './zoom';

export interface CropRect {
    x: number
    y: number
    width: number
    height: number
}

export interface Point {
    x: number
    y: number
}

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function isValidCrop(crop: CropRect, image: Size): boolean {
    return (
        [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
    && crop.x >= 0
    && crop.y >= 0
    && crop.width > 0
    && crop.height > 0
    && crop.x + crop.width <= image.width
    && crop.y + crop.height <= image.height
    );
}

export function snapCropToPixels(crop: CropRect, image: Size): CropRect {
    const x = Math.max(0, Math.min(image.width - 1, Math.round(crop.x)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(crop.y)));
    const right = Math.min(image.width, Math.max(x + 1, Math.round(crop.x + crop.width)));
    const bottom = Math.min(image.height, Math.max(y + 1, Math.round(crop.y + crop.height)));
    return { x, y, width: right - x, height: bottom - y };
}

export const MAX_STRAIGHTEN_ANGLE = 45;

export function isValidAngle(angle: number): boolean {
    return Number.isFinite(angle) && Math.abs(angle) <= MAX_STRAIGHTEN_ANGLE;
}

// The image is rotated around its center; its canvas frame stays the same size as the source.
export function isCropInsideRotatedImage(crop: CropRect, image: Size, angleDegrees: number): boolean {
    const radians = angleDegrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const epsilon = 1e-6;
    const corners: [number, number][] = [
        [crop.x, crop.y],
        [crop.x + crop.width, crop.y],
        [crop.x, crop.y + crop.height],
        [crop.x + crop.width, crop.y + crop.height],
    ];
    return corners.every(([cx, cy]) => {
        const dx = cx - image.width / 2;
        const dy = cy - image.height / 2;
        const x = dx * cos + dy * sin;
        const y = -dx * sin + dy * cos;
        return Math.abs(x) <= image.width / 2 + epsilon && Math.abs(y) <= image.height / 2 + epsilon;
    });
}

// Largest centered crop with the image's aspect ratio that contains no empty corners after rotation.
export function largestCropInsideRotatedImage(image: Size, angleDegrees: number): CropRect {
    const radians = Math.abs(angleDegrees) * Math.PI / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const scale = Math.min(
        image.width / (image.width * cos + image.height * sin),
        image.height / (image.width * sin + image.height * cos),
        1,
    );
    let width = Math.max(1, Math.floor(image.width * scale));
    let height = Math.max(1, Math.floor(image.height * scale));
    for (;;) {
        const crop = {
            x: Math.floor((image.width - width) / 2),
            y: Math.floor((image.height - height) / 2),
            width,
            height,
        };
        if ((width === 1 && height === 1) || isCropInsideRotatedImage(crop, image, angleDegrees)) return crop;
        width = Math.max(1, width - 2);
        height = Math.max(1, height - 2);
    }
}

export function constrainCropInsideRotatedImage(crop: CropRect, image: Size, angleDegrees: number, snapToPixel = false): CropRect {
    if (!snapToPixel && isCropInsideRotatedImage(crop, image, angleDegrees)) return { ...crop };
    const radians = angleDegrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const centerX = image.width / 2;
    const centerY = image.height / 2;
    let scale = 1;
    for (const x of [crop.x, crop.x + crop.width]) {
        for (const y of [crop.y, crop.y + crop.height]) {
            const dx = x - centerX;
            const dy = y - centerY;
            const sourceX = Math.abs(dx * cos + dy * sin);
            const sourceY = Math.abs(-dx * sin + dy * cos);
            if (sourceX > centerX) scale = Math.min(scale, centerX / sourceX);
            if (sourceY > centerY) scale = Math.min(scale, centerY / sourceY);
        }
    }
    // Leave room for floating-point arithmetic at the rotated boundary.
    if (scale < 1) scale *= 1 - 1e-12;
    const left = centerX + (crop.x - centerX) * scale;
    const top = centerY + (crop.y - centerY) * scale;
    const constrained = {
        x: left,
        y: top,
        width: Math.min(crop.width * scale, image.width - left),
        height: Math.min(crop.height * scale, image.height - top),
    };
    if (!snapToPixel) return constrained;
    const x = Math.ceil(constrained.x);
    const y = Math.ceil(constrained.y);
    const snapped = {
        x,
        y,
        width: Math.floor(constrained.x + constrained.width) - x,
        height: Math.floor(constrained.y + constrained.height) - y,
    };
    return isValidCrop(snapped, image) ? snapped : constrained;
}

// Clamp a drag along its path while preserving un-dragged dimensions and resize anchors.
export function constrainCropDrag(
    previous: CropRect,
    requested: CropRect,
    image: Size,
    angleDegrees: number,
    snapToPixel = false,
): CropRect {
    const normalize = (crop: CropRect) => snapToPixel ? snapCropToPixels(crop, image) : crop;
    const start = normalize(previous);
    if (!isValidCrop(start, image) || !isCropInsideRotatedImage(start, image, angleDegrees)) {
        return constrainCropInsideRotatedImage(previous, image, angleDegrees);
    }
    const finish = normalize(requested);
    if (!isValidCrop(finish, image)) return { ...start };
    if (isCropInsideRotatedImage(finish, image, angleDegrees)) return finish;

    let validFraction = 0;
    let invalidFraction = 1;
    for (let iteration = 0; iteration < 48; iteration++) {
        const fraction = (validFraction + invalidFraction) / 2;
        const candidate = normalize({
            x: start.x + (finish.x - start.x) * fraction,
            y: start.y + (finish.y - start.y) * fraction,
            width: start.width + (finish.width - start.width) * fraction,
            height: start.height + (finish.height - start.height) * fraction,
        });
        if (isValidCrop(candidate, image) && isCropInsideRotatedImage(candidate, image, angleDegrees)) {
            validFraction = fraction;
        } else {
            invalidFraction = fraction;
        }
    }

    return normalize({
        x: start.x + (finish.x - start.x) * validFraction,
        y: start.y + (finish.y - start.y) * validFraction,
        width: start.width + (finish.width - start.width) * validFraction,
        height: start.height + (finish.height - start.height) * validFraction,
    });
}

export function previewToImagePoint(
    point: Point,
    preview: { left: number; top: number; width: number; height: number },
    image: Size,
    snapToPixel = true,
): Point {
    if (preview.width <= 0 || preview.height <= 0) {
        throw new Error('The image preview has no drawable area.');
    }
    const convert = (coordinate: number, origin: number, previewLength: number, imageLength: number) => {
        const imageCoordinate = Math.max(0, Math.min(imageLength, (coordinate - origin) * imageLength / previewLength));
        return snapToPixel ? Math.round(imageCoordinate) : imageCoordinate;
    };
    return {
        x: convert(point.x, preview.left, preview.width, image.width),
        y: convert(point.y, preview.top, preview.height, image.height),
    };
}

export function cropFromPoints(start: Point, end: Point): CropRect {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

export function squareCropFromPoints(start: Point, end: Point, image: Size): CropRect {
    const directionX = end.x < start.x ? -1 : 1;
    const directionY = end.y < start.y ? -1 : 1;
    const side = Math.min(
        Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)),
        directionX < 0 ? start.x : image.width - start.x,
        directionY < 0 ? start.y : image.height - start.y,
    );
    return cropFromPoints(start, {
        x: start.x + directionX * side,
        y: start.y + directionY * side,
    });
}

export function moveCrop(crop: CropRect, delta: Point, image: Size): CropRect {
    return {
        ...crop,
        x: Math.max(0, Math.min(image.width - crop.width, crop.x + delta.x)),
        y: Math.max(0, Math.min(image.height - crop.height, crop.y + delta.y)),
    };
}

export function resizeCrop(crop: CropRect, handle: CropHandle, delta: Point, image: Size, square = false): CropRect {
    let left = crop.x;
    let top = crop.y;
    let right = crop.x + crop.width;
    let bottom = crop.y + crop.height;
    if (handle.includes('w')) left = Math.max(0, Math.min(right - 1, left + delta.x));
    if (handle.includes('e')) right = Math.min(image.width, Math.max(left + 1, right + delta.x));
    if (handle.includes('n')) top = Math.max(0, Math.min(bottom - 1, top + delta.y));
    if (handle.includes('s')) bottom = Math.min(image.height, Math.max(top + 1, bottom + delta.y));
    if (square && handle.length === 2) {
        const west = handle.includes('w');
        const north = handle.includes('n');
        const anchorX = west ? right : left;
        const anchorY = north ? bottom : top;
        const side = Math.min(
            Math.max(right - left, bottom - top),
            west ? anchorX : image.width - anchorX,
            north ? anchorY : image.height - anchorY,
        );
        return {
            x: west ? anchorX - side : anchorX,
            y: north ? anchorY - side : anchorY,
            width: side,
            height: side,
        };
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

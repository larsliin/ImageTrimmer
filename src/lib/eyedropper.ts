export interface ImagePixel {
    x: number
    y: number
}

export interface RgbaColor {
    red: number
    green: number
    blue: number
    alpha: number
}

export interface EyedropperSelection {
    hex: string
}

export function imagePixelFromClient(
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    imageWidth: number,
    imageHeight: number,
): ImagePixel | null {
    if (bounds.width <= 0 || bounds.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;

    const relativeX = (clientX - bounds.left) / bounds.width;
    const relativeY = (clientY - bounds.top) / bounds.height;
    if (relativeX < 0 || relativeY < 0 || relativeX >= 1 || relativeY >= 1) return null;

    return {
        x: Math.floor(relativeX * imageWidth),
        y: Math.floor(relativeY * imageHeight),
    };
}

export function formatRgbaHex(color: RgbaColor): string {
    const channels = [color.red, color.green, color.blue, ...(color.alpha === 255 ? [] : [color.alpha])];
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

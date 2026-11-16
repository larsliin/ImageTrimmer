import type { CropHandle } from './crop';

const paths = ['M6 6a12 12 0 0 1 12 12', 'M9 3 6 6l3 3', 'm15 15 3 3 3-3']
    .map(d => `<path d="${d}"/>`).join('');

function rotationCursor(degrees: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(${degrees} 12 12)"><g stroke="white" stroke-width="4">${paths}</g><g stroke="black" stroke-width="2">${paths}</g></g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}

export const rotationCursors: Partial<Record<CropHandle, string>> = {
    ne: rotationCursor(0),
    se: rotationCursor(90),
    sw: rotationCursor(180),
    nw: rotationCursor(270),
};

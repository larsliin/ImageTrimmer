export const RULER_THICKNESS = 20;

export interface RulerTick {
    value: number
    position: number
    major: boolean
}

export function rulerTicks(imageLength: number, displayLength: number, offset: number, viewportLength: number): RulerTick[] {
    if (![imageLength, displayLength, offset, viewportLength].every(Number.isFinite)
        || imageLength <= 0 || displayLength <= 0 || viewportLength < 0) {
        throw new RangeError('Rulers require positive image dimensions and a non-negative viewport length.');
    }
    const scale = displayLength / imageLength;
    const targetStep = Math.max(1, 64 / scale);
    const magnitude = 10 ** Math.floor(Math.log10(targetStep));
    const majorStep = ([1, 2, 5].find((step) => step * magnitude >= targetStep) ?? 10) * magnitude;
    const minorStep = majorStep >= 5 ? majorStep / 5 : 1;
    const start = Math.ceil(-offset / scale / minorStep);
    const end = Math.floor((viewportLength - offset) / scale / minorStep);
    const ticks: RulerTick[] = [];
    for (let index = start; index <= end; index++) {
        const value = index * minorStep;
        ticks.push({ value, position: offset + value * scale, major: value % majorStep === 0 });
    }
    return ticks;
}

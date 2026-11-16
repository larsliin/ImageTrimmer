import assert from 'node:assert/strict';
import test from 'node:test';
import { isCropInsideRotatedImage, previewToImagePoint } from '../crop.ts';
import {
    drawStraightened,
    isValidLevelAngle,
    levelingAngle,
    levelLineProblem,
    MAX_LEVEL_ANGLE,
    sourceToStraightenedPoint,
    straightenCrop,
} from '../straighten.ts';

const image = { width: 400, height: 300 };

test('source points rotate clockwise about the image center and translate into crop coordinates', () => {
    const point = { x: 240, y: 180 };
    const crop = { x: 10, y: 20, width: 300, height: 200 };
    for (const [angle, expected] of [
        [0, { x: 230, y: 160 }],
        [90, { x: 160, y: 170 }],
        [-90, { x: 220, y: 90 }],
    ] as const) {
        assert.deepEqual(sourceToStraightenedPoint(point, image, angle, crop), expected);
    }
});

test('transformed reference lines level horizontally in either endpoint order for landscape and portrait previews', () => {
    for (const source of [image, { width: 300, height: 400 }]) {
        for (const rise of [-50, 0, 50]) {
            const a = { x: source.width / 2 - 50, y: source.height / 2 - rise / 2 };
            const b = { x: a.x + 100, y: a.y + rise };
            for (const [start, end] of [[a, b], [b, a]]) {
                assert.ok(start && end);
                const angle = levelingAngle(start, end);
                const crop = straightenCrop(source, angle);
                const first = sourceToStraightenedPoint(start, source, angle, crop);
                const second = sourceToStraightenedPoint(end, source, angle, crop);
                assert.ok(Math.abs(first.y - second.y) < 0.02, `${angle} levels the line (angle rounded to 0.01°)`);
                for (const point of [first, second]) {
                    assert.ok(point.x > 0 && point.x < crop.width && point.y > 0 && point.y < crop.height);
                }
                const center = sourceToStraightenedPoint({ x: source.width / 2, y: source.height / 2 }, source, angle, crop);
                assert.deepEqual(center, { x: source.width / 2 - crop.x, y: source.height / 2 - crop.y });
            }
        }
    }
});

test('overlay coordinates match drawStraightened at oblique angles without clamping cropped-out points', () => {
    for (const source of [image, { width: 300, height: 400 }]) {
        for (const angle of [-90, -37, -0.5, 0, 0.5, 28, 90]) {
            const crop = straightenCrop(source, angle);
            // Evaluate the actual canvas operations on a source pixel, in reverse transform order.
            // eslint-disable-next-line no-unused-vars
            const transforms: ((point: { x: number, y: number }) => { x: number, y: number })[] = [];
            let drawnPoint = { x: 0, y: 0 };
            const pixel = { x: 0, y: source.height / 3 };
            const context = {
                save() {}, restore() {},
                translate(x: number, y: number) {
                    transforms.push(point => ({ x: point.x + x, y: point.y + y }));
                },
                rotate(radians: number) {
                    transforms.push(point => ({
                        x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
                        y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
                    }));
                },
                drawImage(_source: ImageBitmap, x: number, y: number) {
                    drawnPoint = transforms.reduceRight((point, transform) => transform(point), { x: pixel.x + x, y: pixel.y + y });
                },
            } as unknown as CanvasRenderingContext2D;
            drawStraightened(context, source as ImageBitmap, angle, crop);
            const overlayPoint = sourceToStraightenedPoint(pixel, source, angle, crop);
            assert.ok(Math.abs(overlayPoint.x - drawnPoint.x) < 1e-8, `${angle} x matches canvas`);
            assert.ok(Math.abs(overlayPoint.y - drawnPoint.y) < 1e-8, `${angle} y matches canvas`);
        }
    }
});

test('leveling angle rotates the clicked line to horizontal, with canvas clockwise-positive sign', () => {
    assert.equal(levelingAngle({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    assert.equal(levelingAngle({ x: 0, y: 0 }, { x: 100, y: 100 }), -45);
    assert.equal(levelingAngle({ x: 0, y: 100 }, { x: 100, y: 0 }), 45);
    assert.equal(levelingAngle({ x: 0, y: 0 }, { x: 100, y: 10 }), -5.71);
});

test('leveling angle is the shortest correction and independent of point order', () => {
    const a = { x: 10, y: 20 };
    for (const b of [{ x: 210, y: 70 }, { x: -190, y: 70 }, { x: 10, y: 220 }, { x: 10, y: -180 }, { x: -90, y: 20 }, { x: 110, y: -60 }]) {
        const forward = levelingAngle(a, b);
        assert.equal(forward, levelingAngle(b, a), `order of ${JSON.stringify(b)}`);
        assert.ok(forward >= -MAX_LEVEL_ANGLE && forward <= MAX_LEVEL_ANGLE);
    }
    assert.equal(Math.abs(levelingAngle({ x: 0, y: 0 }, { x: 0, y: 50 })), 90);
    assert.equal(levelingAngle({ x: 0, y: 0 }, { x: -100, y: 0 }), 0);
    assert.equal(levelingAngle({ x: 0, y: 0 }, { x: -100, y: -100 }), -45);
});

test('level angle validation accepts only finite angles within 90 degrees', () => {
    for (const angle of [0, -90, 90, 12.34]) assert.equal(isValidLevelAngle(angle), true);
    for (const angle of [90.01, -91, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(isValidLevelAngle(angle), false);
});

test('rejects coincident, too-short and non-finite lines using on-screen length', () => {
    const display = { width: 200, height: 150 }; // 0.5 display pixels per source pixel
    const a = { x: 100, y: 100 };
    assert.match(levelLineProblem(a, { ...a }, image, display) ?? '', /different/);
    assert.match(levelLineProblem(a, { x: 114, y: 100 }, image, display) ?? '', /8 pixels/);
    assert.equal(levelLineProblem(a, { x: 116, y: 100 }, image, display), null);
    assert.match(levelLineProblem(a, { x: Number.NaN, y: 0 }, image, display) ?? '', /not valid/);
    // The same source distance is long enough when the preview is zoomed in.
    assert.equal(levelLineProblem(a, { x: 104, y: 100 }, image, { width: 800, height: 600 }), null);
});

test('clicks convert from displayed pixels to source coordinates at any preview size', () => {
    const preview = { left: 50, top: 20, width: 200, height: 150 };
    assert.deepEqual(previewToImagePoint({ x: 150, y: 95 }, preview, image, false), { x: 200, y: 150 });
    assert.deepEqual(previewToImagePoint({ x: 151, y: 95 }, preview, image, false), { x: 202, y: 150 });
    const zoomed = { left: 0, top: 0, width: 1600, height: 1200 };
    assert.deepEqual(previewToImagePoint({ x: 401, y: 100 }, zoomed, image, false), { x: 100.25, y: 25 });
});

test('straighten crop is untouched at zero and contains only image pixels otherwise', () => {
    assert.deepEqual(straightenCrop(image, 0), { x: 0, y: 0, width: 400, height: 300 });
    for (const angle of [0.5, -3.25, 10, -30, 45, 60, -89, 90]) {
        const crop = straightenCrop(image, angle);
        assert.ok(Number.isInteger(crop.x) && Number.isInteger(crop.y) && crop.width >= 1 && crop.height >= 1, `${angle}`);
        assert.ok(isCropInsideRotatedImage(crop, image, angle), `${angle} stays inside the rotated image`);
        // One-pixel margin: the crop never touches the rotated source edge.
        const inset = { x: crop.x - 1, y: crop.y - 1, width: crop.width, height: crop.height };
        assert.ok(isCropInsideRotatedImage(inset, { width: image.width - 2, height: image.height - 2 }, angle), `${angle} margin`);
        assert.ok(Math.abs(crop.x + crop.width / 2 - 200) <= 1 && Math.abs(crop.y + crop.height / 2 - 150) <= 1, `${angle} centered`);
    }
    assert.ok(straightenCrop(image, 10).width < straightenCrop(image, 2).width);
});

test('tiny images still produce a valid crop', () => {
    for (const size of [{ width: 1, height: 1 }, { width: 2, height: 3 }, { width: 3, height: 3 }]) {
        const crop = straightenCrop(size, 20);
        assert.ok(crop.width >= 1 && crop.height >= 1);
    }
});

test('drawStraightened rotates about the image center from the unchanged source and translates by the crop', () => {
    const calls: unknown[][] = [];
    const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
    const context = {
        save: record('save'), restore: record('restore'), translate: record('translate'), rotate: record('rotate'),
        drawImage: record('drawImage'),
        set imageSmoothingEnabled(value: boolean) { calls.push(['smoothing', value]); },
        set imageSmoothingQuality(value: string) { calls.push(['quality', value]); },
    } as unknown as CanvasRenderingContext2D;
    const source = { width: 400, height: 300 } as ImageBitmap;
    drawStraightened(context, source, 90, { x: 10, y: 20, width: 100, height: 50 });
    assert.deepEqual(calls, [
        ['save'], ['smoothing', true], ['quality', 'high'],
        ['translate', -10, -20], ['translate', 200, 150], ['rotate', Math.PI / 2],
        ['drawImage', source, -200, -150], ['restore'],
    ]);
    calls.length = 0;
    for (const angle of [10, -30, 0]) {
        drawStraightened(context, source, angle, straightenCrop(source, angle));
    }
    assert.deepEqual(calls.filter(([name]) => name === 'drawImage'), [
        ['drawImage', source, -200, -150],
        ['drawImage', source, -200, -150],
        ['drawImage', source, -200, -150],
    ], 'angle changes and Redraw sample the unchanged source, never the previous output');
});

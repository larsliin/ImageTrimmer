import assert from 'node:assert/strict';
import test from 'node:test';
import { cropFromPoints, squareCropFromPoints, moveCrop, resizeCrop, snapCropToPixels, isValidCrop, previewToImagePoint, type CropHandle, largestCropInsideRotatedImage, isCropInsideRotatedImage, constrainCropInsideRotatedImage } from '../crop.ts';

test('rotated constraints snap inward even when the fractional crop already fits', () => {
    const image = { width: 800, height: 600 };
    const crop = { x: 300.2, y: 200.3, width: 100.6, height: 99.5 };
    for (const angle of [-90, -45, 0, 45, 90]) {
        const result = constrainCropInsideRotatedImage(crop, image, angle, true);
        assert.ok(Object.values(result).every(Number.isInteger));
        assert.ok(result.x >= crop.x && result.y >= crop.y);
        assert.ok(result.x + result.width <= crop.x + crop.width);
        assert.ok(result.y + result.height <= crop.y + crop.height);
        assert.equal(isCropInsideRotatedImage(result, image, angle), true);
    }
});

test('rotated constraints stay valid for edge and tiny crops across the entire Straighten range', () => {
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }, { width: 1, height: 1 }]) {
        for (const crop of [
            { x: 0, y: 0, ...image },
            { x: 0.1, y: 0.2, width: image.width / 2, height: image.height / 2 },
            { x: image.width - 0.4, y: image.height - 0.3, width: 0.3, height: 0.2 },
        ]) {
            for (let angle = -90; angle <= 90; angle++) {
                const fitted = constrainCropInsideRotatedImage(crop, image, angle);
                const snapped = constrainCropInsideRotatedImage(crop, image, angle, true);
                for (const result of [fitted, snapped]) {
                    assert.equal(isValidCrop(result, image), true, JSON.stringify({ image, crop, angle, result }));
                    assert.equal(isCropInsideRotatedImage(result, image, angle), true);
                }
                assert.ok(snapped.x >= fitted.x - 1e-8 && snapped.y >= fitted.y - 1e-8);
                assert.ok(snapped.x + snapped.width <= fitted.x + fitted.width + 1e-8);
                assert.ok(snapped.y + snapped.height <= fitted.y + fitted.height + 1e-8);
            }
        }
    }
});

test('pixel snapping keeps tiny selections non-empty and inside image bounds', () => {
    const image = { width: 800, height: 600 };
    for (const crop of [
        { x: 10.1, y: 20.1, width: 0.2, height: 0.2 },
        { x: 799.6, y: 599.6, width: 0.3, height: 0.3 },
    ]) {
        const snapped = snapCropToPixels(crop, image);
        assert.equal(isValidCrop(snapped, image), true);
        assert.equal(snapped.width, 1);
        assert.equal(snapped.height, 1);
        assert.ok(Object.values(snapped).every(Number.isInteger));
    }
});

test('accepts full image, edge-aligned, and single-pixel crops', () => {
    const image = { width: 800, height: 600 };
    assert.equal(isValidCrop({ x: 0, y: 0, ...image }, image), true);
    assert.equal(isValidCrop({ x: 799, y: 599, width: 1, height: 1 }, image), true);
    assert.equal(isValidCrop({ x: 100, y: 200, width: 700, height: 400 }, image), true);
});

test('square crops use the longer drag axis in all directions', () => {
    const image = { width: 800, height: 600 };
    const start = { x: 300, y: 300 };
    for (const dx of [-200, 200]) {
        for (const dy of [-100, 100]) {
            const crop = squareCropFromPoints(start, { x: start.x + dx, y: start.y + dy }, image);
            assert.deepEqual(crop, {
                x: dx < 0 ? 100 : 300,
                y: dy < 0 ? 100 : 300,
                width: 200,
                height: 200,
            });
            assert.equal(isValidCrop(crop, image), true);
        }
    }
    assert.equal(squareCropFromPoints(start, { x: 350, y: 500 }, image).width, 200);
});

test('square crops stay anchored and inside image edges', () => {
    const image = { width: 800, height: 600 };
    for (const [start, end, expected] of [
        [{ x: 750, y: 550 }, { x: 800, y: 600 }, { x: 750, y: 550, width: 50, height: 50 }],
        [{ x: 10, y: 100 }, { x: 0, y: 0 }, { x: 0, y: 90, width: 10, height: 10 }],
        [{ x: 700, y: 100 }, { x: 800, y: 500 }, { x: 700, y: 100, width: 100, height: 100 }],
    ] as const) {
        assert.deepEqual(squareCropFromPoints(start, end, image), expected);
        assert.equal(isValidCrop(expected, image), true);
    }
});

test('square crops support single-axis drags and leave clicks empty', () => {
    const image = { width: 800, height: 600 };
    const start = { x: 100, y: 100 };
    assert.deepEqual(squareCropFromPoints(start, { x: 300, y: 100 }, image),
        { x: 100, y: 100, width: 200, height: 200 });
    assert.deepEqual(squareCropFromPoints(start, { x: 100, y: 300 }, image),
        { x: 100, y: 100, width: 200, height: 200 });
    assert.equal(isValidCrop(squareCropFromPoints(start, start, image), image), false);
});

test('accepts fractional crop bounds and rejects empty, non-finite, and out-of-bounds crops', () => {
    const image = { width: 800, height: 600 };
    assert.equal(isValidCrop({ x: 0.5, y: 1.25, width: 20.5, height: 30.75 }, image), true);
    for (const crop of [
        { x: 0, y: 0, width: 0, height: 1 },
        { x: 0, y: 0, width: 1, height: -1 },
        { x: -1, y: 0, width: 1, height: 1 },
        { x: 0, y: -1, width: 1, height: 1 },
        { x: 799, y: 0, width: 2, height: 1 },
        { x: 0, y: 599, width: 1, height: 2 },
        { x: 0, y: 0, width: NaN, height: 1 },
        { x: Infinity, y: 0, width: 1, height: 1 },
    ]) {
        assert.equal(isValidCrop(crop, image), false);
    }
});

test('converts source coordinates at reduced and enlarged preview sizes', () => {
    const image = { width: 800, height: 600 };
    for (const zoom of [0.125, 0.5, 1, 2, 3]) {
        assert.deepEqual(
            previewToImagePoint(
                { x: 30 + 200 * zoom, y: 50 + 300 * zoom },
                { left: 30, top: 50, width: image.width * zoom, height: image.height * zoom },
                image,
            ),
            { x: 200, y: 300 },
        );
    }
});

test('uses actual rounded preview dimensions and clamps drags outside the image', () => {
    const preview = { left: -20, top: 40, width: 33, height: 67 };
    const image = { width: 100, height: 201 };
    assert.deepEqual(previewToImagePoint({ x: -40, y: 0 }, preview, image), { x: 0, y: 0 });
    assert.deepEqual(previewToImagePoint({ x: 100, y: 200 }, preview, image), { x: 100, y: 201 });
    assert.deepEqual(previewToImagePoint({ x: -3.5, y: 73.5 }, preview, image), { x: 50, y: 101 });
    assert.deepEqual(previewToImagePoint({ x: -3.5, y: 73.5 }, preview, image, false),
        { x: 50, y: 100.5 });
    assert.throws(() => previewToImagePoint({ x: 0, y: 0 }, { ...preview, width: 0 }, image));
});

test('supports drag selection in every direction and rejects click-only selections', () => {
    const expected = { x: 10, y: 20, width: 90, height: 180 };
    assert.deepEqual(cropFromPoints({ x: 10, y: 20 }, { x: 100, y: 200 }), expected);
    assert.deepEqual(cropFromPoints({ x: 100, y: 200 }, { x: 10, y: 20 }), expected);
    assert.deepEqual(cropFromPoints({ x: 100, y: 20 }, { x: 10, y: 200 }), expected);
    assert.deepEqual(cropFromPoints({ x: 10, y: 200 }, { x: 100, y: 20 }), expected);
    assert.equal(
        isValidCrop(cropFromPoints({ x: 10, y: 20 }, { x: 10, y: 20 }), { width: 100, height: 200 }),
        false,
    );
});

test('moves a crop without resizing or mutating the original selection', () => {
    const crop = { x: 100, y: 150, width: 200, height: 100 };
    assert.deepEqual(moveCrop(crop, { x: 50, y: -75 }, { width: 800, height: 600 }),
        { x: 150, y: 75, width: 200, height: 100 });
    assert.deepEqual(crop, { x: 100, y: 150, width: 200, height: 100 });
});

test('clamps crop movement to every image edge while preserving dimensions', () => {
    const image = { width: 800, height: 600 };
    const crop = { x: 100, y: 150, width: 200, height: 100 };
    for (const dx of [-1000, 1000]) {
        for (const dy of [-1000, 1000]) {
            const moved = moveCrop(crop, { x: dx, y: dy }, image);
            assert.deepEqual(moved, {
                x: dx < 0 ? 0 : 600,
                y: dy < 0 ? 0 : 500,
                width: 200,
                height: 100,
            });
            assert.equal(isValidCrop(moved, image), true);
        }
    }
    assert.deepEqual(moveCrop({ x: 0, y: 0, ...image }, { x: 50, y: -50 }, image),
        { x: 0, y: 0, ...image });
});

test('all eight handles resize only their corresponding edges', () => {
    const crop = { x: 100, y: 100, width: 200, height: 200 };
    const image = { width: 800, height: 600 };
    const handles: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (const handle of handles) {
        const resized = resizeCrop(crop, handle, { x: 20, y: 30 }, image);
        const left = handle.includes('w') ? 120 : 100;
        const top = handle.includes('n') ? 130 : 100;
        const right = handle.includes('e') ? 320 : 300;
        const bottom = handle.includes('s') ? 330 : 300;
        assert.deepEqual(resized, { x: left, y: top, width: right - left, height: bottom - top });
        for (const delta of [{ x: -1000, y: -1000 }, { x: 1000, y: 1000 }]) {
            assert.equal(isValidCrop(resizeCrop(crop, handle, delta, image), image), true);
        }
    }
    assert.deepEqual(resizeCrop(crop, 'nw', { x: 1000, y: 1000 }, image),
        { x: 299, y: 299, width: 1, height: 1 });
    assert.deepEqual(resizeCrop(crop, 'se', { x: 1000, y: 1000 }, image),
        { x: 100, y: 100, width: 700, height: 500 });
});

test('Shift corner resizing creates squares anchored to the opposite corner', () => {
    const crop = { x: 100, y: 100, width: 200, height: 100 };
    const image = { width: 800, height: 600 };
    for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
        for (const delta of [{ x: 20, y: 30 }, { x: -1000, y: -1000 }, { x: 1000, y: 1000 }]) {
            const result = resizeCrop(crop, handle, delta, image, true);
            assert.equal(result.width, result.height);
            assert.equal(isValidCrop(result, image), true);
            assert.equal(handle.includes('w') ? result.x + result.width : result.x,
                handle.includes('w') ? crop.x + crop.width : crop.x);
            assert.equal(handle.includes('n') ? result.y + result.height : result.y,
                handle.includes('n') ? crop.y + crop.height : crop.y);
        }
    }
    assert.deepEqual(resizeCrop(crop, 'se', { x: 50, y: 20 }, image, true),
        { x: 100, y: 100, width: 250, height: 250 });
    assert.deepEqual(resizeCrop(crop, 'se', { x: 1000, y: 1000 }, image, true),
        { x: 100, y: 100, width: 500, height: 500 });
    for (const handle of ['n', 'e', 's', 'w'] as const) {
        assert.deepEqual(resizeCrop(crop, handle, { x: 20, y: 30 }, image, true),
            resizeCrop(crop, handle, { x: 20, y: 30 }, image));
    }
});

test('straighten constrains edge selections without enlarging or changing their aspect ratio', () => {
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }]) {
        for (const x of [0, image.width - 200]) {
            for (const y of [0, image.height - 100]) {
                const crop = { x, y, width: 200, height: 100 };
                for (const angle of [-45, -15, -0.1, 0, 0.1, 15, 45]) {
                    for (const snap of [false, true]) {
                        const constrained = constrainCropInsideRotatedImage(crop, image, angle, snap);
                        assert.equal(isValidCrop(constrained, image), true);
                        assert.equal(isCropInsideRotatedImage(constrained, image, angle), true);
                        assert.ok(constrained.width <= crop.width && constrained.height <= crop.height);
                        if (snap) assert.ok(Object.values(constrained).every(Number.isInteger));
                        else assert.ok(Math.abs(constrained.width / constrained.height - 2) < 1e-10);
                        if (angle === 0) assert.deepEqual(constrained, crop);
                    }
                }
                assert.deepEqual(crop, { x, y, width: 200, height: 100 });
            }
        }
    }
});

test('straighten: zero angle keeps full image; rotation shrinks the safe crop', () => {
    const image = { width: 800, height: 600 };
    assert.deepEqual(largestCropInsideRotatedImage(image, 0), { x: 0, y: 0, width: 800, height: 600 });
    const crop = largestCropInsideRotatedImage(image, 5);
    assert.ok(crop.width < 800 && crop.height < 600);
    assert.ok(isCropInsideRotatedImage(crop, image, 5));
    assert.ok(isCropInsideRotatedImage(crop, image, -5));
    assert.ok(!isCropInsideRotatedImage({ x: 0, y: 0, width: 800, height: 600 }, image, 5));
    assert.ok(isValidCrop(crop, image));
});

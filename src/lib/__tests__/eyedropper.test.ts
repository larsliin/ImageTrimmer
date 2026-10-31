import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRgbaHex, imagePixelFromClient } from '../eyedropper.ts';

const bounds = { left: 20, top: 40, width: 200, height: 100 };

test('imagePixelFromClient maps scaled client positions to image pixels', () => {
    assert.deepEqual(imagePixelFromClient(120, 90, bounds, 1000, 500), { x: 500, y: 250 });
    assert.deepEqual(imagePixelFromClient(20, 40, bounds, 1000, 500), { x: 0, y: 0 });
    assert.deepEqual(imagePixelFromClient(219.9, 139.9, bounds, 1000, 500), { x: 999, y: 499 });
});

test('imagePixelFromClient rejects points outside the image and invalid dimensions', () => {
    assert.equal(imagePixelFromClient(220, 90, bounds, 1000, 500), null);
    assert.equal(imagePixelFromClient(120, 140, bounds, 1000, 500), null);
    assert.equal(imagePixelFromClient(19, 90, bounds, 1000, 500), null);
    assert.equal(imagePixelFromClient(20, 40, { ...bounds, width: 0 }, 1000, 500), null);
    assert.equal(imagePixelFromClient(20, 40, bounds, 0, 500), null);
});

test('formatRgbaHex omits opaque alpha and includes non-opaque alpha', () => {
    assert.equal(formatRgbaHex({ red: 12, green: 128, blue: 255, alpha: 255 }), '#0C80FF');
    assert.equal(formatRgbaHex({ red: 12, green: 128, blue: 255, alpha: 64 }), '#0C80FF40');
    assert.equal(formatRgbaHex({ red: 0, green: 0, blue: 0, alpha: 0 }), '#00000000');
});

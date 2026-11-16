import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { effectScope } from 'vue';
import { defaultCurves } from '../curves.ts';
import { straightenCrop } from '../straighten.ts';

// Resolve the app's Vite aliases and extensionless imports for Node's TS runner.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('@/')) {
            return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
        }
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
});

const { useImageDocument } = await import('../../composables/useImageDocument.ts');

class TestBitmap {
    closes = 0;
    width: number;
    height: number;
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
    close() {
        this.closes += 1;
        assert.equal(this.closes, 1, 'each bitmap must be closed exactly once');
    }
}

function setup(t: TestContext) {
    const bitmaps: TestBitmap[] = [];
    const files = [{ name: 'landscape.png', type: 'image/png', width: 80, height: 40, size: 1000 }];
    const downloads: Blob[] = [];
    const rotationAngles: number[] = [];
    const scales: number[][] = [];
    const context = {
        save() {},
        restore() {},
        drawImage() {},
        translate() {},
        scale(x: number, y: number) { scales.push([x, y]); },
        rotate(angle: number) { rotationAngles.push(angle); },
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData() {},
    };
    const browserWindow = Object.assign(new EventTarget(), { confirm: () => true });
    const browserDocument = {
        createElement(tag: string) {
            if (tag === 'input') {
                return Object.assign(new EventTarget(), {
                    files,
                    click() { this.dispatchEvent(new Event('change')); },
                });
            }
            if (tag === 'a') return { href: '', download: '', click() {} };
            assert.equal(tag, 'canvas');
            return {
                width: 0,
                height: 0,
                getContext: () => context,
                toBlob: (callback: globalThis.BlobCallback, type: string) => callback(new Blob(['image'], { type })),
            };
        },
    };
    let failProcessing = false;
    const globals = {
        window: browserWindow,
        document: browserDocument,
        createImageBitmap: async (source: { width: number; height: number }, ...crop: number[]) => {
            if (failProcessing) throw new Error('Test processing failure');
            const bitmap = new TestBitmap(crop[2] ?? source.width, crop[3] ?? source.height);
            bitmaps.push(bitmap);
            return bitmap;
        },
    };
    const restoreGlobals: (() => void)[] = [];
    for (const [key, value] of Object.entries(globals)) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        restoreGlobals.push(() => {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        });
    }
    const scope = effectScope();
    t.mock.method(URL, 'createObjectURL', (blob: Blob) => {
        downloads.push(blob);
        return 'blob:test-download';
    });
    t.mock.method(URL, 'revokeObjectURL', () => {});
    const editor = scope.run(useImageDocument)!;
    t.after(() => {
        try {
            scope.stop();
            for (const bitmap of bitmaps) assert.equal(bitmap.closes, 1);
        } finally {
            for (const restore of restoreGlobals) restore();
        }
    });
    return {
        editor, scope, bitmaps, files, rotationAngles, scales, downloads,
        fail: () => { failProcessing = true; },
    };
}

test('imports a provided file without opening the picker', async (t) => {
    const { editor } = setup(t);
    const file = Object.assign(new File([], 'dropped.png', { type: 'image/png' }), { width: 80, height: 40 });

    await editor.importImage(file);

    assert.equal(editor.info.value?.fileName, 'dropped.png');
    assert.deepEqual([editor.bitmap.value?.width, editor.bitmap.value?.height], [80, 40]);
});

test('Straighten applies selected framing as one undoable edit and exports its dimensions', async (t) => {
    const { editor, rotationAngles, downloads } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    const crop = { x: 30, y: 10, width: 20, height: 20 };
    assert.equal(await editor.straightenImage(crop, 90), true);
    assert.deepEqual(editor.info.value && [editor.info.value.width, editor.info.value.height], [20, 20]);
    assert.equal(rotationAngles.at(-1), Math.PI / 2);
    assert.equal(editor.canUndo.value, true);
    editor.undo();
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.canUndo.value, false, 'angle and crop share one history entry');
    editor.redo();
    assert.equal(editor.bitmap.value?.width, 20);
    await editor.exportImage();
    assert.equal(downloads.length, 1);
});

test('Straighten rejects invalid framing/angles without mutating history; zero angle can still crop', async (t) => {
    const { editor } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    const initial = straightenCrop({ width: 80, height: 40 }, 5);
    assert.equal(await editor.straightenImage(initial, 40), false);
    assert.equal(await editor.straightenImage(initial, 91), false);
    assert.equal(await editor.straightenImage({ ...initial, width: 0 }, 5), false);
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.canUndo.value, false);
    assert.equal(await editor.straightenImage({ x: 10, y: 10, width: 20, height: 15 }, 0), true);
    assert.deepEqual([editor.bitmap.value?.width, editor.bitmap.value?.height], [20, 15]);
    editor.undo();
    assert.equal(editor.bitmap.value, original);
});

test('only the last three edits can be undone and all three can be redone', async (t) => {
    const { editor, bitmaps } = setup(t);
    assert.equal(editor.canUndo.value, false);
    assert.equal(editor.canRedo.value, false);
    await editor.importImage();
    for (const width of [70, 60, 50, 40, 30]) {
        assert.equal(await editor.resizeImage({ width, height: 20 }), true);
    }
    assert.equal(bitmaps[1]!.closes, 1);
    assert.equal(bitmaps[0]!.closes, 0, 'the original stays available for reset');
    for (const width of [40, 50, 60]) {
        editor.undo();
        assert.equal(editor.bitmap.value?.width, width);
    }
    assert.equal(editor.canUndo.value, false);
    editor.undo();
    assert.equal(editor.bitmap.value?.width, 60);
    for (const width of [50, 40, 30]) {
        editor.redo();
        assert.equal(editor.bitmap.value?.width, width);
    }
    assert.equal(editor.canRedo.value, false);
});

for (const image of [{ width: 80, height: 40 }, { width: 40, height: 80 }]) {
    for (const turns of [1, 2, 3] as const) {
        test(`rotation applies ${turns} quarter-turns as one edit for ${image.width}x${image.height}`, async (t) => {
            const { editor, files, rotationAngles } = setup(t);
            Object.assign(files[0]!, image);
            await editor.importImage();
            const original = editor.bitmap.value;
            assert.equal(await editor.rotateImage(turns), true);
            assert.deepEqual(rotationAngles, [turns * Math.PI / 2]);
            assert.deepEqual(
                [editor.bitmap.value?.width, editor.bitmap.value?.height],
                turns % 2 === 0 ? [image.width, image.height] : [image.height, image.width],
            );
            const rotated = editor.bitmap.value;
            editor.undo();
            assert.equal(editor.bitmap.value, original);
            assert.equal(editor.canUndo.value, false);
            editor.redo();
            assert.equal(editor.bitmap.value, rotated);
        });
    }
}

test('zero rotation preserves the bitmap and redo history without processing', async (t) => {
    const { editor, rotationAngles } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    await editor.rotateImage();
    editor.undo();
    rotationAngles.length = 0;
    assert.equal(await editor.rotateImage(0), true);
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.canUndo.value, false);
    assert.equal(editor.canRedo.value, true);
    assert.deepEqual(rotationAngles, []);
});

test('a new edit clears redo and releases abandoned bitmaps, but not shared ones', async (t) => {
    const { editor, bitmaps } = setup(t);
    await editor.importImage();
    await editor.resizeImage({ width: 60, height: 30 });
    await editor.resizeImage({ width: 40, height: 20 });
    editor.undo();
    editor.renameImage('renamed');
    assert.equal(editor.canRedo.value, false);
    assert.equal(bitmaps[2]!.closes, 1);
    assert.equal(bitmaps[1]!.closes, 0);
    editor.undo();
    assert.equal(editor.info.value?.fileName, 'landscape.png');
    editor.redo();
    assert.equal(editor.info.value?.fileName, 'renamed.png');
});

test('no-op and failed edits preserve history; undo and redo are blocked while processing', async (t) => {
    const { editor, fail } = setup(t);
    await editor.importImage();
    await editor.resizeImage({ width: 60, height: 30 });
    editor.undo();
    await editor.resizeImage({ width: 80, height: 40 });
    await editor.cropImage({ x: 0, y: 0, width: 80, height: 40 });
    editor.renameImage('landscape');
    editor.setExportMimeType('image/png');
    assert.equal(editor.canRedo.value, true);
    await editor.resizeImage({ width: 0, height: 0 });
    assert.equal(editor.canRedo.value, true);
    fail();
    const pending = editor.rotateImage();
    assert.equal(editor.canUndo.value, false);
    assert.equal(editor.canRedo.value, false);
    editor.redo();
    assert.equal(editor.bitmap.value?.width, 80);
    assert.equal(await pending, false);
    assert.equal(editor.canRedo.value, true);
    assert.equal(editor.error.value, 'Test processing failure');
    editor.redo();
    assert.equal(editor.bitmap.value?.width, 60);
    assert.equal(editor.error.value, null);
});

test('crop, rotation, levels, curves and color-mode edits restore exact bitmap references', async (t) => {
    const { editor } = setup(t);
    await editor.importImage();
    const applyAndRestore = async (apply: () => Promise<boolean>) => {
        const before = editor.bitmap.value;
        assert.equal(await apply(), true);
        const after = editor.bitmap.value;
        assert.notEqual(after, before);
        editor.undo();
        assert.equal(editor.bitmap.value, before);
        editor.redo();
        assert.equal(editor.bitmap.value, after);
    };
    await applyAndRestore(() => editor.cropImage({ x: 1, y: 1, width: 60, height: 30 }));
    await applyAndRestore(() => editor.rotateImage());
    assert.deepEqual([editor.bitmap.value?.width, editor.bitmap.value?.height], [30, 60]);
    await applyAndRestore(() => editor.levelsImage({ black: 10, white: 240, gamma: 1 }));
    await applyAndRestore(() => editor.curvesImage({
        ...defaultCurves(),
        rgb: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }],
    }));
    await applyAndRestore(() => editor.colorModeImage('bitmap'));
    assert.equal(editor.info.value?.exportMimeType, 'image/png');
    assert.equal(editor.info.value?.fileName, 'landscape.png');
    editor.undo();
    assert.equal(editor.info.value?.exportMimeType, 'image/png');
    assert.equal(editor.info.value?.fileName, 'landscape.png');
});

test('reset is undoable and format and filename follow history', async (t) => {
    const { editor } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    await editor.resizeImage({ width: 30, height: 60 });
    const resized = editor.bitmap.value;
    editor.setExportMimeType('image/jpeg');
    editor.renameImage('portrait');
    editor.resetImage();
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.info.value?.fileName, 'portrait.jpg');
    editor.undo();
    assert.equal(editor.bitmap.value, resized);
    editor.undo();
    assert.equal(editor.info.value?.fileName, 'landscape.jpg');
    editor.undo();
    assert.equal(editor.info.value?.exportMimeType, 'image/png');
});

test('import clears history and releases old resources; disposal closes an in-flight result', async (t) => {
    const { editor, scope, bitmaps, files } = setup(t);
    await editor.importImage();
    await editor.rotateImage();
    editor.undo();
    files[0] = { name: 'portrait.png', type: 'image/png', width: 40, height: 80, size: 2000 };
    await editor.importImage();
    assert.equal(editor.canUndo.value, false);
    assert.equal(editor.canRedo.value, false);
    assert.equal(editor.isDirty.value, false);
    assert.equal(bitmaps[0]!.closes, 1);
    assert.equal(bitmaps[1]!.closes, 1);
    const pending = editor.rotateImage();
    scope.stop();
    assert.equal(await pending, false);
});

test('undoing to an exported state is clean and redo restores its saved revision', async (t) => {
    const { editor } = setup(t);
    await editor.importImage();
    await editor.rotateImage();
    await editor.exportImage();
    assert.equal(editor.isDirty.value, false);
    await editor.resizeImage({ width: 10, height: 20 });
    assert.equal(editor.isDirty.value, true);
    editor.undo();
    assert.equal(editor.isDirty.value, false);
    editor.undo();
    assert.equal(editor.isDirty.value, true);
    editor.redo();
    assert.equal(editor.isDirty.value, false);
});

test('downloads the exact prepared blob without re-encoding and remembers its format', async (t) => {
    const { editor, downloads } = setup(t);
    await editor.importImage();
    assert.equal(editor.originalFileSize.value, 1000);
    const bitmap = editor.bitmap.value!;
    const blob = new Blob(['exact encoded bytes'], { type: 'image/webp' });

    assert.equal(await editor.exportImage({ bitmap, blob, mimeType: 'image/webp' }), true);
    assert.deepEqual(downloads, [blob]);
    assert.equal(downloads[0], blob);
    assert.equal(editor.info.value?.fileName, 'landscape.webp');
    assert.equal(editor.info.value?.exportMimeType, 'image/webp');
    assert.equal(editor.isDirty.value, false);
    assert.equal(editor.bitmap.value, bitmap, 'compression must not alter editing pixels');
});

test('rejects stale exports and mismatched formats without downloading or marking edits saved', async (t) => {
    const { editor, downloads } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value!;
    await editor.resizeImage({ width: 20, height: 10 });
    const blob = new Blob(['png'], { type: 'image/png' });
    assert.equal(await editor.exportImage({ bitmap: original, blob, mimeType: 'image/png' }), false);
    assert.match(editor.error.value!, /image has changed/);
    assert.equal(await editor.exportImage({ bitmap: editor.bitmap.value!, blob, mimeType: 'image/jpeg' }), false);
    assert.equal(downloads.length, 0);
    assert.equal(editor.isDirty.value, true);
});

test('combined rotation and flips commit once and undo together', async (t) => {
    const { editor, bitmaps, scales } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    assert.equal(await editor.rotateImage(1, true, true), true);
    assert.deepEqual(scales, [[-1, -1]]);
    assert.equal(bitmaps.length, 2, 'one output bitmap, no intermediate applied flips');
    assert.equal(editor.bitmap.value?.width, 40);
    assert.equal(editor.bitmap.value?.height, 80);
    editor.undo();
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.canUndo.value, false);
});

test('failed combined rotation and flips leave the document and history untouched', async (t) => {
    const { editor, bitmaps, fail } = setup(t);
    await editor.importImage();
    const original = editor.bitmap.value;
    fail();
    assert.equal(await editor.rotateImage(1, true, false), false);
    assert.equal(editor.bitmap.value, original);
    assert.equal(editor.canUndo.value, false);
    assert.equal(bitmaps.length, 1);
});

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { createRenderer, h, nextTick, type Component, type ComponentPublicInstance } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';
import { constrainCropInsideRotatedImage, isCropInsideRotatedImage, isValidCrop, type CropRect } from '../crop.ts';
import { straightenCrop } from '../straighten.ts';

// Exercise the overlay's real setup and watchers without requiring a browser DOM.
const source = await readFile(new URL('../../components/editor/canvas/CropOverlay.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'crop-overlay-test' }).content
    .replace("import CropControls from '../controls/CropControls.vue';", 'const CropControls = {};')
    .replace('__expose();', '')
    .replace('return __returned__', '__expose(__returned__); return __returned__');
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'vue'", JSON.stringify(import.meta.resolve('vue')))
    .replaceAll("'@/composables/useToolDraft'", JSON.stringify(new URL('../../composables/useToolDraft.ts', import.meta.url).href))
    .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../straighten.ts', import.meta.url).href))
    .replaceAll("'@/lib/rotationCursors'", JSON.stringify(new URL('../rotationCursors.ts', import.meta.url).href))
    .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../crop.ts', import.meta.url).href));
const { default: overlay }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
before(() => Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => null, setItem() {} },
}));
after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
});
const captures: number[] = [];
const renderer = createRenderer<object, object>({
    createElement: () => ({
        getBoundingClientRect: () => ({ left: 100, top: 80, width: 400, height: 300 }),
        focus() {},
        setPointerCapture: (id: number) => { captures.push(id); },
        hasPointerCapture: () => false,
    }),
    createText: () => ({}),
    createComment: () => ({}),
    insert() {},
    remove() {},
    setText() {},
    setElementText() {},
    patchProp() {},
    parentNode: () => null,
    nextSibling: () => null,
});

interface CropState extends ComponentPublicInstance {
    crop: CropRect
    angle: number
    snapToPixel: boolean
    valid: boolean
    dragging: boolean
    displayCrop: CropRect
    apply(): void
    onFormInput: globalThis.EventListener
    // eslint-disable-next-line no-unused-vars
    resizeWithKeyboard(event: KeyboardEvent, handle: 'e' | 'nw'): void
    // eslint-disable-next-line no-unused-vars
    beginSelection(event: PointerEvent, handle?: 'nw' | 'ne' | 'se' | 'sw' | 'e'): void
    // eslint-disable-next-line no-unused-vars
    updateSelection(event: PointerEvent): void
    // eslint-disable-next-line no-unused-vars
    endSelection(event: PointerEvent): void
}

function pointer(x: number, y: number, type = 'pointermove'): PointerEvent {
    return {
        clientX: 100 + x / 2, clientY: 80 + y / 2, pointerId: 1,
        button: 0, shiftKey: false, type, preventDefault() {},
    } as PointerEvent;
}

test('Straighten Apply rejects unchanged, invalid, busy and invalid-image output without a guide', async (t) => {
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 900 }, { width: 0, height: 0 }]) {
        for (const disabled of [false, true]) {
            const applied: unknown[] = [];
            const app = renderer.createApp({ ...overlay, render: () => null }, {
                image, straighten: true, disabled, panMode: false,
                onApply: (...args: unknown[]) => applied.push(args),
            });
            const state = app.mount({}) as CropState;
            t.after(() => app.unmount());
            for (const angle of [0, Number.NaN, Number.POSITIVE_INFINITY, -91, 91]) {
                state.angle = angle;
                await nextTick();
                state.apply();
                assert.deepEqual(applied, []);
            }
            state.angle = 12.3;
            await nextTick();
            state.apply();
            assert.deepEqual(applied, disabled || image.width === 0 ? [] : [[
                constrainCropInsideRotatedImage(straightenCrop(image, 12.3), image, 12.3), 12.3,
            ]]);
        }
    }
});

for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
    test(`Straighten ${handle} rotates about source center without changing framing intent`, async (t) => {
        const image = { width: 800, height: 600 };
        const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
            image, straighten: true, disabled: false, panMode: false,
        });
        const state = app.mount({}) as CropState;
        t.after(() => app.unmount());
        // Make an off-center manual frame. Rotation must still pivot around (400, 300).
        state.crop = { x: 100, y: 120, width: 400, height: 300 };
        const intended = { ...state.crop };
        const start = {
            x: intended.x + (handle.includes('w') ? 0 : intended.width),
            y: intended.y + (handle.includes('n') ? 0 : intended.height),
        };
        const radians = 12 * Math.PI / 180;
        const end = {
            x: 400 + (start.x - 400) * Math.cos(radians) - (start.y - 300) * Math.sin(radians),
            y: 300 + (start.x - 400) * Math.sin(radians) + (start.y - 300) * Math.cos(radians),
        };
        state.beginSelection(pointer(start.x, start.y, 'pointerdown'), handle);
        state.updateSelection(pointer(end.x, end.y));
        await nextTick();
        assert.equal(state.angle, 12);
        assert.equal(state.valid, true);
        state.endSelection(pointer(end.x, end.y, 'pointerup'));
        state.angle = 0;
        await nextTick();
        assert.deepEqual(state.crop, intended, 'corners must not resize the intended frame');
    });
}

test('Straighten interior and outside gestures are inert, including cancel and Shift', async (t) => {
    const image = { width: 800, height: 600 };
    const dirty: boolean[] = [];
    const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
        image, angle: 30, straighten: true, disabled: false, panMode: false,
        onDirty: (value: boolean) => dirty.push(value),
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    await nextTick();
    const crop = { ...state.crop };
    const dirtyCount = dirty.length;
    captures.length = 0;
    for (const [x, y] of [[crop.x + crop.width / 2, crop.y + crop.height / 2], [5, 5]]) {
        for (const end of ['pointerup', 'pointercancel'] as const) {
            let prevented = false;
            const down = { ...pointer(x, y, 'pointerdown'), preventDefault() { prevented = true; } } as PointerEvent;
            state.beginSelection(down);
            assert.equal(state.dragging, false);
            assert.equal(prevented, false, 'ignored gestures must not preventDefault');
            state.updateSelection({ ...pointer(x + 200, y + 150), shiftKey: true } as PointerEvent);
            state.endSelection({ ...pointer(x + 200, y + 150, end), shiftKey: true } as PointerEvent);
            await nextTick();
            assert.deepEqual(state.crop, crop);
            assert.equal(state.angle, 30);
            assert.equal(state.valid, true);
            assert.equal(state.dragging, false);
        }
    }
    assert.deepEqual(captures, [], 'ignored gestures must not capture the pointer');
    assert.equal(dirty.length, dirtyCount, 'ignored gestures must not report edits');
    // Non-corner handles are never accepted either.
    state.beginSelection(pointer(crop.x, crop.y, 'pointerdown'), 'e');
    assert.equal(state.dragging, false);
    // A real corner still rotates and releases cleanly.
    state.beginSelection(pointer(crop.x + crop.width, crop.y + crop.height, 'pointerdown'), 'se');
    assert.equal(state.dragging, true);
    assert.equal(captures.length, 1);
    state.endSelection(pointer(0, 0, 'pointercancel'));
    assert.equal(state.dragging, false);
    assert.equal(state.angle, 30);
});

test('Straighten reapplies framing intent and ignores snap on angle changes', async (t) => {
    const image = { width: 800, height: 600 };
    const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
        image, angle: 30, straighten: true, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    state.snapToPixel = true;
    const fractional = { x: 100.3, y: 80.4, width: 250.2, height: 200.1 };
    state.crop = fractional;
    state.angle = 30;
    await nextTick();
    assert.deepEqual(state.crop, constrainCropInsideRotatedImage(fractional, image, 30));
});

test('ordinary Crop still draws outside, moves inside and Shift-resizes', async (t) => {
    const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    state.beginSelection(pointer(100, 100, 'pointerdown'));
    assert.equal(state.dragging, true);
    state.updateSelection(pointer(300, 260));
    state.endSelection(pointer(300, 260, 'pointerup'));
    await nextTick();
    assert.deepEqual(state.crop, { x: 100, y: 100, width: 200, height: 160 });
    state.beginSelection(pointer(200, 180, 'pointerdown'));
    state.updateSelection(pointer(250, 230));
    state.endSelection(pointer(250, 230, 'pointerup'));
    await nextTick();
    assert.deepEqual(state.crop, { x: 150, y: 150, width: 200, height: 160 });
    state.beginSelection(pointer(350, 310, 'pointerdown'), 'se');
    state.updateSelection({ ...pointer(450, 330), shiftKey: true } as PointerEvent);
    await nextTick();
    assert.equal(state.crop.width, state.crop.height, 'Shift keeps a square');
    state.endSelection(pointer(450, 330, 'pointerup'));
});
test('ordinary Crop corner dragging still resizes instead of rotating', async (t) => {
    const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    state.beginSelection(pointer(0, 0, 'pointerdown'), 'nw');
    state.updateSelection(pointer(100, 80));
    state.endSelection(pointer(100, 80, 'pointerup'));
    await nextTick();
    assert.equal(state.angle, 0);
    assert.deepEqual(state.crop, { x: 100, y: 80, width: 700, height: 520 });
    assert.equal(state.valid, true);
});

test('Straighten ignores snap preference through repeated angle changes and cancelled rotation restores intent', async (t) => {
    const image = { width: 800, height: 600 };
    const app = renderer.createApp({ ...overlay, render: () => h('div', { ref: 'surface' }) }, {
        image, straighten: true, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    const intended = { x: 20.3, y: 30.4, width: 740.4, height: 520.2 };
    state.crop = intended;
    for (let repeat = 0; repeat < 3; repeat++) {
        for (const snap of [true, false]) {
            state.snapToPixel = snap;
            for (const angle of [-90, -70, -45, -1, 0, 1, 45, 70, 90, 0]) {
                state.angle = angle;
                await nextTick();
                assert.equal(state.valid, true);
                assert.deepEqual(state.crop, constrainCropInsideRotatedImage(intended, image, angle));
            }
        }
    }
    assert.deepEqual(state.crop, intended);
    state.beginSelection(pointer(20.3, 30.4, 'pointerdown'), 'nw');
    state.updateSelection(pointer(200, 0));
    await nextTick();
    assert.notEqual(state.angle, 0);
    state.endSelection(pointer(200, 0, 'pointercancel'));
    await nextTick();
    assert.equal(state.angle, 0);
    assert.deepEqual(state.crop, intended);
    state.resizeWithKeyboard({
        key: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {},
    } as KeyboardEvent, 'nw');
    await nextTick();
    assert.equal(state.angle, 1);
    state.angle = 0;
    await nextTick();
    assert.deepEqual(state.crop, intended, 'keyboard corner rotation also preserves intent');
});

function markManual(state: CropState) {
    const event = new Event('input', { bubbles: true });
    Object.defineProperty(event, 'target', { value: { getAttribute: () => 'Crop width' } });
    state.onFormInput(event);
}

test('Straighten framing reports dirty for manual framing, and clean when restored', async (t) => {
    const initialCrop = straightenCrop({ width: 800, height: 600 }, 5);
    const reports: boolean[] = [];
    const app = renderer.createApp({ ...overlay, render: () => null }, {
        image: { width: 800, height: 600 }, initialCrop, angle: 5, straighten: true,
        disabled: false, panMode: false,
        onDirty: (value: boolean) => reports.push(value),
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    assert.deepEqual(reports, [false]);
    for (const field of ['x', 'y', 'width', 'height'] as const) {
        state.crop = { ...initialCrop, [field]: initialCrop[field] + 1 };
        assert.equal(reports.at(-1), true, `${field} changes must report dirty`);
        state.crop = { ...initialCrop };
        assert.equal(reports.at(-1), false, `${field} restored to baseline must report clean`);
    }
    state.crop = { x: 200, y: 160, width: 300, height: 200 };
    await nextTick();
    assert.equal(reports.at(-1), true, 'replacing the selection must report dirty');
    assert.equal(state.angle, 5);
    state.crop = { ...initialCrop };
    await nextTick();
    assert.equal(reports.at(-1), false);
});

test('Straighten ignores the saved Crop snap preference without overwriting it', async (t) => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const writes: [string, string][] = [];
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => key === 'image-editor-crop-snap-to-pixel' ? 'true' : null,
            setItem: (key: string, value: string) => writes.push([key, value]),
        },
    });
    t.after(() => {
        if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
    });

    const image = { width: 800, height: 600 };
    const app = renderer.createApp({ ...overlay, render: () => null }, {
        image, straighten: true, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());

    assert.equal(state.snapToPixel, true, 'the existing preference remains stored in Crop state');
    const intended = { x: 100.3, y: 80.4, width: 250.2, height: 200.1 };
    state.crop = intended;
    state.angle = 12.35;
    await nextTick();
    assert.deepEqual(state.crop, constrainCropInsideRotatedImage(intended, image, 12.35));
    assert.deepEqual(writes, [], 'Straighten does not rewrite the Crop preference');
});

test('enabling pixel snapping immediately rounds existing fractional crop edges', async (t) => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
    });
    t.after(() => {
        if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
    });
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }]) {
        saved.clear();
        const app = renderer.createApp({ ...overlay, render: () => null }, { image, disabled: false, panMode: false });
        const state = app.mount({}) as CropState;
        try {
            assert.equal(state.snapToPixel, false);
            state.crop = { x: 10.4, y: 20.6, width: 20.2, height: 21.2 };
            markManual(state);
            await nextTick();

            state.snapToPixel = true;
            await nextTick();
            assert.deepEqual(state.crop, { x: 10, y: 21, width: 21, height: 21 });
            assert.equal(saved.get('image-editor-crop-snap-to-pixel'), 'true');

            const arrow = new Event('keydown');
            Object.defineProperties(arrow, { key: { value: 'ArrowRight' }, shiftKey: { value: false } });
            state.resizeWithKeyboard(arrow as KeyboardEvent, 'e');
            await nextTick();
            assert.deepEqual(state.crop, { x: 10, y: 21, width: 22, height: 21 });

            state.snapToPixel = false;
            await nextTick();
            state.crop = { x: 10.4, y: 20.6, width: 20.2, height: 21.2 };
            await nextTick();
            assert.equal(state.crop.x, 10.4, 'unsnapped selections retain fractional coordinates');

            state.crop = { x: image.width - 1.4, y: image.height - 1.4, width: 1.3, height: 1.3 };
            await nextTick();
            state.snapToPixel = true;
            await nextTick();
            assert.deepEqual(state.crop, { x: image.width - 1, y: image.height - 1, width: 1, height: 1 });
        } finally {
            app.unmount();
        }
    }
});

for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }]) {
    for (const direction of [-1, 1]) {
        test(`straighten constrains and restores the manual crop: ${image.width}x${image.height}, direction ${direction}`, async (t) => {
            const app = renderer.createApp({ ...overlay, render: () => null }, { image, disabled: false, panMode: false });
            const state = app.mount({}) as CropState;
            t.after(() => app.unmount());

            state.crop.width -= 20;
            markManual(state);
            await nextTick();
            const manualCrop = { ...state.crop };

            state.angle = direction * 15;
            await nextTick();
            const shrunkWidth = state.crop.width;
            assert.ok(state.crop.width <= manualCrop.width);
            assert.ok(state.crop.height <= manualCrop.height);
            assert.equal(isValidCrop(state.crop, image), true);
            assert.equal(isCropInsideRotatedImage(state.crop, image, direction * 15), true);

            state.angle = direction * 5;
            await nextTick();
            assert.ok(state.crop.width > shrunkWidth, 'rotating back must expand the crop');
            assert.ok(state.crop.width <= manualCrop.width);
            assert.ok(state.crop.height <= manualCrop.height);
            assert.equal(isCropInsideRotatedImage(state.crop, image, direction * 5), true);

            state.angle = 0;
            await nextTick();
            assert.deepEqual(state.crop, manualCrop);
        });
    }
}

test('straighten preserves a manual crop that still fits inside the rotated image', async (t) => {
    const image = { width: 800, height: 600 };
    const app = renderer.createApp({ ...overlay, render: () => null }, { image, disabled: false, panMode: false });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    const manualCrop = { x: 300, y: 200, width: 200, height: 200 };
    state.crop = { ...manualCrop };
    markManual(state);
    await nextTick();

    for (const angle of [15, 5, -5, 0]) {
        state.angle = angle;
        await nextTick();
        assert.deepEqual(state.crop, manualCrop);
    }
});

test('editing a constrained crop replaces the remembered manual selection', async (t) => {
    const image = { width: 800, height: 600 };
    const app = renderer.createApp({ ...overlay, render: () => null }, { image, disabled: false, panMode: false });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    state.crop = { x: 0, y: 0, width: 200, height: 100 };
    markManual(state);
    state.angle = 15;
    await nextTick();

    const editedCrop = { x: 300, y: 200, width: 100, height: 80 };
    state.crop = { ...editedCrop };
    markManual(state);
    await nextTick();
    state.angle = 0;
    await nextTick();
    assert.deepEqual(state.crop, editedCrop);
});

for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }]) {
    test(`Straighten auto-fits angles then constrains manual framing: ${image.width}x${image.height}`, async (t) => {
        const applied: [CropRect, number][] = [];
        const initialCrop = straightenCrop(image, 5.71);
        const app = renderer.createApp({ ...overlay, render: () => null }, {
            image, initialCrop, angle: 5.71, straighten: true, disabled: false, panMode: false,
            onApply: (crop: CropRect, angle: number) => applied.push([crop, angle]),
        });
        const state = app.mount({}) as CropState;
        t.after(() => app.unmount());
        assert.deepEqual(state.crop, initialCrop);
        assert.equal(state.valid, true);
        state.apply();
        assert.deepEqual(applied, [[initialCrop, 5.71]], 'measured hundredth-degree precision can apply unchanged');
        applied.length = 0;

        for (const angle of [40, -65, -90, 90, 0, 5.71]) {
            state.angle = angle;
            await nextTick();
            assert.deepEqual(state.crop, straightenCrop(image, angle), 'automatic crop follows refined angle');
            assert.equal(state.valid, true);
            assert.deepEqual(state.displayCrop, state.crop);
        }

        const selected = { x: 10, y: 10, width: image.width / 2, height: image.height / 2 };
        state.crop = { ...selected };
        markManual(state);
        await nextTick();
        assert.equal(state.angle, 5.71, 'manual crop edits never change angle');
        for (const angle of [-65, -90, 90, 0, 15]) {
            state.angle = angle;
            await nextTick();
            assert.deepEqual(state.crop, constrainCropInsideRotatedImage(selected, image, angle));
            assert.equal(state.valid, true);
            assert.notDeepEqual(state.crop, straightenCrop(image, angle), 'manual framing must not become an automatic crop');
        }
        state.resizeWithKeyboard({
            key: 'ArrowRight', shiftKey: false, preventDefault() {}, stopPropagation() {},
        } as KeyboardEvent, 'e');
        await nextTick();
        assert.equal(state.angle, 15, 'keyboard resizing never changes angle');
        state.snapToPixel = true;
        await nextTick();
        assert.equal(state.angle, 15);
        state.apply();
        assert.deepEqual(applied, [[state.crop, 15]]);
        for (const angle of [90.1, -91, Number.NaN]) {
            state.angle = angle;
            await nextTick();
            assert.equal(state.valid, false);
            state.apply();
        }
        assert.equal(applied.length, 1);
    });

    test(`Straighten initializes a valid crop at a measured angle: ${image.width}x${image.height}`, (t) => {
        const app = renderer.createApp({ ...overlay, render: () => null }, {
            image, angle: -63.43, straighten: true, disabled: false, panMode: false,
        });
        const state = app.mount({}) as CropState;
        t.after(() => app.unmount());
        assert.deepEqual(state.crop, straightenCrop(image, -63.43));
        assert.equal(state.valid, true);
    });
}

test('Standard Crop keeps its 45-degree angle limit', async (t) => {
    const app = renderer.createApp({ ...overlay, render: () => null }, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    const state = app.mount({}) as CropState;
    t.after(() => app.unmount());
    state.angle = 45;
    await nextTick();
    assert.equal(state.valid, true);
    state.angle = 45.1;
    await nextTick();
    assert.equal(state.valid, false);
});

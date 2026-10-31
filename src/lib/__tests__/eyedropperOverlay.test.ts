import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRenderer, type Component, type ComponentPublicInstance } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';
import type { ImagePixel } from '../eyedropper.ts';

const source = await readFile(new URL('../../components/editor/eyedropper/EyedropperOverlay.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'eyedropper-overlay-test' }).content
    .replace('__expose();', '')
    .replace('return __returned__', '__expose(__returned__); return __returned__');
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'vue'", JSON.stringify(import.meta.resolve('vue')))
    .replaceAll("'@/lib/eyedropper'", JSON.stringify(new URL('../eyedropper.ts', import.meta.url).href));
const { default: overlay }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const renderer = createRenderer<object, object>({
    createElement: () => ({}),
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

interface OverlayState extends ComponentPublicInstance {
    keyboardPixel: ImagePixel | null
    cursor: { pixel: ImagePixel } | null
    // eslint-disable-next-line no-unused-vars
    onPointerMove(event: PointerEvent): void
    onPointerLeave(): void
    // eslint-disable-next-line no-unused-vars
    onKeydown(event: KeyboardEvent): void
    // eslint-disable-next-line no-unused-vars
    sampleAtPointer(event: MouseEvent): void
}

function createCanvas() {
    const reads: ImagePixel[] = [];
    const context = {
        getImageData(x: number, y: number) {
            reads.push({ x, y });
            return { data: new Uint8ClampedArray([12, 128, 255, 255]) };
        },
    };
    const canvas = {
        width: 100,
        height: 50,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
        getContext: () => context,
    } as unknown as HTMLCanvasElement;
    return { canvas, reads };
}

function keyEvent(key: string, shiftKey = false) {
    return {
        key,
        shiftKey,
        preventDefault() {},
        stopPropagation() {},
    } as KeyboardEvent;
}

test('activation has no synthetic position and the first arrow starts at center then steps', async (t) => {
    const { canvas } = createCanvas();
    const app = renderer.createApp({ ...overlay, render: () => null }, { canvas, disabled: false });
    const state = app.mount({}) as OverlayState;
    t.after(() => app.unmount());

    assert.equal(state.keyboardPixel, null);
    assert.equal(state.cursor, null);

    state.onKeydown(keyEvent('ArrowRight'));
    assert.deepEqual(state.keyboardPixel, { x: 51, y: 25 });
    assert.deepEqual(state.cursor?.pixel, { x: 51, y: 25 });
});

test('invalid pointer movement and pointerleave hide the lens but retain keyboard position', async (t) => {
    const { canvas } = createCanvas();
    const app = renderer.createApp({ ...overlay, render: () => null }, { canvas, disabled: false });
    const state = app.mount({}) as OverlayState;
    t.after(() => app.unmount());

    state.onKeydown(keyEvent('ArrowLeft'));
    const keyboardPosition = state.keyboardPixel;
    state.onPointerMove({ clientX: 500, clientY: 500 } as PointerEvent);
    assert.equal(state.cursor, null);
    assert.deepEqual(state.keyboardPixel, keyboardPosition);

    state.onPointerMove({ clientX: 110, clientY: 70 } as PointerEvent);
    assert.deepEqual(state.cursor?.pixel, { x: 50, y: 25 });
    state.onPointerLeave();
    assert.equal(state.cursor, null);
    assert.deepEqual(state.keyboardPixel, keyboardPosition);

    state.onKeydown(keyEvent('ArrowDown'));
    assert.deepEqual(state.keyboardPixel, { x: 49, y: 26 });
    assert.deepEqual(state.cursor?.pixel, { x: 49, y: 26 });
});

test('Enter and Space sample the visible pointer or retained keyboard pixel; click samples its own pixel', async (t) => {
    const { canvas, reads } = createCanvas();
    const samples: string[] = [];
    const app = renderer.createApp({ ...overlay, render: () => null }, {
        canvas,
        disabled: false,
        onSample: (hex: string) => samples.push(hex),
    });
    const state = app.mount({}) as OverlayState;
    t.after(() => app.unmount());

    state.onKeydown(keyEvent('Enter'));
    assert.deepEqual(reads, [], 'Enter without a positioned pixel does nothing');

    state.onPointerMove({ clientX: 110, clientY: 70 } as PointerEvent);
    state.onKeydown(keyEvent('Enter'));
    assert.deepEqual(reads, [{ x: 50, y: 25 }]);

    state.onKeydown(keyEvent('ArrowUp'));
    state.onKeydown(keyEvent(' '));
    assert.deepEqual(reads, [{ x: 50, y: 25 }, { x: 50, y: 24 }]);

    state.onPointerMove({ clientX: 60, clientY: 35 } as PointerEvent);
    state.onKeydown(keyEvent('Enter'));
    assert.deepEqual(reads[2], { x: 25, y: 7 }, 'a visible pointer position takes precedence over an older keyboard position');

    state.onPointerLeave();
    state.onKeydown(keyEvent('Enter'));
    assert.deepEqual(reads[3], { x: 50, y: 24 }, 'the keyboard position remains available after pointerleave');

    state.sampleAtPointer({ clientX: 60, clientY: 35 } as MouseEvent);
    assert.deepEqual(reads[4], { x: 25, y: 7 });
    assert.equal(samples.length, 5);
    assert.equal(samples[4], '#0C80FF');
});

test('click samples the pixel already shown by the magnifier', async (t) => {
    const { canvas, reads } = createCanvas();
    const app = renderer.createApp({ ...overlay, render: () => null }, { canvas, disabled: false });
    const state = app.mount({}) as OverlayState;
    t.after(() => app.unmount());

    state.onPointerMove({ clientX: 110, clientY: 70 } as PointerEvent);
    const magnifiedPixel = state.cursor?.pixel;

    state.sampleAtPointer({ clientX: 109.9, clientY: 70 } as MouseEvent);

    assert.deepEqual(reads, [{ x: 50, y: 25 }]);
    assert.deepEqual(state.cursor?.pixel, magnifiedPixel);
});

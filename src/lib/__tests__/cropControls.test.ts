import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRenderer, type Component, type ComponentPublicInstance } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';
import type { CropRect } from '../crop.ts';

const source = await readFile(new URL('../../components/editor/controls/CropControls.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'crop-controls-test' }).content
    .replace("import FloatingToolbar from '../chrome/FloatingToolbar.vue';", 'const FloatingToolbar = {};')
    .replaceAll(/import (Base\w+) from '[^']+';/g, 'const $1 = {};')
    .replace('__expose();', '')
    .replace('return __returned__', '__expose(__returned__); return __returned__');
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'chrome-extension-component-library'", JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
    .replaceAll("'vue'", JSON.stringify(import.meta.resolve('vue')))
    .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../crop.ts', import.meta.url).href));
const { default: controls }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
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

interface ControlsState extends ComponentPublicInstance {
    cropWidth: number
    cropHeight: number
}

test('crop dimensions display one decimal without changing the source selection', () => {
    const crop = { x: 0, y: 0, width: 123.456789, height: 98.7654321 };
    const updates: CropRect[] = [];
    const app = renderer.createApp({ ...controls, render: () => null }, {
        image: { width: 800, height: 600 }, crop, disabled: false, dragging: false,
        valid: true, unchanged: false, angle: 0, snapToPixel: false,
        'onUpdate:crop': (value: CropRect) => updates.push(value),
    });
    const state = app.mount({}) as ControlsState;
    try {
        assert.equal(state.cropWidth, 123.5);
        assert.equal(state.cropHeight, 98.8);
        assert.equal(crop.width, 123.456789);
        assert.equal(crop.height, 98.7654321);
        state.cropWidth = 140.2;
        assert.deepEqual(updates, [{ ...crop, width: 140.2 }]);
    } finally {
        app.unmount();
    }
});

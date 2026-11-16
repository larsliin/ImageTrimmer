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
    .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../straighten.ts', import.meta.url).href))
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
    angle: number
    maxAngle: number
    toolName: string
    validationMessage: string
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

test('Straighten controls use 90 degrees while Standard Crop keeps 45 degrees', () => {
    for (const straighten of [false, true]) {
        const app = renderer.createApp({ ...controls, render: () => null }, {
            image: { width: 800, height: 600 }, crop: { x: 100, y: 100, width: 100, height: 100 },
            disabled: false, dragging: false, valid: false, unchanged: false, angle: 0, snapToPixel: false, straighten,
        });
        const state = app.mount({}) as ControlsState;
        try {
            assert.equal(state.maxAngle, straighten ? 90 : 45);
            assert.equal(state.toolName, straighten ? 'Straighten' : 'Crop');
            if (straighten) {
                assert.doesNotMatch(state.validationMessage, /Resize or move/);
                state.angle = 91;
                assert.match(state.validationMessage, /±90/);
            }
        } finally {
            app.unmount();
        }
    }
});

test('Straighten hides crop geometry, Snap, and Reset angle; ordinary Crop retains them', async () => {
    const renderSource = source
        .replace('<Teleport defer to="#editor-tool-controls">', '<div>')
        .replace('</Teleport>', '</div>');
    const renderScript = compileScript(parse(renderSource).descriptor, { id: 'crop-controls-render-test', inlineTemplate: true }).content
        .replace("import FloatingToolbar from '../chrome/FloatingToolbar.vue';",
            'const FloatingToolbar = { inheritAttrs: false, setup: (_props, { slots }) => () => slots.default?.() };')
        .replace("import { BaseIconButton } from 'chrome-extension-component-library';", "const BaseIconButton = 'button';")
        .replaceAll(/import (Base\w+) from '[^']+';/g, "const $1 = 'input';");
    const renderCompiled = transpileModule(renderScript, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
        .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')))
        .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../straighten.ts', import.meta.url).href))
        .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../crop.ts', import.meta.url).href));
    const { default: renderedControls }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(renderCompiled).toString('base64')}`);
    for (const straighten of [false, true]) {
        const labels: string[] = [];
        const fieldRenderer = createRenderer<object, object>({
            createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
            insert() {}, remove() {}, setText() {}, setElementText() {},
            patchProp(_element, key, _old, value) {
                if (key === 'aria-label' || key === 'label') labels.push(String(value));
            },
            parentNode: () => null, nextSibling: () => null,
        });
        const app = fieldRenderer.createApp(renderedControls, {
            image: { width: 800, height: 600 }, crop: { x: 100, y: 100, width: 100, height: 100 },
            disabled: false, dragging: false, valid: true, unchanged: false, angle: 5.71, snapToPixel: false, straighten,
        });
        app.mount({});
        try {
            for (const label of ['Crop X', 'Crop Y', 'Crop width', 'Crop height']) {
                assert.equal(labels.includes(label), !straighten, label);
            }
            assert.equal(labels.includes('Snap to pixel'), !straighten);
            assert.equal(labels.includes('Reset angle'), !straighten);
            for (const label of ['Straighten angle slider', 'Straighten angle in degrees']) assert.ok(labels.includes(label), label);
        } finally {
            app.unmount();
        }
    }
});

async function loadRecordingControls(file: string): Promise<Component> {
    const raw = await readFile(new URL(`../../components/editor/controls/${file}`, import.meta.url), 'utf8');
    const renderSource = raw
        .replace('<Teleport defer to="#editor-tool-controls">', '<div>')
        .replace('</Teleport>', '</div>');
    const renderScript = compileScript(parse(renderSource).descriptor, { id: `toolbar-props-${file}`, inlineTemplate: true }).content
        .replace("import FloatingToolbar from '../chrome/FloatingToolbar.vue';",
            'const FloatingToolbar = { inheritAttrs: false, setup: (_props, { slots, attrs }) => () => { globalThis.toolbarAttrs.push({ ...attrs }); return slots.default?.(); } };')
        .replace("import { BaseIconButton } from 'chrome-extension-component-library';", "const BaseIconButton = 'button';")
        .replaceAll(/import (Base\w+) from '[^']+';/g, "const $1 = 'input';");
    const compiled = transpileModule(renderScript, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
        .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')))
        .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../straighten.ts', import.meta.url).href))
        .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../crop.ts', import.meta.url).href));
    return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default as Component;
}

test('Straighten measurement and framing toolbars are not scrollable; ordinary Crop is unchanged', async (t) => {
    const globals = globalThis as unknown as { toolbarAttrs: Record<string, unknown>[] };
    globals.toolbarAttrs = [];
    t.after(() => Reflect.deleteProperty(globals, 'toolbarAttrs'));
    const cropProps = {
        image: { width: 800, height: 600 }, crop: { x: 100, y: 100, width: 100, height: 100 },
        disabled: false, dragging: false, valid: true, unchanged: false, angle: 5, snapToPixel: false,
    };
    const cases: [string, Component, Record<string, unknown>, string][] = [
        ['measurement', await loadRecordingControls('StraightenControls.vue'), { canStraighten: true, disabled: false, canApply: true, valid: true, angle: 1 }, 'Straighten toolbar'],
        ['framing', await loadRecordingControls('CropControls.vue'), { ...cropProps, straighten: true }, 'Straighten toolbar'],
        ['crop', await loadRecordingControls('CropControls.vue'), cropProps, 'Crop toolbar'],
    ];
    for (const [name, component, props, label] of cases) {
        globals.toolbarAttrs.length = 0;
        const app = renderer.createApp(component, props);
        app.mount({});
        try {
            assert.ok(globals.toolbarAttrs.length > 0, `${name} renders a floating toolbar`);
            for (const attrs of globals.toolbarAttrs) {
                assert.equal(attrs.label, label, name);
                assert.equal('scrollable' in attrs, false, `${name} must not opt into scrolling`);
            }
        } finally {
            app.unmount();
        }
    }
});

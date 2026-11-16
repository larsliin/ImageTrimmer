import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRenderer, markRaw, nextTick, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { ModuleKind, transpileModule } from 'typescript';
import { drawStraightened, straightenCrop } from '../../../../lib/straighten.ts';
import type { CropRect } from '../../../../lib/crop.ts';

const source = await readFile(new URL('../EditorCanvas.vue', import.meta.url), 'utf8');
const script = compileScript(parse(source).descriptor, { id: 'editor-canvas-test', inlineTemplate: true }).content
    .replace("import { usePan } from '@/composables/usePan';", 'const usePan = () => ({ isPanMode: false, isDragging: false, stopMomentum() {} });')
    .replace(
        "import { useCanvasWheelZoom, type WheelZoomAnchor } from '@/composables/useCanvasWheelZoom';",
        'const useCanvasWheelZoom = () => ({ handleWheel() {} });',
    )
    .replace("import { useFileDrop } from '@/composables/useFileDrop';", 'const useFileDrop = () => ({ isDropActive: false, handleDragEnter() {}, handleDragOver() {}, handleDragLeave() {}, handleDrop() {} });')
    .replace("import CropOverlay from './CropOverlay.vue';", 'const CropOverlay = {};')
    .replace("import StraightenOverlay from './StraightenOverlay.vue';", `
        import { h } from 'vue';
        const StraightenOverlay = {
            props: ['image'], emits: ['preview', 'apply'],
            setup(props, { emit }) {
                return () => h('test-straighten', {
                    image: props.image,
                    onPreview: angle => emit('preview', angle),
                    onApply: (crop, angle) => emit('apply', crop, angle),
                });
            },
        };
    `)
    .replace("import EditorRulers from './EditorRulers.vue';", 'const EditorRulers = {};')
    .replace("import EyedropperTool from '../eyedropper/EyedropperTool.vue';", 'const EyedropperTool = {};')
    .replace("import { applyLevelsToPixels, type LevelsParams } from '@/lib/levels';", 'const applyLevelsToPixels = () => {};')
    .replace("import { applyCurvesToPixels, type CurvesParams } from '@/lib/curves';", 'const applyCurvesToPixels = () => {};')
    .replace("import { applyColorModeToPixels, type ColorMode } from '@/lib/colorMode';", 'const applyColorModeToPixels = () => {};')
    .replace(
        "import { applyBrightnessContrastToPixels, type BrightnessContrastParams } from '@/lib/brightnessContrast';",
        'const applyBrightnessContrastToPixels = () => {};',
    );
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'@/lib/zoom'", JSON.stringify(new URL('../../../../lib/zoom.ts', import.meta.url).href))
    .replaceAll("'@/lib/rotate'", JSON.stringify(new URL('../../../../lib/rotate.ts', import.meta.url).href))
    .replaceAll(/(['"])chrome-extension-component-library\1/g, JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
    .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')));
const { default: editorCanvas }: { default: Component } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
);

interface TestElement {
    type: string
    props: Record<string, unknown>
    children: TestElement[]
    parent: TestElement | null
    text: string
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
        observe() {}
        disconnect() {}
    },
});

const renderer = createRenderer<TestElement, TestElement>({
    createElement: (type) => markRaw({
        type, props: {}, children: [], parent: null, text: '',
        width: 0, height: 0,
        getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage() {} }),
    }),
    createText: (text) => markRaw({ type: '#text', props: {}, children: [], parent: null, text }),
    createComment: (text) => markRaw({ type: '#comment', props: {}, children: [], parent: null, text }),
    insert(child, parent, anchor) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = parent;
        const index = anchor ? parent.children.indexOf(anchor) : -1;
        if (index < 0) parent.children.push(child);
        else parent.children.splice(index, 0, child);
    },
    remove(child) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = null;
    },
    setText(node, text) { node.text = text; },
    setElementText(node, text) {
        node.text = text;
        node.children.splice(0);
    },
    patchProp(node, key, _previous, next) { node.props[key] = next; },
    parentNode: (node) => node.parent,
    nextSibling: (node) => {
        const siblings = node.parent?.children;
        const index = siblings?.indexOf(node) ?? -1;
        return index >= 0 ? siblings?.[index + 1] ?? null : null;
    },
});

function findElement(root: TestElement, type: string): TestElement | undefined {
    if (root.type === type) return root;
    for (const child of root.children) {
        const match = findElement(child, type);
        if (match) return match;
    }
}

test('empty-state primary button stays enabled and emits import when clicked', () => {
    let imports = 0;
    const root: TestElement = { type: 'root', props: {}, children: [], parent: null, text: '' };
    const app = renderer.createApp(editorCanvas, {
        bitmap: null, zoom: 1, rulersEnabled: false, panEnabled: false, navigationAnimationsEnabled: false,
        cropEnabled: false, straightenEnabled: false, eyedropperEnabled: false, busy: false, loading: false, error: null,
        onImport: () => { imports += 1; },
    });

    try {
        app.mount(root);
        const button = findElement(root, 'button');
        assert.ok(button);
        assert.equal(button.props.type, 'button');
        assert.notEqual(button.props.disabled, true);
        assert.ok(String(button.props.class).includes('base-button primary-button'));
        assert.ok(String(button.props.class).includes('import-button'));
        assert.equal(findElement(button, 'span')?.text, 'Open image');

        const click = button.props.onClick;
        assert.equal(typeof click, 'function');
        (click as () => void)();
        assert.equal(imports, 1);
    } finally {
        app.unmount();
    }
});

test('Straighten keeps the source-sized frame and CSS rotation in apply coordinates at every zoom', async () => {
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 800 }]) {
        for (const zoom of [0.5, 1, 2]) {
            const applied: [CropRect, number][] = [];
            const root: TestElement = { type: 'root', props: {}, children: [], parent: null, text: '' };
            const app = renderer.createApp(editorCanvas, {
                bitmap: image, zoom, rulersEnabled: false, panEnabled: false, navigationAnimationsEnabled: false,
                cropEnabled: false, straightenEnabled: true, eyedropperEnabled: false, busy: false, loading: false, error: null,
                onStraighten: (crop: CropRect, angle: number) => applied.push([crop, angle]),
            });
            try {
                app.mount(root);
                await nextTick();
                const canvas = findElement(root, 'canvas') as TestElement & { width: number, height: number };
                const overlay = findElement(root, 'test-straighten');
                assert.ok(canvas && overlay);
                assert.deepEqual(overlay.props.image, image);
                const preview = overlay.props.onPreview;
                const apply = overlay.props.onApply;
                assert.ok(typeof preview === 'function' && typeof apply === 'function');
                for (const angle of [-90, -63.43, 0, 27.1, 90]) {
                    preview(angle);
                    await nextTick();
                    assert.equal(canvas.width, image.width);
                    assert.equal(canvas.height, image.height);
                    assert.deepEqual(canvas.parent?.props.style, { width: `${image.width * zoom}px`, height: `${image.height * zoom}px` });
                    assert.deepEqual(canvas.props.style, { transform: `rotate(${angle}deg)` });
                    assert.equal(overlay.props.style, undefined, 'overlay stays axis-aligned');
                    const crop = straightenCrop(image, angle);
                    apply(crop, angle);
                    assert.deepEqual(applied.at(-1), [crop, angle], 'source-pixel crop and angle are forwarded without zoom conversion');

                    // Evaluate the apply renderer's actual transform on a source pixel.
                    // eslint-disable-next-line no-unused-vars
                    const transforms: ((point: { x: number, y: number }) => { x: number, y: number })[] = [];
                    const pixel = { x: image.width * 0.6, y: image.height * 0.4 };
                    let output = { x: 0, y: 0 };
                    const context = {
                        save() {}, restore() {},
                        translate(x: number, y: number) { transforms.push(p => ({ x: p.x + x, y: p.y + y })); },
                        rotate(r: number) {
                            transforms.push(p => ({ x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) }));
                        },
                        drawImage(_source: ImageBitmap, x: number, y: number) {
                            output = transforms.reduceRight((p, transform) => transform(p), { x: pixel.x + x, y: pixel.y + y });
                        },
                    } as unknown as CanvasRenderingContext2D;
                    drawStraightened(context, image as ImageBitmap, angle, crop);
                    const radians = angle * Math.PI / 180;
                    const dx = (pixel.x - image.width / 2) * zoom;
                    const dy = (pixel.y - image.height / 2) * zoom;
                    const cssPoint = {
                        x: image.width * zoom / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
                        y: image.height * zoom / 2 + dx * Math.sin(radians) + dy * Math.cos(radians),
                    };
                    assert.ok(Math.abs((cssPoint.x - crop.x * zoom) / zoom - output.x) < 1e-8);
                    assert.ok(Math.abs((cssPoint.y - crop.y * zoom) / zoom - output.y) < 1e-8);
                }
                assert.doesNotMatch(source, /straightenCrop|drawStraightened/);
                assert.doesNotMatch(source.match(/\.image-surface\s*\{([^}]*)\}/)?.[1] ?? '', /overflow:\s*hidden/, 'rotated corners are not clipped to the frame');
            } finally {
                app.unmount();
            }
        }
    }
});

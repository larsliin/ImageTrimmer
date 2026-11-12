import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRenderer, markRaw, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { ModuleKind, transpileModule } from 'typescript';

const source = await readFile(new URL('../EditorCanvas.vue', import.meta.url), 'utf8');
const script = compileScript(parse(source).descriptor, { id: 'editor-canvas-test', inlineTemplate: true }).content
    .replace("import { displaySize, type Size } from '@/lib/zoom';", 'const displaySize = () => ({ width: 0, height: 0 });')
    .replace("import { usePan } from '@/composables/usePan';", 'const usePan = () => ({ isPanMode: false, isDragging: false, stopMomentum() {} });')
    .replace(
        "import { useCanvasWheelZoom, type WheelZoomAnchor } from '@/composables/useCanvasWheelZoom';",
        'const useCanvasWheelZoom = () => ({ handleWheel() {} });',
    )
    .replace("import CropOverlay from './CropOverlay.vue';", 'const CropOverlay = {};')
    .replace("import EditorRulers from './EditorRulers.vue';", 'const EditorRulers = {};')
    .replace("import EyedropperTool from '../eyedropper/EyedropperTool.vue';", 'const EyedropperTool = {};')
    .replace("import { applyLevelsToPixels, type LevelsParams } from '@/lib/levels';", 'const applyLevelsToPixels = () => {};')
    .replace("import { applyCurvesToPixels, type CurvesParams } from '@/lib/curves';", 'const applyCurvesToPixels = () => {};')
    .replace("import { applyColorModeToPixels, type ColorMode } from '@/lib/colorMode';", 'const applyColorModeToPixels = () => {};')
    .replace(
        "import { applyBrightnessContrastToPixels, type BrightnessContrastParams } from '@/lib/brightnessContrast';",
        'const applyBrightnessContrastToPixels = () => {};',
    )
    .replace(
        "import { drawRotatedImage, rotatedSize, type QuarterTurns } from '@/lib/rotate';",
        'const drawRotatedImage = () => {}; const rotatedSize = () => ({ width: 0, height: 0 });',
    );
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
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
    createElement: (type) => markRaw({ type, props: {}, children: [], parent: null, text: '' }),
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
        cropEnabled: false, eyedropperEnabled: false, busy: false, loading: false, error: null,
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

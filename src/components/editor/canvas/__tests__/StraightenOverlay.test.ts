import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { createRenderer, effectScope, h, markRaw, nextTick, shallowRef, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { ModuleKind, transpileModule } from 'typescript';
import { levelingAngle, sourceToStraightenedPoint, straightenedToSourcePoint, straightenCrop } from '../../../../lib/straighten.ts';
import { constrainCropInsideRotatedImage } from '../../../../lib/crop.ts';
import { useToolCloseGuard } from '../../../../composables/useToolCloseGuard.ts';
import type { ToolId } from '../../../../types/editor.ts';
import { rotationCursors } from '../../../../lib/rotationCursors.ts';

const source = await readFile(new URL('../StraightenOverlay.vue', import.meta.url), 'utf8');
const script = compileScript(parse(source).descriptor, { id: 'straighten-overlay-test', inlineTemplate: true }).content
    .replace("import { BaseIconButton } from 'chrome-extension-component-library';", "const BaseIconButton = 'button';")
    .replace("import CropOverlay from './CropOverlay.vue';", `
        import { h } from 'vue';
        const CropOverlay = {
            props: ['angle', 'canStraighten', 'disabled', 'panMode'],
            emits: ['update:angle', 'apply', 'cancel', 'dirty', 'straighten'],
            setup(props, { emit }) {
                return () => h('test-crop', {
                    angle: props.angle,
                    valid: Number.isFinite(props.angle) && Math.abs(props.angle) <= 90,
                    disabled: props.disabled,
                    panMode: props.panMode,
                    onAngle: value => emit('update:angle', value),
                    onApply: (crop, angle) => emit('apply', crop, angle),
                    onCancel: () => emit('cancel'),
                    onDirty: value => emit('dirty', value),
                }, [
                    h('button', { 'aria-label': 'Straighten', disabled: !props.canStraighten, onClick: () => emit('straighten') }),
                    h('button', { 'aria-label': 'Apply straighten', onClick: () => emit('apply') }),
                    h('button', { 'aria-label': 'Cancel straighten', onClick: () => emit('cancel') }),
                ]);
            },
        };
    `);
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')))
    .replaceAll("'@/composables/useToolDraft'", JSON.stringify(new URL('../../../../composables/useToolDraft.ts', import.meta.url).href))
    .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../../../../lib/crop.ts', import.meta.url).href))
    .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../../../../lib/straighten.ts', import.meta.url).href));
const { default: overlay }: { default: Component } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
);

interface TestElement {
    type: string
    props: Record<string, unknown>
    children: TestElement[]
    parent: TestElement | null
    capturedPointer: number | null
    bounds: { left: number, top: number, width: number, height: number }
    getBoundingClientRect(): { left: number, top: number, width: number, height: number }
    // eslint-disable-next-line no-unused-vars
    setPointerCapture(id: number): void
    // eslint-disable-next-line no-unused-vars
    hasPointerCapture(id: number): boolean
    releasePointerCapture(): void
    focus(): void
}

function element(type: string): TestElement {
    return markRaw({
        type, props: {}, children: [], parent: null, capturedPointer: null,
        bounds: { left: 100, top: 80, width: 400, height: 300 },
        getBoundingClientRect() { return this.bounds; },
        setPointerCapture(id) { this.capturedPointer = id; },
        hasPointerCapture(id) { return this.capturedPointer === id; },
        releasePointerCapture() { this.capturedPointer = null; },
        focus() {},
    });
}

const renderer = createRenderer<TestElement, TestElement>({
    createElement: element,
    createText: () => element('#text'),
    createComment: () => element('#comment'),
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
    setText() {},
    setElementText() {},
    patchProp(node, key, _previous, next) { node.props[key] = next; },
    parentNode: node => node.parent,
    nextSibling(node) {
        const siblings = node.parent?.children;
        const index = siblings?.indexOf(node) ?? -1;
        return index >= 0 ? siblings?.[index + 1] ?? null : null;
    },
});

function buttons(node: TestElement): TestElement[] {
    return node.type === 'button' ? [node] : node.children.flatMap(buttons);
}

function clickButton(root: TestElement, label: string) {
    const button = buttons(root).find(node => node.props['aria-label'] === label || node.props.title === label);
    assert.ok(button, label);
    if (button.props.disabled === true) return false;
    const handler = button.props.onClick;
    assert.ok(typeof handler === 'function');
    handler();
    return true;
}

function dispatch(target: TestElement, name: string, x: number, y: number) {
    const handler = target.props[name];
    assert.ok(typeof handler === 'function');
    handler({
        button: 0, pointerId: 7, clientX: x, clientY: y, currentTarget: target, target,
        preventDefault() {}, stopPropagation() {},
    });
}

function dispatchPointer(
    target: TestElement,
    name: string,
    x: number,
    y: number,
    options: { pointerId?: number, button?: number, isPrimary?: boolean } = {},
) {
    const handler = target.props[name];
    assert.ok(typeof handler === 'function');
    const event = {
        type: name.slice(2).toLowerCase(),
        button: options.button ?? 0,
        pointerId: options.pointerId ?? 7,
        isPrimary: options.isPrimary ?? true,
        clientX: x,
        clientY: y,
        currentTarget: target,
        target,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
    };
    handler(event);
    return event;
}

function dispatchCompatibilityClick(target: TestElement, x: number, y: number, pointerId = 7) {
    const handler = target.props.onClick;
    assert.ok(typeof handler === 'function');
    handler({
        button: 0, detail: 1, pointerId, clientX: x, clientY: y, currentTarget: target, target,
        preventDefault() {}, stopPropagation() {},
    });
}

function mockWindow(t: TestContext) {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            clearTimeout() {},
            setTimeout: () => 0,
        },
    });
    t.after(() => {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    });
}

function findAll(node: TestElement, className: string): TestElement[] {
    return [
        ...(String(node.props.class).split(' ').includes(className) ? [node] : []),
        ...node.children.flatMap(child => findAll(child, className)),
    ];
}

function all(node: TestElement): TestElement[] {
    return [node, ...node.children.flatMap(all)];
}

function assertGuide(root: TestElement, start: { x: number, y: number }, end: { x: number, y: number }, angle: number, dots: number) {
    const image = { width: 800, height: 600 };
    const crop = { x: 0, y: 0, ...image };
    const radians = angle * Math.PI / 180;
    const transformed = [start, end].map(point => ({
        x: 400 + (point.x - 400) * Math.cos(radians) - (point.y - 300) * Math.sin(radians) - crop.x,
        y: 300 + (point.x - 400) * Math.sin(radians) + (point.y - 300) * Math.cos(radians) - crop.y,
    }));
    const [line] = findAll(root, 'straighten-line__stroke');
    assert.ok(line, 'reference line must remain rendered');
    const [svg] = findAll(root, 'straighten-line');
    assert.equal(svg?.props.viewBox, `0 0 ${crop.width} ${crop.height}`);
    for (const [index, point] of transformed.entries()) {
        assert.ok(Math.abs(Number(line.props[`x${index + 1}`]) - point.x) < 1e-8);
        assert.ok(Math.abs(Number(line.props[`y${index + 1}`]) - point.y) < 1e-8);
    }
    const endpoints = findAll(root, 'straighten-point');
    assert.equal(endpoints.length, dots);
    endpoints.forEach((endpoint, index) => {
        const point = transformed[index];
        assert.ok(point);
        const style = endpoint.props.style as { left: string, top: string };
        assert.ok(Math.abs(parseFloat(style.left) - point.x / crop.width * 100) < 1e-8);
        assert.ok(Math.abs(parseFloat(style.top) - point.y / crop.height * 100) < 1e-8);
    });
}

function assertGuideForImage(
    root: TestElement,
    image: { width: number, height: number },
    start: { x: number, y: number },
    end: { x: number, y: number },
    angle: number,
) {
    const [line] = findAll(root, 'straighten-line__stroke');
    assert.ok(line, 'reference line must remain rendered');
    for (const [index, sourcePoint] of [start, end].entries()) {
        const previewPoint = sourceToStraightenedPoint(sourcePoint, image, angle, { x: 0, y: 0, ...image });
        assert.ok(Math.abs(Number(line.props[`x${index + 1}`]) - previewPoint.x) < 1e-8);
        assert.ok(Math.abs(Number(line.props[`y${index + 1}`]) - previewPoint.y) < 1e-8);
    }
}

test('completed line and endpoints stay on the transformed preview through angle changes in either endpoint order', async (t) => {
    mockWindow(t);
    for (const reverse of [false, true]) {
        const previews: number[] = [];
        const root = element('root');
        const app = renderer.createApp(overlay, {
            // ImageBitmap exposes dimensions via non-enumerable properties.
            image: Object.defineProperties({}, { width: { value: 800 }, height: { value: 600 } }),
            disabled: false, panMode: false,
            onPreview: (angle: number) => previews.push(angle),
        });
        try {
            app.mount(root);
            const surface = root.children[0];
            assert.ok(surface);
            const start = reverse ? { x: 600, y: 400 } : { x: 200, y: 200 };
            const end = reverse ? { x: 200, y: 200 } : { x: 600, y: 400 };
            dispatch(surface, 'onClick', 100 + start.x / 2, 80 + start.y / 2);
            dispatch(surface, 'onClick', 100 + end.x / 2, 80 + end.y / 2);
            await nextTick();
            assert.deepEqual(previews, [], 'second point records the line only');
            assertGuide(root, start, end, 0, 2);
            assert.ok(clickButton(root, 'Straighten'));
            await nextTick();
            assert.deepEqual(previews, [-26.57]);
            assertGuide(root, start, end, -26.57, 2);
            dispatch(surface, 'onPointerleave', 0, 0);
            await nextTick();
            assertGuide(root, start, end, -26.57, 2);

            const controls = surface.children.find(child => child.type === 'test-crop');
            assert.ok(controls);
            const updateAngle = controls.props.onAngle;
            assert.ok(typeof updateAngle === 'function');
            assert.equal(controls.props.initialCrop, undefined, 'shared overlay owns automatic framing from entry');
            for (const angle of [15, -40, 0]) {
                updateAngle(angle);
                await nextTick();
                assert.equal(previews.at(-1), angle);
                assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'angle edits never remount framing');
                assertGuide(root, start, end, angle, 2);
            }
            assert.equal(findAll(root, 'straighten-handle').length, 0, 'framing uses shared crop handles, not rotate buttons');
            assert.deepEqual(buttons(root).map(button => button.props['aria-label']), ['Straighten', 'Apply straighten', 'Cancel straighten'], 'one continuous toolbar without Redraw or Reset');
            assert.equal(typeof controls.props.onCancel, 'function');
        } finally {
            app.unmount();
        }
    }
});

test('keyboard measurement preserves the frame; Apply forwards selected crop and angle, Cancel never applies', async (t) => {
    const root = element('root');
    const applied: unknown[] = [];
    let cancellations = 0;
    const dirty: boolean[] = [];
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onApply: (...args: unknown[]) => applied.push(args),
        onCancel: () => { cancellations++; },
        onDirty: (value: boolean) => dirty.push(value),
    });
    t.after(() => app.unmount());
    mockWindow(t);
    app.mount(root);
    const surface = root.children[0];
    assert.ok(surface);
    const keydown = surface.props.onKeydown;
    const handlers = Array.isArray(keydown) ? keydown : [keydown];
    const key = async (value: string, shiftKey = false) => {
        for (const handler of handlers) {
            assert.ok(typeof handler === 'function');
            handler({
                key: value, shiftKey, target: surface, currentTarget: surface,
                preventDefault() {}, stopPropagation() {},
            });
        }
        await nextTick();
    };
    await key('Enter');
    await key('Enter'); // coincident points must not complete the guide
    const initialFrame = surface.children.find(child => child.type === 'test-crop');
    assert.ok(initialFrame, 'frame is present even with an invalid guide');
    await key('ArrowRight', true);
    await key('ArrowDown', true);
    await key('Enter');
    assert.equal(surface.children.find(child => child.type === 'test-crop'), initialFrame, 'Enter placing the second point does not remount the frame');
    assert.equal(initialFrame.props.angle, 0, 'Enter placing the second point does not straighten');
    assert.deepEqual(applied, []);
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    const crop = surface.children.find(child => child.type === 'test-crop');
    assert.ok(crop);
    assert.deepEqual(applied, [], 'placing a line never commits the image');
    assert.equal(dirty.at(-1), true);
    const selection = { x: 300, y: 200, width: 150, height: 100 };
    const apply = crop.props.onApply;
    assert.ok(typeof apply === 'function');
    apply(selection, 65);
    assert.deepEqual(applied, [[selection, 65]]);
    const cancel = crop.props.onCancel;
    assert.ok(typeof cancel === 'function');
    cancel();
    assert.equal(cancellations, 1);
    assert.equal(applied.length, 1);
});

test('partial line follows the cursor and keeps its first point until cancellation', async (t) => {
    mockWindow(t);
    const root = element('root');
    let cancellations = 0;
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onCancel: () => { cancellations++; },
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);
        dispatch(surface, 'onClick', 200, 180);
        dispatch(surface, 'onPointermove', 400, 280);
        await nextTick();
        assertGuide(root, { x: 200, y: 200 }, { x: 600, y: 400 }, 0, 1);
        dispatch(surface, 'onPointerleave', 0, 0);
        await nextTick();
        assert.equal(findAll(root, 'straighten-line').length, 0);
        assert.equal(findAll(root, 'straighten-point').length, 1);
        dispatch(surface, 'onPointermove', 350, 260);
        await nextTick();
        assertGuide(root, { x: 200, y: 200 }, { x: 500, y: 360 }, 0, 1);
        const controls = surface.children.find(child => child.type === 'test-crop');
        assert.ok(controls);
        assert.deepEqual(buttons(controls).map(button => button.props['aria-label']), ['Straighten', 'Apply straighten', 'Cancel straighten']);
        assert.equal(clickButton(root, 'Straighten'), false, 'disabled until the line is complete');
        const cancel = buttons(controls)[2]?.props.onClick;
        assert.ok(typeof cancel === 'function');
        cancel();
        assert.equal(cancellations, 1);
        assert.equal(findAll(root, 'straighten-point').length, 1, 'the overlay itself has no reset action');
    } finally {
        app.unmount();
    }
});

test('a pointer drag previews and records both source-space endpoints at multiple preview sizes and angles', async (t) => {
    mockWindow(t);
    const cases = [
        {
            image: { width: 800, height: 600 }, bounds: { left: 90, top: 60, width: 400, height: 300 },
            angle: 0, start: { x: 120, y: 120 }, end: { x: 320, y: 210 },
        },
        {
            image: { width: 600, height: 900 }, bounds: { left: 35, top: 25, width: 320, height: 480 },
            angle: 27.5, start: { x: 480, y: 690 }, end: { x: 105, y: 180 },
        },
        {
            image: { width: 1200, height: 400 }, bounds: { left: 120, top: 40, width: 720, height: 240 },
            angle: -31.2, start: { x: 180, y: 275 }, end: { x: 900, y: 100 },
        },
    ];

    for (const scenario of cases) {
        const previews: number[] = [];
        const applied: unknown[] = [];
        const root = element('root');
        const app = renderer.createApp(overlay, {
            image: scenario.image, disabled: false, panMode: false,
            onPreview: (angle: number) => previews.push(angle),
            onApply: (...args: unknown[]) => applied.push(args),
        });
        try {
            app.mount(root);
            const surface = root.children[0];
            assert.ok(surface);
            surface.bounds = scenario.bounds;
            const controls = surface.children.find(child => child.type === 'test-crop');
            const setAngle = controls?.props.onAngle;
            assert.ok(typeof setAngle === 'function');
            setAngle(scenario.angle);
            await nextTick();
            previews.length = 0;

            const client = (point: { x: number, y: number }) => ({
                x: scenario.bounds.left + point.x * scenario.bounds.width / scenario.image.width,
                y: scenario.bounds.top + point.y * scenario.bounds.height / scenario.image.height,
            });
            const start = client(scenario.start);
            const end = client(scenario.end);
            const down = dispatchPointer(surface, 'onPointerdown', start.x, start.y);
            assert.equal(down.defaultPrevented, true);
            assert.equal(surface.capturedPointer, 7);
            dispatchPointer(surface, 'onPointermove', end.x, end.y);
            await nextTick();
            assert.equal(findAll(root, 'straighten-point').length, 0, 'a drag preview is not a committed guide');
            const [previewLine] = findAll(root, 'straighten-line__stroke');
            assert.ok(previewLine, 'the full line previews while the pointer is held');
            for (const [index, previewPoint] of [scenario.start, scenario.end].entries()) {
                assert.ok(Math.abs(Number(previewLine.props[`x${index + 1}`]) - previewPoint.x) < 1e-8);
                assert.ok(Math.abs(Number(previewLine.props[`y${index + 1}`]) - previewPoint.y) < 1e-8);
            }

            dispatchPointer(surface, 'onPointerup', end.x, end.y);
            await nextTick();
            assert.equal(surface.capturedPointer, null);
            const sourceStart = straightenedToSourcePoint(scenario.start, scenario.image, scenario.angle);
            const sourceEnd = straightenedToSourcePoint(scenario.end, scenario.image, scenario.angle);
            assertGuideForImage(root, scenario.image, sourceStart, sourceEnd, scenario.angle);
            assert.equal(findAll(root, 'straighten-point').length, 2);
            assert.deepEqual(previews, [], 'placing a drag does not change the preview angle');
            assert.deepEqual(applied, [], 'placing a drag does not commit the image');
            assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'guide drawing retains the existing frame');

            dispatchCompatibilityClick(surface, end.x, end.y);
            await nextTick();
            assert.equal(findAll(root, 'straighten-point').length, 2, 'the compatibility click cannot add another endpoint');
            assert.equal(clickButton(root, 'Straighten'), true);
            await nextTick();
            assert.equal(previews.at(-1), levelingAngle(sourceStart, sourceEnd));
            assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'Straighten levels without remounting framing');
        } finally {
            app.unmount();
        }
    }
});

test('dragging a second endpoint retains its existing anchor and click sequences still honor jitter', async (t) => {
    mockWindow(t);
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);
        const image = { width: 800, height: 600 };
        const angle = 24;
        const controls = surface.children.find(child => child.type === 'test-crop');
        const setAngle = controls?.props.onAngle;
        assert.ok(typeof setAngle === 'function');
        setAngle(angle);
        await nextTick();

        const firstPreview = { x: 160, y: 130 };
        const endPreview = { x: 330, y: 230 };
        const toClient = (point: { x: number, y: number }) => ({
            x: surface.bounds.left + point.x / image.width * surface.bounds.width,
            y: surface.bounds.top + point.y / image.height * surface.bounds.height,
        });
        const firstClient = toClient(firstPreview);
        dispatch(surface, 'onClick', firstClient.x, firstClient.y);
        await nextTick();
        const anchor = straightenedToSourcePoint(firstPreview, image, angle);
        assert.equal(findAll(root, 'straighten-point').length, 1);

        const startClient = toClient({ x: firstPreview.x + 8, y: firstPreview.y + 5 });
        const endClient = toClient(endPreview);
        dispatchPointer(surface, 'onPointerdown', startClient.x, startClient.y);
        dispatchPointer(surface, 'onPointermove', endClient.x, endClient.y);
        await nextTick();
        assert.ok(findAll(root, 'straighten-line__stroke')[0], 'the live preview still begins at the original anchor');
        dispatchPointer(surface, 'onPointerup', endClient.x, endClient.y);
        await nextTick();
        const endpoint = straightenedToSourcePoint(endPreview, image, angle);
        assertGuideForImage(root, image, anchor, endpoint, angle);
        assert.equal(findAll(root, 'straighten-point').length, 2, 'the first point was not replaced');
        dispatchCompatibilityClick(surface, endClient.x, endClient.y);
        assert.equal(findAll(root, 'straighten-point').length, 2);
    } finally {
        app.unmount();
    }
});

test('pointer jitter remains click placement; short drags restore the anchor and suppress only their compatibility click', async (t) => {
    mockWindow(t);
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);

        dispatchPointer(surface, 'onPointerdown', 200, 180);
        dispatchPointer(surface, 'onPointermove', 202, 180);
        dispatchPointer(surface, 'onPointerup', 202, 180);
        dispatchCompatibilityClick(surface, 202, 180);
        await nextTick();
        assert.equal(findAll(root, 'straighten-point').length, 1, 'movement at or below 3 CSS pixels stays a click');

        dispatchPointer(surface, 'onPointerdown', 201, 180);
        dispatchPointer(surface, 'onPointermove', 206, 180);
        dispatchPointer(surface, 'onPointerup', 206, 180);
        await nextTick();
        assert.equal(findAll(root, 'straighten-point').length, 1, 'a 5-pixel drag cannot replace or complete the anchor');
        assert.ok(all(root).some(node => node.props.role === 'alert'), 'the existing line validation is announced');
        dispatchCompatibilityClick(surface, 206, 180);
        assert.equal(findAll(root, 'straighten-point').length, 1, 'the rejected drag click is consumed');

        dispatchPointer(surface, 'onPointerdown', 400, 180);
        dispatchPointer(surface, 'onPointerup', 400, 180);
        dispatchCompatibilityClick(surface, 400, 180);
        await nextTick();
        assert.equal(findAll(root, 'straighten-point').length, 2, 'the next intentional click is accepted');
    } finally {
        app.unmount();
    }
});

test('minimum guide length uses actual displayed endpoints after manual rotation and nonuniform preview scaling', async (t) => {
    mockWindow(t);
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);
        surface.bounds = { left: 100, top: 80, width: 400, height: 400 };
        const controls = surface.children.find(child => child.type === 'test-crop');
        const setAngle = controls?.props.onAngle;
        assert.ok(typeof setAngle === 'function');
        setAngle(-90);
        await nextTick();

        const first = { x: 200, y: 180 };
        dispatch(surface, 'onClick', first.x, first.y);
        dispatchPointer(surface, 'onPointerdown', first.x, first.y);
        dispatchPointer(surface, 'onPointermove', first.x + 7, first.y);
        dispatchPointer(surface, 'onPointerup', first.x + 7, first.y);
        await nextTick();
        assert.equal(findAll(root, 'straighten-point').length, 1, 'a displayed 7px line remains below the 8px minimum');
        assert.ok(all(root).some(node => node.props.role === 'alert'));
    } finally {
        app.unmount();
    }
});

test('guide gestures ignore bubbled handle events and keep exclusive pointer ownership', async (t) => {
    const root = element('root');
    const previews: number[] = [];
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onPreview: (value: number) => previews.push(value),
    });
    t.after(() => app.unmount());
    mockWindow(t);
    app.mount(root);
    const surface = root.children[0];
    const frame = surface?.children.find(node => node.type === 'test-crop');
    assert.ok(surface && frame);
    for (const name of ['onPointerdown', 'onPointermove', 'onClick']) {
        const handler = surface.props[name];
        assert.ok(typeof handler === 'function');
        handler({
            button: 0, detail: 1, pointerId: 7, clientX: 200, clientY: 180,
            target: frame, currentTarget: surface, preventDefault() {}, stopPropagation() {},
        });
    }
    await nextTick();
    assert.equal(surface.capturedPointer, null, 'rotation never starts guide capture');
    assert.equal(findAll(root, 'straighten-point').length, 0, 'rotation compatibility clicks never place a point');
    dispatchPointer(surface, 'onPointerdown', 200, 180);
    await nextTick();
    assert.equal(frame.props.disabled, true, 'guide capture disables rotation and Apply');
    dispatchPointer(surface, 'onPointerdown', 400, 280, { pointerId: 8 });
    assert.equal(surface.capturedPointer, 7, 'another pointer cannot take over a guide');
    dispatchPointer(surface, 'onPointermove', 400, 280);
    dispatchPointer(surface, 'onPointerup', 400, 280);
    await nextTick();
    assert.equal(frame.props.disabled, false);
    assertGuide(root, { x: 200, y: 200 }, { x: 600, y: 400 }, 0, 2);
    assert.deepEqual(previews, [], 'guide completion never rotates');
});

test('cancel, lost capture, pan, and disabled transitions restore an in-progress drag', async (t) => {
    mockWindow(t);
    const disabled = shallowRef(false);
    const panMode = shallowRef(false);
    const root = element('root');
    const app = renderer.createApp({
        setup: () => () => h(overlay, {
            image: { width: 800, height: 600 }, disabled: disabled.value, panMode: panMode.value,
        }),
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);
        dispatchPointer(surface, 'onPointerdown', 200, 180);
        dispatchPointer(surface, 'onPointermove', 300, 240);
        dispatchPointer(surface, 'onPointerup', 310, 245, { pointerId: 8 });
        assert.equal(surface.capturedPointer, 7, 'a different pointer cannot finish the gesture');
        dispatchPointer(surface, 'onLostpointercapture', 310, 245, { pointerId: 8 });
        assert.equal(surface.capturedPointer, 7, 'unrelated capture loss is ignored');
        dispatchPointer(surface, 'onLostpointercapture', 310, 245);
        await nextTick();
        assert.equal(surface.capturedPointer, null);
        assert.equal(findAll(root, 'straighten-point').length, 0);
        assert.equal(findAll(root, 'straighten-line').length, 0);
        dispatchCompatibilityClick(surface, 310, 245);
        assert.equal(findAll(root, 'straighten-point').length, 0, 'lost capture does not leave a phantom click');

        dispatchPointer(surface, 'onPointerdown', 200, 180);
        dispatchPointer(surface, 'onPointermove', 300, 240);
        dispatchPointer(surface, 'onPointercancel', 300, 240);
        await nextTick();
        assert.equal(surface.capturedPointer, null, 'pointer cancellation releases capture');
        assert.equal(findAll(root, 'straighten-point').length, 0);
        dispatchCompatibilityClick(surface, 300, 240);
        assert.equal(findAll(root, 'straighten-point').length, 0, 'pointer cancellation cannot create a compatibility-click point');

        const nonPrimary = dispatchPointer(surface, 'onPointerdown', 200, 180, { isPrimary: false });
        assert.equal(nonPrimary.defaultPrevented, false);
        assert.equal(surface.capturedPointer, null, 'non-primary pointers are ignored');
        dispatchPointer(surface, 'onPointerdown', 200, 180);
        dispatchPointer(surface, 'onPointerup', 200, 180);
        dispatchCompatibilityClick(surface, 200, 180);
        await nextTick();
        const anchorStyle = findAll(root, 'straighten-point')[0]?.props.style;
        assert.ok(anchorStyle, 'the first valid point is present before interrupted drags');

        dispatchPointer(surface, 'onPointerdown', 201, 181);
        dispatchPointer(surface, 'onPointermove', 300, 240);
        panMode.value = true;
        await nextTick();
        assert.equal(surface.capturedPointer, null, 'entering pan releases placement capture');
        assert.deepEqual(findAll(root, 'straighten-point')[0]?.props.style, anchorStyle, 'pan preserves the existing source anchor');
        const panDown = dispatchPointer(surface, 'onPointerdown', 200, 180);
        assert.equal(panDown.defaultPrevented, false, 'pan keeps priority over guide placement');
        panMode.value = false;
        await nextTick();

        dispatchPointer(surface, 'onPointerdown', 201, 181);
        dispatchPointer(surface, 'onPointermove', 300, 240);
        const controls = surface.children.find(child => child.type === 'test-crop');
        const setAngle = controls?.props.onAngle;
        assert.ok(typeof setAngle === 'function');
        setAngle(15);
        await nextTick();
        assert.equal(surface.capturedPointer, null, 'changing preview rotation cancels stale pointer coordinates');
        assert.equal(controls?.props.angle, 15, 'cancelling the gesture preserves the manual angle');
        assert.equal(findAll(root, 'straighten-point').length, 1, 'angle change preserves the existing source anchor');

        dispatchPointer(surface, 'onPointerdown', 201, 181);
        dispatchPointer(surface, 'onPointermove', 300, 240);
        disabled.value = true;
        await nextTick();
        assert.equal(surface.capturedPointer, null, 'disabling placement releases capture');
        assert.equal(findAll(root, 'straighten-point').length, 1, 'disabled state also preserves the existing source anchor');
        const disabledDown = dispatchPointer(surface, 'onPointerdown', 200, 180);
        assert.equal(disabledDown.defaultPrevented, false);
        assert.equal(surface.capturedPointer, null);
    } finally {
        app.unmount();
    }
});

test('coincident reference points stay in placement stage until a valid second point', async (t) => {
    mockWindow(t);
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);

        dispatch(surface, 'onClick', 200, 180);
        dispatch(surface, 'onClick', 200, 180);
        await nextTick();
        assert.ok(surface.children.find(child => child.type === 'test-crop'), 'invalid guide does not hide the frame');
        assert.equal(findAll(root, 'straighten-point').length, 1);

        assert.equal(clickButton(root, 'Straighten'), false);
        dispatch(surface, 'onClick', 400, 280);
        await nextTick();
        assert.equal(surface.children.find(child => child.type === 'test-crop')?.props.angle, 0, 'valid guide still does not rotate');
        assert.ok(clickButton(root, 'Straighten'));
        await nextTick();
        assert.ok(surface.children.find(child => child.type === 'test-crop'));
    } finally {
        app.unmount();
    }
});

test('framing has no surface arrow-key rotation; angle comes from shared crop controls', async (t) => {
    mockWindow(t);
    const previews: number[] = [];
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onPreview: (angle: number) => previews.push(angle),
    });

    try {
        app.mount(root);
        const surface = root.children[0];
        assert.ok(surface);
        dispatch(surface, 'onClick', 200, 180);
        dispatch(surface, 'onClick', 400, 280);
        await nextTick();
        assert.ok(clickButton(root, 'Straighten'));
        await nextTick();
        assert.equal(findAll(root, 'straighten-handle').length, 0);
        assert.ok(buttons(root).every(button => !String(button.props['aria-label']).startsWith('Rotate from')));
        const crop = surface.children.find(child => child.type === 'test-crop');
        const updateAngle = crop?.props.onAngle;
        assert.ok(typeof updateAngle === 'function');
        for (const angle of [-90, -63.4, 25.7, 90]) {
            updateAngle(angle);
            await nextTick();
            assert.equal(previews.at(-1), angle);
            const keydown = surface.props.onKeydown;
            for (const handler of Array.isArray(keydown) ? keydown : [keydown]) {
                assert.ok(typeof handler === 'function');
                handler({ key: 'ArrowRight', target: surface, currentTarget: surface });
            }
            await nextTick();
            assert.equal(previews.at(-1), angle, 'framing surface arrow keys cannot rotate');
        }
        assert.match(source, /drag one of the four corner handles to rotate/i);
        assert.match(source, /Angle slider or numeric field/);
        assert.doesNotMatch(source, /side handle|Redraw line|rotation handle|rotateWithKeyboard|startRotation/);
    } finally {
        app.unmount();
    }
});

test('reference guideline keeps contrasting strokes at reduced thickness', () => {
    assert.match(source, /\.straighten-line__halo\s*\{[^}]*stroke:\s*#000;[^}]*stroke-width:\s*2px;/s);
    assert.match(source, /\.straighten-line__stroke\s*\{[^}]*stroke:\s*#fff;[^}]*stroke-width:\s*0\.75px;/s);
});

test('rotation cursors share the exact quarter-arc art, contrast and centered hotspot', async () => {
    const orientations = { ne: 0, se: 90, sw: 180, nw: 270 } as const;
    assert.equal(new Set(Object.values(rotationCursors)).size, 4);
    for (const [corner, degrees] of Object.entries(orientations)) {
        const cursor = rotationCursors[corner as keyof typeof orientations];
        assert.ok(cursor);
        const match = /^url\("data:image\/svg\+xml,([^"]+)"\) 12 12, crosshair$/.exec(cursor);
        assert.ok(match?.[1]);
        const svg = decodeURIComponent(match[1]);
        assert.match(svg, /width="24" height="24" viewBox="0 0 24 24" fill="none"/);
        assert.ok(svg.includes(`transform="rotate(${degrees} 12 12)"`));
        assert.match(svg, /stroke-linecap="round" stroke-linejoin="round"/);
        for (const [stroke, width] of [['white', 4], ['black', 2]]) {
            assert.ok(svg.includes(`<g stroke="${stroke}" stroke-width="${width}">`));
        }
        assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"\/>/g)].map(path => path[1]), [
            'M6 6a12 12 0 0 1 12 12', 'M9 3 6 6l3 3', 'm15 15 3 3 3-3',
            'M6 6a12 12 0 0 1 12 12', 'M9 3 6 6l3 3', 'm15 15 3 3 3-3',
        ]);
    }
    const cropSource = await readFile(new URL('../CropOverlay.vue', import.meta.url), 'utf8');
    assert.match(cropSource, /\.crop-surface\.is-rotating \.crop-selection\s*\{\s*cursor: inherit;/);
    assert.match(cropSource, /\.crop-handle\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s, 'ordinary Crop handles retain their 12px target');
    assert.match(cropSource, /\.crop-handle\.is-rotation\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
    assert.match(cropSource, /\.crop-handle\.is-rotation::before\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s);
    assert.match(cropSource, /\.crop-handle\.is-rotation:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\);/s);
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
        const rule = new RegExp(String.raw`\.crop-handle\.is-rotation-${corner}::before\s*\{([^}]*)\}`, 's').exec(cropSource)?.[1];
        assert.ok(rule);
        assert.match(rule, /-6px;/);
    }
});

test('real controls keep an immediate frame, gate Apply by output, preserve guide intent, and isolate ordinary Crop', async (t) => {
    let app: ReturnType<typeof renderer.createApp> | undefined;
    t.after(() => app?.unmount());
    mockWindow(t);
    async function componentUrl(path: string, imports: Record<string, string> = {}): Promise<string> {
        let content = await readFile(new URL(path, import.meta.url), 'utf8');
        // Teleport placement and toolbar layout are browser-tested; retain their slots here.
        content = content.replace(/<Teleport\b[^>]*>/g, '<div>').replaceAll('</Teleport>', '</div>');
        let script = compileScript(parse(content).descriptor, { id: path, inlineTemplate: true }).content
            .replace("import FloatingToolbar from '../chrome/FloatingToolbar.vue';", `
                import { h } from 'vue';
                const FloatingToolbar = { setup(_props, { slots }) { return () => h('test-toolbar', slots.default?.()); } };
            `);
        for (const [from, to] of Object.entries(imports)) script = script.replaceAll(`'${from}'`, JSON.stringify(to));
        const code = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
            .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')))
            .replaceAll("'chrome-extension-component-library'", JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
            .replaceAll("'@/lib/rotationCursors'", JSON.stringify(new URL('../../../../lib/rotationCursors.ts', import.meta.url).href))
            .replaceAll("'@/composables/useToolDraft'", JSON.stringify(new URL('../../../../composables/useToolDraft.ts', import.meta.url).href))
            .replaceAll("'@/lib/crop'", JSON.stringify(new URL('../../../../lib/crop.ts', import.meta.url).href))
            .replaceAll("'@/lib/straighten'", JSON.stringify(new URL('../../../../lib/straighten.ts', import.meta.url).href));
        return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    }
    const fields: Record<string, string> = {};
    for (const name of ['BaseRangeInput', 'BaseNumberInput']) {
        fields[`@/components/bascomponents/${name}.vue`] = await componentUrl(`../../../bascomponents/${name}.vue`);
    }
    fields['@/components/bascomponents/BaseCheckbox.vue'] = 'data:text/javascript,export default { render() { return null; } }';
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {} } });
    t.after(() => {
        if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
    });
    const controlsUrl = await componentUrl('../../controls/CropControls.vue', fields);
    const cropUrl = await componentUrl('../CropOverlay.vue', { '../controls/CropControls.vue': controlsUrl });
    const overlayUrl = await componentUrl('../StraightenOverlay.vue', {
        './CropOverlay.vue': cropUrl,
    });
    const { default: realOverlay }: { default: Component } = await import(overlayUrl);
    const root = element('root');
    const previews: number[] = [];
    const applied: [unknown, number][] = [];
    const busy = shallowRef(false);
    let cancellations = 0;
    app = renderer.createApp({
        setup: () => () => h(realOverlay, {
            image: { width: 800, height: 600 }, disabled: busy.value, panMode: false,
            onPreview: (angle: number) => previews.push(angle),
            onApply: (crop: unknown, angle: number) => applied.push([crop, angle]),
            onCancel: () => { cancellations++; },
        }),
    });
    app.mount(root);
    const surface = root.children[0];
    assert.ok(surface);
    function applyButton() {
        const matches = buttons(root).filter(button => button.props['aria-label'] === 'Apply straighten');
        assert.equal(matches.length, 1, 'exactly one Apply action throughout editing');
        const button = matches[0];
        assert.ok(button);
        assert.equal(button.props.title, 'Apply straighten');
        assert.equal(button.props.type, 'submit');
        assert.ok(button.children.some(child => child.props.class === 'bi bi-check-lg'));
        return button;
    }
    function submit() {
        const handler = all(root).find(node => node.type === 'form')?.props.onSubmit;
        assert.ok(typeof handler === 'function');
        handler({ preventDefault() {} });
    }
    function enterAngle(label: string) {
        const field = all(root).find(node => node.type === 'input' && node.props['aria-label'] === label);
        const handler = field?.parent?.props.onKeydown;
        assert.ok(typeof handler === 'function');
        handler({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
    }
    assert.equal(applyButton().props.disabled, true, 'Apply is visible but disabled on entry');
    submit();
    enterAngle('Straighten angle in degrees');
    assert.deepEqual(applied, [], 'forced no-op submission and Enter cannot apply');
    for (const degrees of [0.001, -63.4, 90]) {
        input('Straighten angle in degrees', String(degrees));
        await nextTick();
        assert.equal(applyButton().props.disabled, false, 'manual angle needs no guide, even below alignment tolerance');
        enterAngle('Straighten angle in degrees');
        const image = { width: 800, height: 600 };
        assert.deepEqual(applied.at(-1), [
            constrainCropInsideRotatedImage(straightenCrop(image, degrees), image, degrees), degrees,
        ], 'direct Apply uses the same canonical auto-crop and angle as framing');
        assert.equal(findAll(root, 'crop-surface').length, 1, 'direct Apply retains the frame mounted on entry');
        assert.equal(findAll(root, 'straighten-point').length, 0, 'direct Apply never initializes a guide');
        assert.equal(root.children[0], surface);
    }
    applied.length = 0;
    for (const value of ['', 'Infinity', '-91', '91']) {
        input('Straighten angle in degrees', value);
        await nextTick();
        assert.equal(applyButton().props.disabled, true, `invalid angle ${value}`);
        submit();
        enterAngle('Straighten angle slider');
        assert.deepEqual(applied, []);
    }
    input('Straighten angle in degrees', '7');
    busy.value = true;
    await nextTick();
    assert.ok(all(root).some(node => node.type === 'fieldset' && node.props.disabled === true));
    submit();
    enterAngle('Straighten angle in degrees');
    assert.deepEqual(applied, [], 'busy direct submission cannot commit');
    busy.value = false;
    input('Straighten angle in degrees', '0');
    await nextTick();
    assert.equal(applyButton().props.disabled, true, 'returning to zero disables despite angle history');
    assert.ok(clickButton(root, 'Cancel straighten'));
    assert.equal(cancellations, 1);
    assert.deepEqual(applied, []);
    previews.length = 0;
    function straightenButton() {
        const matches = buttons(root).filter(button => button.props['aria-label'] === 'Straighten');
        assert.equal(matches.length, 1, 'exactly one Straighten action in the current toolbar');
        const button = matches[0];
        assert.ok(button);
        assert.equal(button.props.title, 'Straighten');
        assert.equal(button.props.type, 'button', 'native Enter/Space activation cannot submit Apply');
        assert.ok(button.children.some(child => child.props.class === 'bi bi-hr' && child.props['aria-hidden'] === 'true'));
        return button;
    }
    assert.equal(straightenButton().props.disabled, true);
    assert.equal(findAll(root, 'crop-handle').length, 4, 'rotation-only handles are present before placing a reference');
    const entryFrame = findAll(root, 'crop-surface')[0];
    assert.ok(entryFrame);
    assert.equal(entryFrame.props.tabindex, -1, 'guide surface, not the visual frame, is the image tab stop');
    assert.equal(surface.props.tabindex, '0');
    assert.deepEqual(findAll(root, 'crop-selection')[0]?.props.style, {
        left: '0%', top: '0%', width: '100%', height: '100%',
    });
    dispatch(surface, 'onClick', 200, 180);
    await nextTick();
    assert.equal(applyButton().props.disabled, true, 'one point alone cannot apply');
    input('Straighten angle slider', '12.3');
    await nextTick();
    assert.equal(applyButton().props.disabled, false);
    enterAngle('Straighten angle slider');
    assert.equal(applied.at(-1)?.[1], 12.3, 'Enter applies with an incomplete guide');
    applied.length = 0;
    input('Straighten angle in degrees', '0');
    await nextTick();
    assert.equal(applyButton().props.disabled, true);
    previews.length = 0;
    assert.equal(findAll(root, 'crop-handle').length, 4, 'partial guide retains handles');
    dispatch(surface, 'onClick', 200, 180);
    await nextTick();
    assert.equal(findAll(root, 'crop-handle').length, 4, 'coincident points retain handles');
    assert.equal(surface.children.find(child => child.type === 'test-crop'), undefined);
    dispatch(surface, 'onClick', 400, 280);
    await nextTick();
    assert.equal(findAll(root, 'crop-handle').length, 4, 'complete guide retains handles without rotating');
    assert.equal(findAll(root, 'crop-surface')[0], entryFrame);
    assert.deepEqual(previews, []);
    assert.equal(straightenButton().props.disabled, false);
    assert.equal(applyButton().props.disabled, true, 'complete uncorrected guide alone cannot apply');
    submit();
    assert.deepEqual(applied, []);
    input('Straighten angle in degrees', '5.71');
    await nextTick();
    assert.equal(applyButton().props.disabled, false);
    submit();
    assert.equal(applied.at(-1)?.[1], 5.71, 'manual angle applies with a complete guide');
    applied.length = 0;
    input('Straighten angle in degrees', '0');
    await nextTick();
    assert.equal(applyButton().props.disabled, true, 'guide/history cannot enable zero-degree automatic full frame');
    busy.value = true;
    await nextTick();
    assert.equal(straightenButton().props.disabled, true);
    busy.value = false;
    await nextTick();
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    assert.equal(findAll(root, 'crop-handle').length, 4);
    assert.equal(findAll(root, 'straighten-handle').length, 0);
    assert.equal(straightenButton().props.disabled, true, 'disabled after rounding the correction');
    assert.equal(applyButton().props.disabled, false, 'Apply remains visible/enabled when the corrected guide is level');
    const leveledPreviews = [...previews];
    assert.equal(clickButton(root, 'Straighten'), false);
    assert.deepEqual(previews, leveledPreviews);
    assert.deepEqual(applied, []);

    function all(node: TestElement): TestElement[] { return [node, ...node.children.flatMap(all)]; }
    function hasControl(label: string) {
        return all(root).some(node => node.props['aria-label'] === label || node.props.label === label);
    }
    function input(label: string, value: string) {
        const field = all(root).find(node => node.type === 'input' && node.props['aria-label'] === label);
        assert.ok(field, label);
        const handler = field.props.onInput;
        assert.ok(typeof handler === 'function', `${label} emits input`);
        handler({ target: { value, valueAsNumber: Number(value) } });
        const formInput = all(root).find(node => node.type === 'form')?.props.onInput;
        if (typeof formInput === 'function') formInput({ target: { getAttribute: () => label } });
    }
    input('Straighten angle slider', '60');
    await nextTick();
    assert.equal(previews.at(-1), 60);
    assert.equal(straightenButton().props.disabled, false);
    const mountedSurface = findAll(root, 'crop-surface')[0];
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    assert.equal(previews.at(-1), -26.57);
    assert.equal(findAll(root, 'crop-surface')[0], mountedSurface, 'reapply does not remount CropOverlay');
    const automatic = straightenCrop({ width: 800, height: 600 }, -26.57);
    assert.deepEqual(findAll(root, 'crop-selection')[0]?.props.style, {
        left: `${automatic.x / 800 * 100}%`, top: `${automatic.y / 600 * 100}%`,
        width: `${automatic.width / 800 * 100}%`, height: `${automatic.height / 600 * 100}%`,
    }, 'automatic framing still follows the measured angle before manual framing');
    assert.equal(straightenButton().props.disabled, true);
    assert.deepEqual(applied, [], 'reapply previews without a document commit');
    const rotationHandle = findAll(root, 'crop-handle')[0];
    const rotateKey = rotationHandle?.props.onKeydown;
    assert.ok(typeof rotateKey === 'function');
    rotateKey({ key: 'ArrowRight', shiftKey: false, preventDefault() {}, stopPropagation() {} });
    await nextTick();
    assert.equal(previews.at(-1), -26.47, 'keyboard corner rotation is immediate');
    assert.equal(straightenButton().props.disabled, false);
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    assert.equal(previews.at(-1), -26.57);
    input('Straighten angle in degrees', '-63.4');
    await nextTick();
    assert.equal(previews.at(-1), -63.4);
    for (const label of ['Crop X', 'Crop Y', 'Crop width', 'Crop height']) {
        assert.equal(all(root).some(node => node.props['aria-label'] === label), false);
    }
    const handles = findAll(root, 'crop-handle');
    assert.equal(handles.filter(handle => String(handle.props['aria-label']).startsWith('Rotate image from')).length, 4);
    assert.equal(handles.filter(handle => String(handle.props['aria-label']).startsWith('Resize crop')).length, 0);
    assert.equal(hasControl('Snap to pixel'), false);
    assert.equal(hasControl('Reset angle'), false);
    const auto = straightenCrop({ width: 800, height: 600 }, -63.4);
    const cropSurface = findAll(root, 'crop-surface')[0];
    assert.ok(cropSurface);
    const pointerEvent = (type: string, point: { x: number, y: number }) => ({
        type,
        pointerId: 7,
        button: 0,
        shiftKey: false,
        clientX: 100 + point.x / 2,
        clientY: 80 + point.y / 2,
        currentTarget: cropSurface,
        preventDefault() {},
        stopPropagation() {},
    });
    const start = { x: 400, y: 300 };
    const dispatchRotationPointer = (name: string, event: object) => {
        const handler = cropSurface.props[name];
        assert.ok(typeof handler === 'function');
        Reflect.apply(handler, undefined, [event]);
    };
    // Interior/outside presses are inert: no drag state, so reapply stays available.
    dispatchRotationPointer('onPointerdown', pointerEvent('pointerdown', start));
    await nextTick();
    assert.equal(straightenButton().props.disabled, false, 'interior press does not start a drag');
    dispatchRotationPointer('onPointerup', pointerEvent('pointerup', start));
    // A corner rotation drag (returned to its start) blocks reapply while active.
    const dragHandle = rotationHandle?.props.onPointerdown;
    assert.ok(typeof dragHandle === 'function');
    dragHandle(pointerEvent('pointerdown', start));
    await nextTick();
    assert.equal(straightenButton().props.disabled, true, 'active rotation drag blocks reapply');
    // Fieldset disabling is native; force submit to exercise the overlay guard too.
    submit();
    enterAngle('Straighten angle in degrees');
    assert.deepEqual(applied, [], 'drag blocks Apply and Enter even when invoked directly');
    const forceClick = straightenButton().props.onClick;
    assert.ok(typeof forceClick === 'function');
    forceClick();
    await nextTick();
    assert.equal(previews.at(-1), -63.4, 'guard blocks even a forced disabled click during drag');
    dispatchRotationPointer('onPointermove', pointerEvent('pointermove', start));
    dispatchRotationPointer('onPointerup', pointerEvent('pointerup', start));
    await nextTick();
    const image = { width: 800, height: 600 };
    const chosen = auto;
    assert.deepEqual(constrainCropInsideRotatedImage(chosen, image, -26.57), chosen, 'fitting intent is retained exactly on reapply');
    assert.notDeepEqual(constrainCropInsideRotatedImage(chosen, image, 45), chosen, 'test also exercises a constrained frame');
    function assertFrame(angle: number) {
        const expected = straightenCrop(image, angle);
        const selection = findAll(root, 'crop-selection')[0];
        assert.deepEqual(selection?.props.style, {
            left: `${expected.x / image.width * 100}%`,
            top: `${expected.y / image.height * 100}%`,
            width: `${expected.width / image.width * 100}%`,
            height: `${expected.height / image.height * 100}%`,
        });
        assert.equal(findAll(root, 'crop-surface')[0], cropSurface);
    }
    assert.equal(straightenButton().props.disabled, false, 'rotation drag back to start does not level the line');
    for (let cycle = 0; cycle < 3; cycle++) {
        assert.ok(clickButton(root, 'Straighten'));
        await nextTick();
        assert.equal(previews.at(-1), -26.57);
        assertFrame(-26.57);
        assert.equal(straightenButton().props.disabled, true);
        assert.deepEqual(applied, []);
        input('Straighten angle in degrees', '90');
        await nextTick();
        assertFrame(90);
        input('Straighten angle in degrees', '45');
        await nextTick();
        assertFrame(45);
        input('Straighten angle in degrees', '-63.4');
        await nextTick();
        assertFrame(-63.4);
    }
    busy.value = true;
    await nextTick();
    assert.equal(straightenButton().props.disabled, true);
    const busyClick = straightenButton().props.onClick;
    assert.ok(typeof busyClick === 'function');
    busyClick();
    await nextTick();
    assert.equal(previews.at(-1), -63.4);
    submit();
    enterAngle('Straighten angle slider');
    assert.deepEqual(applied, [], 'busy framing submission cannot commit');
    busy.value = false;
    await nextTick();
    input('Straighten angle in degrees', '0');
    await nextTick();
    assert.equal(applyButton().props.disabled, true, 'automatic full frame at zero cannot apply');
    enterAngle('Straighten angle in degrees');
    assert.deepEqual(applied, []);
    applied.length = 0;
    input('Straighten angle in degrees', '90');
    await nextTick();
    submit();
    assert.deepEqual(applied, [[straightenCrop(image, 90), 90]]);

    app.unmount();
    const { default: realCropOverlay }: { default: Component } = await import(cropUrl);
    app = renderer.createApp(realCropOverlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
    });
    app.mount(root);
    const cropHandles = findAll(root, 'crop-handle');
    assert.equal(cropHandles.length, 8);
    assert.equal(cropHandles.filter(handle => String(handle.props['aria-label']).startsWith('Resize crop')).length, 8);
    assert.equal(cropHandles.filter(handle => String(handle.props['aria-label']).startsWith('Rotate image from')).length, 0);
    assert.equal(buttons(root).some(button => button.props['aria-label'] === 'Straighten'), false);
    const cursorOf = (node: TestElement) => (node.props.style as { cursor?: string }).cursor;
    const nativeCursors = [
        'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize',
        'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize',
    ];
    assert.deepEqual(cropHandles.map(cursorOf), nativeCursors);
    const ordinarySurface = findAll(root, 'crop-surface')[0];
    assert.ok(ordinarySurface);
    const cropCorner = cropHandles[0];
    assert.ok(cropCorner);
    dispatch(cropCorner, 'onPointerdown', 100, 80);
    await nextTick();
    assert.equal(cursorOf(ordinarySurface), undefined);
    assert.deepEqual(cropHandles.map(cursorOf), nativeCursors, 'ordinary Crop keeps native cursors even during a corner drag');

    app.unmount();
    const panning = shallowRef(false);
    app = renderer.createApp({
        setup: () => () => h(realCropOverlay, {
            image, straighten: true, disabled: busy.value, panMode: panning.value,
        }),
    });
    app.mount(root);
    const rotationSurface = findAll(root, 'crop-surface')[0];
    assert.ok(rotationSurface);
    const corners = [
        ['nw', 'top left'], ['ne', 'top right'], ['se', 'bottom right'], ['sw', 'bottom left'],
    ] as const;
    function assertHoverCursors() {
        const handles = findAll(root, 'crop-handle');
        assert.equal(handles.length, 4);
        for (const [corner, label] of corners) {
            const handle = handles.find(node => node.props['aria-label'] === `Rotate image from ${label}`);
            assert.ok(handle);
            assert.equal(cursorOf(handle), rotationCursors[corner]);
        }
        assert.equal(cursorOf(rotationSurface), undefined);
        assert.ok(!String(rotationSurface.props.class).includes('is-rotating'));
    }
    assertHoverCursors();
    for (const [corner, label] of corners) {
        for (const [event, type] of [
            ['onPointerup', 'pointerup'], ['onPointercancel', 'pointercancel'], ['onLostpointercapture', 'lostpointercapture'],
        ]) {
            const handle = buttons(root).find(node => node.props['aria-label'] === `Rotate image from ${label}`);
            assert.ok(handle && event && type);
            dispatch(handle, 'onPointerdown', 200, 180);
            await nextTick();
            assert.equal(rotationSurface.capturedPointer, 7);
            assert.equal(cursorOf(rotationSurface), rotationCursors[corner]);
            assert.ok(String(rotationSurface.props.class).includes('is-rotating'));
            const selection = findAll(root, 'crop-selection')[0];
            assert.ok(selection);
            // Captured pointer events keep arriving on the surface across all hit targets and outside.
            for (const target of [selection, ...findAll(root, 'crop-handle'), rotationSurface]) {
                const move = rotationSurface.props.onPointermove;
                assert.ok(typeof move === 'function');
                move({ button: 0, pointerId: 7, clientX: -100, clientY: 900, target });
                await nextTick();
                assert.equal(cursorOf(rotationSurface), rotationCursors[corner]);
                assert.ok(findAll(root, 'crop-handle').every(node => cursorOf(node) === 'inherit'));
            }
            const finish = rotationSurface.props[event];
            assert.ok(typeof finish === 'function');
            finish({ type, pointerId: 7, clientX: 200, clientY: 180 });
            await nextTick();
            assert.equal(rotationSurface.capturedPointer, null);
            assertHoverCursors();
        }
    }
    const firstCorner = findAll(root, 'crop-handle')[0];
    assert.ok(firstCorner);
    busy.value = true;
    await nextTick();
    dispatch(firstCorner, 'onPointerdown', 200, 180);
    await nextTick();
    assertHoverCursors();
    assert.equal(rotationSurface.capturedPointer, null, 'disabled handles cannot begin rotation');
    busy.value = false;
    await nextTick();
    const beforePanAngle = all(root).find(node => node.props['aria-label'] === 'Straighten angle in degrees')?.props.value;
    dispatch(firstCorner, 'onPointerdown', 200, 180);
    dispatch(rotationSurface, 'onPointermove', 300, 180);
    await nextTick();
    assert.equal(rotationSurface.capturedPointer, 7);
    panning.value = true;
    await nextTick();
    assert.equal(cursorOf(rotationSurface), undefined, 'pan cursor takes priority over active rotation');
    assert.equal(findAll(root, 'crop-handle').length, 0);
    assert.equal(rotationSurface.capturedPointer, null, 'entering pan releases rotation capture');
    dispatch(rotationSurface, 'onPointermove', 400, 180);
    dispatch(rotationSurface, 'onPointerup', 400, 180);
    await nextTick();
    assert.equal(all(root).find(node => node.props['aria-label'] === 'Straighten angle in degrees')?.props.value,
        beforePanAngle, 'pan restores the pre-gesture angle and prevents further rotation');
    panning.value = false;
    await nextTick();
    assertHoverCursors();
    const restoredCorner = findAll(root, 'crop-handle')[0];
    assert.ok(restoredCorner);
    dispatch(restoredCorner, 'onPointerdown', 200, 180);
    dispatch(rotationSurface, 'onPointermove', 300, 180);
    await nextTick();
    busy.value = true;
    await nextTick();
    assert.equal(rotationSurface.capturedPointer, null, 'processing also releases rotation capture');
    dispatch(rotationSurface, 'onPointerup', 400, 180);
    await nextTick();
    assert.equal(all(root).find(node => node.props['aria-label'] === 'Straighten angle in degrees')?.props.value,
        beforePanAngle, 'processing cannot finish a stale rotation');
    busy.value = false;

    // An inert interior press must not alter automatic fit across reapply/zero cycles.
    app.unmount();
    applied.length = 0;
    app = renderer.createApp(realOverlay, {
        image, disabled: false, panMode: false,
        onApply: (crop: unknown, angle: number) => applied.push([crop, angle]),
    });
    app.mount(root);
    const newSurface = root.children[0];
    assert.ok(newSurface);
    dispatch(newSurface, 'onClick', 200, 180);
    dispatch(newSurface, 'onClick', 400, 280);
    await nextTick();
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    input('Straighten angle in degrees', '0');
    await nextTick();
    assert.equal(applyButton().props.disabled, true, 'automatic full frame at zero is a no-op despite guide history');
    submit();
    assert.deepEqual(applied, []);
    const fullFrameSurface = findAll(root, 'crop-surface')[0];
    assert.ok(fullFrameSurface);
    for (const [name, type] of [['onPointerdown', 'pointerdown'], ['onPointerup', 'pointerup']]) {
        assert.ok(name && type);
        const handler = fullFrameSurface.props[name];
        assert.ok(typeof handler === 'function');
        handler({ ...pointerEvent(type, start), currentTarget: fullFrameSurface });
    }
    await nextTick();
    const constrained = straightenCrop(image, -26.57);
    for (let cycle = 0; cycle < 3; cycle++) {
        assert.ok(clickButton(root, 'Straighten'));
        await nextTick();
        assert.equal(findAll(root, 'crop-surface')[0], fullFrameSurface);
        assert.deepEqual(findAll(root, 'crop-selection')[0]?.props.style, {
            left: `${constrained.x / 800 * 100}%`, top: `${constrained.y / 600 * 100}%`,
            width: `${constrained.width / 800 * 100}%`, height: `${constrained.height / 600 * 100}%`,
        }, 'an inert interior press leaves automatic fit in place on every reapply');
        assert.deepEqual(applied, []);
        input('Straighten angle in degrees', '0');
        await nextTick();
        assert.equal(applyButton().props.disabled, true, 'restored full-frame intent at zero disables Apply');
        submit();
        enterAngle('Straighten angle in degrees');
        assert.deepEqual(applied, []);
        assert.deepEqual(findAll(root, 'crop-selection')[0]?.props.style, {
            left: '0%', top: '0%', width: '100%', height: '100%',
        }, 'returning to zero restores full frame without cumulative shrink');
    }

    // Both pointer and keyboard corner rotation work before and after the optional guide.
    for (const image of [{ width: 800, height: 600 }, { width: 600, height: 900 }]) {
        app.unmount();
        const dirty: boolean[] = [];
        previews.length = 0;
        app = renderer.createApp(realOverlay, {
            image, disabled: false, panMode: false,
            onPreview: (angle: number) => previews.push(angle),
            onDirty: (value: boolean) => dirty.push(value),
        });
        app.mount(root);
        const guideSurface = root.children[0];
        const frame = findAll(root, 'crop-surface')[0];
        const handle = findAll(root, 'crop-handle')[0];
        assert.ok(guideSurface && frame && handle);
        assert.notEqual(dirty.at(-1), true, 'the entry frame is not an edit');
        assert.equal(applyButton().props.disabled, true);
        const pointer = (type: string, x: number, y: number) => ({
            type, pointerId: 7, button: 0, isPrimary: true, shiftKey: false,
            clientX: x, clientY: y, currentTarget: frame, target: frame,
            preventDefault() {}, stopPropagation() {},
        });
        const begin = handle.props.onPointerdown;
        const move = frame.props.onPointermove;
        const finish = frame.props.onPointerup;
        assert.ok(typeof begin === 'function' && typeof move === 'function' && typeof finish === 'function');
        begin(pointer('pointerdown', 110, 90));
        move(pointer('pointermove', 180, 90));
        finish(pointer('pointerup', 180, 90));
        await nextTick();
        const rotated = previews.at(-1);
        assert.ok(rotated && Math.abs(rotated) > 1, 'a corner drag rotates immediately without a guide');
        assert.equal(applyButton().props.disabled, false);
        assert.equal(findAll(root, 'straighten-point').length, 0);
        assert.equal(dirty.at(-1), true);

        const start = { x: image.width / 4, y: image.height / 3 };
        const end = { x: image.width * 3 / 4, y: image.height * 2 / 3 };
        const client = (point: { x: number, y: number }) => ({
            x: 100 + point.x / image.width * 400,
            y: 80 + point.y / image.height * 300,
        });
        const firstClient = client(start);
        const secondClient = client(end);
        const beforeGuide = [...previews];
        dispatchPointer(guideSurface, 'onPointerdown', firstClient.x, firstClient.y);
        dispatchPointer(guideSurface, 'onPointermove', secondClient.x, secondClient.y);
        dispatchPointer(guideSurface, 'onPointerup', secondClient.x, secondClient.y);
        await nextTick();
        assert.deepEqual(previews, beforeGuide, 'drawing after corner rotation does not level the preview');
        const first = straightenedToSourcePoint(start, image, rotated);
        const second = straightenedToSourcePoint(end, image, rotated);
        assertGuideForImage(root, image, first, second, rotated);
        const key = handle.props.onKeydown;
        assert.ok(typeof key === 'function');
        key({ key: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {} });
        await nextTick();
        const adjusted = previews.at(-1);
        assert.ok(adjusted !== undefined);
        assert.equal(adjusted, Math.round((rotated + 1) * 100) / 100);
        assertGuideForImage(root, image, first, second, adjusted);
        assert.equal(findAll(root, 'crop-surface')[0], frame, 'frame identity survives both workflows');
        assert.equal(findAll(root, 'crop-handle').length, 4, 'only existing corner handles are used');
    }
});

test('Straighten frame and controls are visible on entry; the action stays disabled until a valid line exists', async (t) => {
    const root = element('root');
    const app = renderer.createApp(overlay, { image: { width: 800, height: 600 }, disabled: false, panMode: false });
    t.after(() => app.unmount());
    mockWindow(t);
    app.mount(root);
    const surface = root.children[0];
    assert.ok(surface);
    const controls = surface.children.find(child => child.type === 'test-crop');
    assert.ok(controls);
    assert.equal(controls.props.angle, 0);
    assert.equal(controls.props.valid, true);
    assert.equal(clickButton(root, 'Straighten'), false);
    dispatch(surface, 'onClick', 200, 180);
    await nextTick();
    assert.equal(clickButton(root, 'Straighten'), false, 'one point is not a line');
    assert.match(await readFile(new URL('../../controls/CropControls.vue', import.meta.url), 'utf8'),
        /BaseRangeInput[\s\S]*Straighten angle slider[\s\S]*BaseNumberInput[\s\S]*Straighten angle in degrees[\s\S]*BaseIconButton[\s\S]*title="Straighten"/);
});

test('guide alignment uses the current angle modulo 180 with rounding tolerance in both endpoint orders', async (t) => {
    mockWindow(t);
    for (const degrees of [0, 0.014, -0.014, 26.565, 90, -90]) {
        for (const reverse of [false, true]) {
            const root = element('root');
            const previews: number[] = [];
            const applied: unknown[] = [];
            const app = renderer.createApp(overlay, {
                image: { width: 800, height: 600 }, disabled: false, panMode: false,
                onPreview: (angle: number) => previews.push(angle),
                onApply: (...args: unknown[]) => applied.push(args),
            });
            try {
                app.mount(root);
                const surface = root.children[0];
                assert.ok(surface);
                const controls = surface.children.find(child => child.type === 'test-crop');
                const setAngle = controls?.props.onAngle;
                assert.ok(typeof setAngle === 'function');
                const radians = degrees * Math.PI / 180;
                const points = [
                    { x: 400 - 150 * Math.cos(radians), y: 300 - 150 * Math.sin(radians) },
                    { x: 400 + 150 * Math.cos(radians), y: 300 + 150 * Math.sin(radians) },
                ];
                if (reverse) points.reverse();
                const [first, second] = points;
                assert.ok(first && second);
                for (const point of points) dispatch(surface, 'onClick', 100 + point.x / 2, 80 + point.y / 2);
                await nextTick();
                assert.equal(buttons(root)[0]?.props.disabled, degrees === 0, 'already horizontal guides cannot activate');
                const correction = levelingAngle(first, second);
                setAngle(correction);
                await nextTick();
                assert.equal(buttons(root)[0]?.props.disabled, true, 'rounded measured correction is level');
                const before = [...previews];
                const forcedClick = buttons(root)[0]?.props.onClick;
                assert.ok(typeof forcedClick === 'function');
                forcedClick();
                await nextTick();
                assert.deepEqual(previews, before, 'aligned action emits no preview');
                assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'aligned action retains the existing frame');

                if (Math.abs(correction) === 90) {
                    setAngle(-correction);
                    await nextTick();
                    assert.equal(buttons(root)[0]?.props.disabled, true, '±90 corrections are equivalent');
                }
                for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -91, 91]) {
                    setAngle(invalid);
                    await nextTick();
                    assert.equal(buttons(root)[0]?.props.disabled, true, 'invalid angles cannot enable correction');
                }
                // Offset from the unrounded correction so the tolerance itself is exercised.
                const exactCorrection = -Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
                const normalized = exactCorrection > 90 ? exactCorrection - 180
                    : exactCorrection <= -90 ? exactCorrection + 180 : exactCorrection;
                const direction = normalized >= 0 ? -1 : 1;
                setAngle(normalized + direction * 0.01);
                await nextTick();
                assert.equal(buttons(root)[0]?.props.disabled, true, '0.01° residual is aligned');
                setAngle(normalized + direction * 0.01001);
                await nextTick();
                assert.equal(buttons(root)[0]?.props.disabled, false, 'angle change beyond tolerance re-enables');
                assert.ok(clickButton(root, 'Straighten'));
                await nextTick();
                assert.equal(previews.at(-1), correction);
                assert.equal(buttons(root)[0]?.props.disabled, true, 'action persists, disabled after correction');
                assert.deepEqual(applied, []);
            } finally {
                app.unmount();
            }
        }
    }
});

test('manual angle previews before measuring; clicks map back to source so Straighten levels the measured line once', async (t) => {
    const previews: number[] = [];
    const dirty: boolean[] = [];
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onPreview: (angle: number) => previews.push(angle),
        onDirty: (value: boolean) => dirty.push(value),
    });
    t.after(() => app.unmount());
    mockWindow(t);
    app.mount(root);
    const surface = root.children[0];
    assert.ok(surface);
    const controls = surface.children.find(child => child.type === 'test-crop');
    const setAngle = controls?.props.onAngle;
    assert.ok(typeof setAngle === 'function');
    setAngle(20);
    await nextTick();
    assert.deepEqual(previews, [20]);
    assert.equal(dirty.at(-1), true, 'manual pre-line edits are dirty');
    // Display (rotated preview) points; stored guide points are their inverse-rotated source positions.
    const displays = [{ x: 200, y: 200 }, { x: 600, y: 400 }];
    for (const point of displays) dispatch(surface, 'onClick', 100 + point.x / 2, 80 + point.y / 2);
    await nextTick();
    const rad = -20 * Math.PI / 180;
    const sources = displays.map(({ x, y }) => ({
        x: 400 + (x - 400) * Math.cos(rad) - (y - 300) * Math.sin(rad),
        y: 300 + (x - 400) * Math.sin(rad) + (y - 300) * Math.cos(rad),
    }));
    assert.deepEqual(previews, [20], 'completing the line keeps the current preview');
    assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'manual rotation and guide share the entry frame');
    assertGuide(root, sources[0] ?? displays[0]!, sources[1] ?? displays[1]!, 20, 2);
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    const [a, b] = sources;
    assert.ok(a && b);
    const expected = -Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    assert.equal(previews.length, 2, 'Straighten starts exactly one preview update');
    assert.ok(Math.abs((previews.at(-1) ?? 0) - expected) < 0.01);
    assert.equal(surface.children.find(child => child.type === 'test-crop'), controls, 'leveling never remounts the frame');
});

test('manual pre-line edits route Cancel and Escape through the dirty close guard without applying', async (t) => {
    mockWindow(t);
    const activeTool = shallowRef<ToolId | null>('straighten');
    const busy = shallowRef(false);
    const brushDirty = shallowRef(false);
    const guardScope = effectScope();
    const guard = guardScope.run(() => useToolCloseGuard({ activeTool, busy, brushDirty }));
    assert.ok(guard);

    const applied: unknown[] = [];
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onDirty: (value: boolean) => guard.reportDirty(value),
        onCancel: () => guard.request({ kind: 'close' }),
        onApply: (...args: unknown[]) => applied.push(args),
    });
    try {
        app.mount(root);

        const surface = root.children[0];
        assert.ok(surface);
        const controls = surface.children.find(child => child.type === 'test-crop');
        const setAngle = controls?.props.onAngle;
        assert.ok(typeof setAngle === 'function');
        setAngle(12);
        await nextTick();

        assert.equal(clickButton(root, 'Cancel straighten'), true);
        assert.deepEqual(guard.pendingIntent.value, { kind: 'close' });
        assert.equal(activeTool.value, 'straighten', 'dirty Cancel asks before closing');
        assert.deepEqual(applied, []);

        guard.keepEditing();
        assert.equal(guard.pendingIntent.value, null);
        const keydown = surface.props.onKeydown;
        for (const handler of Array.isArray(keydown) ? keydown : [keydown]) {
            assert.ok(typeof handler === 'function');
            handler({
                key: 'Escape', target: surface, currentTarget: surface,
                preventDefault() {}, stopPropagation() {},
            });
        }
        await nextTick();
        assert.deepEqual(guard.pendingIntent.value, { kind: 'close' }, 'Escape still sees the uncommitted angle as dirty');
        assert.equal(activeTool.value, 'straighten');
        assert.deepEqual(applied, []);

        guard.discardChanges();
        assert.equal(activeTool.value, null);
        assert.equal(guard.pendingIntent.value, null);
        assert.deepEqual(applied, []);
    } finally {
        app.unmount();
        guardScope.stop();
    }
});

test('invalid manual angle never previews but measuring still works; busy state blocks placement and action', async (t) => {
    const previews: number[] = [];
    const root = element('root');
    const app = renderer.createApp(overlay, {
        image: { width: 800, height: 600 }, disabled: false, panMode: false,
        onPreview: (angle: number) => previews.push(angle),
    });
    t.after(() => app.unmount());
    mockWindow(t);
    app.mount(root);
    const surface = root.children[0];
    assert.ok(surface);
    const controls = surface.children.find(child => child.type === 'test-crop');
    const setAngle = controls?.props.onAngle;
    assert.ok(typeof setAngle === 'function');
    setAngle(120);
    await nextTick();
    assert.equal(controls?.props.valid, false);
    assert.deepEqual(previews, []);
    dispatch(surface, 'onClick', 200, 180);
    dispatch(surface, 'onClick', 400, 180);
    await nextTick();
    assert.equal(clickButton(root, 'Straighten'), false, 'invalid angle must not be replaced by the action');
    assert.deepEqual(previews, []);
    setAngle(10);
    await nextTick();
    assert.ok(clickButton(root, 'Straighten'));
    await nextTick();
    assert.equal(previews.at(-1), 0, 'valid manual rotation can re-enable the measured correction');

    const busyRoot = element('root');
    const busy = renderer.createApp(overlay, { image: { width: 800, height: 600 }, disabled: true, panMode: false });
    busy.mount(busyRoot);
    const busySurface = busyRoot.children[0];
    assert.ok(busySurface);
    dispatch(busySurface, 'onClick', 200, 180);
    dispatch(busySurface, 'onClick', 400, 180);
    await nextTick();
    assert.equal(findAll(busyRoot, 'straighten-point').length, 0);
    assert.equal(clickButton(busyRoot, 'Straighten'), false);
    busy.unmount();
});

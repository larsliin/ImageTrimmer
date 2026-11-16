import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { createRenderer, nextTick, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';

async function loadComponent(name: string): Promise<Component> {
    const source = await readFile(new URL(`../../components/editor/${name === 'ToolModal' ? 'dialogs' : 'chrome'}/${name}.vue`, import.meta.url), 'utf8');
    const { descriptor } = parse(source);
    const script = compileScript(descriptor, { id: `${name}-drag-test`, inlineTemplate: true }).content;
    const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
        .replaceAll("'chrome-extension-component-library'", JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
        .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')))
        .replaceAll("'@/lib/drag'", JSON.stringify(new URL('../drag.ts', import.meta.url).href))
        .replaceAll("'@/composables/useDragOffset'", JSON.stringify(new URL('../../composables/useDragOffset.ts', import.meta.url).href));
    const { default: component }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    return component;
}

const modal = await loadComponent('ToolModal');
const toolbar = await loadComponent('FloatingToolbar');

class HostElement extends EventTarget {
    tag: string;
    props: Record<string, unknown> = {};
    captures = new Set<number>();
    captureError = false;
    panel: HostElement | null = null;
    showCount = 0;

    constructor(tag: string) {
        super();
        this.tag = tag;
    }

    show() { this.showCount += 1; }
    close() {}
    focus() {}

    setPointerCapture(id: number) {
        if (this.captureError) throw new DOMException('Inactive pointer', 'NotFoundError');
        this.captures.add(id);
    }

    hasPointerCapture(id: number) {
        return this.captures.has(id);
    }

    releasePointerCapture(id: number) {
        this.captures.delete(id);
        this.send('lostpointercapture', { pointerId: id });
    }

    getBoundingClientRect() {
        if (this.panel) {
            const rect = this.panel.getBoundingClientRect();
            return this.props.class === 'tool-modal__grip'
                ? { left: rect.left + rect.width / 2 - 20, top: rect.top + 5, width: 40, height: 12 }
                : { left: rect.left + 7, top: rect.top + 7, width: 12, height: rect.height - 14 };
        }
        const style = this.props.style as { transform?: string, left?: string, top?: string } | undefined;
        const translation = /translate\(([-.\d]+)px, ([-.\d]+)px\)/.exec(style?.transform ?? '');
        const coordinate = (value: string | undefined, viewport: number, fallback: number) =>
            value ? Number.parseFloat(value) * (value.endsWith('%') ? viewport / 100 : 1) : fallback;
        const centered = style?.transform?.includes('translate(-50%, -50%)');
        return {
            left: coordinate(style?.left, window.innerWidth, 200 + (window.innerWidth - 1000) / 2)
                - (centered ? 210 : 0) + Number(translation?.[1] ?? 0),
            top: coordinate(style?.top, window.innerHeight, 150 + (window.innerHeight - 800) / 2)
                - (centered ? 150 : 0) + Number(translation?.[2] ?? 0),
            width: 420,
            height: 300,
        };
    }

    send(type: string, values: Record<string, unknown> = {}) {
        const event = new Event(type, { cancelable: true });
        for (const [key, value] of Object.entries({ button: 0, buttons: 1, pointerId: 1, clientX: 410, clientY: 167, ...values })) {
            Object.defineProperty(event, key, { value });
        }
        this.addEventListener(type, (received) => {
            const handler = this.props[`on${type[0]!.toUpperCase()}${type.slice(1)}`];
            assert.equal(typeof handler, 'function', `the real template must wire ${type}`);
            if (typeof handler === 'function') handler(received);
        }, { once: true });
        this.dispatchEvent(event);
    }
}

function setup(t: TestContext, component = modal) {
    let cancelCount = 0;
    const elements: HostElement[] = [];
    const body = new HostElement('body');
    const browserWindow = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 800 });
    const browserDocument = Object.assign(new EventTarget(), { hidden: false, activeElement: null });
    const globals = { Element: HostElement, HTMLElement: HostElement, window: browserWindow, document: browserDocument };
    const restoreGlobals: (() => void)[] = [];
    for (const [key, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        restoreGlobals.push(() => {
            if (previous) Object.defineProperty(globalThis, key, previous);
            else Reflect.deleteProperty(globalThis, key);
        });
    }
    const renderer = createRenderer<HostElement, HostElement>({
        createElement(tag) {
            const element = new HostElement(tag);
            elements.push(element);
            return element;
        },
        createText: () => new HostElement('#text'),
        createComment: () => new HostElement('#comment'),
        insert() {},
        remove() {},
        setText() {},
        setElementText() {},
        patchProp(element, key, _previous, next) { element.props[key] = next; },
        parentNode: () => null,
        nextSibling: () => null,
        querySelector: () => body,
    });
    const app = renderer.createApp(component, component === modal
        ? { title: 'Levels', canApply: true, busy: false, onCancel: () => { cancelCount += 1; } }
        : { label: 'Crop toolbar' });
    app.mount(new HostElement('root'));
    t.after(() => {
        app.unmount();
        for (const restore of restoreGlobals) restore();
    });
    const dialog = elements.find(element => component === modal
        ? element.tag === 'dialog'
        : String(element.props.class).includes('floating-toolbar'))!;
    const grip = elements.find(element => element.props.class === (component === modal ? 'tool-modal__grip' : 'floating-toolbar__grip'))!;
    grip.panel = dialog;
    const isDragging = () => String(dialog.props.class).includes('is-dragging');
    return { app, dialog, grip, isDragging, browserWindow, browserDocument, cancelCount: () => cancelCount };
}

test('popup opens without making the header inert and supports Escape outside the dialog', (t) => {
    const { dialog, browserDocument, cancelCount } = setup(t);
    assert.equal(dialog.showCount, 1, 'open as a non-modal dialog so header controls remain reachable');
    const escape = new Event('keydown', { cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    browserDocument.dispatchEvent(escape);
    assert.equal(cancelCount(), 1);
    assert.equal(escape.defaultPrevented, true);
});

test('popup does not cancel when a header control already handled Escape', (t) => {
    const { browserDocument, cancelCount } = setup(t);
    const escape = new Event('keydown', { cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    escape.preventDefault();
    browserDocument.dispatchEvent(escape);
    assert.equal(cancelCount(), 0, 'cancelling filename editing must not also discard popup edits');
});

for (const [name, component] of [['popup', modal], ['floating toolbar', toolbar]] as const) {
    test(`${name} stays stationary on resize until an edge meets the grip`, async (t) => {
        const { dialog, grip, browserWindow } = setup(t, component);
        await nextTick();
        const initial = dialog.getBoundingClientRect();
        for (const [width, height] of [[700, 500], [1400, 1000]]) {
            browserWindow.innerWidth = width!;
            browserWindow.innerHeight = height!;
            browserWindow.dispatchEvent(new Event('resize'));
            await nextTick();
            assert.deepEqual(dialog.getBoundingClientRect(), initial, 'resizing must not reposition the tool');
        }
        grip.send('pointerdown');
        grip.send('pointermove', { clientX: 460, clientY: 207 });
        await nextTick();
        grip.send('pointerup');
        await nextTick();
        const moved = dialog.getBoundingClientRect();
        assert.equal(moved.left, initial.left + 50);
        assert.equal(moved.top, initial.top + 40);
        browserWindow.innerWidth = 500;
        browserWindow.innerHeight = 600;
        browserWindow.dispatchEvent(new Event('resize'));
        await nextTick();
        assert.deepEqual(dialog.getBoundingClientRect(), moved, 'resizing must preserve the dragged position');
        for (const [width, height] of [[300, 320], [240, 300]]) {
            const before = grip.getBoundingClientRect();
            browserWindow.innerWidth = width!;
            browserWindow.innerHeight = height!;
            browserWindow.dispatchEvent(new Event('resize'));
            await nextTick();
            const handle = grip.getBoundingClientRect();
            assert.equal(handle.left, Math.max(0, Math.min(before.left, width! - before.width)));
            assert.equal(handle.top, Math.max(0, Math.min(before.top, height! - before.height)));
        }
        const clamped = dialog.getBoundingClientRect();
        browserWindow.innerWidth = 1400;
        browserWindow.innerHeight = 1000;
        browserWindow.dispatchEvent(new Event('resize'));
        await nextTick();
        assert.deepEqual(dialog.getBoundingClientRect(), clamped, 'expanding the window must not move the tool back');
        grip.send('keydown', { key: 'Home' });
        await nextTick();
        assert.deepEqual(dialog.getBoundingClientRect(), initial, 'Home restores the opening pixel position');
    });
}

for (const [name, component] of [['popup', modal], ['floating toolbar', toolbar]] as const) {
    test(`${name} allows panel overflow but keeps its entire grip inside during captured dragging`, async (t) => {
        const { dialog, grip, isDragging, browserWindow } = setup(t, component);
        await nextTick();
        grip.send('pointerdown');
        for (const [clientX, clientY, edge] of [
            [-1000, 167, 'left'],
            [2000, 167, 'right'],
            [410, -1000, 'top'],
            [410, 2000, 'bottom'],
        ]) {
            grip.send('pointermove', { clientX, clientY });
            await nextTick();
            const rect = dialog.getBoundingClientRect();
            const handle = grip.getBoundingClientRect();
            assert.ok(handle.left >= 0 && handle.top >= 0);
            assert.ok(handle.left + handle.width <= browserWindow.innerWidth);
            assert.ok(handle.top + handle.height <= browserWindow.innerHeight);
            if (edge === 'left') assert.ok(rect.left < 0, 'panel may overflow left');
            if (edge === 'right') assert.ok(rect.left + rect.width > browserWindow.innerWidth, 'panel may overflow right');
            if (edge === 'top') assert.ok(rect.top < 0, 'panel may overflow above the viewport');
            if (edge === 'bottom') assert.ok(rect.top + rect.height > browserWindow.innerHeight, 'panel may overflow below the viewport');
            assert.equal(isDragging(), true);
            assert.equal(grip.hasPointerCapture(1), true);
            grip.send('pointermove', { clientX: 430, clientY: 187 });
            await nextTick();
            assert.equal(dialog.getBoundingClientRect().left, 220);
            assert.equal(dialog.getBoundingClientRect().top, 170);
        }
        grip.send('pointerup');
        await nextTick();
        assert.equal(isDragging(), false);
        assert.equal(dialog.getBoundingClientRect().top, 170, 'committing a drag preserves its position');
        grip.send('keydown', { key: 'ArrowRight', shiftKey: true });
        await nextTick();
        assert.equal(dialog.getBoundingClientRect().left, 270);
    });
}

test('keyboard movement keeps floating toolbar reachable even when wider than the viewport', async (t) => {
    const { dialog, grip, browserWindow } = setup(t, toolbar);
    await nextTick();
    browserWindow.innerWidth = 300;
    browserWindow.innerHeight = 400;
    grip.send('keydown', { key: 'ArrowRight', shiftKey: true });
    await nextTick();
    const handle = grip.getBoundingClientRect();
    assert.ok(handle.left >= 0 && handle.left + handle.width <= 300);
    assert.ok(handle.top >= 0 && handle.top + handle.height <= 400);
    assert.ok(dialog.getBoundingClientRect().left + dialog.getBoundingClientRect().width > 300);
});

test('a captured popup drag continues outside the window and resumes inside with the button held', async (t) => {
    const { dialog, grip, isDragging } = setup(t);
    grip.send('pointerdown');
    await nextTick();
    assert.equal(isDragging(), true);
    for (const position of [
        { clientX: 410, clientY: -100 },
        { clientX: -100, clientY: 200 },
        { clientX: 1100, clientY: 200 },
        { clientX: 410, clientY: 900 },
    ]) {
        grip.send('pointermove', position);
        await nextTick();
        assert.equal(isDragging(), true, 'leaving the viewport must not end pointer capture');
        assert.equal(grip.hasPointerCapture(1), true);
        grip.send('pointermove', { clientX: 410, clientY: 217 });
        await nextTick();
        assert.equal(dialog.getBoundingClientRect().top, 200, 'the popup must follow the held pointer on reentry');
    }
    grip.send('pointerup', { buttons: 0 });
    await nextTick();
    assert.equal(isDragging(), false);
    assert.equal(grip.hasPointerCapture(1), false);
});

test('returning after a missed mouse release ends dragging without moving the popup', async (t) => {
    const { dialog, grip, isDragging } = setup(t);
    grip.send('pointerdown');
    grip.send('pointermove', { clientY: 100 });
    await nextTick();
    const top = dialog.getBoundingClientRect().top;
    grip.send('pointermove', { clientY: 300, buttons: 0 });
    await nextTick();
    assert.equal(isDragging(), false);
    assert.equal(dialog.getBoundingClientRect().top, top);
    assert.equal(grip.hasPointerCapture(1), false);
    grip.send('pointerdown', { clientY: 100 });
    grip.send('pointermove', { clientY: 120 });
    await nextTick();
    assert.equal(dialog.getBoundingClientRect().top, top + 20, 'a new drag must work immediately');
});

for (const interruption of ['blur', 'hidden', 'pointercancel', 'lostpointercapture', 'unmount']) {
    test(`${interruption} releases popup drag state and ignores stale movement`, async (t) => {
        const { app, dialog, grip, isDragging, browserWindow, browserDocument } = setup(t);
        grip.send('pointerdown');
        grip.send('pointermove', { clientY: 100 });
        await nextTick();
        const top = dialog.getBoundingClientRect().top;
        if (interruption === 'blur') browserWindow.dispatchEvent(new Event('blur'));
        else if (interruption === 'hidden') {
            browserDocument.hidden = true;
            browserDocument.dispatchEvent(new Event('visibilitychange'));
        } else if (interruption === 'unmount') app.unmount();
        else grip.send(interruption);
        await nextTick();
        if (interruption !== 'unmount') assert.equal(isDragging(), false);
        assert.equal(grip.hasPointerCapture(1), false);
        grip.send('pointermove', { clientY: 300 });
        await nextTick();
        assert.equal(dialog.getBoundingClientRect().top, top);
    });
}

test('failed pointer capture is reported and does not start a partial drag', async (t) => {
    const { grip, isDragging } = setup(t);
    const warn = t.mock.method(console, 'warn', () => {});
    grip.captureError = true;
    grip.send('pointerdown');
    await nextTick();
    assert.equal(isDragging(), false);
    assert.equal(grip.captures.size, 0);
    assert.equal(warn.mock.callCount(), 1);
});

test('unrelated pointers cannot move or end a popup drag', async (t) => {
    const { dialog, grip, isDragging } = setup(t);
    grip.send('pointerdown');
    grip.send('pointermove', { pointerId: 2, clientY: 300 });
    grip.send('pointerup', { pointerId: 2 });
    await nextTick();
    assert.equal(dialog.getBoundingClientRect().top, 150);
    assert.equal(isDragging(), true);
    grip.send('pointerup');
});

test('floating toolbar keeps natural one-row sizing when the window is narrower than it', async (t) => {
    const { dialog, grip, browserWindow } = setup(t, toolbar);
    await nextTick();
    const natural = dialog.getBoundingClientRect();
    for (const width of [700, 300, 240]) {
        browserWindow.innerWidth = width;
        browserWindow.dispatchEvent(new Event('resize'));
        await nextTick();
        const style = dialog.props.style as Record<string, unknown>;
        assert.doesNotMatch(String(dialog.props.class), /is-scrollable/);
        assert.equal(style.maxWidth, undefined, 'no viewport-based width cap');
        assert.equal(dialog.getBoundingClientRect().width, natural.width);
        assert.equal(dialog.getBoundingClientRect().height, natural.height);
        const handle = grip.getBoundingClientRect();
        assert.ok(handle.left >= 0 && handle.left + handle.width <= width, 'grip stays reachable');
    }
});

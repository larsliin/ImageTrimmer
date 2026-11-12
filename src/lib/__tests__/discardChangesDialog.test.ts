import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { createRenderer, markRaw, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';

const source = await readFile(new URL('../../components/editor/dialogs/DiscardChangesDialog.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'discard-dialog-test', inlineTemplate: true }).content;
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'chrome-extension-component-library'", JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
    .replaceAll(/(['"])vue\1/g, JSON.stringify(import.meta.resolve('vue')));
const { default: component }: { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function setup(t: TestContext) {
    const elements: HostElement[] = [];
    let activeElement: HostElement | null = null;
    class HostElement {
        tag: string;
        props: Record<string, unknown> = {};
        children: HostElement[] = [];
        parent: HostElement | null = null;
        text = '';
        inert = false;
        constructor(tag: string) { this.tag = tag; markRaw(this); }
        focus() { activeElement = this; }
        querySelectorAll() { return elements.filter(element => element.tag === 'button'); }
        get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
    }
    const body = new HostElement('body');
    const editor = new HostElement('editor');
    const popup = new HostElement('popup');
    popup.inert = true;
    body.children.push(editor, popup);
    const browserWindow = new EventTarget();
    const browserDocument = { body, get activeElement() { return activeElement; } };
    const globals = { HTMLElement: HostElement, window: browserWindow, document: browserDocument };
    const restore: (() => void)[] = [];
    for (const [name, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        restore.push(() => {
            if (previous) Object.defineProperty(globalThis, name, previous);
            else Reflect.deleteProperty(globalThis, name);
        });
    }
    const renderer = createRenderer<HostElement, HostElement>({
        createElement(tag) { const element = new HostElement(tag); elements.push(element); return element; },
        createText(text) { const element = new HostElement('#text'); element.text = text; return element; },
        createComment: () => new HostElement('#comment'),
        insert(element, parent) { element.parent = parent; parent.children.push(element); },
        remove(element) { if (element.parent) element.parent.children = element.parent.children.filter(child => child !== element); },
        setText(element, text) { element.text = text; },
        setElementText(element, text) { element.text = text; },
        patchProp(element, name, _previous, next) { element.props[name] = next; },
        parentNode: element => element.parent,
        nextSibling: () => null,
        querySelector: () => body,
    });
    let kept = 0;
    let discarded = 0;
    const app = renderer.createApp(component, { toolName: 'Crop', onKeep: () => { kept += 1; }, onDiscard: () => { discarded += 1; } });
    app.mount(new HostElement('root'));
    t.after(() => { app.unmount(); for (const reset of restore) reset(); });
    function key(key: string, shiftKey = false) {
        const event = new Event('keydown', { cancelable: true });
        Object.defineProperties(event, { key: { value: key }, shiftKey: { value: shiftKey } });
        browserWindow.dispatchEvent(event);
        return event;
    }
    return {
        elements, body, editor, popup, key, app, browserWindow,
        get active() { return activeElement; },
        get kept() { return kept; }, get discarded() { return discarded; },
    };
}

test('real alert template supplies exact copy, accessible ids and safe initial focus', t => {
    const state = setup(t);
    const dialog = state.elements.find(element => element.props.role === 'alertdialog')!;
    assert.equal(dialog.props['aria-modal'], 'true');
    const title = state.elements.find(element => element.props.id === dialog.props['aria-labelledby'])!;
    const message = state.elements.find(element => element.props.id === dialog.props['aria-describedby'])!;
    assert.equal(title.textContent, 'Discard unapplied changes?');
    assert.equal(message.textContent.trim(), 'Your changes in Crop haven’t been applied. Discard them and close this tool?');
    assert.equal(state.active?.textContent, 'Keep editing');
    assert.equal(state.editor.inert, true);
});

test('Tab and Shift+Tab cycle both buttons and isolate global shortcuts', t => {
    const state = setup(t);
    let shortcuts = 0;
    state.browserWindow.addEventListener('keydown', () => { shortcuts += 1; });
    assert.equal(state.key('Tab').defaultPrevented, true);
    assert.equal(state.active?.textContent, 'Discard changes');
    state.key('Tab');
    assert.equal(state.active?.textContent, 'Keep editing');
    state.key('Tab', true);
    assert.equal(state.active?.textContent, 'Discard changes');
    state.key('z');
    assert.equal(shortcuts, 0);
});

test('Escape keeps editing and clicking backdrop never discards', t => {
    const state = setup(t);
    const backdrop = state.elements.find(element => element.props.class === 'discard-backdrop')!;
    assert.equal(backdrop.props.onClick, undefined);
    const pointer = new Event('pointerdown', { cancelable: true });
    Object.defineProperties(pointer, { target: { value: backdrop }, currentTarget: { value: backdrop } });
    const handler = backdrop.props.onPointerdown;
    assert.equal(typeof handler, 'function');
    if (typeof handler === 'function') handler(pointer);
    assert.equal(pointer.defaultPrevented, true, 'backdrop cannot steal keyboard focus');
    assert.equal(state.discarded, 0);
    assert.equal(state.key('Escape').defaultPrevented, true);
    assert.equal(state.kept, 1);
    assert.equal(state.discarded, 0);
});

test('unmount restores prior inert state and removes keyboard isolation', t => {
    const state = setup(t);
    state.app.unmount();
    assert.equal(state.editor.inert, false);
    assert.equal(state.popup.inert, true);
    assert.equal(state.key('Escape').defaultPrevented, false);
    assert.equal(state.kept, 0);
});

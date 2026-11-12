import assert from 'node:assert/strict';
import test from 'node:test';
import { createRenderer, defineComponent, h, nextTick, shallowRef, type Component } from 'vue';
import { BaseAlert, BaseIconButton, BaseSelect } from 'chrome-extension-component-library';
import { baseControlUrl } from './loadBaseControl.ts';

class TestInput {
    value = '0';
    checked = false;
    focusCount = 0;
    get valueAsNumber() { return Number(this.value); }
    focus() { this.focusCount += 1; }
}
Object.defineProperty(globalThis, 'HTMLInputElement', { configurable: true, value: TestInput });

async function loadControl(name: string): Promise<Component> {
    return (await import(await baseControlUrl(name))).default;
}

interface TestElement {
    tag: string
    props: Record<string, unknown>
    valuePatches?: number
    focus?: () => void
    getBoundingClientRect?: () => DOMRect
    children: TestElement[]
    listeners: Map<string, TestListener[]>
    checked: boolean
    querySelector: () => TestElement | undefined
}

// eslint-disable-next-line no-unused-vars
type TestListener = (event: Event) => void;

function mountControl(component: Component, props: Record<string, unknown>) {
    const elements: TestElement[] = [];
    const renderer = createRenderer<TestElement, TestElement>({
        createElement(tag) {
            const props: Record<string, unknown> = {};
            const listeners = new Map<string, TestListener[]>();
            const children: TestElement[] = [];
            const element = {
                tag, tagName: tag.toUpperCase(), props, children, listeners, checked: false,
                get options() { return children.filter((child) => child.tag === 'option'); },
                get value() { return props.value; },
                set value(value: unknown) { props.value = value; },
                get className() { return String(props.class ?? ''); },
                set className(value: string) { props.class = value; },
                querySelector: () => children.find((child) => child.tag === 'input'),
                setAttribute: (key: string, value: unknown) => { props[key] = value; },
                removeAttribute: (key: string) => { delete props[key]; },
                addEventListener: (key: string, listener: TestListener) => {
                    listeners.set(key, [...(listeners.get(key) ?? []), listener]);
                },
                removeEventListener: (key: string, listener: TestListener) => {
                    listeners.set(key, (listeners.get(key) ?? []).filter((item) => item !== listener));
                },
            };
            elements.push(element);
            return element;
        },
        createText: () => ({ tag: '#text', props: {} }),
        createComment: () => {
            const element = { tag: '#comment', props: {}, children: [], listeners: new Map(), checked: false, querySelector: () => undefined };
            elements.push(element);
            return element;
        },
        insert(child, parent) { parent.children.push(child); },
        remove() {},
        setText() {},
        setElementText() {},
        patchProp(element, key, _previous, next) {
            element.props[key] = next;
            if (key === 'value') element.valuePatches = (element.valuePatches ?? 0) + 1;
        },
        parentNode: () => null,
        nextSibling: () => null,
    });
    const app = renderer.createApp(component, props);
    app.mount({ tag: 'root', props: {}, children: [], listeners: new Map(), checked: false, querySelector: () => undefined });
    const element = elements.find((item) => item.tag === 'input') ?? elements[0];
    assert.ok(element);
    return { element, elements, app };
}

function dispatch(element: TestElement, name: string, target: TestInput) {
    const event = new Event(name.slice(2).toLowerCase());
    Object.defineProperty(event, 'target', { value: target });
    element.checked = target.checked;
    for (const listener of element.listeners.get(event.type) ?? []) listener(event);
    const listeners = element.props[name];
    assert.ok(listeners || element.listeners.has(event.type));
    if (listeners) for (const listener of Array.isArray(listeners) ? listeners : [listeners]) listener(event);
    return event;
}

test('range keeps a native root, numeric model, attributes and single native event delivery', async () => {
    const updates: number[] = [];
    const events: Event[] = [];
    const { element, app } = mountControl(await loadControl('BaseRangeInput'), {
        modelValue: 12, min: -100, max: 100, step: 1, disabled: true,
        class: 'existing-slider', style: { width: '120px' }, 'aria-label': 'Brightness',
        'onUpdate:modelValue': (value: number) => updates.push(value),
        onInput: (event: Event) => events.push(event),
    });
    try {
        assert.equal(element.tag, 'input');
        assert.equal(element.props.type, 'range');
        assert.equal(element.props.value, 12);
        assert.equal(element.props.min, -100);
        assert.equal(element.props.max, 100);
        assert.equal(element.props.step, 1);
        assert.equal(element.props.disabled, true);
        assert.equal(element.props.class, 'range-input existing-slider');
        assert.deepEqual(element.props.style, { width: '120px' });
        assert.equal(element.props['aria-label'], 'Brightness');
        const input = new TestInput();
        input.value = '24';
        const event = dispatch(element, 'onInput', input);
        assert.deepEqual(updates, [24]);
        assert.deepEqual(events, [event]);
        assert.equal(events[0]?.target, input);
    } finally { app.unmount(); }
});

test('range supports controlled native value/change without a model', async () => {
    const events: Event[] = [];
    const { element, app } = mountControl(await loadControl('BaseRangeInput'), {
        value: 30, onChange: (event: Event) => events.push(event),
    });
    try {
        assert.equal(element.props.value, 30);
        const patches = element.valuePatches;
        const input = new TestInput();
        input.value = '40';
        dispatch(element, 'onInput', input);
        await nextTick();
        assert.equal(element.valuePatches, patches, 'editing must not re-render the old controlled value before change');
        const event = dispatch(element, 'onChange', input);
        assert.deepEqual(events, [event]);
    } finally { app.unmount(); }
});

test('number input emits numbers or empty strings before native input listeners', async () => {
    const calls: unknown[] = [];
    const { element, app } = mountControl(await loadControl('BaseNumberInput'), {
        modelValue: 4, min: 1, max: 255, required: true, 'aria-label': 'Shadows',
        'onUpdate:modelValue': (value: number | string) => calls.push(value),
        onInput: (event: Event) => calls.push(event.target),
        onBlur: (event: Event) => calls.push(event),
    });
    try {
        assert.equal(element.tag, 'input');
        assert.equal(element.props.type, 'number');
        assert.equal(element.props.required, true);
        assert.equal(element.props.min, 1);
        assert.equal(element.props.max, 255);
        const input = new TestInput();
        input.value = '1.25';
        dispatch(element, 'onInput', input);
        input.value = '';
        dispatch(element, 'onInput', input);
        const blur = dispatch(element, 'onBlur', input);
        assert.deepEqual(calls, [1.25, input, '', input, blur]);
        let focuses = 0;
        element.focus = () => { focuses += 1; };
        const instance = app._instance?.exposed;
        assert.ok(instance);
        instance.focus();
        assert.equal(focuses, 1);
    } finally { app.unmount(); }
});

test('number input preserves controlled value and change targets without a model', async () => {
    const events: Event[] = [];
    const { element, app } = mountControl(await loadControl('BaseNumberInput'), {
        value: 128, disabled: true, class: 'field__input',
        onChange: (event: Event) => events.push(event),
    });
    try {
        assert.equal(element.props.value, 128);
        assert.equal(element.props.disabled, true);
        assert.equal(element.props.class, 'number-input field__input');
        const input = new TestInput();
        input.value = '30';
        const patches = element.valuePatches;
        dispatch(element, 'onInput', input);
        await nextTick();
        assert.equal(element.valuePatches, patches, 'editing must not re-render the old controlled value before change');
        const event = dispatch(element, 'onChange', input);
        assert.deepEqual(events, [event]);
        assert.equal(event.target, input);
    } finally { app.unmount(); }
});

test('library checkbox routes attributes to its native input and delivers one boolean update/change', async () => {
    const updates: boolean[] = [];
    const events: Event[] = [];
    const { element, app } = mountControl(await loadControl('BaseCheckbox'), {
        modelValue: true, id: 'preview', name: 'preview', disabled: true,
        'onUpdate:modelValue': (value: boolean) => updates.push(value),
        onChange: (event: Event) => events.push(event),
    });
    try {
        assert.equal(element.tag, 'input');
        assert.equal(element.props.type, 'checkbox');
        assert.equal(element.checked, true);
        assert.equal(element.props.id, 'preview');
        assert.equal(element.props.name, 'preview');
        assert.equal(element.props.disabled, true);
        const input = new TestInput();
        const event = dispatch(element, 'onChange', input);
        input.checked = true;
        dispatch(element, 'onChange', input);
        assert.deepEqual(updates, [false, true]);
        assert.equal(events.length, 2);
        assert.equal(events[0], event);
        let focuses = 0;
        element.focus = () => { focuses += 1; };
        app._instance?.exposed?.focus();
        assert.equal(focuses, 1);
    } finally { app.unmount(); }
});

test('button defaults to non-submit, forwards native attributes/events, and exposes focus', async () => {
    let clicks = 0;
    const { element, app } = mountControl(await loadControl('BaseButton'), {
        disabled: true, title: 'Undo', 'aria-pressed': false, variant: 'tool',
        class: 'is-active', onClick: () => { clicks += 1; },
    });
    try {
        assert.equal(element.tag, 'button');
        assert.equal(element.props.type, 'button');
        assert.equal(element.props.disabled, true);
        assert.equal(element.props.title, 'Undo');
        assert.equal(element.props['aria-pressed'], false);
        assert.equal(element.props.class, 'base-button tool-button is-active');
        dispatch(element, 'onClick', new TestInput());
        assert.equal(clicks, 1);
        let focuses = 0;
        element.focus = () => { focuses += 1; };
        const instance = app._instance?.exposed;
        assert.ok(instance);
        instance.focus();
        assert.equal(focuses, 1);
        const rect = { x: 10, y: 20 } as DOMRect;
        element.getBoundingClientRect = () => rect;
        assert.equal(instance.getBoundingClientRect(), rect);
    } finally { app.unmount(); }
});

test('button preserves explicit submit/reset types', async () => {
    const component = await loadControl('BaseButton');
    for (const type of ['submit', 'reset']) {
        const { element, app } = mountControl(component, { type });
        try { assert.equal(element.props.type, type); }
        finally { app.unmount(); }
    }
});

test('icon actions omit pressed state, while toggles preserve false/true and native attributes', () => {
    for (const active of [undefined, false, true]) {
        const { element, app } = mountControl(BaseIconButton, {
            label: 'Crop', active, disabled: true, title: 'Crop image', type: 'submit',
        });
        try {
            assert.equal(element.tag, 'button');
            assert.equal(element.props['aria-label'], 'Crop');
            assert.equal(element.props.title, 'Crop image');
            assert.equal(element.props['aria-pressed'], active);
            assert.equal(element.props.disabled, true);
            assert.equal(element.props.type, 'submit');
            assert.equal(String(element.props.class).includes('is-active'), active === true);
        } finally { app.unmount(); }
    }
});

test('checkbox keeps library styling, updates/removes native attrs and listeners, and exposes focus', async () => {
    const component = await loadControl('BaseCheckbox');
    let changes = 0;
    const attrs = shallowRef<Record<string, unknown>>({
        modelValue: false, name: 'preview', class: 'checkbox', 'aria-label': 'Preview',
        onChange: () => { changes += 1; },
    });
    const parent = defineComponent(() => () => h(component, attrs.value));
    const { element, app } = mountControl(parent, {});
    try {
        assert.equal(element.props.class, 'base-checkbox checkbox');
        assert.equal(element.props.name, 'preview');
        dispatch(element, 'onChange', new TestInput());
        assert.equal(changes, 1);
        attrs.value = { modelValue: false, 'aria-label': 'Live preview', tabindex: -1 };
        await nextTick();
        assert.equal(element.props.name, undefined);
        assert.equal(element.props.class, 'base-checkbox');
        assert.equal(element.props['aria-label'], 'Live preview');
        assert.equal(element.props.tabindex, -1);
        // Only the library's model listener remains after removing the caller listener.
        assert.equal(element.listeners.get('change')?.length, 1);
    } finally { app.unmount(); }
});

test('dismissible error alert announces the message, emits once and renders nothing when empty', () => {
    let dismissals = 0;
    const { elements, element, app } = mountControl(BaseAlert, {
        message: 'Could not load image', dismissible: true, onDismiss: () => { dismissals += 1; },
    });
    try {
        assert.equal(element.props.role, 'alert');
        const close = elements.find((item) => item.tag === 'button');
        assert.ok(close);
        assert.equal(close.props['aria-label'], 'Dismiss');
        dispatch(close, 'onClick', new TestInput());
        assert.equal(dismissals, 1);
    } finally { app.unmount(); }
    const empty = mountControl(BaseAlert, { message: '', dismissible: true });
    try { assert.equal(empty.element.tag, '#comment'); }
    finally { empty.app.unmount(); }
});

test('native shared select routes attrs/listeners to select, retains disabled options and one chevron', () => {
    const updates: string[] = [];
    const changes: Event[] = [];
    const { elements, app } = mountControl(BaseSelect, {
        modelValue: 'rgb', id: 'channel', class: 'channel-select__input', 'aria-label': 'Channel',
        disabled: true, options: [
            { value: 'rgb', label: 'RGB' }, { value: 'red', label: 'Red', disabled: true },
        ],
        'onUpdate:modelValue': (value: string) => updates.push(value),
        onChange: (event: Event) => changes.push(event),
    });
    try {
        const select = elements.find((item) => item.tag === 'select');
        assert.ok(select);
        assert.equal(select.props.id, 'channel');
        assert.equal(select.props['aria-label'], 'Channel');
        assert.equal(select.props.disabled, true);
        assert.equal(select.props.class, 'channel-select__input base-select');
        assert.equal(elements.filter((item) => String(item.props.class).includes('select-chevron')).length, 1);
        const options = elements.filter((item) => item.tag === 'option');
        assert.equal(options.length, 2);
        assert.equal(options[1]?.props.disabled, true);
        const first = options[0];
        const second = options[1];
        assert.ok(first && second);
        Object.assign(first, { selected: false });
        Object.assign(second, { selected: true });
        const event = new Event('change');
        Object.defineProperty(event, 'target', { value: select });
        for (const listener of select.listeners.get('change') ?? []) listener(event);
        const onChange = select.props.onChange;
        assert.equal(typeof onChange, 'function');
        if (typeof onChange === 'function') onChange(event);
        assert.deepEqual(updates, ['red']);
        assert.deepEqual(changes, [event]);
    } finally { app.unmount(); }
});

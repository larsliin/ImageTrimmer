import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { createRenderer, markRaw, type Component } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { transpileModule, ModuleKind } from 'typescript';
import type { ImageInfo } from '@/types/editor';
import { baseControlUrl } from '../../../bascomponents/__tests__/loadBaseControl.ts';

// This parameter is part of the callback type and is intentionally not referenced here.
// eslint-disable-next-line no-unused-vars
type TestEventListener = (event: Event) => void;

class TestDocument {
    activeElement: TestElement | null = null;
}
Object.defineProperty(globalThis, 'Document', {
    configurable: true,
    value: TestDocument,
});

class TestElement {
    readonly props: Record<string, unknown> = {};
    readonly children: TestElement[] = [];
    readonly selectionRanges: Array<[number, number]> = [];
    readonly validityMessages: string[] = [];
    readonly eventListeners = new Map<string, TestEventListener[]>();
    parent: TestElement | null = null;
    text = '';
    value = '';
    focusCount = 0;
    validityReportCount = 0;
    validityResult = true;
    readonly type: string;

    constructor(type: string) {
        this.type = type;
    }

    getRootNode() {
        return new TestDocument();
    }

    addEventListener(type: string, listener: TestEventListener) {
        const listeners = this.eventListeners.get(type) ?? [];
        listeners.push(listener);
        this.eventListeners.set(type, listeners);
    }

    focus() {
        this.focusCount += 1;
    }

    setSelectionRange(start: number, end: number) {
        this.selectionRanges.push([start, end]);
    }

    setCustomValidity(message: string) {
        this.validityMessages.push(message);
    }

    reportValidity() {
        this.validityReportCount += 1;
        return this.validityResult;
    }
}

class TestSelectElement extends TestElement {}
Object.defineProperty(globalThis, 'HTMLSelectElement', {
    configurable: true,
    value: TestSelectElement,
});

const source = await readFile(new URL('../EditorTopBar.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'editor-top-bar-test', inlineTemplate: true }).content;
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'@/components/bascomponents/BaseButton.vue'", JSON.stringify(await baseControlUrl('BaseButton')))
    .replaceAll("'vue'", JSON.stringify(import.meta.resolve('vue')))
    .replaceAll('"vue"', JSON.stringify(import.meta.resolve('vue')));
const { default: editorTopBar }: { default: Component } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
);
const renderer = createRenderer<TestElement, TestElement>({
    createElement: (type) => markRaw(type === 'select' ? new TestSelectElement(type) : new TestElement(type)),
    createText: (text) => {
        const element = new TestElement('#text');
        element.text = text;
        return markRaw(element);
    },
    createComment: (text) => {
        const element = new TestElement('#comment');
        element.text = text;
        return markRaw(element);
    },
    insert(child, parent, anchor) {
        child.parent?.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = parent;
        const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
        if (anchorIndex < 0) parent.children.push(child);
        else parent.children.splice(anchorIndex, 0, child);
    },
    remove(child) {
        if (!child.parent) return;
        child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = null;
    },
    setText(node, text) {
        node.text = text;
    },
    setElementText(node, text) {
        node.text = text;
        node.children.splice(0);
    },
    patchProp(node, key, _previous, next) {
        node.props[key] = next;
        if (key === 'value') node.value = String(next ?? '');
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => {
        const siblings = node.parent?.children;
        return siblings ? siblings[siblings.indexOf(node) + 1] ?? null : null;
    },
});

interface EmittedEvent {
    name: string
    value?: string
}

function mountTopBar(
    context: TestContext,
    image: ImageInfo | null,
    busy = false,
    rulersEnabled = false,
    navigationAnimationsEnabled = true,
    prefersReducedMotion = false,
    isDarkMode = false,
) {
    const emitted: EmittedEvent[] = [];
    const app = renderer.createApp(
        editorTopBar,
        {
            image,
            busy,
            isDarkMode,
            rulersEnabled,
            navigationAnimationsEnabled,
            prefersReducedMotion,
            onRename: (value: string) => emitted.push({ name: 'rename', value }),
            onToggleTheme: () => emitted.push({ name: 'toggle-theme' }),
            onToggleRulers: () => emitted.push({ name: 'toggle-rulers' }),
            onToggleNavigationAnimations: () => emitted.push({ name: 'toggle-navigation-animations' }),
        },
    );
    const root = markRaw(new TestElement('root'));
    app.mount(root);
    context.after(() => {
        app.unmount();
    });
    const renameButton = findElement(root, 'aria-label', `Rename ${image?.fileName ?? 'No image'}`);
    assert.ok(renameButton, 'the filename rename button should render');
    return { emitted, root, renameButton };
}

function findElement(root: TestElement, property: string, value: string): TestElement | null {
    const actual = property === 'type' ? root.type : root.props[property];
    if (actual === value) return root;
    for (const child of root.children) {
        const match = findElement(child, property, value);
        if (match) return match;
    }
    return null;
}

function getFilenameInput(root: TestElement): TestElement {
    const input = findElement(root, 'aria-label', 'Filename');
    assert.ok(input, 'the filename input should render while editing');
    return input;
}

function hasClass(element: TestElement, className: string): boolean {
    return String(element.props.class).split(/\s+/).includes(className);
}

async function invokeHandler(element: TestElement, name: string, event: Event) {
    const handler = element.props[name];
    assert.ok(typeof handler === 'function' || Array.isArray(handler), `${name} should be wired`);
    const handlers = Array.isArray(handler) ? handler : [handler];
    for (const callback of handlers) {
        if (typeof callback === 'function') await callback(event);
    }
}

async function enterFilename(input: TestElement, value: string) {
    input.value = value;
    const event = new Event('input');
    Object.defineProperty(event, 'target', { value: input });
    for (const listener of input.eventListeners.get('input') ?? []) listener(event);
    await invokeHandler(input, 'onInput', event);
}

function keyboardEvent(key: string): Event {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    return event;
}

test('shows a fallback filename and prevents renaming when there is no image', async (t) => {
    const { emitted, renameButton, root } = mountTopBar(t, null);

    assert.equal(renameButton.props.disabled, true);
    assert.equal(findElement(root, 'class', 'filename-base-text')?.text, 'No image');
    assert.equal(findElement(root, 'type', 'select'), null);
    assert.equal(findElement(root, 'class', 'filename-edit-indicator bi bi-pencil'), null);
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    assert.equal(findElement(root, 'aria-label', 'Filename'), null);
    assert.deepEqual(emitted, []);
    assert.equal(findElement(root, 'aria-label', 'Pixel rulers')?.props.disabled, true);
});

test('pixel ruler toggle exposes its state and emits a toggle event', async (t) => {
    const image: ImageInfo = { fileName: 'image.png', width: 800, height: 600, exportMimeType: 'image/png' };
    const { root, emitted } = mountTopBar(t, image);
    const toggle = findElement(root, 'aria-label', 'Pixel rulers');
    assert.ok(toggle);
    assert.equal(toggle.props['aria-pressed'], false);
    assert.equal(toggle.props.disabled, false);
    await invokeHandler(toggle, 'onClick', new Event('click'));
    assert.deepEqual(emitted, [{ name: 'toggle-rulers' }]);

    const enabled = mountTopBar(t, image, false, true);
    assert.equal(findElement(enabled.root, 'aria-label', 'Pixel rulers')?.props['aria-pressed'], true);
    const busy = mountTopBar(t, image, true);
    assert.equal(findElement(busy.root, 'aria-label', 'Pixel rulers')?.props.disabled, true);
});

test('animated zoom and pan toggle exposes its state, action, and reduced-motion lock', async (t) => {
    const image: ImageInfo = { fileName: 'image.png', width: 800, height: 600, exportMimeType: 'image/png' };
    const enabled = mountTopBar(t, image);
    const toggle = findElement(enabled.root, 'aria-label', 'Animated zoom and pan');
    assert.ok(toggle);
    assert.equal(toggle.props['aria-pressed'], true);
    assert.equal(toggle.props.title, 'Disable animated zoom and pan for better performance');
    assert.equal(toggle.props.disabled, false);
    const enabledIcon = findElement(toggle, 'class', 'bi bi-wind');
    assert.ok(enabledIcon);
    assert.equal(enabledIcon.props['aria-hidden'], 'true');
    await invokeHandler(toggle, 'onClick', new Event('click'));
    assert.deepEqual(enabled.emitted, [{ name: 'toggle-navigation-animations' }]);

    const disabled = mountTopBar(t, image, false, false, false);
    const disabledToggle = findElement(disabled.root, 'aria-label', 'Animated zoom and pan');
    assert.ok(disabledToggle);
    assert.equal(disabledToggle.props['aria-pressed'], false);
    assert.equal(disabledToggle.props.title, 'Enable animated zoom and pan');
    const disabledIcon = findElement(disabledToggle, 'class', 'bi bi-wind');
    assert.ok(disabledIcon);
    assert.equal(disabledIcon.props['aria-hidden'], 'true');

    const reducedMotion = mountTopBar(t, image, false, false, false, true);
    const reducedMotionToggle = findElement(reducedMotion.root, 'aria-label', 'Animated zoom and pan');
    assert.ok(reducedMotionToggle);
    assert.equal(reducedMotionToggle.props['aria-pressed'], false);
    assert.equal(reducedMotionToggle.props.disabled, true);
    assert.match(String(reducedMotionToggle.props.title), /reduced-motion setting/);
});

test('does not start renaming while the editor is busy', async (t) => {
    const { renameButton, root } = mountTopBar(t, {
        fileName: 'portrait.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    }, true);

    await invokeHandler(renameButton, 'onClick', new Event('click'));

    assert.equal(renameButton.props.disabled, true);
    assert.equal(findElement(root, 'aria-label', 'Filename'), null);
});

test('one accessible button starts renaming from the base, extension, or pencil', async (t) => {
    const fileName = 'family.photo.JPG';
    const clickedParts = [
        'filename-base-text',
        'filename-extension',
        'filename-edit-indicator bi bi-pencil',
    ];

    for (const partClass of clickedParts) {
        const { renameButton, root } = mountTopBar(t, {
            fileName,
            width: 400,
            height: 600,
            exportMimeType: 'image/png',
        });
        const isPencil = partClass === 'filename-edit-indicator bi bi-pencil';
        const part = findElement(renameButton, 'class', partClass);
        assert.ok(part, `${partClass} should be available on the rename control`);
        const filenameField = findElement(renameButton, 'class', 'filename-field');
        assert.ok(filenameField);
        if (isPencil) {
            assert.equal(part.parent, renameButton, 'the pencil should be inside the rename button');
            assert.equal(findElement(filenameField, 'class', partClass), null,
                'the pencil should sit outside the filename enclosure');
            assert.equal(part.props.onClick, undefined, 'the pencil should not create a separate click target');
        } else {
            assert.equal(
                findElement(filenameField, 'class', partClass),
                part,
                `${partClass} should be inside the filename enclosure`,
            );
        }
        assert.equal(renameButton.type, 'button');
        assert.equal(renameButton.props['aria-label'], `Rename ${fileName}`);
        assert.equal(renameButton.props.disabled, false);
        assert.equal(findElement(root, 'type', 'text'), null);

        const click = new Event('click', { bubbles: true });
        Object.defineProperty(click, 'target', { value: part });
        await invokeHandler(renameButton, 'onClick', click);

        const filenameInput = getFilenameInput(root);
        assert.equal(filenameInput.value, 'family.photo');
        assert.equal(filenameInput.focusCount, 1);
        assert.deepEqual(filenameInput.selectionRanges, [[0, 'family.photo'.length]]);
        assert.equal(findElement(root, 'class', 'filename-extension')?.text, '.JPG');
        const editingPencil = findElement(root, 'class', 'filename-edit-indicator bi bi-pencil');
        assert.ok(editingPencil);
        assert.equal(editingPencil.parent, findElement(root, 'class', 'filename-control'));
        assert.equal(editingPencil.props.onClick, undefined, 'the edit-state pencil should be decorative');
    }

    const { renameButton, root } = mountTopBar(t, {
        fileName,
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    const filenameInput = getFilenameInput(root);
    const extension = findElement(root, 'class', 'filename-extension');
    const editingPencil = findElement(root, 'class', 'filename-edit-indicator bi bi-pencil');
    assert.ok(editingPencil, 'the pencil slot should remain present while editing');
    await enterFilename(filenameInput, 'a much longer new filename');
    assert.equal(filenameInput.value, 'a much longer new filename');
    assert.equal(findElement(root, 'class', 'filename-extension'), extension);
    assert.equal(findElement(root, 'class', 'filename-edit-indicator bi bi-pencil'), editingPencil);
});

test('activates renaming with Space without including the extension', async (t) => {
    const fileName = 'family.photo.JPG';
    const { renameButton, root } = mountTopBar(t, {
        fileName,
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });

    await invokeHandler(renameButton, 'onKeydown', keyboardEvent(' '));

    const filenameInput = getFilenameInput(root);
    assert.equal(filenameInput.value, 'family.photo');
    assert.equal(findElement(root, 'class', 'filename-extension')?.text, '.JPG');
});

test('trims a renamed filename and removes a supported extension before emitting', async (t) => {
    const { emitted, renameButton, root } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    const filenameInput = getFilenameInput(root);
    await enterFilename(filenameInput, '  Final.Name.JpEg  ');

    await invokeHandler(filenameInput, 'onBlur', new Event('blur'));

    assert.deepEqual(filenameInput.validityMessages, ['', '']);
    assert.equal(filenameInput.validityReportCount, 1);
    assert.ok(findElement(root, 'aria-label', 'Rename original.png'));
    assert.deepEqual(emitted, [{ name: 'rename', value: 'Final.Name' }]);
});

test('keeps an invalid empty filename in edit mode and reports the validation message', async (t) => {
    const { emitted, renameButton, root } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    const filenameInput = getFilenameInput(root);
    filenameInput.validityResult = false;
    await enterFilename(filenameInput, '  .png  ');

    await invokeHandler(filenameInput, 'onBlur', new Event('blur'));

    assert.deepEqual(filenameInput.validityMessages, ['', 'Enter a filename without an extension.']);
    assert.equal(filenameInput.validityReportCount, 1);
    assert.equal(getFilenameInput(root), filenameInput);
    assert.deepEqual(emitted, []);
});

test('suppresses the focus ring on the Enter return and restores button focus', async (t) => {
    const { emitted, renameButton, root } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    const filenameInput = getFilenameInput(root);
    await enterFilename(filenameInput, 'renamed');

    await invokeHandler(filenameInput, 'onKeydown', keyboardEvent('Enter'));

    const returnedButton = findElement(root, 'aria-label', 'Rename original.png');
    assert.ok(returnedButton);
    assert.equal(filenameInput.validityReportCount, 1);
    assert.equal(returnedButton.focusCount, 1);
    assert.equal(hasClass(returnedButton, 'filename-control--programmatic-return'), true);
    assert.deepEqual(emitted, [{ name: 'rename', value: 'renamed' }]);

    await invokeHandler(returnedButton, 'onBlur', new Event('blur'));
    assert.equal(hasClass(returnedButton, 'filename-control--programmatic-return'), false);
});

test('preserves the standard focus-visible ring outside the programmatic return', (t) => {
    const { renameButton } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });

    assert.equal(hasClass(renameButton, 'filename-control--programmatic-return'), false);
    assert.match(
        source,
        /\.filename-control--action:focus-visible:not\(\.filename-control--programmatic-return\) \.filename-field,/,
    );
});

test('cancels renaming without validation or emitting and restores button focus', async (t) => {
    const { emitted, renameButton, root } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    await invokeHandler(renameButton, 'onClick', new Event('click'));
    const filenameInput = getFilenameInput(root);

    await invokeHandler(filenameInput, 'onKeydown', keyboardEvent('Escape'));

    const returnedButton = findElement(root, 'aria-label', 'Rename original.png');
    assert.ok(returnedButton);
    assert.equal(filenameInput.validityReportCount, 0);
    assert.equal(filenameInput.value, 'original');
    assert.equal(filenameInput.focusCount, 1);
    assert.equal(returnedButton.focusCount, 1);
    assert.equal(hasClass(returnedButton, 'filename-control--programmatic-return'), false);
    assert.deepEqual(emitted, []);
});

test('shows the full filename including extension when not editing', (t) => {
    const { renameButton, root } = mountTopBar(t, {
        fileName: 'original.png',
        width: 400,
        height: 600,
        exportMimeType: 'image/png',
    });
    assert.equal(renameButton.type, 'button');
    assert.equal(renameButton.props['aria-label'], 'Rename original.png');
    assert.equal(findElement(root, 'class', 'filename-base-text')?.text, 'original');
    assert.equal(findElement(root, 'type', 'select'), null);
    assert.equal(findElement(root, 'class', 'filename-extension')?.text, '.png');
});

test('emits the theme toggle event when its button is activated', async (t) => {
    const { emitted, root } = mountTopBar(t, null);
    const themeButton = findElement(root, 'class', 'theme-toggle');
    assert.ok(themeButton);
    assert.equal(themeButton.props['aria-label'], 'Light mode');
    assert.equal(themeButton.props['aria-pressed'], false);
    assert.equal(themeButton.props.title, 'Switch to dark mode');
    assert.ok(findElement(themeButton, 'class', 'bi bi-sun'));

    await invokeHandler(themeButton, 'onClick', new Event('click'));

    assert.deepEqual(emitted, [{ name: 'toggle-theme' }]);

    const darkMode = mountTopBar(t, null, false, false, true, false, true);
    const darkThemeButton = findElement(darkMode.root, 'class', 'theme-toggle');
    assert.ok(darkThemeButton);
    assert.equal(darkThemeButton.props['aria-label'], 'Dark mode');
    assert.equal(darkThemeButton.props['aria-pressed'], true);
    assert.equal(darkThemeButton.props.title, 'Switch to light mode');
    assert.ok(findElement(darkThemeButton, 'class', 'bi bi-moon'));
});

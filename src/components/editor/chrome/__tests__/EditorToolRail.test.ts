import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';
import { createRenderer, markRaw, nextTick, type Component } from 'vue';
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc';
import { ModuleKind, transpileModule } from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';

const componentUrls = new Map<string, Promise<string>>();

function replaceImport(source: string, specifier: string, replacement: string): string {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source.replaceAll(new RegExp(`(['"])${escaped}\\1`, 'g'), JSON.stringify(replacement));
}

function resolveAliasPath(specifier: string): string {
    let path = resolve(cwd(), 'src', specifier.slice(2));
    if (!extname(path)) {
        if (existsSync(`${path}.ts`)) path += '.ts';
        else if (existsSync(`${path}.vue`)) path += '.vue';
    }
    return path;
}

function loadComponentUrl(path: string): Promise<string> {
    const absolutePath = resolve(path);
    const cached = componentUrls.get(absolutePath);
    if (cached) return cached;

    const url = (async () => {
        const source = await readFile(absolutePath, 'utf8');
        const { descriptor } = parse(source, { filename: absolutePath });
        const script = descriptor.script || descriptor.scriptSetup
            ? compileScript(descriptor, { id: absolutePath, inlineTemplate: true }).content
            : `${compileTemplate({
                source: descriptor.template?.content ?? '',
                filename: absolutePath,
                id: absolutePath,
            }).code}\nexport default { render };`;
        let compiled = transpileModule(script, {
            compilerOptions: { module: ModuleKind.ESNext },
        }).outputText.replaceAll(/import ['"][^'"]+\.css['"];?/g, '');
        const imports = [...compiled.matchAll(/from\s+(['"])([^'"]+)\1/g)].map((match) => match[2]).filter(Boolean);

        for (const specifier of imports) {
            let replacement: string;
            if (specifier === 'vue') {
                replacement = import.meta.resolve('vue');
            } else if (specifier.startsWith('@/')) {
                const aliasPath = resolveAliasPath(specifier);
                replacement = aliasPath.endsWith('.vue')
                    ? await loadComponentUrl(aliasPath)
                    : pathToFileURL(aliasPath).href;
            } else if (specifier.endsWith('.vue')) {
                replacement = await loadComponentUrl(resolve(dirname(absolutePath), specifier));
            } else {
                throw new Error(`Unexpected component test import: ${specifier}`);
            }
            compiled = replaceImport(compiled, specifier, replacement);
        }

        return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
    })();
    componentUrls.set(absolutePath, url);
    return url;
}

const editorToolRail: Component = (await import(
    await loadComponentUrl(fileURLToPath(new URL('../EditorToolRail.vue', import.meta.url))),
)).default;
let resizeObservers = new Set<() => void>();

interface RailSize {
    clientHeight: number
    scrollHeight: number
    scrollHeightsByCollapsedCount?: readonly number[]
}

let focusedTestElement: TestElement | null = null;

class TestElement {
    readonly props: Record<string, unknown> = {};
    readonly children: TestElement[] = [];
    readonly style: Record<string, string> = {};
    parent: TestElement | null = null;
    text = '';
    clientHeight = 0;
    private measuredScrollHeight = 0;
    readonly type: string;
    private readonly railSize: RailSize;

    constructor(type: string, railSize: RailSize) {
        this.type = type;
        this.railSize = railSize;
        if (type === 'nav') {
            this.clientHeight = railSize.clientHeight;
            this.measuredScrollHeight = railSize.scrollHeight;
        }
    }

    get scrollHeight() {
        const heights = this.railSize.scrollHeightsByCollapsedCount;
        if (this.type !== 'nav' || !heights) return this.measuredScrollHeight;
        const panel = findElement(this, 'class', 'tool-foldout__panel');
        const collapsedGroups = panel ? getPopupGroupLabels(panel).length : 0;
        return heights[collapsedGroups] ?? this.measuredScrollHeight;
    }

    set scrollHeight(value: number) {
        this.measuredScrollHeight = value;
    }

    get disabled() {
        return this.props.disabled === true;
    }

    getAttribute(name: string) {
        const value = this.props[name];
        return typeof value === 'string' ? value : null;
    }

    querySelector(selector: string) {
        const match = selector.match(/^\[([\w-]+)="([^"]+)"\]$/);
        return match ? findElement(this, match[1], match[2]) : null;
    }

    getBoundingClientRect() {
        return { top: 24, right: 48 } as DOMRect;
    }

    focus() {
        focusedTestElement = this;
    }
}

interface RailProps {
    activeTool?: string | null
    eyedropperClosedFromToolbar?: boolean
    hasImage?: boolean
    busy?: boolean
    popupOpen?: boolean
    canZoomIn?: boolean
    canZoomOut?: boolean
    canUndo?: boolean
    canRedo?: boolean
}

interface EmittedEvent {
    name: string
    value?: string
}

function mountRail(railSize: RailSize, props: RailProps = {}) {
    const emitted: EmittedEvent[] = [];
    const renderer = createRenderer<TestElement, TestElement>({
        createElement: (type) => markRaw(new TestElement(type, railSize)),
        createText: (text) => {
            const element = new TestElement('#text', railSize);
            element.text = text;
            return markRaw(element);
        },
        createComment: (text) => {
            const element = new TestElement('#comment', railSize);
            element.text = text;
            return markRaw(element);
        },
        insert(child, parent, anchor) {
            if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
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
            if (key === 'style' && next && typeof next === 'object') {
                Object.assign(node.style, next);
            }
        },
        parentNode: (node) => node.parent,
        nextSibling: (node) => {
            const siblings = node.parent?.children;
            return siblings ? siblings[siblings.indexOf(node) + 1] ?? null : null;
        },
    });
    const app = renderer.createApp(editorToolRail, {
        activeTool: null,
        eyedropperClosedFromToolbar: false,
        hasImage: true,
        busy: false,
        popupOpen: false,
        canZoomIn: true,
        canZoomOut: true,
        canUndo: true,
        canRedo: true,
        ...props,
        onImport: () => emitted.push({ name: 'import' }),
        onExport: () => emitted.push({ name: 'export' }),
        onUndo: () => emitted.push({ name: 'undo' }),
        onRedo: () => emitted.push({ name: 'redo' }),
        onZoomIn: () => emitted.push({ name: 'zoom-in' }),
        onZoomOut: () => emitted.push({ name: 'zoom-out' }),
        onSelectTool: (tool: string) => emitted.push({ name: 'select-tool', value: tool }),
    });
    const root = markRaw(new TestElement('root', railSize));
    app.mount(root);
    function updateProps(nextProps: Partial<RailProps>) {
        const instance = app._instance;
        assert.ok(instance, 'the rail app should be mounted');
        Object.assign(instance.props, nextProps);
    }

    return { app, emitted, root, updateProps };
}

function findElement(root: TestElement, property: string, value: string): TestElement | null {
    if (property === 'tag' ? root.type === value : root.props[property] === value) return root;
    for (const child of root.children) {
        const match = findElement(child, property, value);
        if (match) return match;
    }
    return null;
}

function findElements(root: TestElement, property: string, value: string): TestElement[] {
    const matches = (property === 'tag' ? root.type === value : root.props[property] === value) ? [root] : [];
    return matches.concat(...root.children.map((child) => findElements(child, property, value)));
}

async function readComponentStyles(path: string) {
    const source = await readFile(resolve(cwd(), path), 'utf8');
    return parse(source, { filename: path }).descriptor.styles
        .map((style) => style.content)
        .join('\n');
}

function countElementsWithProperty(root: TestElement, property: string): number {
    return Number(property in root.props)
        + root.children.reduce((count, child) => count + countElementsWithProperty(child, property), 0);
}

function getToolIds(root: TestElement): string[] {
    const toolId = root.props['data-tool-id'];
    return [
        ...(typeof toolId === 'string' ? [toolId] : []),
        ...root.children.flatMap(getToolIds),
    ];
}

function getPopupGroupLabels(root: TestElement): string[] {
    return findElements(root, 'role', 'group')
        .map((element) => element.props['aria-label'])
        .filter((label): label is string => typeof label === 'string' && label !== 'More tools');
}

function findFoldoutPanel(root: TestElement, label: string): TestElement | null {
    if (root.props.role === 'group' && root.props['aria-label'] === label) return root;
    for (const child of root.children) {
        const match = findFoldoutPanel(child, label);
        if (match) return match;
    }
    return null;
}

function isWithin(element: TestElement, ancestor: TestElement): boolean {
    let current = element.parent;
    while (current) {
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
}

function findMoreToolsLauncher(root: TestElement): TestElement | null {
    return findElement(root, 'data-more-tools-launcher', 'true');
}

function assertToolGroupRailOrder(root: TestElement, expected: readonly string[]) {
    const groups = findElement(root, 'class', 'tool-groups');
    assert.ok(groups);
    const order = groups.children
        .filter((child) => child.type !== '#text' && child.type !== '#comment')
        .map((child) => {
            if (child.type === 'hr') return 'divider';
            if (child.props.class === 'tool-foldout') return 'launcher';
            return child.props['aria-label'];
        });
    assert.deepEqual(order, expected);
}

function assertMoreToolsLauncher(root: TestElement) {
    const launcher = findMoreToolsLauncher(root);
    assert.ok(launcher, 'the shared launcher should render');
    assert.equal(findElements(root, 'data-more-tools-launcher', 'true').length, 1);
    assert.equal(countElementsWithProperty(root, 'data-group-launcher'), 0);
    const iconClasses = findElements(launcher, 'tag', 'i').map((icon) => String(icon.props.class));
    assert.deepEqual(iconClasses, ['bi bi-three-dots-vertical']);
    const groups = findElement(root, 'class', 'tool-groups');
    assert.ok(groups);
    assert.equal(launcher.parent?.parent, groups, 'the launcher stays in the Adjustment slot');
    const laterGroupElements = groups.children
        .slice(groups.children.indexOf(launcher.parent!) + 1)
        .filter((child) => child.type !== '#text' && child.type !== '#comment');
    assert.equal(laterGroupElements.length, 0, 'the launcher remains at the end of the edit-tool cluster');
    const nextElement = groups.parent?.children
        .slice((groups.parent?.children.indexOf(groups) ?? -1) + 1)
        .find((child) => child.type !== '#text' && child.type !== '#comment');
    assert.equal(nextElement?.type, 'hr', 'the launcher stays before the View separator');
}

async function click(element: TestElement | null) {
    assert.ok(element, 'the target button should render');
    element.focus();
    const handler = element.props.onClick;
    assert.ok(typeof handler === 'function' || Array.isArray(handler), 'the button should have a click handler');
    for (const callback of Array.isArray(handler) ? handler : [handler]) {
        if (typeof callback === 'function') await callback(new Event('click'));
    }
}

function installBrowserMocks() {
    resizeObservers = new Set();
    focusedTestElement = null;
    type TestResizeObserverCallback = () => void;
    class TestResizeObserver {
        private readonly callback: TestResizeObserverCallback;
        private readonly notify: () => void;
        constructor(callback: TestResizeObserverCallback) {
            this.callback = callback;
            this.notify = () => this.callback();
            resizeObservers.add(this.notify);
        }
        observe() { this.callback(); }
        disconnect() { resizeObservers.delete(this.notify); }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { innerWidth: 1280, innerHeight: 420, addEventListener() {}, removeEventListener() {} },
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            get activeElement() { return focusedTestElement; },
            addEventListener() {},
            removeEventListener() {},
        },
    });
}

function triggerResizeObservers() {
    for (const notify of resizeObservers) notify();
}

async function settleLayout() {
    for (let index = 0; index < 8; index += 1) await nextTick();
}

test('closing eyedropper from its toolbar keeps collapsed Adjustment tools closed', async (context) => {
    installBrowserMocks();
    const railSize = {
        clientHeight: 250,
        scrollHeight: 500,
        scrollHeightsByCollapsedCount: [500, 300, 180, 120],
    };
    const closedFromToolbar = mountRail(railSize);
    context.after(() => closedFromToolbar.app.unmount());
    await settleLayout();
    closedFromToolbar.updateProps({ activeTool: 'eyedropper' });
    await settleLayout();
    closedFromToolbar.updateProps({
        activeTool: null,
        eyedropperClosedFromToolbar: true,
    });
    await settleLayout();
    assert.equal(findMoreToolsLauncher(closedFromToolbar.root)?.props['aria-expanded'], false);

    const closedAnotherWay = mountRail(railSize);
    context.after(() => closedAnotherWay.app.unmount());
    await settleLayout();
    closedAnotherWay.updateProps({ activeTool: 'eyedropper' });
    await settleLayout();
    const launcher = findMoreToolsLauncher(closedAnotherWay.root);
    assert.ok(launcher);
    await click(launcher);
    const panel = findFoldoutPanel(closedAnotherWay.root, 'More tools');
    assert.ok(panel);
    assert.deepEqual(getPopupGroupLabels(panel), ['Paint tools', 'Adjustment tools']);
    const eyedropper = findElement(panel, 'aria-label', 'Eyedropper');
    assert.ok(eyedropper);
    assert.equal(eyedropper.props['data-tool-group'], 'adjustment');
    assert.equal(eyedropper.props['aria-pressed'], true);
    assert.match(String(eyedropper.props.class), /\bis-active\b/);
    assert.equal(findElements(eyedropper, 'tag', 'i')[0]?.props.class, 'bi bi-eyedropper');
    await click(eyedropper);
    assert.deepEqual(closedAnotherWay.emitted, [{ name: 'select-tool', value: 'eyedropper' }]);
    assert.equal(focusedTestElement, launcher, 'selecting the collapsed tool returns focus to the launcher');
    closedAnotherWay.updateProps({ activeTool: null });
    await settleLayout();
    assert.equal(findMoreToolsLauncher(closedAnotherWay.root)?.props['aria-expanded'], true);
});

test('one shared popup combines collapsed groups and preserves fixed tool actions', async (context) => {
    installBrowserMocks();
    const { app, emitted, root } = mountRail({
        clientHeight: 250,
        scrollHeight: 500,
        scrollHeightsByCollapsedCount: [500, 300, 180, 120],
    }, { activeTool: 'brush' });
    context.after(() => app.unmount());
    await settleLayout();

    const launcher = findMoreToolsLauncher(root);
    const transformGroup = findElement(root, 'aria-label', 'Transform tools');
    const zoomIn = findElement(root, 'aria-label', 'Zoom in');
    const zoomOut = findElement(root, 'aria-label', 'Zoom out');
    const pan = findElement(root, 'aria-label', 'Pan');
    assert.ok(launcher && transformGroup && zoomIn && zoomOut && pan);
    assert.equal(launcher.props['aria-label'], 'More tools');
    assert.equal(launcher.props['aria-expanded'], false);
    assertMoreToolsLauncher(root);
    assertToolGroupRailOrder(root, ['Transform tools', 'divider', 'launcher']);
    assert.equal(findElement(root, 'aria-label', 'Crop')?.props['aria-pressed'], false);
    assert.equal(findElement(root, 'aria-label', 'Brush')?.props['aria-pressed'], true);

    const panel = findFoldoutPanel(root, 'More tools');
    assert.ok(panel);
    assert.equal(launcher.props['aria-controls'], panel.props.id);
    for (const fixedTool of [zoomIn, zoomOut, pan]) {
        assert.equal(isWithin(fixedTool, panel), false);
    }

    await click(launcher);
    await settleLayout();
    assert.equal(launcher.props['aria-expanded'], true);
    assert.deepEqual(getPopupGroupLabels(panel), ['Paint tools', 'Adjustment tools']);
    assert.deepEqual(
        findElements(panel, 'tag', 'hr').length,
        1,
        'collapsed groups retain their divider boundary',
    );
    const popupDividers = findElements(panel, 'role', 'separator');
    assert.equal(popupDividers.length, 1);
    assert.equal(popupDividers[0]?.props['aria-orientation'], 'vertical');
    const groupStyles = await readComponentStyles('src/components/editor/chrome/EditorToolGroups.vue');
    const foldoutStyles = await readComponentStyles('src/components/editor/chrome/EditorToolFoldout.vue');
    assert.match(
        groupStyles,
        /\.tool-group--popup\s*\{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;/s,
        'buttons in each collapsed group remain in one non-wrapping row',
    );
    assert.match(
        foldoutStyles,
        /\.tool-foldout__panel\s*\{[^}]*flex-direction:\s*row;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s,
        'the shared popup stays in one horizontally scrollable row',
    );
    for (const label of ['Brush', 'Eyedropper', 'Levels', 'Curves', 'Brightness/Contrast', 'Color mode']) {
        assert.ok(findElement(panel, 'aria-label', label), `${label} should be in the combined popup`);
    }
    assert.deepEqual(
        getToolIds(panel),
        ['brush', 'levels', 'curves', 'brightness-contrast', 'color-mode', 'eyedropper'],
    );
    assert.equal(findElement(panel, 'aria-label', 'Crop'), null);

    await click(findElement(panel, 'aria-label', 'Brush'));
    await settleLayout();
    assert.equal(launcher.props['aria-expanded'], false);
    assert.equal(focusedTestElement, launcher, 'tool selection returns focus to the shared launcher');
    assert.deepEqual(emitted, [{ name: 'select-tool', value: 'brush' }]);

    await click(launcher);
    const escapeHandler = panel.parent?.props.onKeydown;
    assert.ok(typeof escapeHandler === 'function');
    escapeHandler({
        key: 'Escape',
        stopPropagation() {},
    } as KeyboardEvent);
    await settleLayout();
    assert.equal(launcher.props['aria-expanded'], false);
    assert.equal(focusedTestElement, launcher, 'Escape restores focus to the shared launcher');

    await click(zoomIn);
    await click(zoomOut);
    assert.deepEqual(emitted, [
        { name: 'select-tool', value: 'brush' },
        { name: 'zoom-in' },
        { name: 'zoom-out' },
    ]);

    const panActive = mountRail(
        { clientHeight: 100, scrollHeight: 500 },
        { activeTool: 'pan' },
    );
    context.after(() => panActive.app.unmount());
    await settleLayout();
    const activeLauncher = findMoreToolsLauncher(panActive.root);
    assert.ok(activeLauncher);
    assert.equal(activeLauncher.props['aria-expanded'], false);
    assert.doesNotMatch(String(activeLauncher.props.class), /\bis-active\b/);
});

test('collapsing/restoring follows group order and the smallest rail can scroll', async (context) => {
    installBrowserMocks();
    const adjustable = mountRail({
        clientHeight: 510,
        scrollHeight: 500,
        scrollHeightsByCollapsedCount: [500, 300, 180, 120],
    });
    context.after(() => adjustable.app.unmount());
    await settleLayout();

    assert.equal(findMoreToolsLauncher(adjustable.root), null);
    assertToolGroupRailOrder(adjustable.root, [
        'Transform tools',
        'divider',
        'Paint tools',
        'divider',
        'Adjustment tools',
    ]);

    const rail = findElement(adjustable.root, 'tag', 'nav');
    assert.ok(rail);
    rail.clientHeight = 350;
    triggerResizeObservers();
    await settleLayout();
    assertMoreToolsLauncher(adjustable.root);
    assertToolGroupRailOrder(adjustable.root, [
        'Transform tools',
        'divider',
        'Paint tools',
        'divider',
        'launcher',
    ]);
    const adjustmentPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(adjustmentPanel);
    assert.deepEqual(getPopupGroupLabels(adjustmentPanel), ['Adjustment tools']);

    rail.clientHeight = 250;
    triggerResizeObservers();
    await settleLayout();
    assertMoreToolsLauncher(adjustable.root);
    assertToolGroupRailOrder(adjustable.root, ['Transform tools', 'divider', 'launcher']);
    const paintAndAdjustmentPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(paintAndAdjustmentPanel);
    assert.deepEqual(getPopupGroupLabels(paintAndAdjustmentPanel), ['Paint tools', 'Adjustment tools']);

    rail.clientHeight = 50;
    triggerResizeObservers();
    await settleLayout();
    assertMoreToolsLauncher(adjustable.root);
    assertToolGroupRailOrder(adjustable.root, ['launcher']);
    const allToolsPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(allToolsPanel);
    assert.deepEqual(getPopupGroupLabels(allToolsPanel), [
        'Transform tools',
        'Paint tools',
        'Adjustment tools',
    ]);
    assert.deepEqual(getToolIds(allToolsPanel), [
        'crop',
        'resize',
        'rotate',
        'brush',
        'levels',
        'curves',
        'brightness-contrast',
        'color-mode',
        'eyedropper',
    ]);
    assert.equal(findElements(allToolsPanel, 'tag', 'hr').length, 2);

    rail.clientHeight = 250;
    triggerResizeObservers();
    await settleLayout();
    assertMoreToolsLauncher(adjustable.root);
    assertToolGroupRailOrder(adjustable.root, ['Transform tools', 'divider', 'launcher']);
    const restoredTransformPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(restoredTransformPanel);
    assert.deepEqual(getPopupGroupLabels(restoredTransformPanel), ['Paint tools', 'Adjustment tools']);

    const inlineBrush = findElement(adjustable.root, 'aria-label', 'Brush');
    assert.ok(inlineBrush);
    inlineBrush.focus();
    rail.clientHeight = 350;
    triggerResizeObservers();
    await settleLayout();
    assertMoreToolsLauncher(adjustable.root);
    assertToolGroupRailOrder(adjustable.root, [
        'Transform tools',
        'divider',
        'Paint tools',
        'divider',
        'launcher',
    ]);
    const restoredPaintPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(restoredPaintPanel);
    assert.deepEqual(getPopupGroupLabels(restoredPaintPanel), ['Adjustment tools']);

    rail.clientHeight = 250;
    triggerResizeObservers();
    await settleLayout();
    assertToolGroupRailOrder(adjustable.root, ['Transform tools', 'divider', 'launcher']);
    const collapsedLauncher = findMoreToolsLauncher(adjustable.root);
    assert.ok(collapsedLauncher);
    assert.equal(focusedTestElement, collapsedLauncher, 'a hidden inline tool hands focus to the shared launcher');

    await click(collapsedLauncher);
    const combinedPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(combinedPanel);
    findElement(combinedPanel, 'aria-label', 'Brush')?.focus();
    rail.clientHeight = 310;
    triggerResizeObservers();
    await settleLayout();
    assertToolGroupRailOrder(adjustable.root, [
        'Transform tools',
        'divider',
        'Paint tools',
        'divider',
        'launcher',
    ]);
    const remainingPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(remainingPanel);
    assert.deepEqual(getPopupGroupLabels(remainingPanel), ['Adjustment tools']);
    assert.equal(collapsedLauncher.props['aria-expanded'], false);
    assert.equal(
        focusedTestElement?.getAttribute('aria-label'),
        'Brush',
        'expanding an open group hands focus to its inline tool',
    );

    rail.clientHeight = 510;
    triggerResizeObservers();
    await settleLayout();
    const inlineEyedropper = findElement(adjustable.root, 'aria-label', 'Eyedropper');
    assert.ok(inlineEyedropper);
    inlineEyedropper.focus();
    rail.clientHeight = 350;
    triggerResizeObservers();
    await settleLayout();
    const eyedropperLauncher = findMoreToolsLauncher(adjustable.root);
    assert.ok(eyedropperLauncher);
    assert.equal(
        focusedTestElement,
        eyedropperLauncher,
        'collapsing Adjustment tools hands Eyedropper focus to the shared launcher',
    );
    await click(eyedropperLauncher);
    const eyedropperPanel = findFoldoutPanel(adjustable.root, 'More tools');
    assert.ok(eyedropperPanel);
    findElement(eyedropperPanel, 'aria-label', 'Eyedropper')?.focus();
    rail.clientHeight = 510;
    triggerResizeObservers();
    await settleLayout();
    assert.equal(
        focusedTestElement?.getAttribute('data-tool-id'),
        'eyedropper',
        'restoring Adjustment tools returns focus to Eyedropper',
    );

    const tiny = mountRail({
        clientHeight: 50,
        scrollHeight: 500,
        scrollHeightsByCollapsedCount: [500, 300, 180, 120],
    });
    context.after(() => tiny.app.unmount());
    await settleLayout();
    const tinyLauncher = findMoreToolsLauncher(tiny.root);
    const transformPanel = findFoldoutPanel(tiny.root, 'More tools');
    assert.ok(tinyLauncher && transformPanel);
    assert.equal(transformPanel.style.display, 'none', 'collapsed content stays available in its launcher popup');
    assert.deepEqual(getPopupGroupLabels(transformPanel), [
        'Transform tools',
        'Paint tools',
        'Adjustment tools',
    ]);
    assertMoreToolsLauncher(tiny.root);
    await click(tinyLauncher);
    for (const label of ['Crop', 'Resize', 'Rotate image']) {
        assert.ok(findElement(transformPanel, 'aria-label', label), `${label} should be in Transform tools`);
    }
    assert.deepEqual(getToolIds(transformPanel), [
        'crop',
        'resize',
        'rotate',
        'brush',
        'levels',
        'curves',
        'brightness-contrast',
        'color-mode',
        'eyedropper',
    ]);
    for (const label of ['Levels', 'Brush', 'Eyedropper']) {
        assert.ok(findElement(transformPanel, 'aria-label', label), `${label} should be in the combined popup`);
    }

    const empty = mountRail(
        { clientHeight: 100, scrollHeight: 500 },
        { hasImage: false, canZoomIn: false, canZoomOut: true },
    );
    context.after(() => empty.app.unmount());
    await settleLayout();
    assert.equal(findElement(empty.root, 'aria-label', 'Import image')?.props.disabled, false);
    assert.equal(findElement(empty.root, 'aria-label', 'Export')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Undo')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Redo')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Crop')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Pan')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Zoom in')?.props.disabled, true);
    assert.equal(findElement(empty.root, 'aria-label', 'Zoom out')?.props.disabled, false);

    const busy = mountRail(
        { clientHeight: 100, scrollHeight: 500 },
        { busy: true, popupOpen: true },
    );
    context.after(() => busy.app.unmount());
    await settleLayout();
    assert.equal(findElement(busy.root, 'tag', 'fieldset')?.props.disabled, true);
    for (const label of ['Import image', 'Export', 'Undo', 'Redo', 'Crop', 'Pan']) {
        assert.equal(findElement(busy.root, 'aria-label', label)?.props.disabled, true);
    }
    assert.equal(findElement(busy.root, 'aria-label', 'Zoom in')?.props.disabled, false);
    assert.equal(findElement(busy.root, 'aria-label', 'Zoom out')?.props.disabled, false);

    const expanded = mountRail({ clientHeight: 1000, scrollHeight: 500 });
    context.after(() => expanded.app.unmount());
    await settleLayout();
    assert.equal(findMoreToolsLauncher(expanded.root), null);
    const transformGroup = findElement(expanded.root, 'aria-label', 'Transform tools');
    const paintGroup = findElement(expanded.root, 'aria-label', 'Paint tools');
    const adjustmentGroup = findElement(expanded.root, 'aria-label', 'Adjustment tools');
    assert.ok(transformGroup && paintGroup && adjustmentGroup, 'all expanded tool groups should remain visible');
    const groupsContainer = findElement(expanded.root, 'class', 'tool-groups');
    assert.ok(groupsContainer);
    const groupRoots = groupsContainer.children.filter((child) => child.type === 'div');
    assert.equal(groupRoots.length, 3, 'each semantic tool group keeps its own boundary');
    const dividerGroupOrder = groupsContainer.children
        .filter((child) => child.type === 'div' || child.type === 'hr')
        .map((child) => child.type === 'hr' ? 'divider' : child.props['aria-label']);
    assert.deepEqual(
        dividerGroupOrder,
        ['Transform tools', 'divider', 'Paint tools', 'divider', 'Adjustment tools'],
        'the original Transform, Paint, Adjustment order remains separated by dividers',
    );
    const groupChildren = groupsContainer.parent?.children ?? [];
    const groupsIndex = groupChildren.indexOf(groupsContainer);
    const nextGroupElement = groupChildren
        .slice(groupsIndex + 1)
        .find((child) => child.type !== '#text' && child.type !== '#comment');
    assert.equal(nextGroupElement?.type, 'hr', 'editing groups should be separated from View tools');
    assert.deepEqual(getToolIds(transformGroup), ['crop', 'resize', 'rotate']);
    assert.deepEqual(getToolIds(paintGroup), ['brush']);
    assert.deepEqual(getToolIds(adjustmentGroup), [
        'levels',
        'curves',
        'brightness-contrast',
        'color-mode',
        'eyedropper',
    ]);
});

for (const [platform, modifier] of [['MacIntel', '⌘'], ['Win32', 'Ctrl'], ['Linux x86_64', 'Ctrl']]) {
    test(`shortcut tooltips match the platform: ${platform}`, async (context) => {
        installBrowserMocks();
        const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform } });
        context.after(() => {
            if (saved) Object.defineProperty(globalThis, 'navigator', saved);
            else Reflect.deleteProperty(globalThis, 'navigator');
        });
        const { app, root } = mountRail({ clientHeight: 1000, scrollHeight: 500 });
        context.after(() => app.unmount());
        await nextTick();
        for (const [label, title] of [
            ['Undo', `Undo last edit (${modifier}+Z)`],
            ['Redo', `Redo last undone edit (${modifier}+Y or ${modifier}+Shift+Z)`],
            ['Zoom in', `Zoom in (${modifier}++)`],
            ['Zoom out', `Zoom out (${modifier}+-)`],
        ]) {
            assert.equal(findElement(root, 'aria-label', label)?.props.title, title);
        }
    });
}

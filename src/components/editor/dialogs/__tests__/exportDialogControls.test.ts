import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createRenderer, type Component, type ComponentPublicInstance } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { ModuleKind, transpileModule } from 'typescript';
import type { ExportMimeType } from '../../../../lib/imageIO.ts';

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
});

const source = await readFile(new URL('../ExportDialog.vue', import.meta.url), 'utf8');
const script = compileScript(parse(source).descriptor, { id: 'export-controls-test' }).content
    .replace("import ToolModal from './ToolModal.vue';", 'const ToolModal = {};')
    // Encoding/resource lifecycle is covered by export.test.ts. Isolate the select boundary here.
    .replace("import { useExportPreview } from '@/composables/useExportPreview';",
        'const useExportPreview = () => ({ result: { value: null }, previewUrl: { value: null }, calculating: { value: false }, error: { value: null } });')
    .replace('__expose();', '')
    .replace('return __returned__', '__expose(__returned__); return __returned__');
const compiled = transpileModule(script, { compilerOptions: { module: ModuleKind.ESNext } }).outputText
    .replaceAll("'vue'", JSON.stringify(import.meta.resolve('vue')))
    .replaceAll("'chrome-extension-component-library'", JSON.stringify(import.meta.resolve('chrome-extension-component-library')))
    .replaceAll("'@/lib/imageIO'", JSON.stringify(new URL('../../../../lib/imageIO.ts', import.meta.url).href));
const controls: Component = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default;
const renderer = createRenderer<object, object>({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
});

interface ExportControls extends ComponentPublicInstance {
    mimeType: ExportMimeType
    quality: number
    displayedQuality: string
    qualityOptions: { value: string; label: string }[]
    formatOptions: { value: ExportMimeType; label: string }[]
    fileName: string
}

function mountControls(mimeType: ExportMimeType) {
    const app = renderer.createApp({ ...controls, render: () => null }, {
        bitmap: { width: 320, height: 180 },
        image: { fileName: 'migration.png', exportMimeType: mimeType },
        originalSize: 1024, busy: false, error: null,
    });
    const state = app.mount({}) as ExportControls;
    return { app, state };
}

test('export select string values map only to existing numeric quality presets', () => {
    const { app, state } = mountControls('image/jpeg');
    try {
        assert.deepEqual(state.formatOptions.map(({ value }) => value), ['image/jpeg', 'image/png', 'image/webp']);
        assert.equal(state.displayedQuality, '0.92');
        assert.deepEqual(state.qualityOptions.map(({ value }) => value), ['0.92', '0.8', '0.6', '0.4']);
        for (const option of state.qualityOptions) {
            state.displayedQuality = option.value;
            assert.equal(state.quality, Number(option.value));
        }
        state.displayedQuality = '0.8';
        state.displayedQuality = '';
        state.displayedQuality = 'invalid';
        state.displayedQuality = '0.1';
        assert.equal(state.quality, 0.8);
        assert.equal(state.fileName, 'migration.jpg');
    } finally { app.unmount(); }
});

test('PNG shows a blank quality option without losing the previous lossy quality', () => {
    const { app, state } = mountControls('image/webp');
    try {
        state.displayedQuality = '0.6';
        state.mimeType = 'image/png';
        assert.equal(state.displayedQuality, '');
        assert.deepEqual(state.qualityOptions, [{ value: '', label: '' }]);
        assert.equal(state.quality, 0.6);
        assert.equal(state.fileName, 'migration.png');
        state.mimeType = 'image/webp';
        assert.equal(state.displayedQuality, '0.6');
        assert.equal(state.fileName, 'migration.webp');
    } finally { app.unmount(); }
});

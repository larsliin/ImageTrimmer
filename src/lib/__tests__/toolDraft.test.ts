import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, shallowRef, reactive } from 'vue';
import { toolDraftKey, isFloatingTool, type ToolDraft } from '../toolDraft.ts';
import { useToolDraft } from '../../composables/useToolDraft.ts';

const drafts: ToolDraft[] = [
    { tool: 'crop', rect: { x: 0, y: 0, width: 200, height: 100 }, angle: 0 },
    { tool: 'resize', width: 200, height: 100 },
    { tool: 'rotate', turns: 0, flipH: false, flipV: false },
    { tool: 'brush', strokes: [] },
];

for (const baseline of drafts) {
    test(`${baseline.tool}: opening baseline, edits and restoration`, () => {
        const current = shallowRef<ToolDraft>(baseline);
        const reports: boolean[] = [];
        const scope = effectScope();
        scope.run(() => useToolDraft(() => current.value, value => reports.push(value)));
        switch (baseline.tool) {
            case 'crop': current.value = { ...baseline, angle: 5 }; break;
            case 'resize': current.value = { ...baseline, width: 199 }; break;
            case 'rotate': current.value = { ...baseline, flipH: true }; break;
            case 'brush': current.value = { ...baseline, strokes: [{ thickness: 20, color: '#000000', points: [{ x: 10, y: 20 }] }] }; break;
        }
        current.value = baseline;
        assert.deepEqual(reports, [false, true, false]);
        scope.stop();
    });
}

test('display state and persisted preferences never enter the snapshot', () => {
    const scope = effectScope();
    const state = reactive({
        tool: 'crop' as const, rect: { x: 0, y: 0, width: 200, height: 100 }, angle: 0,
        zoom: 1, pan: 0, panelX: 0, preview: true, channel: 'rgb', aspectLock: true, snapToPixel: false,
    });
    const reports: boolean[] = [];
    scope.run(() => useToolDraft(() => state, dirty => reports.push(dirty)));
    Object.assign(state, { zoom: 2, pan: 10, panelX: 20, preview: false, channel: 'red', aspectLock: false, snapToPixel: true });
    assert.deepEqual(reports, [false]);
    state.rect.width = 199;
    state.rect.width = 200;
    assert.deepEqual(reports, [false, true, false]);
    scope.stop();
    const brush = { tool: 'brush' as const, strokes: [], thickness: 20, color: '#000000' };
    assert.equal(toolDraftKey(brush), toolDraftKey({ ...brush, thickness: 50, color: '#ffffff' }));
});

test('all pending stroke content is compared, not just stroke count', () => {
    const stroke = { thickness: 20, color: '#000000', points: [{ x: 10, y: 20 }] };
    const key = toolDraftKey({ tool: 'brush', strokes: [stroke] });
    assert.notEqual(key, toolDraftKey({ tool: 'brush', strokes: [{ ...stroke, points: [{ x: 11, y: 20 }] }] }));
});

test('invalid dimensions differ from the opening baseline', () => {
    assert.notEqual(toolDraftKey({ tool: 'resize', width: '', height: 100 }), toolDraftKey(drafts[1]!));
    assert.notEqual(toolDraftKey({ tool: 'resize', width: NaN, height: 100 }), toolDraftKey({ tool: 'resize', width: 'NaN', height: 100 }));
});

test('only FloatingToolbar tools participate', () => {
    for (const tool of ['crop', 'resize', 'rotate', 'brush', 'eyedropper'] as const) assert.equal(isFloatingTool(tool), true);
    for (const tool of ['levels', 'curves', 'brightness-contrast', 'color-mode', 'pan', null] as const) assert.equal(isFloatingTool(tool), false);
});

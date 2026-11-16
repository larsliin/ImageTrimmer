import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, shallowRef } from 'vue';
import { useToolCloseGuard } from '../../composables/useToolCloseGuard.ts';
import type { ToolId } from '../../types/editor.ts';

function setup(tool: ToolId = 'resize') {
    const activeTool = shallowRef<ToolId | null>(tool);
    const busy = shallowRef(false);
    const brushDirty = shallowRef(false);
    const scope = effectScope();
    const guard = scope.run(() => useToolCloseGuard({ activeTool, busy, brushDirty }))!;
    return { activeTool, busy, brushDirty, guard, stop: () => scope.stop() };
}

test('clean close completes immediately', () => {
    const state = setup();
    state.guard.request({ kind: 'close' });
    assert.equal(state.activeTool.value, null);
    assert.equal(state.guard.pendingIntent.value, null);
    state.stop();
});

test('dirty prompt preserves the active tool, keep retains its dirty state', () => {
    const state = setup();
    state.guard.reportDirty(true);
    state.guard.request({ kind: 'close' });
    assert.equal(state.activeTool.value, 'resize');
    assert.deepEqual(state.guard.pendingIntent.value, { kind: 'close' });
    state.guard.keepEditing();
    assert.equal(state.activeTool.value, 'resize');
    assert.equal(state.guard.pendingIntent.value, null);
    state.guard.request({ kind: 'close' });
    assert.ok(state.guard.pendingIntent.value);
    state.stop();
});

test('discard completes the original switch and ignores stacked intents', () => {
    const state = setup('crop');
    state.guard.reportDirty(true);
    state.guard.request({ kind: 'switch', tool: 'levels' });
    state.guard.request({ kind: 'switch', tool: 'brush' });
    state.guard.discardChanges();
    assert.equal(state.activeTool.value, 'levels');
    assert.equal(state.guard.pendingIntent.value, null);
    state.guard.request({ kind: 'close' });
    assert.equal(state.activeTool.value, null);
    state.stop();
});

test('restoring baseline permits immediate close', () => {
    const state = setup();
    state.guard.reportDirty(true);
    state.guard.reportDirty(false);
    state.guard.request({ kind: 'close' });
    assert.equal(state.activeTool.value, null);
    state.stop();
});

test('brush undo to empty opening set makes it clean', () => {
    const state = setup('brush');
    state.brushDirty.value = true;
    state.guard.request({ kind: 'close' });
    assert.ok(state.guard.pendingIntent.value);
    state.guard.keepEditing();
    state.brushDirty.value = false;
    state.guard.request({ kind: 'close' });
    assert.equal(state.activeTool.value, null);
    state.stop();
});

test('busy blocks close, switch and discard', () => {
    const state = setup();
    state.guard.reportDirty(true);
    state.busy.value = true;
    state.guard.request({ kind: 'close' });
    assert.equal(state.guard.pendingIntent.value, null);
    state.busy.value = false;
    state.guard.request({ kind: 'switch', tool: 'rotate' });
    state.busy.value = true;
    state.guard.discardChanges();
    assert.equal(state.activeTool.value, 'resize');
    assert.ok(state.guard.pendingIntent.value);
    state.stop();
});

test('Apply blocks dismissal across async processing; failure preserves draft', async () => {
    const state = setup();
    state.guard.reportDirty(true);
    // eslint-disable-next-line no-unused-vars
    let finish: (success: boolean) => void = () => {};
    const applying = state.guard.apply(() => new Promise<boolean>(resolve => { finish = resolve; }));
    state.guard.request({ kind: 'switch', tool: 'brush' });
    state.guard.request({ kind: 'close' });
    state.guard.discardChanges();
    assert.equal(state.activeTool.value, 'resize');
    assert.equal(state.guard.pendingIntent.value, null);
    finish(false);
    await applying;
    state.guard.request({ kind: 'close' });
    assert.ok(state.guard.pendingIntent.value);
    state.guard.keepEditing();
    await state.guard.apply(async () => true);
    assert.equal(state.activeTool.value, null);
    state.stop();
});

test('popup tools never prompt, even when mistakenly reported dirty', () => {
    for (const tool of ['levels', 'curves', 'brightness-contrast', 'color-mode'] as const) {
        const state = setup(tool);
        state.guard.reportDirty(true);
        state.guard.request({ kind: 'switch', tool: 'crop' });
        assert.equal(state.activeTool.value, 'crop');
        assert.equal(state.guard.pendingIntent.value, null);
        state.stop();
    }
});

test('deferred close action runs only after discard, never keep or stacked request', () => {
    const state = setup();
    let completed = 0;
    state.guard.reportDirty(true);
    state.guard.request({ kind: 'close' }, () => { completed += 1; });
    state.guard.keepEditing();
    assert.equal(completed, 0);
    state.guard.request({ kind: 'close' }, () => { completed += 1; });
    state.guard.request({ kind: 'close' }, () => { completed += 10; });
    state.guard.discardChanges();
    assert.equal(completed, 1);
    state.stop();
});

test('Straighten Cancel uses the standard dirty-draft close guard', () => {
    const state = setup('straighten');
    state.guard.reportDirty(true);
    state.guard.request({ kind: 'close' });
    assert.deepEqual(state.guard.pendingIntent.value, { kind: 'close' });
    assert.equal(state.activeTool.value, 'straighten');
    state.guard.keepEditing();
    assert.equal(state.activeTool.value, 'straighten');
    state.guard.request({ kind: 'close' });
    state.guard.discardChanges();
    assert.equal(state.activeTool.value, null);
    assert.equal(state.guard.pendingIntent.value, null);
    state.stop();
});

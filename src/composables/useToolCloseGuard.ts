import { computed, nextTick, readonly, shallowRef, watch, type Ref } from 'vue';
import type { ToolId } from '../types/editor';
import { EDIT_TOOLS, PAINT_TOOLS, PAN_TOOL } from '../types/editor.ts';
import { isFloatingTool, type ToolCloseIntent } from '../lib/toolDraft.ts';

interface CloseGuardOptions {
    activeTool: Ref<ToolId | null>
    busy: Readonly<Ref<boolean>>
    brushDirty: Readonly<Ref<boolean>>
}

export function useToolCloseGuard(options: CloseGuardOptions) {
    const reportedDirty = shallowRef(false);
    const pendingIntent = shallowRef<ToolCloseIntent | null>(null);
    const applying = shallowRef(false);
    const blocked = computed(() => options.busy.value || applying.value);
    const dirty = computed(() => isFloatingTool(options.activeTool.value)
        && (options.activeTool.value === 'brush' ? options.brushDirty.value : reportedDirty.value));
    const toolName = computed(() => [...EDIT_TOOLS, ...PAINT_TOOLS, PAN_TOOL]
        .find(tool => tool.id === options.activeTool.value)?.label ?? 'tool');
    let pendingCompletion: (() => void) | undefined;
    let previousFocus: HTMLElement | null = null;

    watch(options.activeTool, () => { reportedDirty.value = false; }, { flush: 'sync' });

    function focusDestination(closedTool: ToolId | null) {
        void nextTick(async () => {
            // Let the departing tool finish its own nextTick focus restoration first.
            await nextTick();
            const panel = document.querySelector<HTMLElement>('.tool-modal, #editor-tool-controls [role="toolbar"], .crop-surface');
            if (options.activeTool.value && panel) {
                const target = panel.querySelector<HTMLElement>('form button:not(:disabled), form input:not(:disabled), [tabindex="0"]') ?? panel;
                target.focus();
            } else {
                const tool = [...EDIT_TOOLS, ...PAINT_TOOLS, PAN_TOOL].find(item => item.id === closedTool);
                const buttons = document.querySelectorAll<HTMLElement>('.editor__tool-rail button');
                const target = [...buttons].find(button => button.getAttribute('aria-label') === tool?.label && button.getClientRects().length)
                    ?? document.querySelector<HTMLElement>('.editor__tool-rail button:not(:disabled)');
                target?.focus();
            }
        });
    }

    function complete(intent: ToolCloseIntent) {
        const closedTool = options.activeTool.value;
        reportedDirty.value = false;
        options.activeTool.value = intent.kind === 'switch' ? intent.tool : null;
        if (isFloatingTool(closedTool) && typeof document !== 'undefined') focusDestination(closedTool);
    }

    function request(intent: ToolCloseIntent, onComplete?: () => void) {
        if (blocked.value || pendingIntent.value) return;
        if (!dirty.value) { complete(intent); onComplete?.(); return; }
        pendingCompletion = onComplete;
        previousFocus = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
        pendingIntent.value = intent;
    }

    function keepEditing() {
        if (!pendingIntent.value) return;
        pendingIntent.value = null;
        pendingCompletion = undefined;
        void nextTick(() => {
            if (previousFocus?.isConnected) previousFocus.focus();
            else if (typeof document !== 'undefined') focusDestination(options.activeTool.value);
        });
    }

    function discardChanges() {
        if (blocked.value || !pendingIntent.value) return;
        const intent = pendingIntent.value;
        pendingIntent.value = null;
        // Closing or switching unmounts the local draft.
        complete(intent);
        const onComplete = pendingCompletion;
        pendingCompletion = undefined;
        onComplete?.();
    }

    async function apply(operation: () => Promise<boolean>) {
        if (blocked.value || pendingIntent.value) return;
        applying.value = true;
        try {
            if (await operation()) complete({ kind: 'close' });
        } finally {
            applying.value = false;
        }
    }

    return {
        pendingIntent: readonly(pendingIntent), applying: readonly(applying), blocked, toolName,
        reportDirty: (value: boolean) => { reportedDirty.value = value; },
        request, keepEditing, discardChanges, apply,
    };
}

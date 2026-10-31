<script setup lang="ts">
    import { nextTick, shallowRef, useTemplateRef, watch } from 'vue';
    import {
        ADJUSTMENT_TOOLS,
        PAINT_TOOLS,
        PAN_TOOL,
        TRANSFORM_TOOLS,
        type ToolId,
    } from '@/types/editor';
    import { useOverflowCollapse } from '@/composables/useOverflowCollapse';
    import EditorToolGroups from './EditorToolGroups.vue';
    import PanIcon from '@/components/editor/icons/PanIcon.vue';
    import UndoIcon from '@/components/editor/icons/UndoIcon.vue';
    import RedoIcon from '@/components/editor/icons/RedoIcon.vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
    import { shortcutModifierLabel } from '@/lib/shortcuts';

    const modifier = shortcutModifierLabel();

    const props = defineProps<{
        activeTool: ToolId | null
        eyedropperClosedFromToolbar: boolean
        hasImage: boolean
        busy: boolean
        popupOpen: boolean
        canZoomIn: boolean
        canZoomOut: boolean
        canUndo: boolean
        canRedo: boolean
    }>();

    const emit = defineEmits<{
        import: []
        export: []
        'select-tool': [tool: ToolId]
        'zoom-in': []
        'zoom-out': []
        undo: []
        redo: []
    }>();

    type ToolGroupId = 'adjustment' | 'paint' | 'transform';
    const COLLAPSE_ORDER: readonly ToolGroupId[] = ['adjustment', 'paint', 'transform'];
    const TOOLS_BY_GROUP = {
        adjustment: ADJUSTMENT_TOOLS,
        paint: PAINT_TOOLS,
        transform: TRANSFORM_TOOLS,
    } as const;

    const rail = useTemplateRef<HTMLElement>('rail');
    const { collapsedCount } = useOverflowCollapse(rail);
    const moreToolsOpen = shallowRef(false);

    function groupForTool(tool: string | null | undefined): ToolGroupId | null {
        if (TOOLS_BY_GROUP.transform.some((item) => item.id === tool)) return 'transform';
        if (TOOLS_BY_GROUP.paint.some((item) => item.id === tool)) return 'paint';
        if (TOOLS_BY_GROUP.adjustment.some((item) => item.id === tool)) return 'adjustment';
        return null;
    }

    function isToolGroupId(value: string | null | undefined): value is ToolGroupId {
        return value === 'adjustment' || value === 'paint' || value === 'transform';
    }

    function groupIsCollapsed(group: ToolGroupId) {
        return COLLAPSE_ORDER.indexOf(group) < collapsedCount.value;
    }

    function focusRailTarget(selector: string) {
        if (
            props.popupOpen
            || !rail.value
            || (typeof rail.value.closest === 'function' && rail.value.closest('[inert]'))
            || typeof rail.value.querySelector !== 'function'
        ) return;
        const target = rail.value.querySelector<HTMLButtonElement>(selector);
        const fallback = rail.value.querySelector<HTMLButtonElement>('[aria-label="Import image"]');
        const focusTarget = target && !target.disabled ? target : fallback;
        if (focusTarget && !focusTarget.disabled) focusTarget.focus();
    }

    function focusMoreToolsLauncher() {
        focusRailTarget('[data-more-tools-launcher="true"]');
    }

    function focusTool(group: ToolGroupId, tool: string | null | undefined) {
        const targetTool = groupForTool(tool) === group
            ? tool
            : TOOLS_BY_GROUP[group][0]?.id ?? null;
        if (targetTool) focusRailTarget(`[data-tool-id="${targetTool}"]`);
    }

    watch(collapsedCount, (count, previousCount) => {
        const activeElement = typeof document === 'undefined' ? null : document.activeElement;
        const focusedGroup = activeElement?.getAttribute('data-tool-group');
        const focusedTool = activeElement?.getAttribute('data-tool-id');
        const newlyCollapsed = COLLAPSE_ORDER.slice(previousCount, count);

        if (isToolGroupId(focusedGroup) && newlyCollapsed.includes(focusedGroup)) {
            void nextTick(focusMoreToolsLauncher);
        }

        if (count < previousCount && moreToolsOpen.value) {
            const restoredGroups = COLLAPSE_ORDER.slice(count, previousCount);
            if ((isToolGroupId(focusedGroup) && restoredGroups.includes(focusedGroup)) || count === 0) {
                moreToolsOpen.value = false;
                const group = isToolGroupId(focusedGroup) && restoredGroups.includes(focusedGroup)
                    ? focusedGroup
                    : restoredGroups.at(-1);
                if (group) void nextTick(() => focusTool(group, focusedTool));
            }
        }
    });

    watch(() => props.activeTool, (tool, previousTool) => {
        if (
            previousTool === 'eyedropper'
            && tool === null
            && !props.eyedropperClosedFromToolbar
            && groupIsCollapsed('adjustment')
            && props.hasImage
            && !props.busy
        ) {
            moreToolsOpen.value = true;
        }
    });

    watch(() => props.popupOpen, (isOpen) => {
        if (isOpen) moreToolsOpen.value = false;
    });

    function selectTool(tool: ToolId) {
        const returnFocus = moreToolsOpen.value;
        moreToolsOpen.value = false;
        emit('select-tool', tool);
        if (returnFocus) void nextTick(focusMoreToolsLauncher);
    }
</script>

<template>
    <nav ref="rail" class="tool-rail" aria-label="Editor tools">
        <fieldset class="tool-rail__controls" :disabled="popupOpen" aria-label="Editor tools">
            <div class="tool-group" role="group" aria-label="File">
                <BaseButton
                    variant="tool"
                    aria-label="Import image"
                    title="Import image"
                    :disabled="busy"
                    @click="emit('import')"
                >
                    <i class="bi bi-folder2-open" aria-hidden="true"></i>
                </BaseButton>
                <BaseButton
                    variant="tool"
                    aria-label="Export"
                    title="Export"
                    :disabled="!hasImage || busy"
                    @click="emit('export')"
                >
                    <i class="bi bi-download" aria-hidden="true"></i>
                </BaseButton>
            </div>

            <hr class="separator" />

            <div class="tool-group" role="group" aria-label="Edit history">
                <BaseButton
                    variant="tool"
                    aria-label="Undo"
                    :title="`Undo last edit (${modifier}+Z)`"
                    :disabled="!hasImage || busy || !canUndo"
                    @click="emit('undo')"
                >
                    <UndoIcon />
                </BaseButton>
                <BaseButton
                    variant="tool"
                    aria-label="Redo"
                    :title="`Redo last undone edit (${modifier}+Y or ${modifier}+Shift+Z)`"
                    :disabled="!hasImage || busy || !canRedo"
                    @click="emit('redo')"
                >
                    <RedoIcon />
                </BaseButton>
            </div>

            <hr class="separator" />

            <EditorToolGroups
                :active-tool="activeTool"
                :has-image="hasImage"
                :busy="busy"
                :collapsed-count="collapsedCount"
                :more-tools-open="moreToolsOpen"
                @update:more-tools-open="moreToolsOpen = $event"
                @select-tool="selectTool"
            />

            <hr class="separator" />

            <div class="tool-group" role="group" aria-label="View tools">
                <BaseButton
                    variant="tool"
                    aria-label="Zoom in"
                    :title="`Zoom in (${modifier}++)`"
                    :disabled="!canZoomIn"
                    @click="emit('zoom-in')"
                >
                    <i class="bi bi-zoom-in" aria-hidden="true"></i>
                </BaseButton>
                <BaseButton
                    variant="tool"
                    aria-label="Zoom out"
                    :title="`Zoom out (${modifier}+-)`"
                    :disabled="!canZoomOut"
                    @click="emit('zoom-out')"
                >
                    <i class="bi bi-zoom-out" aria-hidden="true"></i>
                </BaseButton>
                <BaseButton
                    variant="tool"
                    :class="{ 'is-active': activeTool === PAN_TOOL.id }"
                    :aria-pressed="activeTool === PAN_TOOL.id"
                    :aria-label="PAN_TOOL.label"
                    :title="PAN_TOOL.label"
                    :disabled="!hasImage || busy"
                    @click="selectTool(PAN_TOOL.id)"
                >
                    <PanIcon />
                </BaseButton>
            </div>
        </fieldset>
    </nav>
</template>

<style scoped src="./toolButtons.css"></style>

<style scoped>
.tool-rail__controls {
    display: contents;
}

.tool-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    width: 48px;
    min-height: 0;
    padding: 8px 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    background-color: var(--color-panel);
    border-right: 1px solid var(--color-border);
}

.tool-rail :deep(.tool-group),
.tool-rail :deep(.separator),
.tool-rail :deep(.tool-foldout) {
    flex-shrink: 0;
}
</style>

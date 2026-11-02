<script setup lang="ts">
    import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
    import {
        PAN_TOOL,
        TOOL_GROUPS,
        type ToolGroupId,
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

    const COLLAPSE_ORDER: ToolGroupId[] = [...TOOL_GROUPS].reverse().map(({ id }) => id);

    const rail = useTemplateRef<HTMLElement>('rail');
    const { collapsedCount } = useOverflowCollapse(rail, TOOL_GROUPS.length + 1);
    const historyCollapsed = computed(() => collapsedCount.value > TOOL_GROUPS.length);
    const moreToolsOpen = shallowRef(false);

    function groupForTool(tool: string | null | undefined): ToolGroupId | null {
        return TOOL_GROUPS.find((group) => group.tools.some((item) => item.id === tool))?.id ?? null;
    }

    function isToolGroupId(value: string | null | undefined): value is ToolGroupId {
        return TOOL_GROUPS.some((group) => group.id === value);
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
            : TOOL_GROUPS.find((toolGroup) => toolGroup.id === group)?.tools[0]?.id ?? null;
        if (targetTool) focusRailTarget(`[data-tool-id="${targetTool}"]`);
    }

    watch(historyCollapsed, (isCollapsed) => {
        const activeElement = typeof document === 'undefined' ? null : document.activeElement;
        const focusedHistoryAction = activeElement?.getAttribute('data-history-action');

        if (focusedHistoryAction !== 'undo' && focusedHistoryAction !== 'redo') return;

        moreToolsOpen.value = isCollapsed;
        void nextTick(() => focusRailTarget(`[data-history-action="${focusedHistoryAction}"]`));
    });

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

    function runHistoryAction(action: 'undo' | 'redo') {
        const returnFocus = moreToolsOpen.value;
        moreToolsOpen.value = false;
        if (action === 'undo') emit('undo');
        else emit('redo');
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

            <div
                v-if="!historyCollapsed"
                class="tool-group"
                role="group"
                aria-label="Edit history"
            >
                <BaseButton
                    variant="tool"
                    aria-label="Undo"
                    :title="`Undo last edit (${modifier}+Z)`"
                    :disabled="!hasImage || busy || !canUndo"
                    data-history-action="undo"
                    @click="runHistoryAction('undo')"
                >
                    <UndoIcon />
                </BaseButton>
                <BaseButton
                    variant="tool"
                    aria-label="Redo"
                    :title="`Redo last undone edit (${modifier}+Y or ${modifier}+Shift+Z)`"
                    :disabled="!hasImage || busy || !canRedo"
                    data-history-action="redo"
                    @click="runHistoryAction('redo')"
                >
                    <RedoIcon />
                </BaseButton>
            </div>

            <hr v-if="!historyCollapsed" class="separator" />

            <EditorToolGroups
                :active-tool="activeTool"
                :has-image="hasImage"
                :busy="busy"
                :can-undo="canUndo"
                :can-redo="canRedo"
                :history-collapsed="historyCollapsed"
                :collapsed-count="collapsedCount"
                :more-tools-open="moreToolsOpen"
                @update:more-tools-open="moreToolsOpen = $event"
                @select-tool="selectTool"
                @undo="runHistoryAction('undo')"
                @redo="runHistoryAction('redo')"
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
    overflow: hidden;
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

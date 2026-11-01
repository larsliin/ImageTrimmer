<script setup lang="ts">
    import { computed } from 'vue';
    import { TOOL_GROUPS, type ToolId } from '@/types/editor';
    import UndoIcon from '@/components/editor/icons/UndoIcon.vue';
    import RedoIcon from '@/components/editor/icons/RedoIcon.vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
    import { shortcutModifierLabel } from '@/lib/shortcuts';
    import EditorToolFoldout from './EditorToolFoldout.vue';
    import EditorToolButton from './EditorToolButton.vue';

    const modifier = shortcutModifierLabel();

    const props = defineProps<{
        activeTool: ToolId | null
        hasImage: boolean
        busy: boolean
        canUndo: boolean
        canRedo: boolean
        historyCollapsed: boolean
        collapsedCount: number
        moreToolsOpen: boolean
    }>();

    const emit = defineEmits<{
        'select-tool': [tool: ToolId]
        'update:moreToolsOpen': [open: boolean]
        undo: []
        redo: []
    }>();

    const inlineGroups = computed(() => TOOL_GROUPS.filter((_, index) => !isCollapsed(index)));
    const collapsedGroups = computed(() => TOOL_GROUPS.filter((_, index) => isCollapsed(index)));
    const collapsedToolIsActive = computed(() =>
        collapsedGroups.value.some((group) => group.tools.some((tool) => props.activeTool === tool.id)),
    );

    function isCollapsed(index: number) {
        return index >= TOOL_GROUPS.length - Math.min(props.collapsedCount, TOOL_GROUPS.length);
    }

</script>

<template>
    <div class="tool-groups">
        <template v-for="(group, index) in inlineGroups" :key="group.id">
            <hr v-if="index > 0" class="separator" />
            <div
                class="tool-group"
                role="group"
                :aria-label="group.label"
            >
                <EditorToolButton
                    v-for="tool in group.tools"
                    :key="tool.id"
                    :tool="tool"
                    :group-id="group.id"
                    :active="activeTool === tool.id"
                    :disabled="!hasImage || busy"
                    @select="emit('select-tool', $event)"
                />
            </div>
        </template>

        <template v-if="collapsedGroups.length > 0">
            <hr v-if="inlineGroups.length > 0" class="separator" />
            <EditorToolFoldout
                label="More tools"
                :active="collapsedToolIsActive"
                :open="moreToolsOpen"
                @update:open="emit('update:moreToolsOpen', $event)"
            >
                <template v-if="historyCollapsed">
                    <div class="tool-group-popup-section" role="group" aria-label="Edit history">
                        <div class="tool-group tool-group--popup">
                            <BaseButton
                                variant="tool"
                                aria-label="Undo"
                                :title="`Undo last edit (${modifier}+Z)`"
                                :disabled="!hasImage || busy || !canUndo"
                                data-history-action="undo"
                                @click="emit('undo')"
                            >
                                <UndoIcon />
                            </BaseButton>
                            <BaseButton
                                variant="tool"
                                aria-label="Redo"
                                :title="`Redo last undone edit (${modifier}+Y or ${modifier}+Shift+Z)`"
                                :disabled="!hasImage || busy || !canRedo"
                                data-history-action="redo"
                                @click="emit('redo')"
                            >
                                <RedoIcon />
                            </BaseButton>
                        </div>
                    </div>
                    <hr
                        class="separator tool-group__separator"
                        role="separator"
                        aria-orientation="vertical"
                    />
                </template>
                <template
                    v-for="(popupGroup, popupIndex) in collapsedGroups"
                    :key="popupGroup.id"
                >
                    <hr
                        v-if="popupIndex > 0"
                        class="separator tool-group__separator"
                        role="separator"
                        aria-orientation="vertical"
                    />
                    <div
                        class="tool-group-popup-section"
                        role="group"
                        :aria-label="popupGroup.label"
                    >
                        <div class="tool-group tool-group--popup">
                            <EditorToolButton
                                v-for="tool in popupGroup.tools"
                                :key="tool.id"
                                :tool="tool"
                                :group-id="popupGroup.id"
                                :active="activeTool === tool.id"
                                :disabled="!hasImage || busy"
                                @select="emit('select-tool', $event)"
                            />
                        </div>
                    </div>
                </template>
            </EditorToolFoldout>
        </template>
    </div>
</template>

<style scoped src="./toolButtons.css"></style>

<style scoped>
.tool-groups {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    gap: 6px;
}

.tool-group--popup {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    flex-shrink: 0;
}

.tool-group-popup-section {
    display: flex;
    flex: 0 0 auto;
}

.tool-group--popup :deep(.tool-button) {
    flex-shrink: 0;
}

.tool-group__separator {
    box-sizing: border-box;
    flex: 0 0 1px;
    align-self: center;
    width: 1px;
    height: 28px;
    margin: 0;
    border: 0;
    border-left: 1px solid var(--color-border);
}
</style>

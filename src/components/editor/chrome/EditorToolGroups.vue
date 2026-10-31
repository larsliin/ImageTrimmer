<script setup lang="ts">
    import { computed } from 'vue';
    import { ADJUSTMENT_TOOLS, PAINT_TOOLS, TRANSFORM_TOOLS, type ToolId } from '@/types/editor';
    import CurvesIcon from '@/components/editor/icons/CurvesIcon.vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
    import EditorToolFoldout from './EditorToolFoldout.vue';

    const props = defineProps<{
        activeTool: ToolId | null
        hasImage: boolean
        busy: boolean
        collapsedCount: number
        moreToolsOpen: boolean
    }>();

    const emit = defineEmits<{
        'select-tool': [tool: ToolId]
        'update:moreToolsOpen': [open: boolean]
    }>();

    const TOOL_GROUPS = [
        { id: 'transform', label: 'Transform tools', tools: TRANSFORM_TOOLS },
        { id: 'paint', label: 'Paint tools', tools: PAINT_TOOLS },
        { id: 'adjustment', label: 'Adjustment tools', tools: ADJUSTMENT_TOOLS },
    ] as const;

    const inlineGroups = computed(() => TOOL_GROUPS.filter((_, index) => !isCollapsed(index)));
    const collapsedGroups = computed(() => TOOL_GROUPS.filter((_, index) => isCollapsed(index)));
    const collapsedToolIsActive = computed(() =>
        collapsedGroups.value.some((group) => group.tools.some((tool) => props.activeTool === tool.id)),
    );

    function isCollapsed(index: number) {
        return index >= TOOL_GROUPS.length - props.collapsedCount;
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
                <BaseButton
                    v-for="tool in group.tools"
                    :key="tool.id"
                    variant="tool"
                    :class="{ 'is-active': activeTool === tool.id }"
                    :aria-pressed="activeTool === tool.id"
                    :aria-label="tool.label"
                    :title="tool.label"
                    :data-tool-id="tool.id"
                    :data-tool-group="group.id"
                    :disabled="!hasImage || busy"
                    @click="emit('select-tool', tool.id)"
                >
                    <CurvesIcon v-if="tool.id === 'curves'" />
                    <i v-else class="bi" :class="tool.icon" aria-hidden="true"></i>
                </BaseButton>
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
                            <BaseButton
                                v-for="tool in popupGroup.tools"
                                :key="tool.id"
                                variant="tool"
                                :class="{ 'is-active': activeTool === tool.id }"
                                :aria-pressed="activeTool === tool.id"
                                :aria-label="tool.label"
                                :title="tool.label"
                                :data-tool-id="tool.id"
                                :data-tool-group="popupGroup.id"
                                :disabled="!hasImage || busy"
                                @click="emit('select-tool', tool.id)"
                            >
                                <CurvesIcon v-if="tool.id === 'curves'" />
                                <i v-else class="bi" :class="tool.icon" aria-hidden="true"></i>
                            </BaseButton>
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

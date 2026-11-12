<script setup lang="ts">
    import CurvesIcon from '@/components/editor/icons/CurvesIcon.vue';
    import { BaseIconButton } from 'chrome-extension-component-library';
    import type { ToolDefinition, ToolGroupId, ToolId } from '@/types/editor';

    defineProps<{
        tool: ToolDefinition
        groupId: ToolGroupId
        active: boolean
        disabled: boolean
    }>();

    const emit = defineEmits<{
        select: [tool: ToolId]
    }>();
</script>

<template>
    <BaseIconButton
        variant="tool"
        :active="active"
        :label="tool.label"
        :title="tool.label"
        :data-tool-id="tool.id"
        :data-tool-group="groupId"
        :disabled="disabled"
        @click="emit('select', tool.id)"
    >
        <CurvesIcon v-if="tool.id === 'curves'" />
        <i v-else class="bi" :class="tool.icon" aria-hidden="true"></i>
    </BaseIconButton>
</template>

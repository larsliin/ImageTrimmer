<script setup lang="ts">
    import CurvesIcon from '@/components/editor/icons/CurvesIcon.vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
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
    <BaseButton
        variant="tool"
        :class="{ 'is-active': active }"
        :aria-pressed="active"
        :aria-label="tool.label"
        :title="tool.label"
        :data-tool-id="tool.id"
        :data-tool-group="groupId"
        :disabled="disabled"
        @click="emit('select', tool.id)"
    >
        <CurvesIcon v-if="tool.id === 'curves'" />
        <i v-else class="bi" :class="tool.icon" aria-hidden="true"></i>
    </BaseButton>
</template>

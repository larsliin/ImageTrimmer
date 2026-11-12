<script setup lang="ts">
    import { useAttrs, useTemplateRef } from 'vue';
    import { BaseNumberInput as LibraryNumberInput } from 'chrome-extension-component-library';

    defineProps<{ variant?: 'field' }>();

    const model = defineModel<number | string>();
    const attrs = useAttrs();
    const input = useTemplateRef<InstanceType<typeof LibraryNumberInput>>('input');

    defineExpose({ focus: () => input.value?.focus() });

    function updateValue(value: number | string | undefined) {
        // Native value/change callers own validation and commit timing.
        if (!('value' in attrs)) model.value = value;
    }
</script>

<template>
    <LibraryNumberInput ref="input" :model-value="model" :class="{ 'number-field': variant === 'field' }"
        @update:model-value="updateValue" />
</template>

<style scoped>
.number-input:not(.number-field) {
    min-height: 0;
    font: inherit;
}

.number-field {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 6px 10px;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
}

.number-field:focus-visible {
    outline: 1px solid var(--color-focus);
    outline-offset: 0;
}
</style>

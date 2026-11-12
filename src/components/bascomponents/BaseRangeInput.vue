<script setup lang="ts">
    import { useAttrs, useTemplateRef } from 'vue';
    import { BaseRangeInput as LibraryRangeInput } from 'chrome-extension-component-library';

    const model = defineModel<number>();
    const attrs = useAttrs();
    const input = useTemplateRef<InstanceType<typeof LibraryRangeInput>>('input');

    defineExpose({ focus: () => input.value?.focus() });

    function updateValue(value: number | undefined) {
        if (!('value' in attrs)) model.value = value;
    }
</script>

<template>
    <LibraryRangeInput ref="input" :model-value="model" @update:model-value="updateValue" />
</template>

<script setup lang="ts">
    import { normalizeClass, onBeforeUnmount, onMounted, onUpdated, patchProp, useAttrs, useTemplateRef } from 'vue';
    import { BaseCheckbox as LibraryCheckbox } from 'chrome-extension-component-library';

    defineOptions({ inheritAttrs: false });

    const props = defineProps<{ id?: string; disabled?: boolean }>();
    const model = defineModel<boolean>({ required: true });
    const attrs = useAttrs();
    const checkbox = useTemplateRef<InstanceType<typeof LibraryCheckbox>>('checkbox');
    let input: HTMLInputElement | null = null;
    let nativeClass = '';
    let previousAttrs: Record<string, unknown> = {};

    // The library owns the checkbox/model, but forwards attrs to its span.
    // Keep existing native names, labels, classes and listeners on the input.
    function forwardAttrs() {
        if (!input) return;
        const nextAttrs: Record<string, unknown> = { ...attrs, class: normalizeClass([nativeClass, attrs.class]) };
        for (const key of new Set([...Object.keys(previousAttrs), ...Object.keys(nextAttrs)])) {
            patchProp(input, key, previousAttrs[key], nextAttrs[key]);
        }
        previousAttrs = nextAttrs;
    }

    onMounted(() => {
        const root: HTMLElement | undefined = checkbox.value?.$el;
        input = root?.querySelector('input') ?? null;
        nativeClass = input?.className ?? '';
        forwardAttrs();
    });
    onUpdated(forwardAttrs);
    onBeforeUnmount(() => {
        if (input) {
            for (const key of Object.keys(previousAttrs)) patchProp(input, key, previousAttrs[key], null);
        }
        input = null;
    });

    defineExpose({ focus: () => input?.focus() });
</script>

<template>
    <LibraryCheckbox ref="checkbox" v-model="model" :id="props.id" :disabled="props.disabled" />
</template>

<style scoped>
:deep(.base-checkbox) {
    width: 13px;
    height: 13px;
}
</style>

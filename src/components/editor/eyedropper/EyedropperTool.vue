<script setup lang="ts">
    import { shallowRef } from 'vue';
    import type { EyedropperSelection } from '@/lib/eyedropper';
    import EyedropperControls from './EyedropperControls.vue';
    import EyedropperOverlay from './EyedropperOverlay.vue';

    defineProps<{
        canvas: HTMLCanvasElement | null
        disabled: boolean
    }>();

    const emit = defineEmits<{
        exit: []
        close: []
    }>();

    const selection = shallowRef<EyedropperSelection | null>(null);

    function selectColor(hex: string) {
        selection.value = { hex };
    }
</script>

<template>
    <EyedropperOverlay
        :canvas="canvas"
        :disabled="disabled"
        @sample="selectColor"
        @exit="emit('exit')"
    />
    <EyedropperControls
        :selection="selection"
        :disabled="disabled"
        @close="emit('close')"
    />
</template>

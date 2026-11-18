<script setup lang="ts">
    import { useToolDraft } from '@/composables/useToolDraft';
    import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
    import type { QuarterTurns } from '@/lib/rotate';
    import FloatingToolbar from '../chrome/FloatingToolbar.vue';
    import { BaseAlert, BaseIconButton } from 'chrome-extension-component-library';

    const props = defineProps<{
        disabled: boolean
        error: string | null
    }>();

    const emit = defineEmits<{
        preview: [turns: QuarterTurns, flipH: boolean, flipV: boolean]
        apply: [turns: QuarterTurns, flipH: boolean, flipV: boolean]
        dirty: [value: boolean]
        cancel: []
    }>();

    const turns = shallowRef<QuarterTurns>(0);
    const flipH = shallowRef(false);
    const flipV = shallowRef(false);
    useToolDraft(() => ({ tool: 'rotate', turns: turns.value, flipH: flipH.value, flipV: flipV.value }), value => emit('dirty', value));

    const clockwise = useTemplateRef<{ $el: HTMLButtonElement }>('clockwise');
    let previousFocus: HTMLElement | null = null;

    onMounted(() => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        clockwise.value?.$el.focus();
    });

    onBeforeUnmount(() => {
        void nextTick(() => {
            if (previousFocus?.isConnected) previousFocus.focus();
        });
    });

    function rotate(direction: 1 | -1) {
        if (props.disabled) return;
        const rotations: readonly QuarterTurns[] = [0, 1, 2, 3];
        turns.value = rotations[(turns.value + direction + 4) % 4]!;
        emit('preview', turns.value, flipH.value, flipV.value);
    }

    function toggleFlipH() {
        if (props.disabled) return;
        flipH.value = !flipH.value;
        emit('preview', turns.value, flipH.value, flipV.value);
    }

    function toggleFlipV() {
        if (props.disabled) return;
        flipV.value = !flipV.value;
        emit('preview', turns.value, flipH.value, flipV.value);
    }

    function apply() {
        if (!props.disabled && (turns.value !== 0 || flipH.value || flipV.value)) emit('apply', turns.value, flipH.value, flipV.value);
    }

    function cancel() {
        if (!props.disabled) emit('cancel');
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar label="Rotate toolbar" @keydown.esc.stop.prevent="cancel">
            <form class="rotate-form" aria-label="Rotate image" :aria-busy="disabled" @submit.prevent="apply">
                <fieldset class="rotate-controls" :disabled="disabled">
                    <BaseIconButton variant="secondary" ref="clockwise" class="icon-button" label="Rotate clockwise"
                        title="Rotate 90 degrees clockwise" @click="rotate(1)">
                        <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                    </BaseIconButton>
                    <BaseIconButton variant="secondary" class="icon-button" label="Rotate counterclockwise"
                        title="Rotate 90 degrees counterclockwise" @click="rotate(-1)">
                        <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                    </BaseIconButton>
                    <span class="rotate-divider" role="separator" aria-orientation="vertical"></span>
                    <BaseIconButton variant="secondary" class="icon-button" :active="flipH" label="Flip horizontally"
                        title="Flip image horizontally (mirror left-right)" @click="toggleFlipH">
                        <i class="bi bi-symmetry-horizontal" aria-hidden="true"></i>
                    </BaseIconButton>
                    <BaseIconButton variant="secondary" class="icon-button" :active="flipV" label="Flip vertically"
                        title="Flip image vertically (mirror top-bottom)" @click="toggleFlipV">
                        <i class="bi bi-symmetry-vertical" aria-hidden="true"></i>
                    </BaseIconButton>
                    <span class="rotate-divider" role="separator" aria-orientation="vertical"></span>
                    <BaseIconButton variant="primary" type="submit" class="icon-button" label="Apply rotation"
                        title="Apply rotation" :disabled="turns === 0 && !flipH && !flipV">
                        <i class="bi bi-check-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                    <BaseIconButton variant="secondary" class="icon-button" label="Cancel rotation" title="Cancel rotation" @click="cancel">
                        <i class="bi bi-x-lg" aria-hidden="true"></i>
                    </BaseIconButton>
                </fieldset>
                <BaseAlert v-if="error" class="rotate-error" :message="error" />
                <p v-if="disabled" class="rotate-status" role="status">Processing image...</p>
            </form>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.rotate-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.rotate-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
}

.rotate-divider {
    height: 24px;
    border-left: 1px solid var(--color-border);
}

.icon-button {
    width: 30px;
    height: 30px;
    padding: 0;
}

.icon-button.secondary-button.is-active:not(:disabled),
.icon-button.secondary-button.is-active:hover:not(:disabled) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #fff;
}

.icon-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}

.rotate-error {
    max-width: 400px;
    white-space: normal;
}

.rotate-status {
    color: var(--color-text-muted);
}
</style>

<script setup lang="ts">
    import { onBeforeUnmount, shallowRef, watch } from 'vue';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';
    import FloatingToolbar from '@/components/editor/chrome/FloatingToolbar.vue';
    import type { EyedropperSelection } from '@/lib/eyedropper';

    const props = defineProps<{
        selection: EyedropperSelection | null
        disabled: boolean
    }>();

    const emit = defineEmits<{
        close: []
    }>();

    const status = shallowRef('');
    const copyConfirmed = shallowRef(false);
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;

    onBeforeUnmount(() => {
        isMounted = false;
        clearTimeout(confirmationTimer);
    });

    watch(() => props.selection, (selection) => {
        clearTimeout(confirmationTimer);
        confirmationTimer = undefined;
        copyConfirmed.value = false;
        if (selection) status.value = `Sampled ${selection.hex}.`;
    }, { flush: 'sync' });

    function selectHex(event: Event) {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) return;
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(target);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function copySelection() {
        const selection = props.selection;
        if (!selection || props.disabled) return;
        clearTimeout(confirmationTimer);
        confirmationTimer = undefined;
        copyConfirmed.value = false;
        try {
            await navigator.clipboard.writeText(selection.hex);
            if (isMounted && props.selection === selection) {
                status.value = `Copied ${selection.hex}.`;
                clearTimeout(confirmationTimer);
                copyConfirmed.value = true;
                confirmationTimer = setTimeout(() => {
                    copyConfirmed.value = false;
                    confirmationTimer = undefined;
                }, 1500);
            }
        } catch {
            if (isMounted && props.selection === selection) status.value = 'Copy failed. Select the hex value and copy it manually.';
        }
    }
</script>

<template>
    <Teleport defer to="#editor-tool-controls">
        <FloatingToolbar label="Eyedropper toolbar">
            <div class="eyedropper-controls" :aria-busy="disabled">
                <div class="eyedropper-controls__sample">
                    <span
                        class="eyedropper-controls__swatch"
                        role="img"
                        :aria-label="selection ? `Sampled color ${selection.hex}` : 'No color sampled'"
                        :style="{ backgroundColor: selection?.hex ?? 'transparent' }"
                    ></span>
                </div>
                <div class="eyedropper-controls__hex">
                    <span
                        class="eyedropper-controls__hex-value"
                        :class="{ 'eyedropper-controls__hex-value--empty': !selection }"
                        role="textbox"
                        :aria-label="selection ? 'Sampled color hex' : 'No color sampled yet; move over the image to sample a color'"
                        aria-readonly="true"
                        :aria-disabled="disabled"
                        :tabindex="disabled ? -1 : 0"
                        @focus="selectHex"
                        @click="selectHex"
                    >{{ selection?.hex ?? '' }}</span>
                </div>
                <BaseButton
                    variant="secondary"
                    class="eyedropper-controls__button"
                    aria-label="Copy sampled color"
                    :disabled="!selection || disabled"
                    @click="copySelection"
                >
                    <i
                        :class="[
                            'eyedropper-controls__copy-icon',
                            copyConfirmed ? 'bi bi-check-lg eyedropper-controls__copy-icon--confirmed' : 'bi bi-copy',
                        ]"
                        aria-hidden="true"
                    ></i>
                    <span class="eyedropper-controls__tooltip" aria-hidden="true">Copy sampled color</span>
                </BaseButton>
                <BaseButton
                    variant="secondary"
                    class="eyedropper-controls__button"
                    aria-label="Close eyedropper"
                    :disabled="disabled"
                    @click="emit('close')"
                >
                    <i class="bi bi-x-lg" aria-hidden="true"></i>
                    <span class="eyedropper-controls__tooltip" aria-hidden="true">Close eyedropper</span>
                </BaseButton>
                <span class="eyedropper-controls__status" role="status" aria-live="polite" aria-atomic="true">
                    {{ status }}
                </span>
            </div>
        </FloatingToolbar>
    </Teleport>
</template>

<style scoped>
.eyedropper-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
    font-size: 12px;
}

.eyedropper-controls__sample,
.eyedropper-controls__hex {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
}

.eyedropper-controls__swatch {
    width: 24px;
    height: 24px;
    border: 1px solid var(--color-text-muted);
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px var(--color-panel);
}

.eyedropper-controls__hex-value {
    display: inline-flex;
    align-items: center;
    width: 70px;
    height: 30px;
    padding: 4px 6px;
    box-sizing: border-box;
    color: var(--color-text);
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font: inherit;
    font-family: 'Courier New', Courier, monospace;
    white-space: nowrap;
    user-select: text;
    cursor: text;
}

.eyedropper-controls__hex-value--empty {
    opacity: var(--opacity-button-secondary-disabled);
}

.eyedropper-controls__hex-value:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
}

.eyedropper-controls__button {
    position: relative;
    display: grid;
    flex: 0 0 30px;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
}

.eyedropper-controls__copy-icon--confirmed {
    font-size: 16px;
}

.eyedropper-controls__tooltip {
    position: absolute;
    z-index: 1;
    top: calc(100% + 6px);
    left: 50%;
    padding: 4px 7px;
    color: var(--color-text);
    background-color: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    box-shadow: var(--shadow-floating-panel);
    font-size: 12px;
    font-weight: normal;
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translateX(-50%);
}

.eyedropper-controls__button:hover .eyedropper-controls__tooltip,
.eyedropper-controls__button:focus-visible .eyedropper-controls__tooltip {
    opacity: 1;
    visibility: visible;
}

.eyedropper-controls__status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

</style>

<script setup lang="ts">
    import { computed, ref, nextTick, watch } from 'vue';
    import { clampZoom, formatZoom, type Size } from '@/lib/zoom';
    import BaseButton from '@/components/bascomponents/BaseButton.vue';

    const props = defineProps<{
        zoom: number
        displayZoom: number
        isFit: boolean
        imageSize: Size | null
        rulersEnabled?: boolean
        disabled?: boolean
    }>();

    const emit = defineEmits<{
        fit: []
        'actual-size': []
        'zoom-change': [zoom: number]
    }>();

    const label = computed(() => formatZoom(props.displayZoom));
    const isActualSize = computed(() => props.zoom === 1);
    const isEditing = ref(false);
    const inputValue = ref(label.value.replace('%', ''));
    const inputRef = ref<HTMLInputElement | null>(null);

    // Update input value when displayZoom changes (but not while editing)
    watch(() => props.displayZoom, (newZoom) => {
        if (!isEditing.value) {
            inputValue.value = formatZoom(newZoom).replace('%', '');
        }
    });

    async function handleClick() {
        if (!props.disabled && !isEditing.value) {
            isEditing.value = true;
            // Use the displayed label value directly (remove the % sign)
            inputValue.value = label.value.replace('%', '');
            await nextTick();
            inputRef.value?.focus();
            inputRef.value?.select();
        }
    }

    function finishEditing() {
        const percent = parseFloat(inputValue.value);
        if (!isNaN(percent) && percent > 0) {
            const newZoom = clampZoom(percent / 100);
            emit('zoom-change', newZoom);
        } else {
            // Reset to current display value by using the label
            inputValue.value = label.value.replace('%', '');
        }
        isEditing.value = false;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            finishEditing();
        } else if (event.key === 'Escape') {
            isEditing.value = false;
        }
    }

</script>

<template>
    <div class="zoom-controls" :class="{ 'zoom-controls--with-rulers': rulersEnabled }" role="group" aria-label="Zoom">
        <div class="zoom-input-wrapper">
            <i class="bi bi-search zoom-icon" aria-hidden="true"></i>
            <input
                ref="inputRef"
                type="text"
                class="zoom-input"
                :class="{ 'zoom-input--editing': isEditing }"
                :value="inputValue"
                :readonly="!isEditing"
                @click="handleClick"
                @input="inputValue = ($event.target as HTMLInputElement).value"
                @keydown="handleKeydown"
                @blur="finishEditing"
                aria-label="Zoom percentage"
            />
            <span class="zoom-input-suffix">%</span>
        </div>
        <BaseButton
            class="zoom-button"
            aria-label="Fit to window"
            title="Fit to window"
            :aria-pressed="isFit"
            :disabled="disabled || isFit"
            @click="emit('fit')"
        >
            <i class="bi bi-arrows-angle-contract" aria-hidden="true"></i>
        </BaseButton>
        <BaseButton
            class="zoom-button"
            aria-label="Actual size (100%)"
            title="Actual size (100%)"
            :aria-pressed="isActualSize"
            :disabled="disabled || isActualSize"
            @click="emit('actual-size')"
        >
            <span class="zoom-actual-size-icon" aria-hidden="true">1:1</span>
        </BaseButton>
        <output
            v-if="imageSize"
            class="image-dimensions"
            :aria-label="`Image dimensions: ${imageSize.width} pixels wide by ${imageSize.height} pixels high`"
            :title="`Image dimensions: ${imageSize.width} × ${imageSize.height} px`"
        >
            {{ imageSize.width }} × {{ imageSize.height }} px
        </output>
    </div>
</template>

<style scoped>
.zoom-controls {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    font-size: 12px;
    background-color: color-mix(in srgb, var(--color-panel) 85%, transparent);
    border: 1px solid var(--color-border);
    border-radius: 4px;
}

/* Clear the 20px vertical ruler while keeping the same 8px gap. */
.zoom-controls--with-rulers {
    left: 28px;
}

.zoom-input-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px 0 4px;
    height: 22px;
    border-right: 1px solid var(--color-border);
    margin-right: 2px;
}

.zoom-icon {
    flex-shrink: 0;
}

.zoom-input {
    padding: 3px 2px 2px 2px;
    font-size: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    text-align: right;
    cursor: pointer;
    width: auto;
    min-width: 20px;
    max-width: 60px;
    field-sizing: content;
    vertical-align: baseline;
}

.zoom-input:hover:not(.zoom-input--editing) {
    background-color: var(--color-hover);
}

.zoom-input:focus-visible {
    outline: none;
}

.zoom-input--editing {
    background: var(--color-panel-raised);
    border-color: var(--color-focus);
    cursor: text;
}

.zoom-input--editing:focus {
    outline: none;
}

.zoom-input-suffix {
    flex-shrink: 0;
    font-size: 11px;
    margin-left: -3px;
}

.image-dimensions {
    padding: 0 6px;
    border-left: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.zoom-button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 22px;
    padding: 0;
    font-size: 13px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
}

.zoom-button:hover:not(:disabled) {
    background-color: var(--color-hover);
}

.zoom-button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
}

.zoom-button:disabled {
    opacity: 0.4;
    cursor: default;
}

.zoom-actual-size-icon {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 1px solid currentColor;
    color: inherit;
    font-size: 7px;
    line-height: 1;
}
</style>

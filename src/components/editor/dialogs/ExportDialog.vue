<script setup lang="ts">
    import { computed, shallowRef } from 'vue';
    import { BaseSelect, type SelectOption } from 'chrome-extension-component-library';
    import { useExportPreview } from '@/composables/useExportPreview';
    import { EXPORT_QUALITY_PRESETS, exportFileName, type ExportMimeType, type PreparedExport } from '@/lib/imageIO';
    import type { ImageInfo } from '@/types/editor';
    import ToolModal from './ToolModal.vue';

    const props = defineProps<{
        bitmap: ImageBitmap
        image: ImageInfo
        originalSize: number
        busy: boolean
        error: string | null
    }>();
    const emit = defineEmits<{
        download: [prepared: PreparedExport]
        cancel: []
    }>();

    const loadedPreviewUrl = shallowRef<string | null>(null);
    const mimeType = shallowRef<ExportMimeType>(props.image.exportMimeType);
    const quality = shallowRef<number>(0.92);
    const formatOptions: SelectOption<ExportMimeType>[] = [
        { value: 'image/jpeg', label: 'JPEG' },
        { value: 'image/png', label: 'PNG (lossless)' },
        { value: 'image/webp', label: 'WebP' },
    ];
    const qualityOptions = computed(() => mimeType.value === 'image/png'
        ? [{ value: '', label: '' }]
        : EXPORT_QUALITY_PRESETS.map((preset) => ({ value: String(preset.value), label: preset.label })));
    const displayedQuality = computed({
        get: () => mimeType.value === 'image/png' ? '' : String(quality.value),
        set: (value: string) => {
            const preset = EXPORT_QUALITY_PRESETS.find((item) => String(item.value) === value);
            if (preset) quality.value = preset.value;
        },
    });
    const { result, previewUrl, calculating, error: previewError } = useExportPreview(() => props.bitmap, mimeType, quality);
    const fileName = computed(() => exportFileName(props.image.fileName, mimeType.value));
    const sizeChange = computed(() => {
        if (!result.value || props.originalSize <= 0) return null;
        const change = (result.value.blob.size / props.originalSize - 1) * 100;
        return `${Math.abs(change).toFixed(1)}% ${change <= 0 ? 'smaller' : 'larger'} than original`;
    });

    function formatSize(bytes: number): string {
        if (bytes < 1000) return `${bytes} bytes`;
        if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} KB`;
        return `${(bytes / 1000000).toFixed(2)} MB`;
    }

    function download() {
        if (result.value && !calculating.value && !props.busy) emit('download', result.value);
    }
</script>

<template>
    <ToolModal
        title="Export"
        apply-label="Export"
        compact
        focus-title
        :draggable="false"
        :can-apply="result !== null && !calculating"
        :busy="busy"
        :error="previewError ?? error"
        @apply="download"
        @cancel="emit('cancel')"
    >
        <div class="export-fields">
            <div class="export-options">
                <BaseSelect v-model="mimeType" :options="formatOptions" class="export-select" aria-label="Format" />
                <BaseSelect v-model="displayedQuality" :options="qualityOptions" class="export-select"
                    aria-label="Quality" :disabled="mimeType === 'image/png'" />
            </div>
            <div class="export-preview" :aria-busy="calculating || (previewUrl !== null && loadedPreviewUrl !== previewUrl)">
                <img v-if="previewUrl" class="export-preview__image" :src="previewUrl" alt="Encoded export preview"
                    @load="loadedPreviewUrl = previewUrl" />
                <span v-if="calculating || (previewUrl !== null && loadedPreviewUrl !== previewUrl)"
                    class="export-spinner" role="status" aria-label="Preparing export"></span>
            </div>
            <div class="export-summary" role="status" aria-live="polite">
                <p class="export-filename">{{ fileName }} <span class="export-dimensions">{{ bitmap.width }} &times; {{ bitmap.height }} px</span></p>
                <p>Original: {{ formatSize(originalSize) }}</p>
                <div class="export-output">
                    <template v-if="result">
                        <p>Output: <strong>{{ formatSize(result.blob.size) }}</strong> ({{ result.blob.size.toLocaleString() }} bytes)</p>
                        <p v-if="sizeChange">{{ sizeChange }}</p>
                    </template>
                </div>
            </div>
        </div>
    </ToolModal>
</template>

<style scoped>
.export-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.export-options {
    display: flex;
    gap: 12px;
    padding-block: 6px;
}

.export-options > :deep(.select-wrapper) {
    flex: 1;
    min-width: 0;
}

.export-options :deep(.export-select) {
    padding: 6px 30px 6px 8px;
    font: inherit;
    color: var(--color-text);
    background: var(--color-panel-raised);
    border: 1px solid var(--color-border);
    border-radius: 4px;
}

.export-options :deep(.export-select:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

.export-options :deep(.export-select:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
}

.export-preview {
    position: relative;
    display: grid;
    place-items: center;
    height: clamp(80px, 24dvh, 160px);
    overflow: hidden;
    /* Checkerboard makes transparent areas visible. */
    background-color: #fff;
    background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
}

.export-preview__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
}

.export-summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}

.export-filename {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-weight: 600;
}

.export-dimensions {
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 400;
}

.export-output {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: calc(2lh + 6px);
}

@media (max-height: 500px) {
    .export-fields {
        gap: 12px;
    }

    .export-summary {
        gap: 6px;
    }
}

.export-spinner {
    z-index: 1;
    width: 24px;
    height: 24px;
    border: 3px solid rgb(0 0 0 / 20%);
    border-top-color: #333;
    border-radius: 50%;
    animation: export-spin 0.8s linear infinite;
}

@keyframes export-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .export-spinner {
        animation: none;
    }
}
</style>

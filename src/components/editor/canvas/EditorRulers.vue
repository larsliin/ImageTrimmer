<script setup lang="ts">
    import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
    import type { Size } from '@/lib/zoom';
    import { rulerTicks, RULER_THICKNESS as thickness } from '@/lib/rulers';

    const props = defineProps<{
        viewport: HTMLDivElement | null
        surface: HTMLDivElement | null
        image: Size
        zoom: number
    }>();

    const geometry = shallowRef({ x: 0, y: 0, width: 0, height: 0, imageWidth: 0, imageHeight: 0 });

    function measure() {
        if (!props.viewport || !props.surface) return;
        const viewport = props.viewport.getBoundingClientRect();
        const surface = props.surface.getBoundingClientRect();
        geometry.value = {
            x: surface.left - viewport.left - thickness,
            y: surface.top - viewport.top - thickness,
            width: Math.max(0, props.viewport.clientWidth - thickness),
            height: Math.max(0, props.viewport.clientHeight - thickness),
            imageWidth: surface.width,
            imageHeight: surface.height,
        };
    }

    const horizontalTicks = computed(() => geometry.value.imageWidth > 0
        ? rulerTicks(props.image.width, geometry.value.imageWidth, geometry.value.x, geometry.value.width) : []);
    const verticalTicks = computed(() => geometry.value.imageHeight > 0
        ? rulerTicks(props.image.height, geometry.value.imageHeight, geometry.value.y, geometry.value.height) : []);

    let observer: ResizeObserver | null = null;
    watch([() => props.zoom, () => props.image], measure, { flush: 'post' });
    watch([() => props.viewport, () => props.surface], ([viewport, surface], _previous, onCleanup) => {
        observer = new ResizeObserver(measure);
        if (viewport) observer.observe(viewport);
        if (surface) observer.observe(surface);
        viewport?.addEventListener('scroll', measure, { passive: true });
        measure();
        onCleanup(() => {
            observer?.disconnect();
            viewport?.removeEventListener('scroll', measure);
        });
    }, { immediate: true, flush: 'post' });
    onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
    <div class="rulers" aria-hidden="true">
        <svg class="ruler ruler--horizontal">
            <g v-for="tick in horizontalTicks" :key="tick.value" :transform="`translate(${tick.position}, 0)`">
                <line x1="0" :y1="tick.major ? 12 : 16" x2="0" y2="20" />
                <text v-if="tick.major" x="3" y="10">{{ Math.abs(tick.value) }}</text>
            </g>
        </svg>
        <svg class="ruler ruler--vertical">
            <g v-for="tick in verticalTicks" :key="tick.value" :transform="`translate(0, ${tick.position})`">
                <line :x1="tick.major ? 12 : 16" y1="0" x2="20" y2="0" />
                <text v-if="tick.major" transform="translate(4, 3) rotate(90)">{{ Math.abs(tick.value) }}</text>
            </g>
        </svg>
        <span class="rulers__unit">px</span>
    </div>
</template>

<style scoped>
.rulers {
    --ruler-thickness: v-bind('`${thickness}px`');

    position: absolute;
    inset: 0;
    pointer-events: none;
}

.ruler {
    position: absolute;
    overflow: hidden;
    color: var(--color-text-muted);
    background-color: var(--color-panel);
    fill: currentColor;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
}

.ruler line {
    stroke: currentColor;
    stroke-width: 1;
}

.ruler--horizontal {
    top: 0;
    left: var(--ruler-thickness);
    width: calc(100% - var(--ruler-thickness));
    height: var(--ruler-thickness);
    border-bottom: 1px solid var(--color-border);
}

.ruler--vertical {
    top: var(--ruler-thickness);
    left: 0;
    width: var(--ruler-thickness);
    height: calc(100% - var(--ruler-thickness));
    border-right: 1px solid var(--color-border);
}

.rulers__unit {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: var(--ruler-thickness);
    height: var(--ruler-thickness);
    color: var(--color-text-muted);
    background-color: var(--color-panel);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    font-size: 9px;
}
</style>

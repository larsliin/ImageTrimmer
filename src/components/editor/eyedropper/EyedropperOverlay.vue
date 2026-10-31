<script setup lang="ts">
    import { computed, shallowRef, useTemplateRef, watch } from 'vue';
    import { formatRgbaHex, imagePixelFromClient, type ImagePixel } from '@/lib/eyedropper';

    const props = defineProps<{
        canvas: HTMLCanvasElement | null
        disabled: boolean
    }>();

    const emit = defineEmits<{
        sample: [hex: string]
        exit: []
    }>();

    interface CursorPosition {
        pixel: ImagePixel
        clientX: number
        clientY: number
    }

    const MAGNIFIER_SIZE = 128;
    const MAGNIFIER_RADIUS = MAGNIFIER_SIZE / 2;
    const MAGNIFIED_PIXELS = 15;
    const lens = useTemplateRef<HTMLCanvasElement>('lens');
    const surface = useTemplateRef<HTMLDivElement>('surface');
    const keyboardPixel = shallowRef<ImagePixel | null>(null);
    const cursor = shallowRef<CursorPosition | null>(null);

    const magnifierStyle = computed(() => {
        if (!cursor.value) return undefined;
        const x = Math.max(MAGNIFIER_RADIUS, Math.min(window.innerWidth - MAGNIFIER_RADIUS, cursor.value.clientX));
        const y = Math.max(MAGNIFIER_RADIUS, Math.min(window.innerHeight - MAGNIFIER_RADIUS, cursor.value.clientY));
        return { left: `${x}px`, top: `${y}px` };
    });

    function setCursor(pixel: ImagePixel, clientX: number, clientY: number) {
        cursor.value = { pixel, clientX, clientY };
    }

    function cursorFromPixel(pixel: ImagePixel): CursorPosition | null {
        const canvas = props.canvas;
        const bounds = canvas?.getBoundingClientRect();
        if (!canvas || canvas.width <= 0 || canvas.height <= 0 || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;
        return {
            pixel,
            clientX: bounds.left + (pixel.x + 0.5) * bounds.width / canvas.width,
            clientY: bounds.top + (pixel.y + 0.5) * bounds.height / canvas.height,
        };
    }

    function mapPointer(clientX: number, clientY: number): ImagePixel | null {
        const canvas = props.canvas;
        const bounds = canvas?.getBoundingClientRect();
        if (!canvas || !bounds) return null;
        return imagePixelFromClient(clientX, clientY, bounds, canvas.width, canvas.height);
    }

    function onPointerMove(event: PointerEvent) {
        const pixel = mapPointer(event.clientX, event.clientY);
        if (!pixel) {
            cursor.value = null;
            return;
        }
        setCursor(pixel, event.clientX, event.clientY);
    }

    function onPointerLeave() {
        cursor.value = null;
    }

    function onPointerDown() {
        surface.value?.focus({ preventScroll: true });
    }

    function sample(pixel: ImagePixel | null) {
        const canvas = props.canvas;
        const context = canvas?.getContext('2d');
        if (!pixel || !canvas || !context || props.disabled) return;
        const { data } = context.getImageData(pixel.x, pixel.y, 1, 1);
        const [red, green, blue, alpha] = data;
        if (red === undefined || green === undefined || blue === undefined || alpha === undefined) return;
        emit('sample', formatRgbaHex({ red, green, blue, alpha }));
    }

    function sampleAtPointer(event: MouseEvent) {
        if (!cursor.value) {
            const pixel = mapPointer(event.clientX, event.clientY);
            if (pixel) setCursor(pixel, event.clientX, event.clientY);
        }
        sample(cursor.value?.pixel ?? null);
    }

    function onKeydown(event: KeyboardEvent) {
        if (props.disabled) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            emit('exit');
            return;
        }
        const moves: Record<string, ImagePixel> = {
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
        };
        const move = moves[event.key];
        if (move) {
            event.preventDefault();
            const canvas = props.canvas;
            if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;
            const current = keyboardPixel.value ?? {
                x: Math.floor(canvas.width / 2),
                y: Math.floor(canvas.height / 2),
            };
            const step = event.shiftKey ? 10 : 1;
            const pixel = {
                x: Math.max(0, Math.min(canvas.width - 1, current.x + move.x * step)),
                y: Math.max(0, Math.min(canvas.height - 1, current.y + move.y * step)),
            };
            const position = cursorFromPixel(pixel);
            if (!position) return;
            keyboardPixel.value = pixel;
            cursor.value = position;
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            sample(cursor.value?.pixel ?? keyboardPixel.value);
        }
    }

    function drawMagnifier() {
        const source = props.canvas;
        const target = lens.value;
        const position = cursor.value;
        const context = target?.getContext('2d');
        if (!source || !target || !position || !context) return;

        context.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
        context.imageSmoothingEnabled = false;
        const sourceLeft = position.pixel.x - Math.floor(MAGNIFIED_PIXELS / 2);
        const sourceTop = position.pixel.y - Math.floor(MAGNIFIED_PIXELS / 2);
        const sourceX = Math.max(0, sourceLeft);
        const sourceY = Math.max(0, sourceTop);
        const sourceWidth = Math.min(MAGNIFIED_PIXELS, source.width - sourceX);
        const sourceHeight = Math.min(MAGNIFIED_PIXELS, source.height - sourceY);
        const scale = MAGNIFIER_SIZE / MAGNIFIED_PIXELS;
        context.drawImage(
            source,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            (sourceX - sourceLeft) * scale,
            (sourceY - sourceTop) * scale,
            sourceWidth * scale,
            sourceHeight * scale,
        );
    }

    watch(cursor, drawMagnifier, { flush: 'post' });

</script>

<template>
    <div
        ref="surface"
        class="eyedropper-surface"
        :inert="disabled"
        :tabindex="disabled ? -1 : 0"
        role="group"
        aria-label="Eyedropper sampling surface"
        aria-describedby="eyedropper-instructions"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @click="sampleAtPointer"
        @keydown="onKeydown"
    >
        <span id="eyedropper-instructions" class="eyedropper-surface__instructions">
            Move the pointer over the image or use arrow keys to position the sampling point. Click to sample.
            Use Shift plus an arrow to move ten image pixels. Enter or Space samples the positioned pixel;
            Escape closes the eyedropper.
        </span>
    </div>
    <Teleport defer to="body">
        <div
            v-if="cursor"
            class="eyedropper-magnifier"
            :style="magnifierStyle"
            aria-hidden="true"
        >
            <canvas ref="lens" width="128" height="128"></canvas>
        </div>
    </Teleport>
</template>

<style scoped>
.eyedropper-surface {
    position: absolute;
    z-index: 2;
    inset: 0;
    cursor: crosshair;
    touch-action: manipulation;
}

.eyedropper-surface:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
}

.eyedropper-surface__instructions {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.eyedropper-magnifier {
    position: fixed;
    z-index: 40;
    width: 128px;
    height: 128px;
    box-sizing: border-box;
    overflow: hidden;
    background-color: var(--color-panel);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px #111, var(--shadow-floating-panel);
    pointer-events: none;
    transform: translate(-50%, -50%);
}

.eyedropper-magnifier canvas {
    display: block;
    width: 100%;
    height: 100%;
}

</style>

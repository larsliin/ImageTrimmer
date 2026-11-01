<script setup lang="ts">
    import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
    import EditorTopBar from './components/editor/chrome/EditorTopBar.vue';
    import EditorToolRail from './components/editor/chrome/EditorToolRail.vue';
    import EditorCanvas from './components/editor/canvas/EditorCanvas.vue';
    import ZoomControls from './components/editor/controls/ZoomControls.vue';
    import ResizeControls from './components/editor/controls/ResizeControls.vue';
    import RotateControls from './components/editor/controls/RotateControls.vue';
    import { rotatedSize, type QuarterTurns } from './lib/rotate';
    import { useImageDocument } from './composables/useImageDocument';
    import { useAnimatedZoom } from './composables/useAnimatedZoom';
    import type { Size } from './lib/zoom';
    import type { ToolId } from './types/editor';
    import type { CropRect } from './lib/crop';
    import LevelsControls from './components/editor/controls/LevelsControls.vue';
    import type { LevelsParams } from './lib/levels';
    import CurvesControls from './components/editor/controls/CurvesControls.vue';
    import type { CurvesParams } from './lib/curves';
    import ColorModeControls from './components/editor/controls/ColorModeControls.vue';
    import BrightnessContrastControls from './components/editor/controls/BrightnessContrastControls.vue';
    import BrushControls from './components/editor/controls/BrushControls.vue';
    import BrushOverlay from './components/editor/canvas/BrushOverlay.vue';
    import type { BrightnessContrastParams } from './lib/brightnessContrast';
    import ExportDialog from './components/editor/dialogs/ExportDialog.vue';
    import type { PreparedExport } from './lib/imageIO';
    import type { ColorMode } from './lib/colorMode';
    import { useBrushTools } from './composables/useBrushTools';
    import DiscardChangesDialog from './components/editor/dialogs/DiscardChangesDialog.vue';
    import { useToolCloseGuard } from './composables/useToolCloseGuard';
    import { isFloatingTool } from './lib/toolDraft';
    import { hasShortcutModifier } from './lib/shortcuts';
    import { isThemeMode, type ThemeMode } from './lib/theme';

    const {
        bitmap, info, documentId, status, error, isBusy, importImage, exportImage, cropImage, rotateImage,
        resizeImage, levelsImage, curvesImage, colorModeImage, brightnessContrastImage, brushImage,
        renameImage, dismissError, closeImage,
        canUndo, canRedo, undo, redo, originalFileSize,
    } = useImageDocument();

    const viewportSize = ref<Size>({ width: 0, height: 0 });
    const rotationPreview = ref<QuarterTurns>(0);
    const flipHPreview = ref(false);
    const flipVPreview = ref(false);
    const imageSize = computed<Size | null>(() =>
        bitmap.value ? rotatedSize(bitmap.value, rotationPreview.value) : null,
    );
    const navigationAnimationStorageKey = 'image-editor-navigation-animation';
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersReducedMotion = shallowRef(reducedMotionQuery.matches);
    const navigationAnimationsPreference = shallowRef(true);
    try {
        const savedPreference = localStorage.getItem(navigationAnimationStorageKey);
        if (savedPreference === 'true' || savedPreference === 'false') {
            navigationAnimationsPreference.value = savedPreference === 'true';
        } else if (savedPreference !== null) {
            console.warn('Ignoring an invalid saved navigation animation preference:', savedPreference);
        }
    } catch (error) {
        console.warn('Unable to restore the saved navigation animation preference:', error);
    }
    const navigationAnimationsEnabled = computed(
        () => navigationAnimationsPreference.value && !prefersReducedMotion.value,
    );
    const { zoom, targetZoom, isFit, canZoomIn, canZoomOut, zoomIn, zoomOut, fitToView, actualSize, setZoom } = useAnimatedZoom(
        imageSize,
        viewportSize,
        documentId,
        { animationsEnabled: navigationAnimationsEnabled },
    );

    const activeTool = ref<ToolId | null>(null);
    const eyedropperClosedFromToolbar = shallowRef(false);
    const exportOpen = ref(false);
    const brush = useBrushTools({ activeTool, bitmap, isBusy, brushImage });
    const { settings: brushSettings, strokes: brushStrokes, hasPending: hasPendingBrush, drawing: brushDrawing } = brush;
    const guard = useToolCloseGuard({ activeTool, busy: isBusy, brushDirty: brush.dirty });
    const { pendingIntent, blocked: toolBlocked, toolName } = guard;
    const requestClose = () => guard.request({ kind: 'close' });
    function closeEyedropperFromToolbar() {
        eyedropperClosedFromToolbar.value = true;
        requestClose();
    }
    function afterFloatingToolClose(action: () => void) {
        if (isFloatingTool(activeTool.value)) guard.request({ kind: 'close' }, action);
        else action();
    }
    function requestImport(file?: File) {
        afterFloatingToolClose(() => { void importImage(file); });
    }
    function requestImageClose() { afterFloatingToolClose(closeImage); }
    const popupOpen = computed(() => exportOpen.value
        || activeTool.value === 'levels'
        || activeTool.value === 'curves'
        || activeTool.value === 'color-mode'
        || activeTool.value === 'brightness-contrast');
    const rulersEnabled = shallowRef(true);
    const rulersStorageKey = 'image-editor-rulers';

    try {
        const savedRulers = localStorage.getItem(rulersStorageKey);
        if (savedRulers === 'true' || savedRulers === 'false') {
            rulersEnabled.value = savedRulers === 'true';
        } else if (savedRulers !== null) {
            console.warn('Ignoring an invalid saved rulers preference:', savedRulers);
        }
    } catch (error) {
        console.warn('Unable to restore the saved rulers preference:', error);
    }

    function toggleRulers() {
        rulersEnabled.value = !rulersEnabled.value;
        try {
            localStorage.setItem(rulersStorageKey, String(rulersEnabled.value));
        } catch (error) {
            console.warn('Unable to save the rulers preference:', error);
        }
    }

    function toggleNavigationAnimations() {
        if (prefersReducedMotion.value) return;
        navigationAnimationsPreference.value = !navigationAnimationsPreference.value;
        try {
            localStorage.setItem(navigationAnimationStorageKey, String(navigationAnimationsPreference.value));
        } catch (error) {
            console.warn('Unable to save the navigation animation preference:', error);
        }
    }

    function openExport() {
        if (!bitmap.value || isBusy.value) return;
        guard.request({ kind: 'close' }, () => {
            dismissError();
            exportOpen.value = true;
        });
    }

    // Pending brush strokes are undone one at a time before document history.
    const canUndoEdit = computed(() => hasPendingBrush.value || canUndo.value);
    const canRedoEdit = computed(() => !hasPendingBrush.value && canRedo.value);

    function undoEdit() {
        if (hasPendingBrush.value) brush.undoStroke();
        else afterFloatingToolClose(undo);
    }

    function redoEdit() {
        if (canRedoEdit.value) afterFloatingToolClose(redo);
    }

    async function downloadExport(prepared: PreparedExport) {
        if (await exportImage(prepared)) exportOpen.value = false;
    }
    const themeMode = shallowRef<ThemeMode>('light');
    const themeStorageKey = 'image-editor-theme';
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemPrefersDark = shallowRef(systemThemeQuery.matches);

    try {
        const savedTheme = localStorage.getItem(themeStorageKey);
        if (isThemeMode(savedTheme)) {
            themeMode.value = savedTheme;
        } else if (savedTheme !== null) {
            console.warn('Ignoring an invalid saved theme preference:', savedTheme);
        }
    } catch (error) {
        console.warn('Unable to restore the saved theme preference:', error);
    }

    const isDarkMode = computed(() => themeMode.value === 'auto'
        ? systemPrefersDark.value
        : themeMode.value === 'dark');

    watch(isDarkMode, (isDark) => {
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    }, { immediate: true });

    function selectTheme(mode: ThemeMode) {
        themeMode.value = mode;
        try {
            localStorage.setItem(themeStorageKey, mode);
        } catch (error) {
            console.warn('Unable to save the theme preference:', error);
        }
    }

    function onSystemThemeChange(event: MediaQueryListEvent) {
        systemPrefersDark.value = event.matches;
    }

    function selectTool(tool: ToolId) {
        guard.request(activeTool.value === tool ? { kind: 'close' } : { kind: 'switch', tool });
    }

    const applyCrop = (crop: CropRect, angle: number) => guard.apply(() => cropImage(crop, angle));
    const applyResize = (size: Size) => guard.apply(() => resizeImage(size));
    const applyRotationWithFlips = (turns: QuarterTurns, flipH: boolean, flipV: boolean) =>
        guard.apply(() => rotateImage(turns, flipH, flipV));
    async function applyLevels(levels: LevelsParams) {
        if (await levelsImage(levels)) activeTool.value = null;
    }
    async function applyCurves(curves: CurvesParams) {
        if (await curvesImage(curves)) activeTool.value = null;
    }
    async function applyColorMode(mode: ColorMode) {
        if (await colorModeImage(mode)) activeTool.value = null;
    }
    async function applyBrightnessContrast(params: BrightnessContrastParams) {
        if (await brightnessContrastImage(params)) activeTool.value = null;
    }

    const levelsPreview = ref<LevelsParams | null>(null);
    const curvesPreview = ref<CurvesParams | null>(null);
    const colorModePreview = ref<ColorMode | null>(null);
    const brightnessContrastPreview = ref<BrightnessContrastParams | null>(null);

    watch(activeTool, (tool) => {
        if (tool === 'eyedropper') eyedropperClosedFromToolbar.value = false;
        rotationPreview.value = 0;
        flipHPreview.value = false;
        flipVPreview.value = false;
        levelsPreview.value = null;
        curvesPreview.value = null;
        colorModePreview.value = null;
        brightnessContrastPreview.value = null;
    });

    watch(bitmap, () => {
        if (!guard.applying.value) activeTool.value = null;
        exportOpen.value = false;
    }, { flush: 'sync' });

    function handleEditorShortcut(event: KeyboardEvent) {
        if (pendingIntent.value || event.defaultPrevented || event.isComposing) return;
        if (event.key === 'Escape' && isFloatingTool(activeTool.value)) {
            if (toolBlocked.value) return;
            event.preventDefault();
            requestClose();
            return;
        }
        if (!hasShortcutModifier(event) || event.altKey) return;
        const target = event.target;
        if (
            target instanceof HTMLElement
            && (target.isContentEditable
                || target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || target instanceof HTMLSelectElement)
        ) return;

        const key = event.key.toLowerCase();
        if (key === '+' || key === '=') {
            event.preventDefault();
            if (canZoomIn.value) zoomIn();
        } else if (key === '-') {
            event.preventDefault();
            if (canZoomOut.value) zoomOut();
        } else if (key === 'z' && !event.shiftKey) {
            event.preventDefault();
            if (!popupOpen.value && canUndoEdit.value) undoEdit();
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
            event.preventDefault();
            if (!popupOpen.value) redoEdit();
        }
    }

    function warnBeforeUnloadWithBrushStrokes(event: BeforeUnloadEvent) {
        if (!hasPendingBrush.value) return;
        event.preventDefault();
        event.returnValue = '';
    }

    onMounted(() => {
        document.addEventListener('keydown', handleEditorShortcut);
        window.addEventListener('beforeunload', warnBeforeUnloadWithBrushStrokes);
        reducedMotionQuery.addEventListener('change', onReducedMotionChange);
        systemThemeQuery.addEventListener('change', onSystemThemeChange);
    });
    onBeforeUnmount(() => {
        document.removeEventListener('keydown', handleEditorShortcut);
        window.removeEventListener('beforeunload', warnBeforeUnloadWithBrushStrokes);
        reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
        systemThemeQuery.removeEventListener('change', onSystemThemeChange);
    });

    function onReducedMotionChange(event: MediaQueryListEvent) {
        prefersReducedMotion.value = event.matches;
    }
</script>

<template>
    <div class="editor" :inert="pendingIntent !== null">
        <EditorTopBar
            :key="documentId"
            class="editor__top-bar"
            :image="info"
            :busy="toolBlocked"
            :is-dark-mode="isDarkMode"
            :theme-mode="themeMode"
            :rulers-enabled="rulersEnabled"
            :navigation-animations-enabled="navigationAnimationsEnabled"
            :prefers-reduced-motion="prefersReducedMotion"
            @rename="renameImage"
            @select-theme="selectTheme"
            @toggle-rulers="toggleRulers"
            @toggle-navigation-animations="toggleNavigationAnimations"
            @close="requestImageClose"
        />
        <EditorToolRail
            class="editor__tool-rail"
            :active-tool="activeTool"
            :eyedropper-closed-from-toolbar="eyedropperClosedFromToolbar"
            :has-image="bitmap !== null"
            :busy="toolBlocked"
            :popup-open="popupOpen"
            :can-zoom-in="canZoomIn"
            :can-zoom-out="canZoomOut"
            :can-undo="canUndoEdit"
            :can-redo="canRedoEdit"
            @select-tool="selectTool"
            @import="requestImport"
            @export="openExport"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @undo="undoEdit"
            @redo="redoEdit"
        />
        <EditorCanvas
            :key="documentId"
            class="editor__canvas"
            :inert="popupOpen"
            :bitmap="bitmap"
            :zoom="zoom"
            :rulers-enabled="rulersEnabled"
            :pan-enabled="activeTool === 'pan'"
            :navigation-animations-enabled="navigationAnimationsEnabled"
            :crop-enabled="activeTool === 'crop'"
            :eyedropper-enabled="activeTool === 'eyedropper'"
            :busy="toolBlocked"
            :loading="status === 'loading'"
            :error="error"
            :levels-preview="levelsPreview"
            :curves-preview="curvesPreview"
            :color-mode-preview="colorModePreview"
            :brightness-contrast-preview="brightnessContrastPreview"
            :rotation-preview="rotationPreview"
            :flip-h-preview="flipHPreview"
            :flip-v-preview="flipVPreview"
            @import="requestImport"
            @dismiss-error="dismissError"
            @viewport-resize="viewportSize = $event"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @crop="(crop, angle) => applyCrop(crop, angle)"
            @cancel-crop="requestClose"
            @crop-dirty="guard.reportDirty"
            @exit-eyedropper="requestClose"
            @close-eyedropper="closeEyedropperFromToolbar"
        >
            <template #overlay>
                <ZoomControls
                    :disabled="popupOpen"
                    :zoom="zoom"
                    :display-zoom="targetZoom"
                    :is-fit="isFit"
                    :image-size="imageSize"
                    :rulers-enabled="rulersEnabled"
                    @fit="fitToView"
                    @actual-size="actualSize"
                    @zoom-change="setZoom"
                />
            </template>
        </EditorCanvas>
        <BrushOverlay
            v-if="activeTool === 'brush' && bitmap"
            :image="bitmap"
            :settings="brushSettings"
            :disabled="toolBlocked || pendingIntent !== null"
            :strokes="brushStrokes"
            @drawing="brush.setDrawing"
            @stroke="brush.addStroke"
        />
        <div
            id="editor-tool-controls"
            class="floating-tool-controls"
            :class="{ 'floating-tool-controls--with-rulers': rulersEnabled && bitmap && status !== 'loading' }"
        ></div>
        <ExportDialog
            v-if="exportOpen && bitmap && info"
            :bitmap="bitmap"
            :image="info"
            :original-size="originalFileSize"
            :busy="toolBlocked"
            :error="error"
            @download="downloadExport"
            @cancel="exportOpen = false"
        />
        <RotateControls
            @dirty="guard.reportDirty"
            v-if="activeTool === 'rotate' && bitmap"
            :disabled="toolBlocked"
            :error="error"
            @preview="(turns, flipH, flipV) => {
                rotationPreview = turns;
                flipHPreview = flipH;
                flipVPreview = flipV;
            }"
            @apply="applyRotationWithFlips"
            @cancel="requestClose"
        />
        <ResizeControls
            @dirty="guard.reportDirty"
            v-if="activeTool === 'resize' && imageSize"
            :image="imageSize"
            :disabled="toolBlocked"
            :error="error"
            @apply="applyResize"
            @cancel="requestClose"
        />
        <LevelsControls
            v-if="activeTool === 'levels' && bitmap"
            :image="bitmap"
            :disabled="isBusy"
            :error="error"
            @preview="levelsPreview = $event"
            @apply="applyLevels"
            @cancel="activeTool = null"
        />
        <CurvesControls
            v-if="activeTool === 'curves' && bitmap"
            :image="bitmap"
            :disabled="isBusy"
            :error="error"
            @preview="curvesPreview = $event"
            @apply="applyCurves"
            @cancel="activeTool = null"
        />
        <ColorModeControls
            v-if="activeTool === 'color-mode' && bitmap"
            :disabled="isBusy"
            :error="error"
            @preview="colorModePreview = $event"
            @apply="applyColorMode"
            @cancel="activeTool = null"
        />
        <BrightnessContrastControls
            v-if="activeTool === 'brightness-contrast' && bitmap"
            :image="bitmap"
            :disabled="isBusy"
            :error="error"
            @preview="brightnessContrastPreview = $event"
            @apply="applyBrightnessContrast"
            @cancel="activeTool = null"
        />
        <DiscardChangesDialog
            v-if="pendingIntent"
            :tool-name="toolName"
            @keep="guard.keepEditing"
            @discard="guard.discardChanges"
        />
        <BrushControls
            v-if="activeTool === 'brush' && bitmap"
            :settings="brushSettings"
            :disabled="toolBlocked"
            :can-apply="hasPendingBrush && !brushDrawing"
            :error="error"
            @update:settings="brush.updateSettings"
            @apply="guard.apply(brush.apply)"
            @cancel="requestClose"
        />
    </div>
</template>

<style scoped>
.editor {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
        'top-bar top-bar'
        'tool-rail canvas';
    height: 100%;
}

.editor__top-bar {
    grid-area: top-bar;
}

.editor__tool-rail {
    grid-area: tool-rail;
}

.editor__canvas {
    grid-area: canvas;
}

.floating-tool-controls {
    position: fixed;
    top: 60px;
    right: 12px;
    left: 61px;
    z-index: 20;
    display: flex;
    justify-content: center;
    pointer-events: none;
}

.floating-tool-controls:empty {
    display: none;
}

.floating-tool-controls--with-rulers {
    top: 80px;
}

</style>

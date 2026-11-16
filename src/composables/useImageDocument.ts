import { computed, onScopeDispose, readonly, ref, shallowRef } from 'vue';
import type { ImageInfo } from '@/types/editor';
import { isCropInsideRotatedImage, isValidAngle, isValidCrop, type CropRect } from '@/lib/crop';
import { MAX_RESIZE_DIMENSION, isValidResize } from '@/lib/resize';
import { isIdentityLevels, isValidLevels, type LevelsParams } from '@/lib/levels';
import { isIdentityCurves, isValidCurves, type CurvesParams } from '@/lib/curves';
import { isIdentityBrightnessContrast, isValidBrightnessContrast, type BrightnessContrastParams } from '@/lib/brightnessContrast';
import type { ColorMode } from '@/lib/colorMode';
import { isValidBrushStrokes, type BrushStroke } from '@/lib/brush';
import type { Size } from '@/lib/zoom';
import type { QuarterTurns } from '@/lib/rotate';
import { isValidLevelAngle, MAX_LEVEL_ANGLE } from '@/lib/straighten';
import {
    canvasToBlob,
    cropImageBitmap,
    decodeImageFile,
    downloadBlob,
    exportFileName,
    exportFileNameFromBase,
    pickImageFile,
    renderToCanvas,
    resizeImageBitmap,
    levelsImageBitmap,
    curvesImageBitmap,
    colorModeImageBitmap,
    brightnessContrastImageBitmap,
    brushImageBitmap,
    flipImageBitmap,
    resolveExportMimeType,
    rotateImageBitmap,
    rotateCropImageBitmap,
    type ExportMimeType,
    type PreparedExport,
} from '@/lib/imageIO';

export type DocumentStatus = 'idle' | 'loading' | 'processing' | 'exporting';

interface LoadedDocument {
    original: ImageBitmap
    bitmap: ImageBitmap
    fileName: string
    exportMimeType: ExportMimeType
    sourceByteSize: number
}

interface HistoryEntry {
    document: LoadedDocument
    revision: number
}

const HISTORY_LIMIT = 3;

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export function useImageDocument() {
    const current = shallowRef<LoadedDocument | null>(null);
    const status = ref<DocumentStatus>('idle');
    const error = ref<string | null>(null);
    const documentId = ref(0);
    const revision = shallowRef(0);
    const savedRevision = shallowRef(0);
    const savedFileName = shallowRef('');
    const savedExportMimeType = shallowRef<ExportMimeType>('image/png');
    const undoHistory = shallowRef<HistoryEntry[]>([]);
    const redoHistory = shallowRef<HistoryEntry[]>([]);
    let nextRevision = 0;
    let disposed = false;

    const bitmap = computed(() => current.value?.bitmap ?? null);
    const originalFileSize = computed(() => current.value?.sourceByteSize ?? 0);
    const info = computed<ImageInfo | null>(() =>
        current.value
            ? {
                fileName: current.value.fileName,
                width: current.value.bitmap.width,
                height: current.value.bitmap.height,
                exportMimeType: current.value.exportMimeType,
            }
            : null,
    );
    const isBusy = computed(() => status.value !== 'idle');
    const isDirty = computed(() =>
        revision.value !== savedRevision.value
        || (current.value !== null
            && (current.value.fileName !== savedFileName.value
                || current.value.exportMimeType !== savedExportMimeType.value)),
    );
    const canReset = computed(() => current.value !== null && current.value.bitmap !== current.value.original);
    const canUndo = computed(() => current.value !== null && !isBusy.value && undoHistory.value.length > 0);
    const canRedo = computed(() => current.value !== null && !isBusy.value && redoHistory.value.length > 0);

    function retainedBitmaps(): Set<ImageBitmap> {
        const bitmaps = new Set<ImageBitmap>();
        if (current.value) {
            bitmaps.add(current.value.original);
            bitmaps.add(current.value.bitmap);
        }
        for (const entry of [...undoHistory.value, ...redoHistory.value]) {
            bitmaps.add(entry.document.bitmap);
        }
        return bitmaps;
    }

    function commitEdit(next: LoadedDocument, nextStateRevision = ++nextRevision) {
        const doc = current.value;
        if (!doc) return;
        const previousBitmaps = retainedBitmaps();
        undoHistory.value = [...undoHistory.value, { document: doc, revision: revision.value }].slice(-HISTORY_LIMIT);
        redoHistory.value = [];
        current.value = next;
        revision.value = nextStateRevision;
        const retained = retainedBitmaps();
        for (const previous of previousBitmaps) {
            if (!retained.has(previous)) previous.close();
        }
        error.value = null;
    }

    async function applyBitmapEdit(doc: LoadedDocument, edited: Promise<ImageBitmap>, fallback: string): Promise<boolean> {
        status.value = 'processing';
        error.value = null;
        try {
            const bitmap = await edited;
            if (disposed) {
                bitmap.close();
                return false;
            }
            commitEdit({ ...doc, bitmap });
            return true;
        } catch (e) {
            error.value = errorMessage(e, fallback);
            return false;
        } finally {
            status.value = 'idle';
        }
    }

    function undo() {
        if (!canUndo.value) return;
        const doc = current.value;
        const entry = undoHistory.value.at(-1);
        if (!doc || !entry) return;
        redoHistory.value = [...redoHistory.value, { document: doc, revision: revision.value }];
        undoHistory.value = undoHistory.value.slice(0, -1);
        current.value = entry.document;
        revision.value = entry.revision;
        error.value = null;
    }

    function redo() {
        if (!canRedo.value) return;
        const doc = current.value;
        const entry = redoHistory.value.at(-1);
        if (!doc || !entry) return;
        undoHistory.value = [...undoHistory.value, { document: doc, revision: revision.value }];
        redoHistory.value = redoHistory.value.slice(0, -1);
        current.value = entry.document;
        revision.value = entry.revision;
        error.value = null;
    }

    function replaceDocument(next: LoadedDocument | null) {
        for (const previous of retainedBitmaps()) previous.close();
        undoHistory.value = [];
        redoHistory.value = [];
        current.value = next;
    }

    async function importImage(file?: File) {
        if (isBusy.value) return;
        const selectedFile = file ?? await pickImageFile();
        if (!selectedFile || isBusy.value || disposed) return;
        if (isDirty.value && !window.confirm('Discard unsaved changes and open another image?')) return;

        status.value = 'loading';
        error.value = null;
        try {
            const decoded = await decodeImageFile(selectedFile);
            if (disposed) {
                decoded.close();
                return;
            }
            const exportMimeType = resolveExportMimeType(selectedFile.type);
            const fileName = exportFileName(selectedFile.name, exportMimeType);
            replaceDocument({ original: decoded, bitmap: decoded, fileName, exportMimeType, sourceByteSize: selectedFile.size });
            documentId.value += 1;
            revision.value = 0;
            savedRevision.value = 0;
            savedFileName.value = fileName;
            savedExportMimeType.value = exportMimeType;
            nextRevision = 0;
        } catch (e) {
            error.value = errorMessage(e, 'The image could not be opened.');
        } finally {
            status.value = 'idle';
        }
    }

    async function cropImage(crop: CropRect, angle = 0): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidCrop(crop, doc.bitmap)) {
            error.value = 'Select a non-empty crop inside the image bounds.';
            return false;
        }
        if (!isValidAngle(angle) || !isCropInsideRotatedImage(crop, doc.bitmap, angle)) {
            error.value = 'The crop must stay inside the rotated image so no empty space is left.';
            return false;
        }
        if (angle === 0 && crop.x === 0 && crop.y === 0 && crop.width === doc.bitmap.width && crop.height === doc.bitmap.height) {
            return true;
        }
        status.value = 'processing';
        error.value = null;
        try {
            const cropped = angle === 0
                ? await cropImageBitmap(doc.bitmap, crop)
                : await rotateCropImageBitmap(doc.bitmap, angle, crop);
            if (disposed) {
                cropped.close();
                return false;
            }
            commitEdit({ ...doc, bitmap: cropped });
            return true;
        } catch (e) {
            error.value = errorMessage(e, 'The image could not be cropped.');
            return false;
        } finally {
            status.value = 'idle';
        }
    }

    async function straightenImage(crop: CropRect, angle: number): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidLevelAngle(angle)) {
            error.value = `Enter a straighten angle between -${MAX_LEVEL_ANGLE}° and ${MAX_LEVEL_ANGLE}°.`;
            return false;
        }
        if (!isValidCrop(crop, doc.bitmap) || !isCropInsideRotatedImage(crop, doc.bitmap, angle)) {
            error.value = 'Keep the crop inside the rotated image. Resize or move it.';
            return false;
        }
        if (angle === 0 && crop.x === 0 && crop.y === 0
            && crop.width === doc.bitmap.width && crop.height === doc.bitmap.height) return true;
        return applyBitmapEdit(
            doc,
            rotateCropImageBitmap(doc.bitmap, angle, crop),
            'The image could not be straightened.',
        );
    }

    async function rotateImage(turns: QuarterTurns = 1, flipH = false, flipV = false): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (turns === 0 && !flipH && !flipV) return true;
        return applyBitmapEdit(doc, rotateImageBitmap(doc.bitmap, turns, flipH, flipV), 'The image could not be rotated.');
    }

    async function resizeImage(size: Size): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidResize(size)) {
            error.value = `Enter a width and height between 1 and ${MAX_RESIZE_DIMENSION} px.`;
            return false;
        }
        if (size.width === doc.bitmap.width && size.height === doc.bitmap.height) return true;
        status.value = 'processing';
        error.value = null;
        try {
            const resized = await resizeImageBitmap(doc.bitmap, size.width, size.height);
            if (disposed) {
                resized.close();
                return false;
            }
            commitEdit({ ...doc, bitmap: resized });
            return true;
        } catch (e) {
            error.value = errorMessage(e, 'The image could not be resized. It may be too large for this browser.');
            return false;
        } finally {
            status.value = 'idle';
        }
    }

    async function levelsImage(levels: LevelsParams): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidLevels(levels)) {
            error.value = 'The black point must be below the white point, and gamma between 0.10 and 9.99.';
            return false;
        }
        if (isIdentityLevels(levels)) return true;
        return applyBitmapEdit(doc, levelsImageBitmap(doc.bitmap, levels), 'The levels could not be applied.');
    }

    async function curvesImage(curves: CurvesParams): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidCurves(curves)) {
            error.value = 'The curve points are invalid.';
            return false;
        }
        if (isIdentityCurves(curves)) return true;
        return applyBitmapEdit(doc, curvesImageBitmap(doc.bitmap, curves), 'The curves could not be applied.');
    }

    async function colorModeImage(mode: ColorMode): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        return applyBitmapEdit(doc, colorModeImageBitmap(doc.bitmap, mode), 'The color mode could not be changed.');
    }

    async function flipImage(horizontal: boolean): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        return applyBitmapEdit(doc, flipImageBitmap(doc.bitmap, horizontal), 'The image could not be flipped.');
    }

    async function brightnessContrastImage(params: BrightnessContrastParams): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidBrightnessContrast(params)) {
            error.value = 'Brightness and contrast must be between -100 and 100.';
            return false;
        }
        if (isIdentityBrightnessContrast(params)) return true;
        return applyBitmapEdit(
            doc,
            brightnessContrastImageBitmap(doc.bitmap, params),
            'The brightness/contrast could not be applied.',
        );
    }

    async function brushImage(strokes: readonly BrushStroke[]): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (!isValidBrushStrokes(strokes, doc.bitmap.width, doc.bitmap.height)) {
            error.value = 'The brush strokes are invalid or outside the image bounds.';
            return false;
        }
        return applyBitmapEdit(
            doc,
            brushImageBitmap(doc.bitmap, strokes),
            'The brush strokes could not be applied.',
        );
    }

    function resetImage() {
        const doc = current.value;
        if (!doc || !canReset.value || isBusy.value) return;
        if (!window.confirm('Reset all edits to the original image?')) return;
        commitEdit({ ...doc, bitmap: doc.original }, 0);
    }

    function renameImage(fileName: string) {
        const doc = current.value;
        if (!doc || isBusy.value) return;
        const name = fileName.trim();
        if (!name) {
            error.value = 'Enter a filename.';
            return;
        }
        const nextFileName = exportFileNameFromBase(name, doc.exportMimeType);
        if (nextFileName === doc.fileName) return;
        commitEdit({ ...doc, fileName: nextFileName }, revision.value);
    }

    function setExportMimeType(mimeType: ExportMimeType) {
        const doc = current.value;
        if (!doc || isBusy.value || doc.exportMimeType === mimeType) return;
        commitEdit({
            ...doc,
            fileName: exportFileName(doc.fileName, mimeType),
            exportMimeType: mimeType,
        }, revision.value);
    }

    async function exportImage(prepared?: PreparedExport): Promise<boolean> {
        const doc = current.value;
        if (!doc || isBusy.value) return false;
        if (prepared && (prepared.bitmap !== doc.bitmap || prepared.blob.type !== prepared.mimeType)) {
            error.value = 'The image has changed. Reopen Export to prepare a new export.';
            return false;
        }

        status.value = 'exporting';
        error.value = null;
        try {
            const mimeType = prepared?.mimeType ?? doc.exportMimeType;
            const blob = prepared?.blob ?? await canvasToBlob(
                renderToCanvas(doc.bitmap, mimeType === 'image/jpeg' ? '#fff' : undefined), mimeType,
            );
            if (disposed) return false;
            const fileName = exportFileName(doc.fileName, mimeType);
            downloadBlob(blob, fileName);
            current.value = { ...doc, fileName, exportMimeType: mimeType };
            savedRevision.value = revision.value;
            savedFileName.value = fileName;
            savedExportMimeType.value = mimeType;
            return true;
        } catch (e) {
            error.value = errorMessage(e, 'The image could not be saved.');
            return false;
        } finally {
            status.value = 'idle';
        }
    }

    function dismissError() {
        error.value = null;
    }

    function closeImage() {
        if (!current.value) return;
        if (isDirty.value && !window.confirm('Discard unsaved changes and close the image?')) return;
        replaceDocument(null);
        documentId.value += 1;
        revision.value = 0;
        savedRevision.value = 0;
        savedFileName.value = '';
        savedExportMimeType.value = 'image/png';
        nextRevision = 0;
        error.value = null;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
        if (!isDirty.value) return;
        event.preventDefault();
        event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    onScopeDispose(() => {
        disposed = true;
        window.removeEventListener('beforeunload', warnBeforeUnload);
        replaceDocument(null);
    });

    return {
        bitmap,
        originalFileSize,
        info,
        documentId: readonly(documentId),
        status: readonly(status),
        error: readonly(error),
        isBusy,
        isDirty,
        canReset,
        canUndo,
        canRedo,
        undo,
        redo,
        importImage,
        cropImage,
        straightenImage,
        rotateImage,
        resizeImage,
        levelsImage,
        curvesImage,
        colorModeImage,
        flipImage,
        brightnessContrastImage,
        brushImage,
        resetImage,
        renameImage,
        setExportMimeType,
        exportImage,
        dismissError,
        closeImage,
    };
}

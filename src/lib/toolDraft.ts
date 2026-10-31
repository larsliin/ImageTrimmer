import type { ToolId } from '../types/editor';
import type { CropRect } from './crop';
import type { QuarterTurns } from './rotate';
import type { BrushStroke } from './brush';

export type ToolDraft
    = { tool: 'crop', rect: CropRect, angle: number }
    | { tool: 'resize', width: number | string, height: number | string }
    | { tool: 'rotate', turns: QuarterTurns, flipH: boolean, flipV: boolean }
    | { tool: 'brush', strokes: readonly BrushStroke[] };

// Project editable values only, never display state or persisted preferences.
export function toolDraftKey(draft: ToolDraft): string {
    let values: unknown;
    switch (draft.tool) {
        case 'crop': values = [draft.rect.x, draft.rect.y, draft.rect.width, draft.rect.height, draft.angle]; break;
        case 'resize': values = [draft.width, draft.height]; break;
        case 'rotate': values = [draft.turns, draft.flipH, draft.flipV]; break;
        case 'brush': values = draft.strokes.map(stroke =>
            [stroke.thickness, stroke.color, stroke.points.map(point => [point.x, point.y])]); break;
    }
    return JSON.stringify([draft.tool, values], (_key, value: unknown) =>
        typeof value === 'number' && !Number.isFinite(value) ? { invalidNumber: String(value) } : value);
}

export function isFloatingTool(tool: ToolId | null): boolean {
    return tool === 'crop' || tool === 'resize' || tool === 'rotate' || tool === 'brush' || tool === 'eyedropper';
}

export type ToolCloseIntent = { kind: 'close' } | { kind: 'switch', tool: ToolId };

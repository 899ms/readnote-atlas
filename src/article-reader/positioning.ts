export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SizeLike = {
  width: number;
  height: number;
};

export type ToolbarPositionInput = {
  selectionEndRect: RectLike;
  toolbarSize: SizeLike;
  viewportSize: SizeLike;
  gap?: number;
};

export type ToolbarPosition = {
  left: number;
  top: number;
};

export function computeToolbarPosition(input: ToolbarPositionInput): ToolbarPosition {
  const gap = input.gap ?? 8;
  const margin = 8;
  let left = input.selectionEndRect.right + gap;
  let top = input.selectionEndRect.bottom + gap;

  if (left + input.toolbarSize.width > input.viewportSize.width - margin) {
    left = input.selectionEndRect.left - input.toolbarSize.width - gap;
  }

  if (top + input.toolbarSize.height > input.viewportSize.height - margin) {
    top = input.selectionEndRect.top - input.toolbarSize.height - gap;
  }

  return {
    left: Math.max(margin, Math.round(left)),
    top: Math.max(margin, Math.round(top))
  };
}

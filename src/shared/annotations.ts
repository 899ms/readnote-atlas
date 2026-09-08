import { stableHash } from "./ids";
import type { AnnotationRecord, AnnotationStyle, ExcerptRecord } from "./types";

export type CreateAnnotationInput = {
  sourceId: string;
  text: string;
  prefix: string;
  suffix: string;
  styles?: AnnotationStyle[];
  style?: AnnotationStyle;
  note?: string;
  translation?: string;
  savedAsExcerpt?: boolean;
  createdAt: string;
};

const STYLE_ORDER: AnnotationStyle[] = ["yellow", "blue", "pink", "green", "underline", "wavy"];

function uniqueStyles(styles: AnnotationStyle[]): AnnotationStyle[] {
  return STYLE_ORDER.filter((style) => styles.includes(style));
}

export function annotationIdFromLocation(input: Pick<CreateAnnotationInput, "sourceId" | "text" | "prefix" | "suffix">): string {
  return `ann_${stableHash([input.sourceId, input.text, input.prefix, input.suffix].join("\n"))}`;
}

export function createAnnotationRecord(input: CreateAnnotationInput): AnnotationRecord {
  const styles = uniqueStyles(input.styles ?? (input.style ? [input.style] : []));

  return {
    id: annotationIdFromLocation(input),
    sourceId: input.sourceId,
    text: input.text,
    prefix: input.prefix,
    suffix: input.suffix,
    styles,
    note: input.note ?? "",
    translation: input.translation ?? "",
    savedAsExcerpt: input.savedAsExcerpt ?? false,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export function normalizeAnnotationRecord(annotation: AnnotationRecord | (Omit<AnnotationRecord, "styles"> & { styles?: AnnotationStyle[] })): AnnotationRecord {
  const styles = uniqueStyles(annotation.styles ?? (annotation.style ? [annotation.style] : []));
  return {
    ...annotation,
    id: annotationIdFromLocation(annotation),
    styles,
    note: annotation.note ?? "",
    translation: annotation.translation ?? "",
    savedAsExcerpt: annotation.savedAsExcerpt ?? false
  };
}

export function toggleAnnotationStyle(
  annotation: AnnotationRecord,
  style: AnnotationStyle,
  updatedAt = new Date().toISOString()
): AnnotationRecord {
  const normalized = normalizeAnnotationRecord(annotation);
  const styles = normalized.styles.includes(style)
    ? normalized.styles.filter((item) => item !== style)
    : uniqueStyles([...normalized.styles, style]);

  return {
    ...normalized,
    styles,
    updatedAt
  };
}

export function clearAnnotationMarkup(annotation: AnnotationRecord, updatedAt = new Date().toISOString()): AnnotationRecord {
  const normalized = normalizeAnnotationRecord(annotation);
  return {
    ...normalized,
    styles: [],
    note: "",
    translation: "",
    updatedAt
  };
}

export function createExcerptFromAnnotation(
  annotation: AnnotationRecord,
  source: { title: string; url: string }
): ExcerptRecord {
  return {
    id: `ex_${stableHash([annotation.id, annotation.updatedAt].join("\n"))}`,
    sourceId: annotation.sourceId,
    sourceTitle: source.title,
    sourceUrl: source.url,
    text: annotation.text,
    note: annotation.note,
    translation: annotation.translation,
    createdAt: new Date().toISOString()
  };
}

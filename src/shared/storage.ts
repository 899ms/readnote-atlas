import { normalizeAnnotationRecord } from "./annotations";
import type {
  AnnotationRecord,
  AnnotationStyle,
  ExcerptRecord,
  HighlightRecord,
  SourceRecord,
  TranslationRecord,
  VocabularyEntry
} from "./types";

const SOURCE_PREFIX = "source:";
const HIGHLIGHTS_PREFIX = "highlights:";
const ANNOTATIONS_PREFIX = "annotations:";
const TRANSLATIONS_PREFIX = "translations:";
const EXCERPTS_KEY = "excerpts";

type HighlightPatch = Partial<Pick<HighlightRecord, "note" | "translation" | "vocabulary">>;
type AnnotationPatch = Partial<Pick<AnnotationRecord, "styles" | "style" | "note" | "translation" | "savedAsExcerpt">>;

function sourceKey(sourceId: string): string {
  return `${SOURCE_PREFIX}${sourceId}`;
}

function highlightsKey(sourceId: string): string {
  return `${HIGHLIGHTS_PREFIX}${sourceId}`;
}

function annotationsKey(sourceId: string): string {
  return `${ANNOTATIONS_PREFIX}${sourceId}`;
}

function translationsKey(sourceId: string): string {
  return `${TRANSLATIONS_PREFIX}${sourceId}`;
}

async function getValue<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function setValue<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function saveSource(source: SourceRecord): Promise<SourceRecord> {
  const key = sourceKey(source.id);
  const existing = await getValue<SourceRecord>(key);
  const next: SourceRecord = {
    ...source,
    firstReadAt: existing?.firstReadAt ?? source.firstReadAt
  };

  await setValue(key, next);
  return next;
}

export async function getSource(sourceId: string): Promise<SourceRecord | null> {
  return (await getValue<SourceRecord>(sourceKey(sourceId))) ?? null;
}

export async function getAllSources(): Promise<SourceRecord[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(SOURCE_PREFIX))
    .map(([, value]) => value as SourceRecord)
    .sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt));
}

export async function saveHighlight(highlight: HighlightRecord): Promise<HighlightRecord> {
  const key = highlightsKey(highlight.sourceId);
  const existing = (await getValue<HighlightRecord[]>(key)) ?? [];
  const next = [...existing.filter((item) => item.id !== highlight.id), highlight].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  await setValue(key, next);
  return highlight;
}

export async function listHighlights(sourceId: string): Promise<HighlightRecord[]> {
  return (await getValue<HighlightRecord[]>(highlightsKey(sourceId))) ?? [];
}

export async function updateHighlight(
  sourceId: string,
  highlightId: string,
  patch: HighlightPatch
): Promise<HighlightRecord | null> {
  const key = highlightsKey(sourceId);
  const existing = (await getValue<HighlightRecord[]>(key)) ?? [];
  const index = existing.findIndex((highlight) => highlight.id === highlightId);

  if (index === -1) {
    return null;
  }

  const nextVocabulary: VocabularyEntry[] | undefined = patch.vocabulary;
  const updated: HighlightRecord = {
    ...existing[index],
    ...patch,
    vocabulary: nextVocabulary ?? existing[index].vocabulary,
    updatedAt: new Date().toISOString()
  };
  const next = [...existing];
  next[index] = updated;

  await setValue(key, next);
  return updated;
}

export async function saveAnnotation(annotation: AnnotationRecord): Promise<AnnotationRecord> {
  const key = annotationsKey(annotation.sourceId);
  const existing = (await getValue<AnnotationRecord[]>(key)) ?? [];
  const normalized = normalizeAnnotationRecord(annotation);
  const next = [...existing.map(normalizeAnnotationRecord).filter((item) => item.id !== normalized.id), normalized].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  await setValue(key, next);
  return normalized;
}

function mergeAnnotations(annotations: AnnotationRecord[]): AnnotationRecord[] {
  return annotations
    .map(normalizeAnnotationRecord)
    .reduce<AnnotationRecord[]>((merged, annotation) => {
      const index = merged.findIndex((item) => item.id === annotation.id);
      if (index === -1) {
        merged.push(annotation);
        return merged;
      }

      const current = merged[index];
      merged[index] = normalizeAnnotationRecord({
        ...current,
        styles: Array.from(new Set([...current.styles, ...annotation.styles])) as AnnotationStyle[],
        note: annotation.note || current.note,
        translation: annotation.translation || current.translation,
        savedAsExcerpt: current.savedAsExcerpt || annotation.savedAsExcerpt,
        createdAt: current.createdAt < annotation.createdAt ? current.createdAt : annotation.createdAt,
        updatedAt: current.updatedAt > annotation.updatedAt ? current.updatedAt : annotation.updatedAt
      });
      return merged;
    }, [])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAnnotations(sourceId: string): Promise<AnnotationRecord[]> {
  return mergeAnnotations((await getValue<AnnotationRecord[]>(annotationsKey(sourceId))) ?? []);
}

export async function updateAnnotation(
  sourceId: string,
  annotationId: string,
  patch: AnnotationPatch
): Promise<AnnotationRecord | null> {
  const key = annotationsKey(sourceId);
  const existing = mergeAnnotations((await getValue<AnnotationRecord[]>(key)) ?? []);
  const index = existing.findIndex((annotation) => annotation.id === annotationId);

  if (index === -1) {
    return null;
  }

  const updated: AnnotationRecord = {
    ...existing[index],
    ...patch,
    styles: patch.styles ?? (patch.style ? [patch.style] : existing[index].styles),
    updatedAt: new Date().toISOString()
  };
  const normalizedUpdated = normalizeAnnotationRecord(updated);
  const next = [...existing.filter((annotation) => annotation.id !== annotationId), normalizedUpdated].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  await setValue(key, next);
  return normalizedUpdated;
}

export async function deleteAnnotation(sourceId: string, annotationId: string): Promise<void> {
  const key = annotationsKey(sourceId);
  const existing = ((await getValue<AnnotationRecord[]>(key)) ?? []).map(normalizeAnnotationRecord);
  await setValue(
    key,
    existing.filter((annotation) => annotation.id !== annotationId)
  );
}

export async function deleteAnnotations(sourceId: string): Promise<void> {
  await setValue(annotationsKey(sourceId), []);
}

export async function saveExcerpt(excerpt: ExcerptRecord): Promise<ExcerptRecord> {
  const existing = (await getValue<ExcerptRecord[]>(EXCERPTS_KEY)) ?? [];
  const next = [...existing.filter((item) => item.id !== excerpt.id), excerpt].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  await setValue(EXCERPTS_KEY, next);
  return excerpt;
}

export async function listExcerpts(): Promise<ExcerptRecord[]> {
  return (await getValue<ExcerptRecord[]>(EXCERPTS_KEY)) ?? [];
}

export async function saveTranslations(sourceId: string, translations: TranslationRecord[]): Promise<TranslationRecord[]> {
  const key = translationsKey(sourceId);
  const existing = (await getValue<TranslationRecord[]>(key)) ?? [];
  const byHash = new Map<string, TranslationRecord>();

  for (const translation of existing) {
    byHash.set(translation.textHash, translation);
  }

  for (const translation of translations) {
    byHash.set(translation.textHash, translation);
  }

  const next = Array.from(byHash.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await setValue(key, next);
  return next;
}

export async function listTranslations(sourceId: string): Promise<TranslationRecord[]> {
  return (await getValue<TranslationRecord[]>(translationsKey(sourceId))) ?? [];
}

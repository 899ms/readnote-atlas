const LIFECYCLE_ERROR_PATTERNS = [
  "Extension context invalidated",
  "Could not establish connection. Receiving end does not exist"
];

export function isExtensionLifecycleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return LIFECYCLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function settleExtensionTask(
  task: () => Promise<unknown>,
  reportError: (error: unknown) => void = console.error
): Promise<void> {
  try {
    await task();
  } catch (error) {
    if (!isExtensionLifecycleError(error)) {
      reportError(error);
    }
  }
}

export function runExtensionTask(
  task: () => Promise<unknown>,
  reportError: (error: unknown) => void = console.error
): void {
  void settleExtensionTask(task, reportError);
}

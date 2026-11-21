/** Shared "Loading..." and error displays for popup sections. */

export function Loading() {
  return (
    <div
      role="status"
      style={{ fontSize: 'var(--sl-fs-small)', color: 'var(--sl-muted)', marginTop: 12 }}
    >
      Loading...
    </div>
  );
}

export function LoadError({
  what,
  message,
  onRetry,
}: {
  what: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 12,
        padding: 8,
        fontSize: 'var(--sl-fs-small)',
        color: 'var(--sl-distraction)',
        border: '1px solid var(--sl-distraction)',
        borderRadius: 6,
        overflowWrap: 'anywhere',
      }}
    >
      <strong>{what} could not load.</strong>
      <div style={{ margin: '4px 0' }}>{message}</div>
      <button type="button" style={{ fontSize: 'var(--sl-fs-small)' }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

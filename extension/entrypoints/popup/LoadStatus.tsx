/** Shared "Loading..." and error displays for popup sections. */

export function Loading() {
  return (
    <div role="status" style={{ fontSize: 12, color: '#57606a', marginTop: 12 }}>
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
        fontSize: 12,
        color: '#cf222e',
        border: '1px solid #cf222e',
        borderRadius: 6,
        overflowWrap: 'anywhere',
      }}
    >
      <strong>{what} could not load.</strong>
      <div style={{ margin: '4px 0' }}>{message}</div>
      <button type="button" style={{ fontSize: 12 }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

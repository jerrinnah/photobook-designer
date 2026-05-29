import { Component } from 'react';

// App-wide error boundary. A render exception used to blank the entire
// screen (white screen of death). Now it shows the actual error +
// stack so issues are diagnosable, with a one-click reload. The error
// is also logged to the console for support to read.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[AutoBook] render crash:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { error, info } = this.state;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0d0d0d', color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 640, width: '100%',
          background: '#141414', border: '1px solid #2a2a2a',
          borderRadius: 10, padding: '24px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Something broke</div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
            Your work is autosaved. Reload to recover. If this keeps happening,
            copy the error below and send it to support.
          </div>
          <div style={{
            background: '#1a0808', border: '1px solid #5a1a1a', borderRadius: 6,
            padding: '10px 12px', marginBottom: 14,
            fontSize: 11, color: '#e89a9a', fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto',
          }}>
            {String(error?.message || error)}
            {info?.componentStack ? `\n\nComponent stack:${info.componentStack.split('\n').slice(0, 6).join('\n')}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => this.setState({ error: null, info: null })}
              style={{
                padding: '8px 14px', fontSize: 12,
                background: 'transparent', color: '#aaa', border: '1px solid #2a2a2a',
                borderRadius: 5, cursor: 'pointer',
              }}
            >Try to continue</button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 600,
                background: '#1a3580', color: '#fff', border: 'none',
                borderRadius: 5, cursor: 'pointer',
              }}
            >Reload</button>
          </div>
        </div>
      </div>
    );
  }
}

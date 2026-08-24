import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fee', color: '#900', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Algo deu errado.</h1>
          <p style={{ marginTop: '10px' }}>Ocorreu um erro no aplicativo. Atualize a página ou verifique o console para mais detalhes.</p>
          <pre style={{ marginTop: '20px', padding: '10px', background: '#fdd', borderRadius: '5px', overflowX: 'auto', maxWidth: '80%' }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}

import { Component, ErrorInfo, ReactNode } from "react";

// Red de seguridad: si algún componente falla al renderizar, en lugar de dejar la pantalla
// en blanco se muestra un mensaje con la opción de volver a cargar la aplicación.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de interfaz:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="login-form" role="alert" style={{ minHeight: "100vh" }}>
        <div className="login-box">
          <p className="eyebrow">ALGO SALIÓ MAL</p>
          <h2>Ocurrió un error inesperado</h2>
          <p className="muted">
            La pantalla no pudo mostrarse correctamente. Tus datos están a salvo: vuelve a cargar la
            aplicación para continuar.
          </p>
          <button className="primary wide" onClick={() => window.location.reload()}>
            Volver a cargar
          </button>
        </div>
      </main>
    );
  }
}

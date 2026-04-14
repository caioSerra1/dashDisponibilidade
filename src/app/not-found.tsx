import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <p
            style={{
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#64748b",
              margin: 0,
            }}
          >
            Erro 404
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0.5rem 0" }}>
            Página não encontrada
          </h1>
          <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
            A página que você tentou acessar não existe ou foi movida.
          </p>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "0.625rem 1.25rem",
              borderRadius: 8,
              background: "#0f172a",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Voltar ao painel
          </Link>
        </div>
      </body>
    </html>
  );
}

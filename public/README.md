# Assets públicos

## Logo

Substitua `logo.svg` pelo arquivo oficial da empresa:

- **Recomendado**: PNG com fundo transparente, 512×512px.
- Nome: `logo.png` **ou** `logo.svg`.
- O componente `<Brand />` em `src/components/layout/brand.tsx` tenta carregar `/logo.png` primeiro; se não existir, usa `/logo.svg`; se nenhum existir, mostra um fallback com o texto da marca.

Para trocar o logo:

1. Copie seu arquivo para `public/logo.png`.
2. Dê um refresh no navegador — o Next.js serve estáticos de `public/` na raiz (`/logo.png`).

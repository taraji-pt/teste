# Bibliotheca — Biblioteca Teológica Pessoal

Primeira versão funcional de uma biblioteca cristã pessoal para Mac, iPhone e iPad. É uma aplicação web responsiva, instalável como PWA quando publicada por HTTPS.

## Funcionalidades implementadas

- Catálogo visual/lista com capas e cartões de livros.
- Pesquisa por título, autor, ISBN, editora, categoria, etiquetas e localização.
- Categorias teológicas personalizadas.
- Índice de autores.
- Estados de leitura, avaliação, notas pessoais e etiquetas.
- Localização física por estante/prateleira.
- Registo de empréstimos, datas previstas e devoluções.
- Consulta de metadados Open Library por ISBN.
- Leitura de código de barras ISBN pela câmara (necessita HTTPS ou localhost e permissão de câmara).
- Importação/exportação integral de cópia JSON.
- Persistência local no navegador.
- Integração inicial Supabase: autenticação por email/palavra-passe, enviar catálogo para nuvem e carregar catálogo da nuvem, com políticas RLS por utilizador.

## Requisitos

Node.js 20+ recomendado.

## Executar localmente

```bash
npm install
npm run dev
```

Abre o endereço local indicado pelo Vite.

## Criar build

```bash
npm run build
npm run preview
```

## Sincronização privada com Supabase

1. Cria um projeto em https://supabase.com/.
2. No painel do Supabase, executa `supabase/schema.sql` no SQL Editor.
3. Em Authentication, ativa Email/Password e cria o teu utilizador. Para uma biblioteca pessoal, podes desativar o registo público depois de criares a conta.
4. Copia `.env.example` para `.env.local` e preenche `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ou publishable key).
5. Reinicia `npm run dev`.
6. Inicia sessão na app e usa **Enviar para a nuvem** para enviar os dados locais. Em cada outro dispositivo, inicia sessão e usa **Carregar nuvem**. Exporta uma cópia antes de substituir dados.

**Importante:** esta primeira versão sincroniza quando pedes explicitamente para enviar/carregar. Ainda não tem sincronização automática em tempo real, resolução de conflitos nem sincronização offline bidirecional. Para evitar sobrescritas acidentais, o carregamento da nuvem pede confirmação.

Nunca coloques a chave `service_role` do Supabase no cliente. Usa apenas a chave publicável/anon, com RLS ativado.

## ISBN e metadados

A pesquisa usa a API pública Open Library. A cobertura depende da edição e do registo bibliográfico disponível. Confirma sempre título, autores, editora e ano antes de guardar. A digitalização da câmara requer HTTPS (ou localhost) e permissões concedidas pelo utilizador.

## Dados e privacidade

Sem Supabase configurado, os dados ficam no armazenamento local do navegador e não sincronizam entre dispositivos. Limpar os dados do navegador pode apagá-los; exporta cópias regularmente. A sincronização remota só fica ativa após configurar o teu projeto e autenticação.

## Publicação

Pode ser publicada em qualquer alojamento estático que sirva Vite/React por HTTPS. Para instalar no ecrã principal do iPhone/iPad, abre a versão HTTPS no Safari e usa **Partilhar → Adicionar ao ecrã principal**. A configuração atual do PWA é mínima; ícones próprios e estratégia de service worker/offline são passos seguintes.

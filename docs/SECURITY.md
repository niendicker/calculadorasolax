# Segurança e permissões

## Papéis

### Usuário comum

Pode acessar seus próprios clientes, projetos, cargas pessoais, pedidos e preferências permitidas pelas policies. Não pode alterar catálogo, regras, usuários, integrações ou logs administrativos.

### Administrador

Pode operar o catálogo e as funções administrativas. O papel é definido no banco e protegido por trigger/policy; nunca deve ser aceito de metadata enviada pelo cliente.

### Público

Pode acessar páginas institucionais, login, recuperação e endpoints de tarifas. Links de cotação usam token e devem expor somente o snapshot previsto.

## Controles obrigatórios

- RLS habilitado em tabelas com dados de usuário.
- `user_id` derivado da sessão, nunca do body.
- Inserts em `app_simulations` permitidos apenas para usuários autenticados e
  apenas para o próprio `auth.uid()` (migration `0088`).
- `service_role` ausente do bundle client-side.
- Validação de payload no route handler e na Edge Function.
- Limites de linhas, paginação e tamanho de requisição.
- Policies de Storage para upload e remoção próprios.
- Logs administrativos sem dados pessoais desnecessários.
- Tokens públicos com alta entropia, expiração ou revogação quando aplicável.
- Testes de autorização para cada recurso público ou administrativo.
- Rate limiting local para cálculo, respostas públicas de cotação, cadastro e
  recuperação de senha; em múltiplas réplicas, complementar com um limitador
  compartilhado (Redis/serviço equivalente) para enforcement global.

## Dados pessoais relevantes

O sistema trata dados de perfil, clientes, endereços, documentos, logomarca, projetos, pedidos, emails e snapshots de cotação. CPF/CNPJ, endereços e dados de clientes devem ser minimizados e não devem aparecer em métricas sem necessidade.

## Incidentes

Em caso de suspeita de vazamento:

1. preservar logs e identificar o escopo;
2. revogar ou rotacionar secrets afetados;
3. bloquear tokens ou integrações comprometidas;
4. verificar RLS, Storage e auditoria;
5. registrar causa, impacto e correção;
6. avaliar comunicação aos titulares e autoridades com orientação jurídica.

## Revisão de segurança

Antes de uma migração ou release relevante, executar `npm run typecheck`, `npm run lint`, `npm test`, revisar migrations pendentes, verificar policies no ambiente alvo e confirmar que nenhum `.env` ou secret aparece no Git.

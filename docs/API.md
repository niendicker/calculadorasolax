# Inventário de APIs

Todas as rotas abaixo usam JSON salvo indicação contrária. Rotas autenticadas validam a sessão Supabase; rotas administrativas também exigem `profiles.role = 'admin'`.

## Autenticação e conta

| Método | Rota | Acesso | Função |
|---|---|---|---|
| POST | `/api/auth/signup` | público | Cria conta, perfil e envia confirmação |
| POST | `/api/auth/recover` | público | Envia email de recuperação |
| POST | `/api/account/delete` | usuário autenticado | Exclui a própria conta via RPC protegida |

## Cálculo e métricas

| Método | Rota | Acesso | Função |
|---|---|---|---|
| POST | `/api/calculations/residential` | usuário autenticado | Valida opções e chama a Edge Function |
| POST | `/api/metrics/simulations` | usuário autenticado | Registra métrica pertencente ao usuário da sessão |

## Projetos, cotações e pedidos

| Método | Rota | Acesso | Função |
|---|---|---|---|
| POST | `/api/projects/:projectId/request-supplier-quote` | dono do projeto | Solicita cotação aos fornecedores selecionados |
| POST | `/api/purchase-orders/:orderId/notify-supplier-email` | dono do pedido | Envia pedido por email ao fornecedor |
| POST | `/api/purchase-orders/:orderId/submit-to-partner` | dono do pedido | Envia pedido para integração de parceiro |
| POST | `/api/quote-shares/:token/respond` | token público | Aceita ou recusa uma cotação compartilhada |

## Administração

| Método | Rota | Acesso | Função |
|---|---|---|---|
| POST | `/api/admin/solutions/refresh` | admin | Remove combinações geradas antigas e faz upsert das novas |
| POST | `/api/admin/suppliers/:supplierId/sync` | admin | Sincroniza catálogo de fornecedor |

## Tarifas

| Método | Rota | Acesso | Função |
|---|---|---|---|
| GET | `/api/tariffs/distributors` | público | Lista distribuidoras disponíveis |
| GET | `/api/tariffs/accessant-agents` | público | Lista agentes de acesso |
| GET | `/api/tariffs/latest-date` | público | Retorna a data mais recente disponível |
| GET | `/api/tariffs/lookup` | público | Consulta tarifa e metadados da fonte ANEEL |

## Regras para novos endpoints

- validar JSON e parâmetros antes de consultar banco;
- não confiar em `user_id` enviado pelo cliente;
- obter o usuário da sessão;
- limitar payload, paginação e quantidade de IDs;
- retornar status HTTP consistente;
- não devolver mensagens internas ou secrets;
- adicionar teste para não autenticado, sem autorização e erro do provedor;
- documentar a rota nesta tabela.

<p align="center">
  <a href="https://docs.google.com/document/d/1Azk65Xh8zneJ-3_1Mszu1qMdgrZ00AYJVG5NYPVZBak/edit?usp=sharing"><strong>Porto Bank — Plataforma de Emissão de Apólices Digitais</strong></a>
</p>

## Visão geral

Caso de negócio
: O Porto Bank quer modernizar e padronizar o processo de emissão (venda) de apólices e títulos de capitalização para os produtos de Fiança e Capitalização. A plataforma deve permitir emissão ágil, segura e 100% digital, integrando-se com serviços externos obrigatórios (concessão de crédito, precificação) durante emissão e com cobrança/contabilidade após emissão.

Objetivo deste repositório
: código-base inicial da microaplicação de Emissão (API + workers) construída com NestJS, com foco em mensagens, integração com brokers (RabbitMQ) e padrões resilientes para produção.

## Checklist de requisitos (extraídos do pedido)

- Documentar o caso e cenário — Done
- Desenhar arquitetura e componentes necessários — Done
- Listar integrações externas obrigatórias (crédito, precificação, cobrança, contabilidade) — Done
- Instruções de execução, testes e build (usar `package.json` scripts) — Done
- Notas operacionais: alta disponibilidade, escalabilidade, observabilidade, segurança — Done
- Próximos passos e melhorias recomendadas — Done

## Arquitetura proposta (resumo)

Componentes principais
- API Gateway / REST API (NestJS): expõe endpoints para venda/emissão e consulta de apólices.
- Processor / Workers: jobs assíncronos que orquestram chamadas a serviços externos e persistência final.
- Message Broker (RabbitMQ): transporte de eventos (emissão requests, status, compensações).
- Banco de dados: relacional (Postgres) para domínio de apólices; réplica/leitura para escala. Considerar esquema com transações e constraints fortes.
- Outbox + CDC / Event Store: garantir entrega atômica de eventos (Transactional Outbox) e integração com consumidores downstream.
- External Integrations: Concessão de Crédito, Precificação, Cobrança, Contabilidade — via HTTP/gRPC com patterns de retry/circuit-breaker.
- Observability: métricas (Prometheus), traces (OpenTelemetry/Jaeger), logs estruturados (JSON).
- Infra: Kubernetes (K8s) + HPA; RabbitMQ em cluster; DB replicado; Secrets in Vault/KMS; LoadBalancer/API Gateway.

Padrões importantes
- Orquestração híbrida: chamada síncrona para validações rápidas (pré-checks), e orquestração assíncrona via eventos para tarefas longas.
- Idempotência: cada chamada externa e cada handler de evento deve ser idempotente.
- Retries e Dead Letter Queues (DLQs): retries exponenciais e DLQ para análise humana/semi-automática.
- Consistency: usar outbox pattern para publicar eventos após commit do DB.
- Timeouts & Circuit Breaker: proteger endpoints críticos (concessão de crédito, precificação).

## Fluxo simplificado de emissão

1. Cliente/Canal chama POST /policies (pedido de emissão) com dados do proponente e produto.
2. API valida entrada rapidamente (schema + business rules básicas) e grava uma transação preliminar (rascunho) no DB.
3. API publica evento `policy.issue.requested` no broker (via outbox) e retorna 202 Accepted com ID de correlação.
4. Worker consome evento e executa passos em série/concorrência:
   - Consultar serviço de Concessão de Crédito (sync/http) — aplicar circuit-breaker.
   - Consultar serviço de Precificação (sync/http) para obter valores finais.
   - Se todos OK, finalizar emissão: gravar apólice como `ISSUED` e publicar `policy.issued`.
   - Se algum passo falhar e for irreversível, publicar `policy.issue.failed` e acionar compensações (cancelamento/estorno).
5. Sistemas de Cobrança e Contabilidade consomem `policy.issued` para gerar títulos/lançamentos.

## API pública (exemplos)

- POST /policies
  - Descrição: iniciar processo de emissão
  - Payload mínimo:

```json
{
  "productCode": "FIANCA",
  "customer": { "id": "123", "name": "João" },
  "coverage": { "amount": 10000 },
  "metadata": { "channel": "mobile" }
}
```

- GET /policies/:id
  - Retorna o estado atual da emissão e históricos de eventos.

Observação: a API deve retornar 202 para processos assíncronos com um campo `correlationId` para polling / websockets / webhooks.

## Persistência e modelagem (alto nível)

- Tabela `policies` (id, product_code, customer_id, status, premium, created_at, updated_at).
- Tabela `policy_events` para histórico de ações (event_type, payload, occurred_at).
- Implementar índices para consultas por status e por data.

## Integrações externas

- Concessão de Crédito
  - Tipo: HTTP/gRPC
  - SLAs esperados: < 500ms em média; Timeout: 2s; retries com backoff.

- Precificação
  - Tipo: HTTP
  - Importante: versão da regra de negócio; cacheada quando possível.

- Cobrança / Contabilidade
  - Consumidores de eventos `policy.issued` para gerar títulos e lançamentos contábeis.

## Como executar (Docker recomendado)

Siga as instruções abaixo — priorizamos o uso de Docker/Docker Compose para reproduzibilidade e facilidade de setup local/CI.

### 1) Executar com Docker (recomendado)

Este repositório inclui um `docker-compose.yml` que sobe a aplicação junto com dependências essenciais (Postgres e RabbitMQ). Use-o para rodar a stack completa rapidamente.

```bash
# da raiz do projeto
docker-compose up -d --build

# verifique containers
docker-compose ps

# acompanhe logs do serviço de aplicação (ex.: service name `app` ou `policy-app`)
docker-compose logs -f app
```

Notas:
- Para limpar volumes e recomeçar:

```bash
docker-compose down -v
```

- Para desenvolvimento com live-reload dentro do container, habilite o volume de código no `docker-compose.yml` (comentado por padrão) e execute `docker-compose up --build`.

### 2) Variáveis de ambiente para o ambiente Docker

O compose já define valores sensíveis padrão para desenvolvimento, mas você pode sobrescrevê-los no ambiente ou usando um arquivo `.env` na raiz. Algumas variáveis úteis:

- JWT_SECRET (padrão de dev: `dev-secret`)
- DATABASE_URL / POSTGRES_USER / POSTGRES_PASSWORD (conforme `docker-compose.yml`)

Exemplo rápido para exportar antes de subir (opcional):

```bash
export JWT_SECRET=dev-secret
```

### 3) Testes e comandos dentro do container

Para executar scripts/npm dentro do container (útil quando não quer instalar localmente):

```bash
# executar um comando npm no container em execução
docker compose exec app npm run test
```

---

## Executar localmente (opcional — para desenvolvimento sem Docker)

Se preferir rodar a aplicação diretamente na sua máquina (Node.js instalado), siga estes passos:

1) Instale dependências

```bash
npm install
```

2) Configure variáveis de ambiente (exemplo):

```bash
export JWT_SECRET=dev-secret
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/policy
export RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

3) Suba Postgres e RabbitMQ (recomendado com Docker Compose)

```bash
docker-compose up -d postgres rabbitmq
```

4) Executar em modo desenvolvimento (hot-reload)

```bash
npm run start:dev
```

5) Build para produção

```bash
npm run build
npm run start:prod
```

6) Testes

```bash
npm run test        # unit
npm run test:e2e    # e2e
npm run test:cov    # coverage
```

7) Lint / format

```bash
npm run lint
npm run format
```

## Observability e Operações

- Logs: JSON estruturado (nivel, timestamp, correlationId, traceId).
- Tracing: instrumentar chamadas HTTP/AMQP com OpenTelemetry.
- Metrics: exportar métricas para Prometheus (latência, QPS, queue depth, retries, failures).
- Health checks: endpoints `/health` (liveness/readiness).

## Segurança

- Autenticação/Autorização: JWT/OAuth2 no API Gateway.
- TLS para todas comunicações (inbound/outbound).
- Secrets: armazenar em Vault/KMS; não hardcodear credenciais.
- PCI/PII: criptografar dados sensíveis em repouso e em trânsito.

## Escalabilidade e alta disponibilidade

- Deploy em K8s com HPA e probes.
- RabbitMQ em cluster com mirrored queues (ou usar managed service).
- Postgres com réplicas de leitura e failover automático.
- Particionamento de filas por produto ou grupo para garantir paralelismo controlado.

## Resiliência e garantias

- Transactional Outbox para garantir publicação de eventos após commit.
- DLQ + operator alerting para filas com mensagens reprocessadas além do limite.
- Idempotência via keys (correlationId + operationId) persistidos.

## Testes e qualidade

- Unit tests com Jest (scripts em `package.json`).
- Testes de integração contra uma stack local (Postgres + RabbitMQ) usando containers.
- Contrato: testes automatizados entre produtor/consumidor (Pact).

## roadmap técnico sugerido

1. Implementar Outbox e mecanismo de publicação garantida.
2. Criar workers de orquestração (concessão, precificação, confirmação) com idempotência.
3. Testes de contrato com serviços de crédito e precificação.
4. Pipelines CI/CD e promoção de imagens (dev → staging → prod).
5. Infra as Code (Terraform) e secrets management.

## Arquivos úteis no repositório

- `package.json` — scripts de build, start e testes.
- `src/` — código da aplicação (controllers, modules, serviços, workers).
- `rabbit/definitions.json` — definições de filas/eventos.

## Gateway Auth (dev) e curls de teste

Este repositório inclui um guard JWT mínimo e opcional para proteger a API em testes locais. O guard aceita:
- um token HS256 verificado com a variável de ambiente `JWT_SECRET` (padrão: `dev-secret`), ou
- um token RS256 verificado com `JWT_PUBLIC_KEY`.

Para conveniência há um pequeno helper para gerar um token HS256 para testes.

Criar um token (dev):

```bash
# gerar um token com claims subject e role
node -e "console.log(require('jsonwebtoken').sign({ sub: 'test-user', role: 'developer' }, process.env.JWT_SECRET||'dev-secret', { algorithm: 'HS256', expiresIn: '1h' }))"
```

Exemplos de curl

# 1) Health (sem auth)
curl -v http://localhost:3000/

# 2) POST issue sem token (deve retornar 401)
curl -v -H "Content-Type: application/json" -X POST http://localhost:3000/policy/issue -d '{"holder":"Alice","amount":100}'

# 3) POST issue com token (substitua <TOKEN> pelo token gerado)
curl -v -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -X POST http://localhost:3000/policy/issue -d '{"holder":"Alice","amount":100,"productCode":"FIANCA"}'

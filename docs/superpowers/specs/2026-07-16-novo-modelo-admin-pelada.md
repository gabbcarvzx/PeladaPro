# Novo Modelo de Pelada — Controle Total pelo Admin

**Data:** 2026-07-16
**Status:** Aprovado
**Tags:** `pelada`, `admin`, `prioridade`, `chegada`, `sorteio`

---

## 1. Objetivo

Remover o sistema de convite por link, auto-participação e prioridade entre mensalista/diarista. Substituir por um modelo onde **apenas o admin controla a pelada**: cadastra jogadores manualmente, confirma chegada física (que define prioridade real), e o sorteio usa exclusivamente a ordem de chegada.

---

## 2. O que é Removido

- ❌ Sistema de convite por link (`link_convite`, `invite_code`, `is_public`)
- ❌ Auto-participação (jogador se adicionar sozinho via link)
- ❌ Prioridade entre mensalista e diarista (em confirmação, fila de espera, sorteio)
- ❌ Múltiplos modos de sorteio (restrito a `ordem_chegada`)
- ❌ Páginas `/pelada/entrar/[invite_code]` e `/pelada/join/[link]`

---

## 3. Modelagem do Banco

### 3.1 `peladas` — Remoção de campos obsoletos

```sql
-- Remove:
alter table public.peladas drop column if exists link_convite;
alter table public.peladas drop column if exists invite_code;
alter table public.peladas drop column if exists is_public;
alter table public.peladas drop column if exists limite_jogadores;
```

### 3.2 `confirmacoes_dia` — Adição de `hora_chegada`

```sql
alter table public.confirmacoes_dia
  add column if not exists hora_chegada timestamptz;
```

### 3.3 `lista_espera` — Remoção de `prioridade`

```sql
alter table public.lista_espera drop column if exists prioridade;
-- Remove check constraint
alter table public.lista_espera drop constraint if exists lista_espera_prioridade_check;
```

### 3.4 `pelada_participantes` — Tipo informativo

O campo `tipo` permanece, mas:
- É apenas informativo (não afeta prioridade)
- Remove check constraint `tipo in ('mensalista', 'diatista')`

### 3.5 `historico_sorteios` — Modo único

```sql
-- Remove check constraint antiga
alter table public.historico_sorteios drop constraint if exists historico_sorteios_modo_check;
-- Adiciona nova
alter table public.historico_sorteios add constraint historico_sorteios_modo_check
  check (modo in ('ordem_chegada'));
```

---

## 4. RPCs Transactionais

### 4.1 `confirmar_intencao` — Jogador marca que vai

```sql
create or replace function public.confirmar_intencao(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
) returns jsonb
```

- Marca status = `pendente` (apenas intenção, sem prioridade)
- Idempotente: se já existe, mantém
- Jogador **pode** chamar esta RPC

### 4.2 `confirmar_chegada` — Admin confirma chegada física

```sql
create or replace function public.confirmar_chegada(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
) returns jsonb
```

- **Lock** na ocorrência (`FOR UPDATE`)
- Verifica se já está confirmado com hora_chegada → erro
- Conta confirmados com `hora_chegada IS NOT NULL`
- Se `< 25`: marca `status='confirmado'`, `hora_chegada=now()`, `ordem_chegada=próximo`
- Se `>= 25`: insere na `lista_espera` (posição = max + 1, sem prioridade)

### 4.3 `recusar_presenca` — Cancela e promove da fila

```sql
create or replace function public.recusar_presenca(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
) returns jsonb
```

- **Lock** na ocorrência
- Se estava confirmado: remove `hora_chegada`, marca `recusado`
- Promove primeiro da fila (ORDER BY posicao ASC LIMIT 1)
- Reordena fila

---

## 5. RLS (Row Level Security)

### `pelada_participantes`
- **Insert**: apenas admin (`auth.uid() IN (SELECT admin_id FROM peladas WHERE id = pelada_id)`)
- **Delete**: apenas admin
- **Select**: autenticados

### `confirmacoes_dia`
- **Insert**: admin **ou** jogador (apenas status = `pendente`)
- **Update**: admin **ou** jogador (apenas se status atual = `pendente`)
- **Delete**: apenas admin
- **Select**: autenticados

### `lista_espera`
- **Insert**: apenas via RPC (security definer)
- **Delete**: apenas admin
- **Select**: autenticados

---

## 6. Sorteio

- Modo único: `ordem_chegada`
- Ordena confirmados por `hora_chegada ASC`
- Remove: `SorteioModo` type, modos alternativos, priorização
- Times gerados por distribuição serpentina simples

---

## 7. Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/00017_novo_modelo_admin.sql` | Criar |
| `src/types/index.ts` | Modificar |
| `src/services/pelada-service.ts` | Modificar |
| `src/services/index.ts` | Modificar (se necessário) |
| `src/services/jogador-service.ts` | Modificar (remover referências a tipo) |
| `src/app/pelada/[id]/page.tsx` | Modificar |
| `src/app/pelada/sorteio/[id]/page.tsx` | Modificar |
| `src/app/pelada/create/page.tsx` | Modificar |
| `src/app/dashboard/page.tsx` | Modificar |
| `src/proxy.ts` | Modificar (remover rotas de convite) |
| `src/lib/supabase/middleware.ts` | Modificar |
| `src/app/pelada/entrar/[invite_code]/page.tsx` | Remover |
| `src/app/pelada/join/[link]/page.tsx` | Remover |

---

## 8. Testes

Cenário obrigatório:
1. Cadastrar 30 jogadores
2. Confirmar presença virtual
3. Confirmar chegada física na ordem
4. Verificar que somente 25 ficam confirmados
5. Verificar que os demais entram na espera
6. Cancelar um confirmado
7. Confirmar que primeiro da fila sobe
8. Executar sorteio
9. Garantir que usa ordem de chegada
10. Garantir que build permanece OK

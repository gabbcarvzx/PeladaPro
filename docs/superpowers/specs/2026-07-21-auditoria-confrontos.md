# Auditoria Estrutural — Sistema de Confrontos

## 1. Diagnóstico da Tabela `confrontos`

| Campo | Tipo | Status |
|-------|------|--------|
| id | uuid PK | ✅ |
| pelada_id | uuid FK → peladas | ✅ |
| sorteio_id | uuid FK → historico_sorteios (nullable) | ✅ |
| time_a_nome / time_b_nome | text | ✅ |
| time_a_jogadores / time_b_jogadores | jsonb | ✅ |
| placar_a / placar_b | integer | ✅ |
| status | text ('em_andamento', 'finalizado') | ✅ |
| resultado | text ('time_a', 'time_b', 'empate', null) | ✅ |
| fila_restante | jsonb | ✅ |
| tempo_limite | integer | ✅ |
| ordem | integer | ✅ |
| cronometro_status | text ('parado','rodando','pausado') | ✅ |
| pelada_ocorrencia_id | uuid FK → pelada_ocorrencias (nullable) | ✅ |

**Coluna `fila_restante` confirmada como jsonb** — definida em `00004_confrontos.sql` linha 20.

⚠️ **TypeScript type incorreto**: `src/types/index.ts` linha 119 define `fila_restante?: string`, mas o banco armazena como `jsonb`. O código já trata ambos (Array.isArray vs string) → arrumar tipo.

---

## 2. Diagnóstico da Tabela `historico_sorteios`

| Campo | Tipo | Status |
|-------|------|--------|
| id | uuid PK | ✅ |
| pelada_id | uuid FK → peladas | ✅ |
| data_sorteio | timestamptz | ✅ |
| modo | text (apenas 'ordem_chegada') | ✅ |
| times | jsonb | ✅ |
| pelada_ocorrencia_id | uuid FK (nullable) | ✅ |

**Múltiplos sorteios são permitidos** — sem unique constraint em pelada_id.

**Estrutura do jsonb `times`:** `[{nome: string, jogadores: [{user_id, nome, avatar_url}]}]`.

---

## 3. Verificação da Fila (fila_restante)

### ❌ ISSUE CRÍTICO #1 — Sem atomicidade transacional

`ConfrontoService.finalizarConfronto()` executa:

1. `supabase.from("confrontos").update({status:'finalizado', resultado})` — chamada HTTP
2. `supabase.from("confrontos").insert({...fila_restante})` — chamada HTTP separada

**Problema:** Se a chamada 1 falhar → nada acontece (safe).  
**Pior:** Se a chamada 1 **sucede** e a chamada 2 **falha** → confronto fica finalizado sem próximo. **Estado inconsistente.**

### ❌ ISSUE CRÍTICO #2 — Sem FOR UPDATE / Lock

Nenhuma operação de finalização ou criação adquire `FOR UPDATE`. Cenário de race condition:

1. Dois admins clicam "Finalizar" simultaneamente
2. Ambos leem o mesmo `fila_restante`
3. Ambos criam um novo confronto com times duplicados
4. Resultado: confrontos duplicados, fila corrompida

### ❌ ISSUE CRÍTICO #3 — Sem RPC transacional

Toda lógica de rotação roda em Node.js, não no banco. A abordagem correta é um RPC PostgreSQL que executa tudo dentro de `BEGIN ... COMMIT`.

---

## 4. Verificação do Refazer Sorteio

### ❌ ISSUE CRÍTICO #4 — Refazer Sorteio não limpa confrontos

`handleSortear()` em `/pelada/sorteio/[id]/page.tsx`:
- ✅ Cria novo `historico_sorteios`
- ❌ **Não deleta confrontos ativos**
- ❌ **Não deleta eventos de confronto**
- ❌ **Não reseta fila_restante**

**Consequência:** Se o admin fizer "Refazer Sorteio" com confrontos em andamento, o sistema fica com:
- Confrontos antigos (referenciando sorteio_id antigo)
- Novo histórico de sorteio (sem confrontos)
- Estado misto — abas mostram dados inconsistentes

---

## 5. Comportamento com fila vazia

### ⚠️ ISSUE #5 — Ciclo infinito quando fila acaba

**Vitória + fila vazia:** vencedor enfrenta perdedor novamente → loop infinito  
**Empate + fila vazia:** mesmos times se enfrentam de novo → loop infinito

**Solução:** Quando fila estiver vazia e o resultado for definido, **encerrar a rodada** em vez de criar novo confronto.

---

## 6. Times Sorteados — Aba

### ✅ OK — getHistoricoSorteios retorna todos, ordenado por created_at DESC
### ⚠️ ISSUE #6 — Mostrar apenas último sorteio por padrão

A aba `/pelada/[id]/times` mostra todos os sorteios. Para clareza, o comportamento deve ser:
- Último sorteio visível por padrão
- Históricos anteriores expansíveis (accordion)

---

## 7. Pontuação de Risco

| # | Issue | Severidade | Impacto |
|---|-------|-----------|---------|
| 1 | Sem atomicidade — finalizarConfronto | 🔴 CRÍTICO | Estado inconsistente se chamada HTTP falha |
| 2 | Sem FOR UPDATE — race condition | 🔴 CRÍTICO | Fila corrompida em concorrência |
| 3 | Lógica em Node.js, não no banco | 🟡 ALTO | Sem garantias ACID |
| 4 | Refazer Sorteio não limpa estado | 🔴 CRÍTICO | Estado misto entre sorteios |
| 5 | Ciclo infinito com fila vazia | 🟡 ALTO | Confrontos nunca terminam |
| 6 | Tipo fila_restante incorreto | 🟢 BAIXO | Apenas TypeScript, runtime trata |

---

## 8. Plano de Correção

### 🔧 Correção A — RPC `finalizar_confronto` (resolve Issues 1, 2, 3, 5)
Criar stored procedure PostgreSQL que:
1. `SELECT ... FOR UPDATE` na ocorrência/pelada
2. Finaliza confronto atual (status + resultado)
3. Aplica lógica de rotação completa (vitória/empate/fila vazia)
4. Insere próximo confronto com fila atualizada, SE houver times restantes
5. Se fila vazia: **não cria próximo** — retorna vazio
6. Tudo em uma transação

### 🔧 Correção B — RPC `limpar_estado_confrontos` (resolve Issue 4)
Criar stored procedure que:
1. Deleta `eventos_confronto` vinculados
2. Deleta `confrontos` da pelada
3. Garante estado limpo antes de novo sorteio

### 🔧 Correção C — Tipo TypeScript (resolve Issue 6)
Atualizar `fila_restante?: string` → `fila_restante?: TimeFila[]`

### 🔧 Correção D — UI Refazer Sorteio (resolve Issue 4)
Antes de criar novo sorteio, chamar RPC de limpeza.

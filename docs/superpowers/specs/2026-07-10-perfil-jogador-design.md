# Perfil Público do Jogador — Design Specification

**Data:** 2026-07-10
**Projeto:** PeladaPro
**Status:** Rascunho para aprovação

---

## 1. Objetivo

Criar uma página pública de perfil para cada jogador do PeladaPro, acessível via `/jogador/[id]`, exibindo informações pessoais, estatísticas de presença e as peladas das quais participa.

## 2. Escopo MVP

### Inclui
- Página pública `/jogador/[id]`
- Hero card: avatar, nome, badge (admin/mensalista/diarista), número favorito, posições
- Stats cards: % presença, streak 🔥, total de jogos
- Lista de peladas que o jogador participa
- Campo `posicoes` no `profiles` (array de strings, até 2)
- Formulário de edição de perfil atualizado com campo de posições
- Links clicáveis: nome do jogador vira link para perfil

### Não inclui (futuro)
- Gols/estatísticas de confronto
- Feed de atividades
- Avaliações entre jogadores
- Badges/medalhas

## 3. Modelo de Dados

### Migration: adicionar `posicoes` ao `profiles`

```sql
alter table public.profiles
  add column if not exists posicoes text[] not null default '{}';
```

### TypeScript: atualizar `Profile` e `ProfileUpdate`

```typescript
export interface Profile {
  // ... campos existentes
  posicoes: string[] // novo
}

export interface ProfileUpdate {
  nome?: string
  avatar_url?: string | null
  numero_favorito?: number | null
  posicoes?: string[] // novo
}
```

### Estatísticas (calculadas em tempo real)

As estatísticas são derivadas das tabelas existentes, sem novas tabelas:

- **% Presença**: `confirmados / total_ocorrencias` via `confirmacoes_dia` onde `user_id = $1`
- **Streak**: presenças consecutivas da data mais recente para trás (lógica em TS)
- **Total de Jogos**: `count(*)` de `confirmacoes_dia` onde `user_id = $1`

## 4. Rotas e Navegação

| Rota | Descrição | Proteção |
|------|-----------|----------|
| `/jogador/[id]` | Perfil público do jogador | Autenticado (proxy) |
| `/dashboard/profile` | Edição de perfil (já existe) | Autenticado |

### Proxy: adicionar `"/jogador"` às rotas protegidas.

### Links para perfil
Em toda parte onde o nome do jogador aparece, virar link para `/jogador/[id]`:
- Lista de participantes na página da pelada
- Dashboard (avatar/nome no header)
- Página de convite (admin)

## 5. UI / Layout

### Página `/jogador/[id]`

Consistente com o design atual (dark + verde neon). Estrutura:

```
┌──────────────────────────────────────┐
│  Header (voltar + logo)              │
├──────────────────────────────────────┤
│  ┌──────────┐                        │
│  │  Avatar  │  Nome do Jogador       │
│  │  grande  │  [Admin] [Mensalista]  │
│  │          │  #10 · Atacante · Ponta│
│  └──────────┘                        │
│         [Convidar para Pelada]       │
├──────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ Presença│ │ Streak  │ │ Total   ││
│  │   78%   │ │  🔥 5   │ │  23     ││
│  │ ██████  │ │ jogos   │ │ jogos   ││
│  └─────────┘ └─────────┘ └─────────┘│
├──────────────────────────────────────┤
│  Peladas                              │
│  ┌────────────────────────────────┐  │
│  │ ⚽ Pelada do Sábado            │  │
│  │ Sábado 08:00 · Admin           │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ ⚽ Pelada da Quarta            │  │
│  │ Quarta 19:00                   │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 6. Componentes

### Novos componentes
- `PlayerHeroCard` — Avatar grande, nome, badges, número, posições, ação
- `PlayerStats` — 3 stats cards com animação de contagem
- `PlayerPeladas` — Lista de peladas que participa

### Serviço novo
- `JogadorService` — métodos para buscar dados do perfil público:
  - `getProfile(userId)`: busca profile + posicoes
  - `getStats(userId)`: calcula % presença, streak, total
  - `getPeladas(userId)`: busca peladas que participa (usa RPC security definer)

## 7. Segurança

- Rota `/jogador/[id]` exige autenticação (proxy)
- Dados são públicos entre usuários autenticados (mesma política do RLS atual de `profiles`)
- Stats são calculadas no backend (RPC ou service), nunca expostas via frontend puro
- Edição de perfil (`/dashboard/profile`) já protegida por RLS

## 8. Dependências

- Migration 00015 para adicionar coluna `posicoes`
- Nenhuma nova dependência externa
- Reutiliza componentes existentes: Avatar, BadgeStatus, Button, Card, Skeleton

## 9. Critérios de Sucesso

1. ✅ Usuário acessa `/jogador/[id]` e vê perfil completo
2. ✅ Estatísticas refletem dados reais do banco
3 ✅ Posições aparecem corretamente no perfil e na edição
4. ✅ Links para perfil funcionam em toda parte
5. ✅ Build OK, TypeScript 0 erros

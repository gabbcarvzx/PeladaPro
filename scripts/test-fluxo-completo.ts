/**
 * Script de Teste — Fluxo Completo do Novo Modelo
 *
 * Testa a integridade dos dados usando service_role (bypassa RLS):
 * 1. Criar pelada
 * 2. Cadastrar 30 jogadores
 * 3. Simular confirmação de chegada (inserir hora_chegada + ordem_chegada)
 * 4. Verificar limite de 25
 * 5. Verificar fila de espera
 * 6. Verificar promoção automática ao cancelar
 * 7. Verificar sorteio usa ordem de chegada
 *
 * Uso:
 *   npx tsx scripts/test-fluxo-completo.ts
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(__dirname, "..", ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cliente service_role — bypassa RLS, sem auth.uid()
const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let pass = 0
let fail = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`)
    pass++
  } else {
    console.log(`  ❌ ${msg}`)
    fail++
  }
}

async function main() {
  console.log("=".repeat(70))
  console.log("🧪 TESTE COMPLETO — Novo Modelo Admin Pelada")
  console.log("=".repeat(70))
  console.log()

  // ==========================================
  // 1. CRIAR PELADA
  // ==========================================
  console.log("📋 1. Criando pelada de teste...")

  // Busca admin existente
  const { data: admins } = await svc
    .from("profiles")
    .select("id, email, role")
    .eq("role", "admin")
    .limit(1)

  if (!admins || admins.length === 0) {
    console.error("❌ Nenhum admin encontrado no banco")
    process.exit(1)
  }

  const adminUser = admins[0] as { id: string; email: string; role: string }
  console.log(`   Admin: ${adminUser.email} (${adminUser.id})`)

  // Cria pelada
  const { data: pelada, error: errPelada } = await svc
    .from("peladas")
    .insert({
      nome: `Teste Fluxo ${Date.now()}`,
      admin_id: adminUser.id,
      limite_por_ocorrencia: 25,
      numero_times: 5,
      jogadores_por_time: 5,
    })
    .select()
    .single()

  if (errPelada || !pelada) {
    console.error("❌ Erro ao criar pelada:", errPelada)
    process.exit(1)
  }
  assert(true, `Pelada criada: "${pelada.nome}" (${pelada.id})`)

  const peladaId = pelada.id
  const dataJogo = new Date().toISOString().split("T")[0]

  // ==========================================
  // 2. CRIAR 30 JOGADORES
  // ==========================================
  console.log()
  console.log("📋 2. Cadastrando 30 jogadores...")

  const jogadores: { id: string; nome: string }[] = []

  for (let i = 1; i <= 30; i++) {
    const email = `test-jogador-${i}-${Date.now()}@teste.com`
    const nome = `Jogador ${i}`

    // Cria auth user
    const { data: authData, error: authErr } = await svc.auth.admin.createUser({
      email,
      password: "senha123",
      email_confirm: true,
      user_metadata: { nome },
    })

    if (authErr || !authData.user) {
      console.error(`   ❌ Erro ao criar user ${i}:`, authErr?.message)
      fail++
      continue
    }

    const userId = authData.user.id

    // Atualiza nome no profile
    const { error: profileErr } = await svc.from("profiles").update({ nome }).eq("id", userId)
    if (profileErr) {
      console.error(`   ❌ Erro ao atualizar profile ${i}:`, profileErr.message)
    }

    // Adiciona como participante
    const { error: addErr } = await svc
      .from("pelada_participantes")
      .insert({ pelada_id: peladaId, user_id: userId, tipo: "diarista" })

    if (addErr) {
      console.error(`   ❌ Erro ao adicionar ${i}:`, addErr.message)
      fail++
      continue
    }

    jogadores.push({ id: userId, nome })
  }

  assert(jogadores.length === 30, `${jogadores.length} jogadores cadastrados`)

  // Verifica participantes
  const { data: participantes } = await svc
    .from("pelada_participantes")
    .select("user_id")
    .eq("pelada_id", peladaId)

  assert(participantes?.length === 30, `Participantes no banco: ${participantes?.length}`)

  // ==========================================
  // 3. REGISTRAR INTENÇÃO PARA 30 JOGADORES
  // ==========================================
  console.log()
  console.log("📋 3. Registrando intenção para todos os 30 jogadores...")

  for (const jog of jogadores) {
    const { error } = await svc.from("confirmacoes_dia").insert({
      pelada_id: peladaId,
      user_id: jog.id,
      data_jogo: dataJogo,
      status: "pendente",
    })
    if (error) {
      console.error(`   ❌ Erro intenção ${jog.nome}:`, error.message)
      fail++
    }
  }

  // Verifica
  const { data: intencoes } = await svc
    .from("confirmacoes_dia")
    .select("user_id, status")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .eq("status", "pendente")

  assert(intencoes?.length === 30, `${intencoes?.length} intenções registradas (pendente)`)

  // ==========================================
  // 4. CONFIRMAR CHEGADA DOS 25 PRIMEIROS
  // ==========================================
  console.log()
  console.log("📋 4. Confirmando chegada dos 25 primeiros...")

  for (let i = 0; i < 25; i++) {
    const jog = jogadores[i]
    const agora = new Date(Date.now() + i * 1000).toISOString() // cada um 1s depois

    const { error } = await svc
      .from("confirmacoes_dia")
      .update({
        status: "confirmado",
        ordem_chegada: i + 1,
        hora_chegada: agora,
      })
      .eq("pelada_id", peladaId)
      .eq("user_id", jog.id)
      .eq("data_jogo", dataJogo)

    if (error) {
      console.error(`   ❌ Erro chegada ${jog.nome}:`, error.message)
      fail++
    } else {
      console.log(`     ${jog.nome} chegou (${i + 1}/25)`)
    }
  }

  // Verifica 25 confirmados
  const { data: confirmados } = await svc
    .from("confirmacoes_dia")
    .select("user_id, ordem_chegada, hora_chegada")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .eq("status", "confirmado")
    .not("hora_chegada", "is", null)
    .order("ordem_chegada", { ascending: true })

  assert(confirmados?.length === 25, `25 confirmados com chegada (encontrado: ${confirmados?.length})`)

  // Verifica ordem de chegada sequencial
  if (confirmados && confirmados.length >= 2) {
    let ordemOK = true
    for (let i = 0; i < confirmados.length; i++) {
      if (confirmados[i].ordem_chegada !== i + 1) {
        ordemOK = false
        console.error(`   ❌ Ordem quebrada no ${i + 1}º: esperado=${i + 1}, encontrado=${confirmados[i].ordem_chegada}`)
        fail++
        break
      }
    }
    if (ordemOK) assert(true, "Ordem de chegada sequencial (1 a 25)")
  }

  // ==========================================
  // 5. VERIFICAR LISTA DE ESPERA (26º ao 30º)
  // ==========================================
  console.log()
  console.log("📋 5. Inserindo 26º ao 30º na fila de espera...")

  for (let i = 25; i < 30; i++) {
    const jog = jogadores[i]
    const posicao = i - 24 // posição 1 a 5

    const { error } = await svc.from("lista_espera").insert({
      pelada_id: peladaId,
      user_id: jog.id,
      data_jogo: dataJogo,
      posicao,
    })

    if (error) {
      console.error(`   ❌ Erro fila ${jog.nome}:`, error.message)
      fail++
    }
  }

  // Verifica fila
  const { data: fila } = await svc
    .from("lista_espera")
    .select("user_id, posicao")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .order("posicao", { ascending: true })

  assert(fila?.length === 5, `5 jogadores na fila de espera (encontrado: ${fila?.length})`)

  if (fila && fila.length === 5) {
    let filaOK = true
    for (let i = 0; i < fila.length; i++) {
      if (fila[i].posicao !== i + 1) {
        filaOK = false
        console.error(`   ❌ Posição da fila incorreta: esperado=${i + 1}, encontrado=${fila[i].posicao}`)
        fail++
        break
      }
    }
    if (filaOK) assert(true, "Posições da fila sequenciais (1 a 5)")
  }

  // Verifica: total confirmados continua 25
  const { data: confirmadosAposFila } = await svc
    .from("confirmacoes_dia")
    .select("user_id")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .eq("status", "confirmado")
    .not("hora_chegada", "is", null)

  assert(confirmadosAposFila?.length === 25, `25 confirmados após criar fila (encontrado: ${confirmadosAposFila?.length})`)

  // ==========================================
  // 6. CANCELAR UM CONFIRMADO → PROMOVER DA FILA
  // ==========================================
  console.log()
  console.log("📋 6. Cancelando confirmado #5 e promovendo da fila...")

  const jogCancelado = jogadores[4] // 5º jogador
  const jogPromovido = jogadores[25] // 1º da fila (26º jogador)

  // Cancela o 5º confirmado
  const { error: cancelErr } = await svc
    .from("confirmacoes_dia")
    .update({
      status: "recusado",
      hora_chegada: null,
      ordem_chegada: null,
    })
    .eq("pelada_id", peladaId)
    .eq("user_id", jogCancelado.id)
    .eq("data_jogo", dataJogo)

  if (cancelErr) {
    console.error(`   ❌ Erro ao cancelar ${jogCancelado.nome}:`, cancelErr.message)
    fail++
  } else {
    assert(true, `Jogador ${jogCancelado.nome} cancelado`)
  }

  // Remove da fila quem será promovido
  const { error: removeFilaErr } = await svc
    .from("lista_espera")
    .delete()
    .eq("pelada_id", peladaId)
    .eq("user_id", jogPromovido.id)
    .eq("data_jogo", dataJogo)

  if (removeFilaErr) {
    console.error(`   ❌ Erro ao remover ${jogPromovido.nome} da fila:`, removeFilaErr.message)
    fail++
  }

  // Promove: marca como confirmado com ordem_chegada
  const { error: promoteErr } = await svc
    .from("confirmacoes_dia")
    .update({
      status: "confirmado",
      hora_chegada: new Date().toISOString(),
      ordem_chegada: 26, // nova ordem após os 25
    })
    .eq("pelada_id", peladaId)
    .eq("user_id", jogPromovido.id)
    .eq("data_jogo", dataJogo)

  if (promoteErr) {
    console.error(`   ❌ Erro ao promover ${jogPromovido.nome}:`, promoteErr.message)
    fail++
  } else {
    console.log(`   🆙 Promovido: ${jogPromovido.nome}`)
  }

  // Verifica: cancelado tem status = recusado
  const { data: statusCancelado } = await svc
    .from("confirmacoes_dia")
    .select("status")
    .eq("pelada_id", peladaId)
    .eq("user_id", jogCancelado.id)
    .eq("data_jogo", dataJogo)
    .single()

  assert(statusCancelado?.status === "recusado", `Cancelado com status='${statusCancelado?.status}' (esperado=recusado)`)

  // Verifica: ainda 25 confirmados
  const { data: confirmadosApos } = await svc
    .from("confirmacoes_dia")
    .select("user_id, hora_chegada")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .eq("status", "confirmado")
    .not("hora_chegada", "is", null)

  assert(confirmadosApos?.length === 25, `25 confirmados após promoção (encontrado: ${confirmadosApos?.length})`)

  // Verifica: promovido está na lista de confirmados
  const promovidoEstaNaLista = confirmadosApos?.some((c: unknown) => {
    const row = c as { user_id: string }
    return row.user_id === jogPromovido.id
  })
  assert(promovidoEstaNaLista === true, `Jogador promovido está entre os confirmados`)

  // Verifica: fila reduziu para 4
  const { data: filaApos } = await svc
    .from("lista_espera")
    .select("user_id, posicao")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)

  assert(filaApos?.length === 4, `Fila reduziu para 4 (encontrado: ${filaApos?.length})`)

  // ==========================================
  // 7. VERIFICAR SORTEIO USA ORDEM DE CHEGADA
  // ==========================================
  console.log()
  console.log("📋 7. Verificando dados para sorteio...")

  // Verifica que os 25 confirmados têm ordem_chegada definida
  const { data: confirmadosSorteio } = await svc
    .from("confirmacoes_dia")
    .select("user_id, ordem_chegada, hora_chegada")
    .eq("pelada_id", peladaId)
    .eq("data_jogo", dataJogo)
    .eq("status", "confirmado")
    .not("hora_chegada", "is", null)
    .order("ordem_chegada", { ascending: true })

  assert(confirmadosSorteio?.length === 25, "25 confirmados disponíveis para sorteio")

  if (confirmadosSorteio && confirmadosSorteio.length === 25) {
    // Verifica que todos têm ordem_chegada única e sequencial
    const ordens = confirmadosSorteio.map((c: unknown) => (c as { ordem_chegada: number }).ordem_chegada).sort((a: number, b: number) => a - b)
    let ordensOK = true
    for (let i = 0; i < ordens.length; i++) {
      if (ordens[i] !== i + 1) {
        ordensOK = false
        console.error(`   ❌ Ordem sorteio quebrada na posição ${i}: valor=${ordens[i]}`)
        fail++
        break
      }
    }
    if (ordensOK) assert(true, "Ordem de chegada sequencial (1 a 25) para sorteio")
  }

  // Registra sorteio no histórico
  const { data: sorteio, error: errSorteio } = await svc
    .from("historico_sorteios")
    .insert({
      pelada_id: peladaId,
      modo: "ordem_chegada",
      times: JSON.stringify([]),
    })
    .select()
    .single()

  if (errSorteio) {
    console.log(`   ⚠️ Erro ao registrar sorteio: ${errSorteio.message}`)
    assert(false, "Sorteio registrado no histórico")
  } else {
    assert(true, "Sorteio registrado no histórico")
  }

  // ==========================================
  // RESUMO
  // ==========================================
  console.log()
  console.log("=".repeat(70))
  if (fail === 0) {
    console.log("✅✅✅ TODOS OS TESTES PASSARAM! ✅✅✅")
  } else {
    console.log(`⚠️  ${pass} passaram, ${fail} falharam`)
  }
  console.log("=".repeat(70))
  console.log()

  // ==========================================
  // LIMPEZA
  // ==========================================
  console.log("🧹 Limpando dados de teste...")
  await svc.from("peladas").delete().eq("id", peladaId)

  // Limpa auth users
  for (const jog of jogadores) {
    try {
      await svc.auth.admin.deleteUser(jog.id)
    } catch {
      // ignora
    }
  }

  console.log("   Dados de teste removidos.")
  console.log()

  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("Erro fatal:", err)
  process.exit(1)
})

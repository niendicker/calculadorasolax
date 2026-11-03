# Planejamento do Módulo C&I — Backup e Falta de Rede (`ci_backup`)

**Data:** 2026-11-03  
**Status:** Planejamento aprovado — pronto para implementação  
**Dependências:** Feature flags de usuário (`0096_user_feature_flags.sql`), Motor C&I base (Fases 1–7), Workspace C&I (`CommercialIndustrialWorkspace.tsx`)  
**Feature Flag:** `ci_backup` (requer `ci` ativo)  
**Referência:** Lógica de cargas e dimensionamento do gerador/soluções residenciais (`calculate-residential/logic.ts`, `TechnicalSizingEditor.tsx`)

---

## 1. Visão Geral e Objetivos

O módulo Comercial e Industrial (C&I) atual dimensiona sistemas BESS para conexão à rede focando em **benefício econômico**: *Peak Shaving* (redução de demanda faturada), *Load Shifting* (arbitragem tarifária ponta/fora de ponta) e modo *Híbrido*.

Contudo, clientes comerciais e industriais possuem **cargas críticas e prioritárias** (servidores/TI, câmeras e alarmes de segurança, controle de acesso, refrigeração de perecíveis, iluminação de emergência e linhas de processo sensíveis) que necessitam de **operação contínua durante quedas e apagões da concessionária**.

Este plano estabelece a extensão do C&I para suportar o **dimensionamento de emergência (falta de rede / backup)**, liberado exclusivamente para usuários autorizados com a flag `ci_backup`.

---

## 2. Princípios de Projeto

1. **Reuso da Lógica Residencial:** O modelo de cargas críticas e combinação de potência/energia segue a mesma base já validada no residencial (`nominalW`, `peakW`, autonomia e energia útil).
2. **Entrada Dual (Rápida vs. Detalhada):**
   - **Rápida:** Potência crítica agregada ($\text{kW}$) + Horas de autonomia desejadas ($h$).
   - **Detalhada (estilo residencial):** Tabela de cargas individuais com quantidade, potência nominal, fator de potência e regime de uso.
3. **Reserva Dinâmica de Contingência ($SOC_{\text{backup}}$):** Quando a instalação opera no dia a dia em *Peak Shaving* ou *Load Shifting*, o motor de despacho não pode esvaziar a bateria além da reserva necessária para a emergência, garantindo disponibilidade de energia caso ocorra um blecaute logo após ou durante a ponta.
4. **Isolamento por Feature Flag:** Nenhum campo, card ou métrica de backup é visível ou exigido para usuários que não possuam a permissão `ci_backup`.
5. **Determinismo:** O cálculo de autonomia e combinações válidas é 100% puro e reproduzível.

---

## 3. Contratos de Domínio e Tipagem

### 3.1 Contrato de Cargas Críticas (`CiCriticalLoad`)

```typescript
export interface CiCriticalLoad {
  id: string;
  name: string;
  powerW: number;
  quantity: number;
  /** Regime de uso durante a falta de rede */
  usageMode?: 'fixed' | 'fraction';
  usageFactor?: number; // 0.1 a 1.0 (ex: compressores intermitentes)
  fixedHours?: number;  // horas específicas de uso
}
```

### 3.2 Contrato de Configuração de Backup (`CiBackupConfig`)

```typescript
export type CiBackupInputMode = 'simple' | 'detailed';

export interface CiBackupConfig {
  enabled: boolean;
  inputMode: CiBackupInputMode;
  
  // Modo simples (valores agregados diretos)
  targetPowerKw: number;
  targetPeakPowerKw?: number;
  autonomyHours: number;
  
  // Modo detalhado (lista de cargas estilo residencial)
  loads: CiCriticalLoad[];
  
  // Parâmetros operacionais
  /** Margem de segurança sobre a potência das cargas (padrão 10%) */
  safetyMarginPercent: number;
  /** Reserva mínima obrigatória de SOC durante operação on-grid (calculada ou manual %) */
  minSocReservePercent?: number;
}
```

### 3.3 Extensão de `CommercialIndustrialOptions`

Em `supabase/functions/_shared/commercial-industrial/types.ts`:

```typescript
export interface CommercialIndustrialOptions {
  // ... campos existentes (loadCurve, tariff, bessProductId, sizing, strategy, financialAssumptions)
  backup?: CiBackupConfig;
}
```

### 3.4 Métricas de Saída de Backup no Resultado (`CiBackupResult`)

```typescript
export interface CiBackupResult {
  requiredContinuousPowerKw: number;
  requiredPeakPowerKw: number;
  requiredEnergyKwh: number;
  
  // Atendimento com a solução recomendada / selecionada
  meetsPower: boolean;
  meetsEnergy: boolean;
  effectiveAutonomyHours: number;
  minModulesForBackup: number;
  recommendedSocReservePercent: number;
  
  // Status de contingência
  status: 'fully_covered' | 'partially_covered' | 'insufficient_power' | 'disabled';
  warningMessage?: string;
}
```

---

## 4. Motor de Cálculo e Regras de Negócio

### 4.1 Cálculo da Demanda Crítica
Se `inputMode === 'detailed'`:
$$P_{\text{contínua}} (\text{kW}) = \sum \left( \frac{\text{load.powerW} \times \text{load.quantity} \times \text{fator}}{1000} \right) \times (1 + \text{safetyMargin})$$
$$E_{\text{backup}} (\text{kWh}) = P_{\text{contínua}} \times \text{autonomyHours}$$

Se `inputMode === 'simple'`:
$$P_{\text{contínua}} = \text{targetPowerKw} \times (1 + \text{safetyMargin})$$
$$E_{\text{backup}} = P_{\text{contínua}} \times \text{autonomyHours}$$

### 4.2 Filtragem e Restrição de Combinações Válidas
Para um produto BESS C&I avaliado:
1. **Potência Nominal:**
   $$P_{\text{BESS, nom}} \ge P_{\text{contínua}}$$
   *(Se o BESS selecionado tiver potência nominal inferior às cargas críticas, a combinação é inválida para backup).*
2. **Potência de Pico/Surto:**
   $$P_{\text{BESS, pico}} \ge P_{\text{pico}}$$
3. **Módulos Mínimos para Backup ($N_{\text{min\_backup}}$):**
   $$E_{\text{útil por módulo}} = \text{capacidade\_kwh} \times (1 - \text{min\_soc} / 100) \times \eta_{\text{rt}}$$
   $$N_{\text{min\_backup}} = \left\lceil \frac{E_{\text{backup}}}{E_{\text{útil por módulo}}} \right\rceil$$

Se o dimensionamento estiver em modo `auto`, o limite inferior de módulos é ajustado:
$$\text{minModules}_{\text{efetivo}} = \max(\text{sizing.minModules}, N_{\text{min\_backup}})$$

### 4.3 Acoplamento com Despacho On-Grid (Reserva de SOC)
Se o backup estiver ativo conjuntamente com *Peak Shaving* ou *Load Shifting*, o SOC operacional mínimo durante a simulação de despacho é elevado:
$$SOC_{\text{reserva\_backup}} = \text{min\_soc} + \left( \frac{E_{\text{backup}}}{N \times \text{capacidade\_kwh}} \times 100 \right)$$
$$SOC_{\text{corte\_despacho}} = \min(100, \max(\text{min\_soc}, SOC_{\text{reserva\_backup}}))$$

Dessa forma, o sistema só realiza arbitragem/peak shaving com a **energia excedente**, preservando a contingência para quedas de energia a qualquer hora do dia.

---

## 5. Arquitetura de Interface (Frontend)

### 5.1 Permissões e Acesso
- O acesso ao backup depende de:
  ```typescript
  const canAccessCiBackup = canAccessCi && Boolean(profile?.featureFlags?.includes('ci_backup'));
  ```

### 5.2 Painéis Afetados

1. **`CiOverviewPanel.tsx`:**
   - Adicionado o card **"Falta de rede (Backup)"** no grid "Configuração do estudo" (visível apenas para `canAccessCiBackup`).
   - Mostra status: `Ativo (X kW, Y h)` ou `Pendente / Não configurado`.

2. **Novo Painel `CiBackupPanel.tsx` (ou aba dedicada no Workspace):**
   - Toggle: *Habilitar proteção para falta de rede (Backup)*.
   - Alternador de modo: *Dimensionamento Direto* vs. *Lista de Cargas Críticas*.
   - Modo Direto: Sliders/Inputs para Potência Crítica (kW) e Autonomia Desejada (h).
   - Modo Detalhado: Tabela interativa para adicionar e gerenciar cargas críticas (cópia dos padrões de `TechnicalSizingEditor`).
   - Indicador visual em tempo real: Potência e Energia totais requeridas para a emergência.

3. **`CiResultsPanel.tsx`:**
   - Card **"Confiabilidade e Backup"**:
     - Autonomia entregue pela quantidade de módulos recomendada.
     - Indicador de conformidade ($P_{\text{BESS}} \ge P_{\text{crítica}}$).
     - Alerta caso a quantidade mínima de módulos tenha sido elevada para atender à autonomia.

4. **`ci-memorial-pdf.tsx`:**
   - Adicionada a seção **"Dimensionamento para Falta de Rede e Contingência"**:
     - Resumo das cargas críticas e potência de emergência.
     - Horas de autonomia estimadas.
     - Nível de SOC reservado para operação em ilha / transição off-grid.

---

## 6. Fases de Implementação e Entregáveis

| Fase | Escopo | Entregáveis |
|---|---|---|
| **Fase B1** | Contratos, Tipos e Defaults | `types.ts`, `defaults.ts`, validação de `CiBackupConfig` |
| **Fase B2** | Motor de Dimensionamento & Reserva de SOC | Funções de cálculo de backup e ajuste do SOC mínimo em `scenarios.ts` e `engine.ts` |
| **Fase B3** | Interface de Configuração (`CiBackupPanel`) | Componente de configuração de backup, integrado ao Workspace C&I com gate por flag |
| **Fase B4** | Apresentação de Resultados e Memorial PDF | Cards em `CiResultsPanel` e seção correspondente no PDF |
| **Fase B5** | Testes Unitários e de Integração | Testes com 100% de cobertura nos cenários com e sem backup |

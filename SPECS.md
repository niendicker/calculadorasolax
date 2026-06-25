# Calculadora SolaX — Especificações do Projeto

## Visão Geral

Aplicativo Flutter desenvolvido pela **Solax Power Brasil** para dimensionamento e recomendação de sistemas híbridos de energia solar + bateria. O app guia o usuário por um wizard que coleta parâmetros de instalação e retorna a combinação ideal de inversor e bateria SolaX.

---

## Domínio

- **Setor**: Energia Renovável — Sistemas Híbridos Solar + Bateria
- **Público-alvo**: Integradores e distribuidores SolaX Brasil
- **Idiomas suportados**: Português (pt), Inglês (en), Chinês Simplificado (zh)

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Linguagem | Dart 3.0+ |
| Framework UI | Flutter (FlutterFlow) |
| Gerenciamento de estado | Provider 6.1.5 — singleton `FFAppState` |
| Navegação | GoRouter 12.1.3 |
| Backend | REST API via Xano.io |
| Banco local | SQLite (sqflite 2.3.3) |
| Persistência leve | SharedPreferences 2.5.3 |
| Gráficos | Syncfusion Flutter Charts |
| i18n | Flutter Localizations (intl) |
| Plataformas-alvo | Android, iOS, Web |

**URL base da API**: `https://xmxe-xror-gg32.n7e.xano.io/api:cIo4oCFB`

---

## Estrutura de Diretórios

```
lib/
├── main.dart                        # Ponto de entrada, MaterialApp, rotas
├── app_state.dart                   # Estado global (FFAppState)
├── app_constants.dart               # Constantes da aplicação
│
├── auth/custom_auth/                # Autenticação customizada
│
├── backend/
│   ├── api_requests/                # Chamadas de API (api_calls.dart, api_manager.dart)
│   └── schema/
│       ├── structs/                 # Modelos de dados (DtSolutionStruct, etc.)
│       └── enums/                   # Enumerações de domínio
│
├── flutter_flow/                    # Utilitários gerados pelo FlutterFlow
│   ├── flutter_flow_theme.dart
│   ├── custom_functions.dart
│   └── nav/nav.dart                 # Configuração do GoRouter
│
├── custom_code/
│   ├── actions/                     # Lógica de negócio e cálculos
│   └── widgets/                     # Widgets customizados
│
├── v1/                              # Wizard principal (Residencial + Industrial)
│   ├── pages/
│   │   ├── common/                  # Home e seleção de tipo de instalação
│   │   ├── residential/             # Etapas do wizard residencial
│   │   └── industrial/              # Etapas do wizard industrial
│   └── components/                  # Componentes reutilizáveis v1
│
└── v2/                              # Interface de simulação avançada
    ├── pages/simulation/            # Simulação em tempo real
    └── components/                  # Componentes reutilizáveis v2
```

---

## Fluxos Principais

### Residencial (v1)

```
Home (etapa_0_0)
  └── Tipo de Instalação (etapa_1_0)
        └── Topologia de Bateria (etapa_1_1)  →  HV ou LV
              └── Tipo de Rede (etapa_1_2)    →  1F / Split / 3F 220V / 3F 380V
                    └── Cargas (etapa_1_3)    →  catálogo ou entrada manual
                          ├── Erro (etapa_1_4)
                          ├── Resultado (etapa_1_5)  →  inversor + bateria recomendados
                          └── Impressão (etapa_1_6)
```

### Industrial / Comercial (v1)

```
Home → Tipo de Instalação → Parâmetros 1 (etapa_2_1) → Parâmetros 2 (etapa_2_2) → Resultado
```

### Simulação Avançada (v2)

Interface de simulação em tempo real com ajuste dinâmico de cargas e visualização do fluxo de potência (inversor, rede, PV, bateria, cargas).

---

## Modelos de Dados Principais

### Enums

| Enum | Valores |
|---|---|
| `BatteryTopology` | `HighVoltage`, `LowVoltage` |
| `ResidentialGridType` | `singlePhase_220`, `splitPhase_220`, `threePhase_220`, `threePhase_380` |
| `MicroGridOptions` | `Gerador`, `Microinversor`, `Desabilitada` |

### Structs

| Struct | Descrição |
|---|---|
| `DtSolutionStruct` | Solução recomendada (modelo de inversor, modelo de bateria, quantidade, potências, acessórios) |
| `DtResidentialOptionsStruct` | Opções selecionadas pelo usuário no wizard residencial |
| `DtIndustrialOptionsStruct` | Opções selecionadas no wizard industrial |
| `DtSimulationStruct` | Dados da simulação em tempo real com nós de fluxo de potência |
| `DtSingleLoadStruct` | Definição de uma carga individual |
| `DtComboRecomendadoStruct` | Combinação de sistema recomendada |
| `DtCatalogItemStruct` | Item do catálogo de cargas pré-definidas |

---

## Estado Global (`FFAppState`)

- Opções residenciais selecionadas pelo usuário
- Opções industriais selecionadas pelo usuário
- Catálogo de cargas pré-definidas
- Mensagens / avisos exibidos no app
- Resultado atual do cálculo
- Dados de simulação em tempo real

---

## Arquivos-chave

| Arquivo | Função |
|---|---|
| `lib/main.dart` | Inicialização, MaterialApp, bootstrap de roteamento |
| `lib/flutter_flow/nav/nav.dart` | Todas as definições de rota (GoRouter) |
| `lib/backend/api_requests/api_calls.dart` | Todos os endpoints de API |
| `lib/custom_code/actions/get_residential_solution.dart` | Motor de cálculo e integração com API para solução residencial |
| `lib/custom_code/actions/simulation_update.dart` | Atualização do estado de simulação |
| `lib/v1/pages/residential/etapa_1_5_resultado/` | Exibição dos resultados e recomendações |
| `lib/v2/pages/simulation/simulation_widget.dart` | Interface de simulação avançada |

---

## Assets

- **Fontes**: `Solax.ttf` (fonte customizada de marca)
- **Imagens**: fotos de equipamentos (inversores X1, X3, LD53, HS36; baterias; transformadores; diagramas de sistema)
- **Ícones customizados**: `custom_icons.dart` com mapeamento de ícones SolaX

---

## Convenções de Desenvolvimento

- Código gerado pelo **FlutterFlow** — não editar diretamente arquivos dentro de `flutter_flow/` sem motivo
- Lógica de negócio customizada vai em `custom_code/actions/`
- Widgets customizados vão em `custom_code/widgets/`
- Nomenclatura de páginas segue padrão `etapa_X_Y_<descricao>`
- Versão 1 (`v1/`) contém o wizard principal; versão 2 (`v2/`) contém a interface de simulação avançada

export interface GuideStep {
  id: string;
  title: string;
  summary: string;
  details: string[];
  tips?: string[];
}

export interface GuideSection {
  id: string;
  title: string;
  intro: string;
  attention?: string;
  details: string[];
  tips?: string[];
}

export interface GuideContent {
  eyebrow: string;
  title: string;
  intro: string;
  stepsTitle: string;
  steps: GuideStep[];
  sections: GuideSection[];
  faqTitle: string;
  faqs: { question: string; answer: string }[];
}

/** Content is intentionally separate from the page and components so the
 * guide can be updated without changing its layout. Add locale-specific
 * entries here as translations become available. */
export const guideContentByLocale: Record<string, GuideContent> = {
  pt: {
    eyebrow: 'Comece aqui',
    title: 'Guia básico da Calculadora SolaX',
    intro: 'Aprenda o fluxo principal para organizar um projeto e concluir uma simulação residencial dentro da Área de trabalho.',
    stepsTitle: 'Fluxo recomendado na Área de trabalho',
    steps: [
      {
        id: 'project',
        title: 'Crie ou abra um projeto',
        summary: 'A tela Projetos é o ponto de entrada para cada Área de trabalho.',
        details: [
          'Na tela Projetos, clique em “Novo projeto” ou selecione um projeto salvo.',
          'Informe o nome da instalação e, quando aplicável, vincule um cliente e preencha o endereço.',
          'Abra o “Workspace” do projeto para acessar o resumo, as cargas, a solução, o financeiro e o relatório.',
        ],
        tips: ['Use nomes que facilitem encontrar o projeto depois.'],
      },
      {
        id: 'loads',
        title: 'Configure as cargas',
        summary: 'Use a seção Cargas da Área de trabalho para descrever a instalação.',
        details: [
          'No Workspace, abra “Cargas” e adicione os equipamentos manualmente ou use um preset existente.',
          'Revise potência, quantidade, horas de uso e, quando aplicável, corrente de partida.',
          'A potência e o consumo diário calculados aparecem no resumo para conferência.',
        ],
        tips: ['Use valores próximos da realidade para obter uma recomendação útil.', 'Confira se cargas críticas estão marcadas corretamente.'],
      },
      {
        id: 'system',
        title: 'Configure o sistema',
        summary: 'A seção Visão geral reúne a rede, a bateria e os recursos do projeto.',
        details: [
          'Na “Visão geral”, abra “Configurações técnicas” para selecionar a topologia da bateria e o tipo de rede, como trifásico 380 V.',
          'Ative os recursos que fazem parte do projeto, como backup, microrrede, gerador, fotovoltaico ou tarifa branca.',
          'Os cards do Workspace indicam o que está configurado e quais recursos ainda precisam de atenção.',
        ],
        tips: ['Os modelos disponíveis são filtrados pelas combinações aprovadas do catálogo.', 'Campos adicionais aparecem conforme as funcionalidades selecionadas.'],
      },
      {
        id: 'calculate',
        title: 'Calcule a solução',
        summary: 'Conclua as configurações técnicas e execute o dimensionamento.',
        details: [
          'Na Área de trabalho, abra “Configurações técnicas”, preencha os campos obrigatórios e clique em “Calcular”.',
          'A calculadora verifica compatibilidade, potência, energia disponível e acessórios necessários.',
          'Se não houver uma combinação válida, revise as cargas, a rede e as funcionalidades escolhidas.',
        ],
      },
      {
        id: 'results',
        title: 'Revise a solução',
        summary: 'A seção Solução concentra a recomendação e os indicadores técnicos.',
        details: [
          'No Workspace, abra “Solução” e revise inversor, quantidade de baterias, energia disponível, potência nominal e potência de pico.',
          'Confira acessórios, recomendações, gráficos e observações de compatibilidade.',
          'Se a solução ficar desatualizada após uma alteração, recalcule para atualizar a recomendação.',
        ],
      },
      {
        id: 'save',
        title: 'Finalize na Área de trabalho',
        summary: 'Use Financeiro e Relatório para concluir e compartilhar o projeto.',
        details: [
          'As alterações do projeto são salvas automaticamente enquanto você trabalha na Área de trabalho.',
          'Abra “Financeiro” para revisar valores, margens, serviços e opções de cotação.',
          'Abra “Relatório” para gerar um PDF com os dados técnicos e comerciais disponíveis; com um telefone de cliente cadastrado, também é possível compartilhar a cotação pelo WhatsApp.',
        ],
        tips: ['Revise os dados antes de enviar uma cotação.'],
      },
    ],
    sections: [
      {
        id: 'microgrid',
        title: 'Microrrede',
        intro: 'A microrrede permite que o inversor híbrido mantenha um inversor on-grid funcionando durante a falta da rede, usando a saída EPS como referência de tensão e frequência.',
        attention: 'Pot. (on-grid) < Pot. (EPS) e Pot. (on-grid) < Pot. (carga da bateria).',
        details: [
          'O controle da geração do inversor on-grid é feito pela frequência da microrrede.',
          'Em sistemas de 60 Hz e com SOC abaixo de 80%, a frequência permanece em 60 Hz. Acima de 80%, ela começa a subir; acima de 90%, a elevação é acelerada para reduzir ou desligar a geração do inversor on-grid por sobrefrequência.',
          'Para sistemas de 60 Hz, o documento indica os pontos correspondentes de 61 Hz e 63 Hz. Se a capacidade de carga da bateria ficar menor que a potência do inversor on-grid, o híbrido pode elevar a frequência até 63 Hz para limitar sua geração.',
          'Limitações de carga da bateria causadas pelo SOC, pela temperatura ou por outros fatores podem impedir a operação normal da microrrede.',
        ],
        tips: ['O híbrido forma a rede e controla o inversor on-grid pela frequência, elevando-a conforme o SOC aumenta para evitar excesso de geração.'],
      },
    ],
    faqTitle: 'Dúvidas comuns',
    faqs: [
      {
        question: 'Por que não aparece uma solução?',
        answer: 'Verifique se há cargas, bateria, rede e funcionalidades compatíveis. Também confira se os valores de potência e consumo estão coerentes.',
      },
      {
        question: 'O resultado substitui um projeto elétrico?',
        answer: 'Não. A calculadora é uma ferramenta de apoio. O resultado deve ser revisado por um profissional habilitado e confrontado com as condições reais da instalação.',
      },
    ],
  },
};

export function getGuideContent(locale: string): GuideContent {
  return guideContentByLocale[locale] ?? guideContentByLocale.pt;
}

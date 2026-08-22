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
    intro: 'Aprenda o fluxo principal para criar uma simulação residencial completa, do projeto ao resultado.',
    stepsTitle: 'Fluxo recomendado',
    steps: [
      {
        id: 'project',
        title: 'Crie ou abra um projeto',
        summary: 'Comece pela aba Projeto para organizar a simulação.',
        details: [
          'Clique em “Nova simulação” e informe um nome para identificar o projeto.',
          'Você pode vincular um cliente já cadastrado ou criar o cadastro durante o fluxo.',
          'Se preferir conhecer a ferramenta antes de preencher tudo, use o exemplo demonstrativo.',
        ],
        tips: ['Uma simulação demo não é salva como projeto real.', 'Use nomes que facilitem encontrar o projeto depois.'],
      },
      {
        id: 'loads',
        title: 'Informe as cargas',
        summary: 'Descreva os equipamentos que o sistema precisa atender.',
        details: [
          'Na aba Dimensionamento, adicione as cargas manualmente ou use um preset de cargas já existente.',
          'Revise potência, quantidade, horas de uso e, quando aplicável, corrente de partida.',
          'A potência e o consumo diário calculados aparecem no resumo para conferência.',
        ],
        tips: ['Use valores próximos da realidade para obter uma recomendação útil.', 'Confira se cargas críticas estão marcadas corretamente.'],
      },
      {
        id: 'system',
        title: 'Escolha o sistema',
        summary: 'Configure a rede elétrica, bateria e funcionalidades desejadas.',
        details: [
          'Selecione a topologia da bateria, como alta tensão (HV) ou baixa tensão (LV).',
          'Informe o tipo de rede, por exemplo trifásico 380 V.',
          'Ative recursos como backup, microrrede, gerador, fotovoltaico ou tarifa branca quando fizerem parte do projeto.',
        ],
        tips: ['Os modelos disponíveis são filtrados pelas combinações aprovadas do catálogo.', 'Campos adicionais aparecem conforme as funcionalidades selecionadas.'],
      },
      {
        id: 'calculate',
        title: 'Clique em Calcular',
        summary: 'O motor usa as mesmas regras técnicas de uma simulação real.',
        details: [
          'Quando os campos obrigatórios estiverem preenchidos, clique em “Calcular”.',
          'A calculadora verifica compatibilidade, potência, energia disponível e acessórios necessários.',
          'Se não houver uma combinação válida, revise as cargas, a rede e as funcionalidades escolhidas.',
        ],
      },
      {
        id: 'results',
        title: 'Analise o resultado',
        summary: 'Confira a solução recomendada e os indicadores técnicos.',
        details: [
          'Revise inversor, quantidade de baterias, energia disponível, potência nominal e potência de pico.',
          'Confira acessórios, recomendações, gráficos e observações de compatibilidade.',
          'Em telas menores, use o botão de resumo para abrir os resultados sem sair da etapa atual.',
        ],
      },
      {
        id: 'save',
        title: 'Salve ou compartilhe',
        summary: 'Finalize o trabalho gerando um relatório ou compartilhando a cotação.',
        details: [
          'Simulações normais são salvas automaticamente enquanto você trabalha no dimensionamento.',
          'Use “Baixar relatório” para gerar um PDF com os dados técnicos e comerciais disponíveis.',
          'Se houver um cliente com telefone cadastrado, você poderá compartilhar a cotação pelo WhatsApp.',
        ],
        tips: ['Revise os dados antes de enviar uma cotação.', 'O modo demo precisa ser convertido em nova simulação antes de salvar.'],
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
        question: 'O exemplo preenchido altera ou salva meus projetos?',
        answer: 'Não. O exemplo usa dados fictícios, não executa o salvamento automático e pode ser encerrado pelo botão “Sair do exemplo”.',
      },
      {
        question: 'Posso editar os dados do exemplo?',
        answer: 'Sim. Todos os campos continuam editáveis. Para transformar o conteúdo em uma simulação própria, escolha “Usar como nova simulação”.',
      },
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

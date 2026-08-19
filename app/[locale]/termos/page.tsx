import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de Uso | Calculadora SolaX',
  description: 'Termos de Uso da Calculadora SolaX.',
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground sm:px-10">
      <Link href={`/${locale}`} className="text-sm font-medium text-primary hover:underline">
        ← Voltar
      </Link>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Termos de Uso</h1>
      <p className="mt-1 text-xs text-muted-foreground">Última atualização: 19 de agosto de 2026.</p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">1. Sobre este documento</h2>
          <p className="mt-2 text-muted-foreground">
            Estes Termos de Uso regulam o acesso e a utilização da Calculadora SolaX (&quot;plataforma&quot;),
            disponibilizada por <strong>SOLAX POWER BRASIL NETWORK ENERGY CO. LTDA</strong> (&quot;nós&quot;).
            O cadastro exige o aceite
            destes Termos e da Política de Privacidade. Ao utilizar a plataforma após o aceite, você concorda
            com estes termos na versão apresentada. A plataforma é destinada a integradores e empresas que atuam
            ou pretendem atuar com soluções de energia solar e armazenamento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. O que a plataforma faz</h2>
          <p className="mt-2 text-muted-foreground">
            A plataforma auxilia no dimensionamento de sistemas de energia solar híbridos, permitindo simular
            cenários de consumo, cadastrar clientes e projetos, gerar relatórios técnicos, consultar tarifas,
            compartilhar uma cotação por link e, quando disponível, solicitar cotações ou pedidos de compra a
            fornecedores. A plataforma é uma ferramenta de apoio e não substitui projeto, validação ou instalação
            por profissional habilitado. Atualmente, o acesso é disponibilizado sem cobrança de assinatura ou
            tarifa de uso. Qualquer cobrança futura dependerá de comunicação prévia e de condições comerciais
            específicas aplicáveis ao serviço.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Cadastro e responsabilidades do usuário</h2>
          <p className="mt-2 text-muted-foreground">
            Você é responsável por manter a confidencialidade da sua senha, por todas as atividades realizadas
            na sua conta e pela exatidão dos dados inseridos. Ao cadastrar dados de clientes, você deve ter base
            legal e fornecer as informações exigidas pela legislação aplicável. Na medida em que tratar esses
            dados para seus próprios fins, você será responsável pelas decisões sobre o tratamento; a plataforma
            os armazena e processa para disponibilizar as funcionalidades contratadas, conforme a Política de
            Privacidade e as instruções aplicáveis. O preenchimento de nome, endereço e documento da empresa é
            opcional, mas pode ser necessário para gerar relatórios ou solicitar cotações com informações
            comerciais completas. O cadastro deve ser realizado por pessoa com capacidade legal ou por
            representante autorizado da empresa. A plataforma não é destinada a menores de 18 anos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Precisão dos resultados</h2>
          <p className="mt-2 text-muted-foreground">
            As combinações, tarifas e dimensionamentos sugeridos pela plataforma dependem dos dados inseridos,
            do catálogo e das regras disponíveis no momento do cálculo. São apoio à decisão técnica e não
            substituem conferência de normas, condições locais, projeto elétrico ou avaliação de profissional
            habilitado antes da instalação de um sistema real. Não garantimos que uma combinação esteja sempre
            disponível, adequada a toda condição de campo ou livre de alterações no catálogo do fornecedor.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Propriedade intelectual</h2>
          <p className="mt-2 text-muted-foreground">
            O software, a interface, o catálogo, as regras de compatibilidade, as marcas e os materiais fornecidos
            pela plataforma pertencem a <strong>SOLAX POWER BRASIL NETWORK ENERGY CO. LTDA</strong> ou a seus
            licenciantes. O usuário recebe
            apenas uma autorização limitada para utilizar a plataforma conforme estes Termos. Os dados e conteúdos
            inseridos pelo usuário permanecem de sua responsabilidade, sem prejuízo dos direitos de terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Encerramento de conta</h2>
          <p className="mt-2 text-muted-foreground">
            Você pode encerrar sua conta a qualquer momento pela página de Perfil. Podemos suspender ou encerrar
            contas em caso de fraude, abuso, tentativa de acesso indevido, violação destes Termos, risco de
            segurança ou determinação legal. O encerramento não elimina obrigações que, por sua natureza, devam
            continuar, nem remove pedidos de compra que precisem ser mantidos sem o vínculo pessoal do usuário
            para preservar o histórico transacional ou cumprir obrigações legais.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Uso aceitável e compartilhamento</h2>
          <p className="mt-2 text-muted-foreground">
            É proibido usar a plataforma para inserir dados ilícitos, violar direitos de terceiros, tentar burlar
            controles de acesso, explorar vulnerabilidades, automatizar consultas abusivas, copiar o catálogo ou
            utilizar os resultados para finalidade incompatível com estes Termos. Links públicos de cotação devem
            ser compartilhados somente com os destinatários pretendidos; quem receber o link poderá visualizar o
            snapshot disponibilizado por até 7 dias após a criação do link e responder conforme a funcionalidade
            existente. Ao solicitar uma cotação ou pedido de compra, o usuário autoriza o compartilhamento dos
            dados necessários do projeto, empresa, contato e endereço de entrega ou instalação com o fornecedor
            selecionado. Após sete dias, o link público deixa de estar disponível.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Alterações destes termos</h2>
          <p className="mt-2 text-muted-foreground">
            Podemos atualizar estes termos periodicamente. A versão vigente será disponibilizada nesta página e
            alterações relevantes poderão ser comunicadas pelos canais disponíveis. O sistema registra atualmente
            a data e a versão dos documentos aceitos, para solicitar nova revisão quando a versão vigente mudar.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Lei aplicável</h2>
          <p className="mt-2 text-muted-foreground">
            Estes termos são regidos pela legislação brasileira, incluindo a Lei Geral de Proteção de Dados
            (Lei nº 13.709/2018).
          </p>
        </section>

        <section>
          <p className="text-muted-foreground">
            Veja também a nossa{' '}
            <Link href={`/${locale}/privacidade`} className="font-medium text-primary hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

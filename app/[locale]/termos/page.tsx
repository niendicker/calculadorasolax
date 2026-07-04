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

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
        <strong>Rascunho.</strong> Este texto foi gerado como ponto de partida e ainda precisa de revisão jurídica
        antes de ser considerado a versão oficial dos Termos de Uso.
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Termos de Uso</h1>
      <p className="mt-1 text-xs text-muted-foreground">Última atualização: a definir.</p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">1. Sobre este documento</h2>
          <p className="mt-2 text-muted-foreground">
            Estes Termos de Uso regulam o acesso e a utilização da Calculadora SolaX (&quot;plataforma&quot;),
            disponibilizada pela SolaX Power Brasil (&quot;nós&quot;). Ao criar uma conta ou utilizar a
            plataforma, você concorda com estes termos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. O que a plataforma faz</h2>
          <p className="mt-2 text-muted-foreground">
            A plataforma auxilia no dimensionamento de sistemas de energia solar híbridos, permitindo simular
            cenários de consumo, cadastrar clientes e projetos, e gerar relatórios técnicos com as combinações
            de equipamentos recomendadas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Cadastro e responsabilidades do usuário</h2>
          <p className="mt-2 text-muted-foreground">
            Você é responsável por manter a confidencialidade da sua senha e por todas as atividades realizadas
            na sua conta. Os dados que você cadastra sobre seus próprios clientes (nome, contato, documento)
            são de sua responsabilidade enquanto controlador desses dados perante a LGPD; a plataforma atua
            como operadora, armazenando essas informações para viabilizar o seu uso do serviço.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Precisão dos resultados</h2>
          <p className="mt-2 text-muted-foreground">
            As combinações e dimensionamentos sugeridos pela plataforma são um apoio à decisão técnica e não
            substituem a avaliação de um profissional habilitado antes da instalação de um sistema real.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Propriedade intelectual</h2>
          <p className="mt-2 text-muted-foreground">
            O catálogo de produtos, as regras de compatibilidade e o software da plataforma pertencem à SolaX
            Power Brasil ou a seus licenciantes, e não podem ser reproduzidos sem autorização.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Encerramento de conta</h2>
          <p className="mt-2 text-muted-foreground">
            Você pode encerrar sua conta a qualquer momento pela página de Perfil. Podemos suspender contas que
            violem estes termos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Alterações destes termos</h2>
          <p className="mt-2 text-muted-foreground">
            Podemos atualizar estes termos periodicamente. Alterações relevantes serão comunicadas e poderão
            exigir um novo aceite para continuar usando a plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Lei aplicável</h2>
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

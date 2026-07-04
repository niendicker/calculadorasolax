import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Calculadora SolaX',
  description: 'Política de Privacidade da Calculadora SolaX.',
};

export default async function PrivacyPage({
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
        <strong>Rascunho.</strong> Este texto foi gerado como ponto de partida, cobrindo as seções exigidas pela
        LGPD, e ainda precisa de revisão jurídica antes de ser considerado a versão oficial da Política de
        Privacidade.
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mt-1 text-xs text-muted-foreground">Última atualização: a definir.</p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">1. Quem somos (controlador dos dados)</h2>
          <p className="mt-2 text-muted-foreground">
            A Calculadora SolaX é operada pela SolaX Power Brasil, controladora dos dados pessoais tratados
            para viabilizar o cadastro e o uso da plataforma, nos termos da Lei nº 13.709/2018 (LGPD).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Quais dados coletamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong>Dados de cadastro:</strong> nome, email, telefone e, opcionalmente, nome/endereço da empresa e logomarca (usados no relatório técnico gerado).</li>
            <li><strong>Dados de clientes cadastrados por você:</strong> nome, email, telefone e CPF/CNPJ dos seus próprios clientes, quando você opta por registrá-los para vincular a projetos.</li>
            <li><strong>Dados de uso:</strong> configurações de simulação (rede, cargas, topologia) e as combinações de equipamentos recomendadas, para fins de suporte técnico e métricas agregadas de uso da plataforma.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Para que usamos esses dados (finalidade e base legal)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Viabilizar o login, o dimensionamento e a geração de relatórios — <strong>execução de contrato</strong>.</li>
            <li>Preencher automaticamente dados do cliente/empresa em relatórios que você gera — <strong>execução de contrato</strong>.</li>
            <li>Entender como a plataforma é usada, para priorizar melhorias (ex.: quais inversores/baterias são mais recomendados) — <strong>legítimo interesse</strong>, sempre limitado ao necessário.</li>
            <li>Cumprir obrigações legais e responder a solicitações de autoridades, quando aplicável.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Com quem compartilhamos</h2>
          <p className="mt-2 text-muted-foreground">
            Utilizamos fornecedores de infraestrutura (hospedagem e banco de dados) que atuam como operadores
            dos dados, seguindo nossas instruções e sob obrigações contratuais de confidencialidade e
            segurança. Não vendemos dados pessoais a terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Por quanto tempo guardamos os dados</h2>
          <p className="mt-2 text-muted-foreground">
            Mantemos os dados enquanto sua conta estiver ativa. Ao excluir sua conta, seus dados de cadastro,
            clientes, projetos e cargas pessoais são apagados de forma definitiva. Dados de uso agregados,
            sem identificação, podem ser mantidos para fins estatísticos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Seus direitos como titular</h2>
          <p className="mt-2 text-muted-foreground">Nos termos do art. 18 da LGPD, você pode, a qualquer momento:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Confirmar e acessar os dados que temos sobre você (página de Perfil).</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados (página de Perfil).</li>
            <li>Solicitar a portabilidade dos seus dados a outro fornecedor.</li>
            <li>Excluir sua conta e os dados vinculados a ela, diretamente pela página de Perfil.</li>
            <li>Revogar o consentimento e se opor a tratamentos baseados em legítimo interesse.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Segurança</h2>
          <p className="mt-2 text-muted-foreground">
            Aplicamos controles de acesso (cada usuário só acessa os próprios clientes, projetos e cargas) e
            conexões criptografadas para proteger os dados armazenados.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Cookies</h2>
          <p className="mt-2 text-muted-foreground">
            Usamos apenas cookies estritamente necessários para manter sua sessão autenticada. Não usamos
            cookies de rastreamento ou publicidade.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Contato do encarregado (DPO)</h2>
          <p className="mt-2 text-muted-foreground">
            Para exercer seus direitos ou tirar dúvidas sobre este documento, entre em contato através do
            canal informado no rodapé da plataforma. <em>(Contato do encarregado a definir.)</em>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">10. Alterações desta política</h2>
          <p className="mt-2 text-muted-foreground">
            Esta política pode ser atualizada periodicamente. Alterações relevantes serão comunicadas e
            poderão exigir um novo aceite.
          </p>
        </section>

        <section>
          <p className="text-muted-foreground">
            Veja também os nossos{' '}
            <Link href={`/${locale}/termos`} className="font-medium text-primary hover:underline">
              Termos de Uso
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

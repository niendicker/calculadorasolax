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

      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mt-1 text-xs text-muted-foreground">Última atualização: 19 de agosto de 2026.</p>

      <div className="mt-8 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">1. Quem somos (controlador dos dados)</h2>
          <p className="mt-2 text-muted-foreground">
            A Calculadora SolaX é operada por <strong>SOLAX POWER BRASIL NETWORK ENERGY CO. LTDA</strong>,
            inscrita no CNPJ sob nº <strong>55.595.619/0001-88</strong>, com endereço na <strong>Av. Paulista,
            2202, Bela Vista, São Paulo - SP</strong>. A empresa é a controladora
            dos dados pessoais tratados para viabilizar o cadastro e o uso da plataforma, nos termos da Lei
            nº 13.709/2018 (LGPD).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Quais dados coletamos</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong>Dados de cadastro:</strong> nome, email, telefone e senha de acesso; a senha é processada pelo serviço de autenticação e não é exibida pela plataforma.</li>
            <li><strong>Dados da empresa:</strong> nome, CNPJ/CPF informado, endereço e logomarca, quando cadastrados para aparecer em relatórios ou solicitações de cotação.</li>
            <li><strong>Dados de clientes cadastrados por você:</strong> nome, email, telefone, documento e observações, quando você opta por registrá-los para vincular a projetos.</li>
            <li><strong>Dados de projetos:</strong> nome, endereço de instalação, observações, cargas, configurações de dimensionamento, solução calculada, serviços e status da cotação.</li>
            <li><strong>Dados de uso e operação:</strong> configurações de simulação, combinações recomendadas, eventos de projeto, pedidos de compra, logs administrativos e informações técnicas necessárias para suporte e segurança.</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            A plataforma não é direcionada a menores de 18 anos. Caso identifiquemos cadastro ou tratamento
            incompatível com essa regra, poderemos solicitar a correção ou remover os dados correspondentes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Para que usamos esses dados (finalidade e base legal)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Viabilizar o login, o dimensionamento e a geração de relatórios (<strong>execução de contrato</strong>).</li>
            <li>Preencher automaticamente dados do cliente/empresa em relatórios que você gera (<strong>execução de contrato</strong>).</li>
            <li>Entender como a plataforma é usada, para priorizar melhorias (ex.: quais inversores e baterias são mais recomendados), com base em <strong>legítimo interesse</strong>, sempre limitado ao necessário e sem registrar o nome do cliente nas métricas de simulação.</li>
            <li>Enviar, quando solicitado pelo usuário, pedidos de cotação e pedidos de compra aos fornecedores selecionados, por email ou integração técnica.</li>
            <li>Disponibilizar links públicos de cotação com um snapshot do projeto e permitir que o destinatário aceite ou recuse a cotação.</li>
            <li>Manter links públicos de cotação disponíveis por até 7 dias após sua criação, salvo resposta anterior ou exclusão do projeto.</li>
            <li>Consultar dados públicos de tarifas e distribuidoras para preencher informações do dimensionamento.</li>
            <li>Cumprir obrigações legais e responder a solicitações de autoridades, quando aplicável.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Com quem compartilhamos</h2>
          <p className="mt-2 text-muted-foreground">
            Utilizamos fornecedores de infraestrutura, autenticação, banco de dados, armazenamento de arquivos,
            envio de emails, consulta de tarifas e integrações com fornecedores. Esses prestadores tratam os
            dados conforme a finalidade do serviço e as instruções aplicáveis. Quando o usuário solicita uma
            cotação ou pedido de compra, os dados necessários do projeto, da empresa, do contato do solicitante
            e, quando aplicável, do endereço de entrega ou instalação podem ser compartilhados com o fornecedor
            selecionado. O compartilhamento é limitado ao necessário para atender à solicitação. Não vendemos
            dados pessoais a terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Por quanto tempo guardamos os dados</h2>
          <p className="mt-2 text-muted-foreground">
            Mantemos os dados enquanto a conta e as finalidades relacionadas estiverem ativas. Ao excluir a
            conta, os dados próprios da conta, clientes, projetos e cargas pessoais são removidos conforme as
            relações do banco de dados; arquivos de logomarca também são removidos em modo best-effort. Pedidos
            de compra permanecem sem o vínculo pessoal do usuário para preservar o histórico transacional.
            Backups, logs técnicos, registros administrativos e obrigações legais podem exigir retenção adicional
            pelo tempo necessário. Dados agregados ou anonimizados podem ser mantidos para fins estatísticos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Seus direitos como titular</h2>
          <p className="mt-2 text-muted-foreground">Nos termos do art. 18 da LGPD, você pode, a qualquer momento:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Confirmar e acessar os dados que temos sobre você (página de Perfil).</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados (página de Perfil).</li>
            <li>Solicitar informações e, quando aplicável, a portabilidade dos seus dados a outro fornecedor pelo email de privacidade; a plataforma não oferece atualmente uma exportação automática na tela de Perfil.</li>
            <li>Excluir sua conta e os dados vinculados a ela, diretamente pela página de Perfil.</li>
            <li>Revogar o consentimento e se opor a tratamentos baseados em legítimo interesse.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Segurança</h2>
          <p className="mt-2 text-muted-foreground">
            Aplicamos autenticação, políticas de acesso por usuário e por papel, controles administrativos,
            validação server-side, conexões criptografadas e políticas de Storage para reduzir o risco de acesso
            não autorizado. Nenhum serviço conectado à internet pode garantir segurança absoluta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Cookies</h2>
          <p className="mt-2 text-muted-foreground">
            Usamos cookies estritamente necessários para manter a sessão autenticada. A aplicação também pode
            usar armazenamento local do navegador para manter temporariamente métricas pendentes quando o envio
            falha. Não utilizamos ferramentas externas de analytics, publicidade ou rastreamento comportamental,
            nem cookies destinados a esses fins.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Contato do encarregado (DPO)</h2>
          <p className="mt-2 text-muted-foreground">
            Para exercer seus direitos ou tirar dúvidas sobre este documento, entre em contato pelo canal
            <strong>marcelo.grando@solaxpower.com</strong>. O encarregado pelo tratamento de dados é
            <strong>Marcelo Grando</strong>, que pode ser contatado pelo mesmo endereço de email.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">10. Alterações desta política</h2>
          <p className="mt-2 text-muted-foreground">
            Esta política pode ser atualizada periodicamente. A versão vigente será disponibilizada nesta página
            e alterações relevantes poderão ser comunicadas pelos canais disponíveis. O sistema registra atualmente
            a data do aceite, sem controle de versão individual do documento aceito.
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

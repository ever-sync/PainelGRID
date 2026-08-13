# Autenticacao, Usuarios e Clientes

## Responsabilidade

Controla identidade, sessão, recuperação de acesso, papéis, permissões, clientes, equipe e credenciais de integração.

## Componentes

- API: `auth`, `users`, `clients`, `client-staff`, `integration-credentials` e permissões.
- Frontend: rotas protegidas e guards por papel.
- Persistência: `User`, `Client`, `IntegrationCredential` e vínculos de equipe.

## Perfis

Consulte [[Perfis e Permissoes]]. O frontend separa experiências de gestor, cliente, vendedor e recepção, mas a autorização definitiva deve ocorrer na API.

## Sessão

- Access token curto e mecanismo de renovação.
- Logout apenas quando refresh for inválido/expirado ou revogado.
- Requisições concorrentes durante renovação devem compartilhar a mesma promessa para evitar logout em cascata.

## Segurança

- Segredos nunca entram no repositório ou nas notas.
- Credenciais externas devem ser criptografadas/isoladas e rotacionáveis.
- Endpoints de automação usam chave própria e escopo de cliente.
- 2FA deve ser configurável, não removido sem avaliação de risco.


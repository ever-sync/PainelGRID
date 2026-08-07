# Rubinho v1 — baseline congelada

Data do congelamento: 06/08/2026  
Workflow n8n: `Rubinho v1`  
Workflow ID: `MWIRTrZl44bVjTZW`  
Versão ativa: `a1358b29-57c5-44c4-8fbf-8194c4e89392`  
Quantidade de nós: `75`  
SHA-256 da estrutura: `0b56a00a6811286e8c921054e83fed7d36a01168ed0f8fe76f8155472e342a96`

## Regra operacional

Este workflow permanece ativo para atender a operação atual. O desenvolvimento da nova arquitetura deve acontecer exclusivamente em outro workflow, denominado `Rubinho v2`.

Não alterar no Rubinho v1 durante a construção do v2:

- nós e conexões;
- prompts;
- credenciais;
- gatilhos;
- ferramentas do agente;
- regras de validação;
- cliente, evento ou número do WhatsApp.

Uma alteração emergencial no v1 deve ser documentada, testada isoladamente e gerar uma nova baseline antes da publicação.

## Critério de integridade

O v1 está íntegro quando:

- permanece ativo;
- `versionId` e `activeVersionId` são iguais;
- possui 75 nós;
- a estrutura produz o SHA-256 registrado acima.

## Rubinho v2

Criado em 06/08/2026 como cópia estrutural do Rubinho v1.

- Workflow: `Rubinho v2`
- Workflow ID: `rQ92Kohukkw7X7ex`
- Versão inicial: `b6a533c8-adb8-4af6-acd9-5897ea0c0d2d`
- Estado inicial: desativado
- Quantidade inicial de nós: 75

O v2 deve permanecer desativado durante a construção e os testes isolados. Sua ativação exigirá uma fase específica de liberação controlada.

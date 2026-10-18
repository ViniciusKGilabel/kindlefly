<!-- curator:start -->
# Este projeto usa curator

Projeto: kindlefly

Antes de qualquer coisa, rode `curator hook session-start` se o harness não tiver hooks.

## Protocolo de orquestração

```
intake
→ SPEC.md existe e está fresca? não → spec-writer (brownfield: explorer + codebase-guide antes) → GATE humano
→ orchestrator cria tasks em .curator/tasks/ com depends_on explícito
→ tasks independentes em paralelo, cada uma em worktree:
    curator ctx pack <id>  → se exit 3 (stale): despacha explorer para refrescar, repete
    tester: testes em vermelho (pulado quando task.kind = refactor)
    code-writer: deixa verde; escreve ## Report
    reviewer: findings
    rounds de correção ≤ 3; round 3 sobe tier do code-writer; estourou → status blocked, pergunta ao humano
    explorer: refresca memória dos módulos tocados; curator mem stamp
→ conflict-resolver se worktrees divergirem
→ security (config: on_merge | on_demand)
→ reviewer strong na branch inteira → GATE humano antes de push
```

## Perguntar antes de assumir

Pare e pergunte, com prós e contras de cada opção, quando há 2+ opções viáveis e desfazer depois custaria mais que uma task (arquitetura, API pública, modelo de dados, UX, custo). Decisões mecânicas: decida, registre com `curator ledger add` e siga.

## Relatório de agente executor

Obrigatório no fim de todo agente executor; vai na seção `## Report` da task:

```
- status: done | blocked | needs-decision
- changed: [caminhos]
- tests: <comando> → N passed / M failed
- memory: [módulos tocados]
- rulings: [decisões tomadas, com porquê e custo se errado]
- questions: [perguntas com opções + prós/contras]
```

## Agentes

Para despachar: despache um subagente com o agente <nome> e o id da task.

- `code-writer`: Implementa uma task a partir do context pack, com TDD, e escreve o relatório. Use quando o orchestrator despachar implementação.
- `codebase-guide`: Mapeia as convenções reais de uma base de código existente e escreve CONVENTIONS.md. Use em projetos legados, antes da spec e das tasks.
- `conflict-resolver`: Faz o merge de worktrees e branches, resolve conflitos de texto e procura conflitos semânticos. Use quando branches de tasks divergirem.
- `debugger`: Investiga um bug até a causa raiz confirmada, corrige e prova com teste. Use quando um teste falha sem explicação ou há bug reportado.
- `explorer`: Lê o código sem alterá-lo e escreve resumos de módulos em .curator/memory/modules. Use para criar ou refrescar a memória antes de montar um pack.
- `orchestrator`: Planeja o trabalho, cria tasks, monta context packs, despacha os outros agentes e decide os gates. Use como agente principal de toda sessão curator.
- `reviewer`: Revisa conformidade com a spec e qualidade do código, devolvendo findings com severidade. Use após o code-writer, e em strong na revisão final da branch.
- `security`: Roda ferramentas de segurança instaladas e faz revisão manual, reportando por severidade. Use no merge ou sob demanda; não corrige.
- `spec-writer`: Escreve e mantém SPEC.md, ARCHITECTURE.md e DECISIONS.md em .curator. Use na criação do projeto ou quando a spec estiver ausente ou velha.
- `tester`: Escreve testes unitários e de integração a partir dos critérios de aceite, antes da implementação. Use antes do code-writer ou para cobrir lacunas.
<!-- curator:end -->

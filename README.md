# Croqui Pro

App de croqui de campo: o técnico desenha o trajeto do cabo, marca postes e caixas, informa a metragem e gera o PDF de medição.

## Como usar no celular

1. Abra o link do app no Chrome, **com internet**, pelo menos uma vez.
2. No menu do Chrome, toque em **Instalar app** (ou **Adicionar à tela inicial**).
3. Pronto: o app abre pelo ícone, em tela cheia, e funciona **sem internet**.

O croqui é salvo sozinho no celular a cada alteração. Se o app fechar, ao abrir de novo está tudo lá. Ele só é apagado no botão **Novo**.

## Versão 2 (outubro de 2026): o que mudou

- **Toque com encaixe:** não precisa mirar na bolinha cinza, o toque vai para o ponto mais próximo.
- **Arrastar em qualquer lugar**, inclusive no modo cabo. A pinça de zoom nunca vira toque.
- **Metragem obrigatória a cada trecho**, com botões grandes (20 a 80m) ou valor digitado. Acabou o "40m automático".
- **Salvamento automático** do desenho, dos dados da OS e dos materiais.
- **Perfil do técnico:** nome, RE e placa ficam guardados para as próximas OS.
- **Funciona offline** e pode ser instalado na tela inicial.
- **App mais leve:** a grade deixou de ser 3.600 objetos.
- Correções: toques duplicados depois de girar a tela, retirada de cabo duplicada ao gerar o PDF duas vezes, nome do PDF com "/" e erros no HTML.

## Versão antiga

A versão anterior a essas mudanças está guardada no branch **`versao-original`**.

Para voltar o site para ela sem perder o histórico, no computador:

```bash
git checkout main
git revert --no-edit origin/versao-original..HEAD
git push
```

## Atualizando o app

Depois de mudar algum arquivo, aumente o número de `VERSAO` no começo do `sw.js` (por exemplo, `croqui-v2.0.1`). Assim os celulares descartam a cópia antiga guardada.

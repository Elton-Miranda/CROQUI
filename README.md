# Croqui Pro

App de croqui de campo: o técnico desenha o trajeto do cabo, marca postes e caixas, informa a metragem e gera o PDF de medição.

## Como usar no celular

1. Abra o link do app no Chrome, **com internet**, pelo menos uma vez.
2. No menu do Chrome, toque em **Instalar app** (ou **Adicionar à tela inicial**).
3. Pronto: o app abre pelo ícone, em tela cheia, e funciona **sem internet**.

O croqui é salvo sozinho no celular a cada alteração. Se o app fechar, ao abrir de novo está tudo lá. Ele só é apagado no botão **Novo**.

## Mapear com GPS (pré-mapeamento)

O jeito mais rápido de fazer o croqui é não desenhar:

1. **Antes de lançar o cabo**, toque em **🗺️ Mapear** e ande pelo trajeto.
2. Em cada poste, aperte **📍 Poste aqui**. O GPS marca o ponto e o celular vibra.
3. No poste que tiver caixa, toque em **CTOP** (escolhendo o tipo), **CEO** ou **Subida**. Material gasto vai em **Material**.
4. A metragem de cada trecho é sugerida pela distância do mapa mais 5% de folga. Toque no trecho para corrigir.
5. No fim, **✅ Gerar croqui**: o app faz o desenho no formato de sempre. Depois é só gerar o PDF.

**Fora do local** (ou sem GPS): digite rua, número e cidade na busca, arraste o mapa até a mira vermelha ficar no poste e aperte **✛ Poste na mira**.

**Mapeamento feito por outra pessoa:** no mapa, menu **⋯ > Compartilhar mapeamento**. Quem recebe o link pelo WhatsApp abre no celular e o mapeamento entra pronto no app.

**No PDF**, o croqui gerado do mapa sai desenhado em cima do mapa simples da região (quarteirões, ruas e nomes), com legenda e norte. **Para a fiscalização**, o PDF ganha ainda duas páginas: o mapa real com o trajeto e uma tabela com as coordenadas, a precisão do GPS e o horário de cada ponto, com link para o Google Maps.

O mapa e a busca de endereço precisam de internet. Os trechos de mapa já vistos ficam guardados no celular. Sem sinal numa região nova, use o modo com a grade, que funciona sempre.

## Versão 2 (outubro de 2026): o que mudou

- **Toque com encaixe:** não precisa mirar na bolinha cinza, o toque vai para o ponto mais próximo.
- **Arrastar em qualquer lugar**, inclusive no modo cabo. A pinça de zoom nunca vira toque.
- **Metragem obrigatória a cada trecho**, com botões grandes (20 a 80m) ou valor digitado. Acabou o "40m automático".
- **Salvamento automático** do desenho, dos dados da OS e dos materiais.
- **Perfil do técnico:** nome, RE e placa ficam guardados para as próximas OS.
- **Funciona offline** e pode ser instalado na tela inicial.
- **App mais leve:** a grade deixou de ser 3.600 objetos.
- **Mapear com GPS**, busca de endereço, croqui gerado sozinho, compartilhamento por link e páginas de fiscalização no PDF (ver acima).
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

Depois de mudar algum arquivo, aumente o número de `VERSAO` no começo do `sw.js` (por exemplo, `croqui-v2.2.1`). Assim os celulares descartam a cópia antiga guardada.

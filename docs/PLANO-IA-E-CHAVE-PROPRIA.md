# IA padrão e chave própria

**Status:** ideia para etapa futura, registrada em 7 de novembro de 2026.

- Manter a IA do OCTOR como padrão. A equipe pode gerar instruções para todos os passos de um guia sem configurar uma chave. A integração usa a conta do OCTOR, com limite de uso por espaço de trabalho.
- Priorizar a geração em lote e a revisão das instruções antes da publicação. O OCTOR define o formato e o nível de detalhe de cada passo em ambos os modos.
- Em uma etapa futura, oferecer **Configurações → Inteligência artificial** ao administrador do espaço de trabalho para cadastrar, testar e ativar uma chave própria. O botão de geração permanece o mesmo e, nesse modo, as chamadas consomem a cota da conta configurada.
- Armazenar a chave criptografada no servidor e manter seu valor fora do navegador, da extensão e das respostas da API.
- Se a chave própria falhar, informar o erro e preservar as instruções já geradas. A volta para a IA padrão exige escolha explícita do administrador, pois muda a conta que consome a cota.

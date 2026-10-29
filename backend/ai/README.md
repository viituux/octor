# Geração de instruções por captura

No editor, cada captura possui um prompt e o botão **Gerar passo detalhado**. A solicitação combina o prompt, a imagem, o título do guia e os metadados da ação. Somente o passo escolhido é atualizado. O texto e o prompt usado são salvos; os demais passos permanecem intactos. Revise a saída antes de compartilhar.

Orientação automática: o campo é preenchido com um texto específico para o número do passo, título do guia, ação, elemento registrado, disponibilidade da captura e da narração. A sugestão é montada a partir desses dados sem uma chamada adicional ao provedor. Ela não interpreta os pixels; a análise da imagem acontece ao gerar a instrução. Ajustes manuais são preservados. A opção Usar sugestão automática restaura o modo automático na próxima geração.

Referência genérica para guias antigos:
> Explique detalhadamente este passo em português brasileiro para alguém que está usando o sistema pela primeira vez. Diga onde agir, o que fazer e qual é o objetivo da ação. Use apenas informações visíveis na captura e na ação registrada; não invente campos, resultados ou etapas.

## Configuração do servidor
Defina LLM_PROVIDER (gemini, openai ou anthropic), LLM_API_KEY e, opcionalmente, LLM_MODEL no ambiente do backend ou no arquivo backend/.env. Use .env.ai.example como referência. A chave não é enviada ao frontend e não pode ser alterada pela API de preferências. Os campos legados de credenciais no banco são mantidos por compatibilidade, mas não participam da geração. Não versione o arquivo .env.

Reinicie o backend após alterar as variáveis. A migração guides.0005_step_generation_prompt adiciona o campo de prompt por passo.

## Comportamento
POST /api/guides/{guide_id}/steps/{step_id}/generate-text/ recebe {"prompt": "instruções do autor"} (até 3000 caracteres) e retorna o passo atualizado. Requer autenticação e propriedade do guia. Na ausência de chave, em erro do provedor ou resposta vazia, retorna erro e preserva a instrução existente. Capturas sem imagem usam somente os metadados. A imagem e o contexto são enviados ao provedor de IA configurado pelo administrador.

A rota legada de geração do guia continua disponível, com gravação atômica dos resultados. A interface oferece apenas geração individual, evitando substituir todos os textos por engano.

Referência Gemini: https://ai.google.dev/api/generate-content (generateContent com imagem e autenticação via cabeçalho x-goog-api-key).

O endpoint de geração aceita prompt_mode (automatic ou manual). Em modo automático, o backend recompõe a orientação com o contexto atual; o campo generation_prompt_suggestion da resposta fornece a sugestão e generation_prompt_mode identifica o modo. A origem automática é registrada nas anotações do passo sem alterar capturas ou narração.

# Motion Director — estudo de animação profissional v1

Este documento transforma fundamentos de animação em um método de estudo e em
critérios aplicáveis a rigs Roblox. O objetivo não é decorar termos nem copiar
poses: é treinar observação, diagnóstico, reconstrução e iteração.

## Método de estudo: O-D-R-C-A

1. **Observar**
   - Assistir em velocidade normal para identificar intenção, emoção, peso e foco.
   - Rever em 24, 30 e 60 FPS para separar leitura artística de densidade técnica.
   - Marcar contatos, pausas, mudanças de direção e poses que permanecem na memória.
2. **Decompor**
   - Extrair linha de ação, silhueta, espaços negativos, apoio e centro de gravidade.
   - Separar pose principal, breakdown, in-betweens, antecipação, impacto, overshoot,
     follow-through e settle.
   - Mapear arcos, spacing, aceleração, desaceleração, drag, offset e overlap.
3. **Reconstruir de memória**
   - Escrever a intenção em uma frase.
   - Fazer thumbnails e bloquear somente as poses essenciais em stepped.
   - Reconstruir relações corporais, não valores de joints copiados.
4. **Comparar**
   - Comparar pose a pose e curva a curva com a referência.
   - Classificar diferenças em comunicação, física, anatomia, timing ou polish.
   - Verificar câmera frontal, lateral e câmera final; uma vista não prova a pose.
5. **Aplicar originalmente**
   - Criar outra ação com intenção e mecânica diferentes usando o princípio aprendido.
   - Pedir avaliação visual humana.
   - Corrigir o menor intervalo defeituoso e registrar o motivo da correção.

## Currículo organizado

### 1. Design visual e posing

- Pose, gesto, line of action, silhueta, staging e clareza visual.
- Contraste de poses, assimetria, contrapposto, espaço negativo e exaggeration.
- Thumbnail poses, comunicação visual, personalidade e storytelling pelo movimento.
- Uma pose é julgada primeiro por significado; anatomia e detalhes refinam uma ideia
  que já precisa ser legível.

### 2. Tempo, curvas e transição

- Timing, spacing, ritmo, flow, pausas e timing cômico ou dramático.
- Slow in/out, easing, aceleração, desaceleração, overshoot e settle.
- Keyframes, extremes, breakdowns, in-betweens, blocking, spline e polish.
- Graph Editor, tangentes, interpolação e limpeza de curvas.
- Curva densa baked deve ser avaliada pelos valores e velocidades, não apenas pelo
  rótulo de easing de cada Pose.

### 3. Física e mecânica corporal

- Peso, equilíbrio, centro de gravidade, base de suporte e transferência de peso.
- Momentum, inércia, gravidade, impacto, compressão e recuperação.
- Arcos, antecipação, follow-through, overlapping action, drag e offset.
- Squash and stretch deve preservar volume e estrutura percebida; em rigs rígidos,
  vem de compressão da silhueta, root e timing, não de articulações inexistentes.

### 4. Corpo, rig e anatomia

- FK, IK, controles, hierarquia, pivôs, C0/C1, attachments e espaços de transformação.
- Proporções, postura, músculos principais, articulações e amplitude de movimento.
- R6 exige design de blocos rígidos; R15 distribui a ação por ombro/cotovelo/punho,
  quadril/joelho/tornozelo e dois segmentos de torso.
- Mãos, dedos, blinking, olhos, cabelo e tecido só podem ser avaliados ou animados
  quando a topologia correspondente existir.

### 5. Acting e vida interna

- Acting, emoção, intenção, personalidade e linguagem corporal.
- Respiração, direção do olhar, blinking, mãos e secondary action.
- A ação secundária apoia a leitura principal; se competir com ela, é ruído.
- Olhos normalmente escolhem o alvo antes da cabeça, e a cabeça antes do peito;
  exceções precisam representar hesitação, surpresa, exaustão ou resistência.

### 6. Biblioteca funcional

- Idle, caminhada, corrida, pulo, queda, aterrissagem, sentar e levantar.
- Pegar objetos, carregar peso, start, stop, turn e transições de locomotion.
- Ciclos precisam fechar pose, velocidade, contato e fase — não apenas o primeiro e
  último transform.
- Animação para jogos também precisa responder a velocidade, direção, input e blend.

### 7. Métodos de produção

- Pose to pose para clareza, planejamento e controle.
- Straight ahead para forças caóticas, overlap e partes secundárias, sempre com
  checkpoints que impeçam deriva.
- Blocking resolve história e mecânica; spline resolve continuidade; polish resolve
  contatos, arcos, microspacing, tangentes e detalhes.
- Referência em vídeo, observação real, feedback, revisão quadro a quadro e iteração
  constante são parte do processo, não correções posteriores.

## Checklist de uma pose profissional

1. Qual é a intenção que deve ser lida sem texto?
2. Existe uma linha de ação dominante, ou várias curvas competem?
3. A silhueta e os espaços negativos separam as ideias importantes?
4. Qual pé, mão, assento ou objeto sustenta o corpo?
5. O centro de gravidade está sobre a base de suporte ou o momentum justifica sair?
6. Quadril, peito e cabeça cooperam ou criam contrapposto intencional?
7. A pose respeita anatomia, pivôs e amplitude do rig?
8. Qual parte liderou, quais arrastam e quais ainda vão assentar?
9. A pose contrasta claramente com a anterior e prepara a próxima?
10. A câmera final mostra a melhor leitura?

## Checklist de uma transição profissional

1. O spacing mostra aceleração ou desaceleração coerente?
2. Cabeça, mãos, pés e centro de massa percorrem arcos deliberados?
3. O contato permanece estável durante o intervalo declarado?
4. Existe antecipação suficiente para a força pretendida?
5. Impacto, overshoot e settle têm funções diferentes?
6. Offset e overlap seguem a hierarquia de massa, sem ondas artificiais sincronizadas?
7. A curva passa por extremos acidentais entre keys?
8. Há keys redundantes tentando corrigir uma pose ruim?
9. A ação lê em tempo real e também quadro a quadro?
10. O fim entrega energia e direção adequadas à próxima animação?

## Evidência das referências locais

Foram analisadas 66 animações disponíveis em `Workspace.References` e uma seleção
representativa de locomotion, idle, combate, reação e skill longa.

| Referência | Duração | Keyframes | Aprendizado principal |
|---|---:|---:|---|
| Pro Walk | 1,333 s | 81 | Seis tracks completos e curva densa baked; translations locais participam da silhueta. |
| Pro Run | 0,533 s | 17 | Inclinação de torso muito maior, assimetria forte e contraste rápido entre apoios. |
| Pro Idle | 1,683 s | 102 | Movimento pequeno, contínuo e completo; baixa assimetria não significa imobilidade. |
| Walk4 | 0,760 s | 49 | Compressão do torso e accents rápidos distinguem o ciclo mesmo com pouco tempo. |
| Combat1 | 0,725 s | 37 | Em média apenas 3,62 dos 6 tracks são explicitados; herança parcial é parte da curva. |
| Combat5 | 0,817 s | 47 | Grandes rotações e translations trabalham juntas durante o contraste de poses. |
| DownSlam | 0,833 s | 51 | Linha de ação extrema e spacing agressivo justificam silhuetas fora da locomotion. |
| HitReaction3 | 0,517 s | 23 | O pico da reação é preparado por aceleração concentrada, não por movimento uniforme. |
| Blockbroken | 2,200 s | 5 | Pose-to-pose forte pode funcionar com grandes pausas entre poucas poses decisivas. |
| Ravage Succsess | 6,133 s | 183 | 141 frames parciais, grandes mudanças de spacing e transforms extremos exigem herança. |

### Conclusões incorporadas

- Não usar o mesmo envelope para locomotion, acting, reação e skill.
- Não julgar posing apenas por ângulos: translation, hierarquia, proporção e câmera
  alteram decisivamente a silhueta.
- Não confundir densidade baked com quantidade de decisões artísticas.
- Não preencher uma pose parcial ausente com identidade; preservar o estado anterior.
- Não considerar a pose de maior magnitude automaticamente a melhor hero pose.
  Contraste, intenção e leitura são mais importantes que energia numérica.
- Translation de membro R6 não é proibida. Deve ser calibrada, coordenada com o torso,
  preservar conexão visual com o pivot e justificar contato ou silhueta.
- Validação numérica mede continuidade e limites; aprovação visual continua humana.

## Rotina contínua

Para cada nova família de movimento:

1. selecionar três referências profissionais com soluções diferentes;
2. extrair três hero poses, dois breakdowns e os contatos;
3. reconstruir uma pose de memória;
4. comparar frontal, lateral, três quartos e câmera final;
5. criar uma ação original usando a relação aprendida;
6. avaliar numericamente;
7. solicitar revisão visual;
8. registrar o defeito, a causa e a correção;
9. repetir até a solução sobreviver a diferentes rigs e câmeras.

## Estudo de caso: exaustão não é apenas uma pose baixa

- Primeiro definir o tipo: sono, exaustão pós-esforço, desgaste emocional ou
  tentativa de esconder o cansaço produzem mecânicas diferentes.
- Perguntar onde o peso "vive". Na exaustão física, cabeça, ombros e braços perdem
  sustentação ativa; mãos, coxas, parede ou objeto frequentemente recebem parte
  do peso do tronco.
- Uma pose pós-esforço clara pode formar uma cadeia de suporte
  `tronco -> braços -> coxas -> pés`, com olhar baixo e ombros pendentes.
- Em R6, apoio bilateral nas coxas pode perder clareza porque braços e pernas não
  articulam. Uma adaptação melhor é criar contraste funcional: um braço reto
  recebe peso na coxa, o outro perde tônus e pende; o quadril continua alto.
- Apoio, drag e relaxamento precisam ter silhuetas diferentes. Se os dois braços
  usam a mesma diagonal, o espectador lê uma ação simétrica planejada, não fadiga.
- Porém, realismo mecânico não deve ser preservado quando a topologia não consegue
  expressá-lo. Em R6, uma leitura cartunesca pode ser superior: cabeça caída,
  linha do tronco "derretida", peito fechado e dois braços baixos com assimetria
  discreta comunicam exaustão sem fingir cotovelos, joelhos ou apoio de mãos.
- Escolher a referência pelo que o rig consegue comunicar, não apenas pela
  fidelidade anatômica da referência original.
- Quando a referência cartunesca mostra colapso total, não preservar por hábito o
  tronco vertical. O tronco deve assumir a grande linha de ação; cabeça e membros
  contra-rotacionam a partir dele somente para encontrar chão, apoio e silhueta.
- Exagero não é apenas aumentar os ângulos dos braços. É redistribuir toda a massa
  e alterar a forma global do personagem.
- O Creator Hub orienta mover apenas o LowerTorso/root durante posing; mover outras
  partes pode desconectá-las do rig. Para R6, usar Torso como tradução principal e
  criar a forma dos membros por rotação nos pivôs reais.
- Translation local em membros rígidos continua possível como efeito excepcional,
  mas não deve ser o método padrão de posing. Precisa de necessidade visual
  explícita e prova de que ombro ou quadril continuam conectados.
- Antecipação de salto faz o oposto: comprime o centro, mantém membros disponíveis,
  armazena tensão e aponta a continuação para cima.
- Antes de misturar emoções, provar uma leitura primária inequívoca. Determinação,
  humor ou ameaça entram depois como atuação secundária.
- Teste de silhueta: sem rosto e sem contexto, perguntar se o próximo movimento
  sugerido é "continuar recuperando o fôlego" ou "explodir para cima".

# MicFudiddo Studio

Aplicativo simples para Windows que captura o microfone, aplica ganho livre e pitch em tempo real, e envia o audio processado para um dispositivo de audio virtual. Ele tambem pode tocar a propria voz no fone quando o monitoramento estiver ligado.

## O que o app faz

- Detecta automaticamente um microfone Fifine quando ele aparece na lista de dispositivos.
- Aplica ganho em tempo real. Valores altos, como 10x, 25x, 100x ou mais, sao aceitos pelo campo numerico.
- Quando o ganho passa do teto de saida, o app achata os picos de proposito para criar distorcao/estouro real antes do Discord receber o audio.
- Altera a altura da voz de -12 a +12 semitons.
- Tem volume final do microfone, distorcao, robo, eco curto, tremolo e bitcrush como efeitos opcionais.
- Todos os efeitos extras vem desligados por padrao.
- Tem botao para restaurar controles ao padrao.
- Tem soundboard local com upload de sons, lista persistente, volume, pitch, repeticoes e atalhos por som.
- Tem gravador da voz processada que salva o audio final enviado ao Discord.
- Tem gravador de audio do PC por WASAPI loopback, com selecao de uma ou mais fontes como JBL Quantum Game e JBL Quantum Chat quando o Windows disponibiliza esses endpoints.
- Tem a interface classica em `customtkinter` e uma interface nova `MicFudiddo Studio` em Electron + React, com sidebar, icones, animacoes e soundboard mais visual.
- Ao abrir, salva o microfone padrao atual do Windows, define `CABLE Output` como microfone padrao e inicia o processamento automaticamente.
- Ao clicar no X, o app continua rodando na bandeja do Windows. Para fechar de verdade, clique com o botao direito no icone da bandeja e escolha `Fechar`.
- Ao fechar de verdade, para o processamento e restaura o microfone padrao anterior.
- Liga/desliga o processamento com um botao.
- Liga/desliga o monitoramento da propria voz.
- Nao altera driver, APO, registro do Windows, configuracao da JBL Quantum ou configuracoes profundas do sistema.

## Resposta tecnica importante

Modificar diretamente o audio do microfone que o Discord ja esta usando, sem selecionar outro dispositivo de entrada, nao e uma abordagem confiavel para um aplicativo comum de usuario.

No Windows, o Discord le audio de um endpoint de captura escolhido por ele. Para trocar os samples "por baixo" desse mesmo endpoint seria necessario usar driver, APO de audio, filtro virtual em nivel de sistema ou injecao no processo. Isso aumenta muito o risco de conflito com softwares como JBL Quantum, Discord, jogos, anticheats e configuracoes existentes do Windows.

A alternativa estavel e:

1. O app le o microfone real, por exemplo o Fifine.
2. O app processa ganho e pitch localmente.
3. O app escreve o resultado em um dispositivo virtual, por exemplo `CABLE Input (VB-Audio Virtual Cable)`.
4. O Discord usa o par de gravacao desse cabo, geralmente `CABLE Output`, como microfone.

Assim o app nao precisa mexer em drivers existentes. Na pratica, voce seleciona o dispositivo virtual no Discord uma vez e depois usa o MicFudiddo para ligar/desligar, ajustar ganho, pitch e monitoramento.

## Como rodar

No PowerShell, dentro desta pasta:

```powershell
.\run.ps1
```

O script cria um ambiente virtual, instala as dependencias e abre o app.

## MicFudiddo Studio

A versao Studio usa Electron + React por cima do mesmo motor de audio em Python. Para rodar em modo desenvolvimento:

```powershell
npm run dev
```

Para gerar o executavel portable:

```powershell
npm run build:studio
```

O executavel fica em:

```text
studio-release\MicFudiddo Studio 0.4.0.exe
```

Para colocar no Menu Iniciar e aparecer na busca do Windows:

```powershell
.\install_studio_start_menu.ps1
```

## Como usar com Discord

1. Instale um cabo virtual de audio, como VB-CABLE ou outro dispositivo virtual equivalente.
2. Abra o MicFudiddo.
3. Confirme se o microfone detectado e o Fifine.
4. Em `Saida processada`, selecione `CABLE Input` ou outro dispositivo virtual de saida.
5. No Discord, selecione o par de gravacao correspondente, normalmente `CABLE Output`.
6. Clique em `Ativar processamento`.

Depois disso, o Discord recebe o audio processado. O botao `Ouvir minha voz` e opcional e toca uma copia do audio no dispositivo de monitoramento.

Na versao atual, o app tambem tenta automatizar essa etapa: quando abre, ele define `CABLE Output` como microfone padrao do Windows e inicia o processamento. Apps que usam o microfone padrao passam a receber o MicFudiddo sem voce trocar manualmente. Ao fechar de verdade pelo icone da bandeja, ele restaura o microfone padrao anterior.

## Soundboard

Abra a aba `Soundboard` e use `Adicionar som`. Os arquivos sao copiados para:

```text
%APPDATA%\MicFudiddo\sounds
```

Cada som pode ter volume, pitch, repeticoes e um atalho. O duplo clique em um som toca imediatamente. O app tenta registrar os atalhos de forma global para funcionar mesmo com Discord/jogo em foco; se o Windows bloquear o hook, os atalhos continuam funcionando com a janela do app em foco.

A aba `Presets` define o volume, pitch e repeticoes padrao para novos sons importados.

## Gravador

A aba `Gravador` salva a voz processada, ou seja, o mesmo audio que o app esta enviando para o Discord. Os arquivos ficam em:

```text
%APPDATA%\MicFudiddo\recordings
```

Tambem da para gravar audio do PC selecionando uma ou mais fontes de loopback na lista. Se voce escolher mais de uma fonte, o app salva um arquivo para cada fonte e tambem cria um `mix_pc_*.wav`.

## Criar .exe

Versao Studio:

```powershell
npm run build:studio
```

Versao classica:

```powershell
.\build_exe.ps1
```

O executavel classico fica em:

```text
dist\MicFudiddo.exe
```

## Instalar no Menu Iniciar

```powershell
.\install_studio_start_menu.ps1
```

Isso copia o Studio para:

```text
%LOCALAPPDATA%\MicFudiddoStudio
```

E cria atalhos no Menu Iniciar para aparecer na busca do Windows como `MicFudiddo Studio`, `Mic Fudido` e `MicFudiddo`.

## Observacoes de estabilidade

- O app usa PortAudio via `sounddevice`, em modo de usuario.
- A latencia alvo e baixa, com blocos de 256 samples quando o dispositivo aceita.
- O ganho interno nao e limitado pelo app. Depois do ganho, a saida e clipada de proposito para que o audio realmente fique estourado quando voce usar valores altos.
- Ha protecao contra valores invalidos como NaN/Inf para evitar travamento.
- Use o monitoramento com cuidado quando o ganho estiver alto, porque pode ficar muito alto no fone.
- Se o Discord suavizar demais o estouro, desligue processamento de voz, cancelamento de ruido e controle automatico de ganho nas configuracoes de voz do Discord.


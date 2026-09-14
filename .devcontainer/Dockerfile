# Node 24 på Debian, inte Alpine.
#
# 24 för att det är vad CI pinnar (.github/workflows/pages.yml), så att
# containern och bygget som publicerar sidan kör samma version.
#
# Debian och inte Alpine för att paket med native-binärer (esbuild, rolldown
# m.fl.) byggs mot glibc här. Kommentaren i compose.yml beskriver exakt den
# fällan: musl-byggda binärer i Alpine krockar med värdens glibc, och
# resultatet blir en testkörare som inte startar.
FROM node:24

ARG TZ
ENV TZ="$TZ"

# Verktygen delas i två grupper med flit: de som är till för att arbeta i
# containern, och de som init-firewall.sh faktiskt kräver för att köra.
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && apt-get -y install --no-install-recommends \
    # Arbetsverktyg
    git \
    sudo \
    zsh \
    fzf \
    less \
    nano \
    vim \
    man-db \
    procps \
    unzip \
    # Brandväggen: iptables/ipset gör jobbet, dnsutils slår upp domänerna,
    # jq läser GitHubs meta-API och aggregate slår ihop CIDR-blocken.
    iptables \
    ipset \
    dnsutils \
    iproute2 \
    jq \
    aggregate \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI från GitHubs eget apt-repo. Utan den är de allowlistade
# GitHub-intervallen bara till nytta för git självt.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# git-delta: läsbara diffar. Paketnamnet är arkitekturberoende.
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Arbetsytan och volymernas monteringspunkter måste ägas av `node` innan
# volymerna monteras, annars skriver de root-ägda kataloger.
RUN mkdir -p /workspace /home/node/.claude /commandhistory && \
    chown -R node:node /workspace /home/node/.claude /commandhistory

# Bash-historiken pekas mot volymen, så att den överlever en rebuild.
RUN echo "export PROMPT_COMMAND='history -a'" >> /home/node/.bashrc && \
    echo "export HISTFILE=/commandhistory/.bash_history" >> /home/node/.bashrc

ENV DEVCONTAINER=true \
    EDITOR=nano \
    SHELL=/bin/zsh

# Brandväggen kräver root, men sessionen ska inte köra som root. Därför får
# `node` köra exakt det här skriptet med sudo och ingenting annat.
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
    chmod 0440 /etc/sudoers.d/node-firewall

USER node

ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
    -p git \
    -p fzf \
    -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
    -a "source /usr/share/doc/fzf/examples/completion.zsh" \
    -a "export HISTFILE=/commandhistory/.zsh_history" \
    -x

# Claude Code installeras INTE här. Det sköter den officiella
# dev container-featuren i devcontainer.json, som också lägger till
# VS Code-tillägget.
#
# `npm ci` körs heller inte här: node_modules hamnar i den bind-mountade
# arbetsytan, så den hör hemma som ett kommando du kör i containern.

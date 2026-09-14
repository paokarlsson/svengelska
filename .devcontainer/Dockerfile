# Node 24 matchar CI. Debian och inte Alpine: native-binärer byggda mot musl
# krockar med värdens glibc — se kommentaren i compose.yml.
FROM node:24

ARG TZ
ENV TZ="$TZ"

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && apt-get -y install --no-install-recommends \
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
    iptables \
    ipset \
    dnsutils \
    iproute2 \
    jq \
    aggregate \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Måste ägas av node innan volymerna monteras, annars blir de root-ägda.
RUN mkdir -p /workspace /home/node/.claude /commandhistory && \
    chown -R node:node /workspace /home/node/.claude /commandhistory

RUN echo "export PROMPT_COMMAND='history -a'" >> /home/node/.bashrc && \
    echo "export HISTFILE=/commandhistory/.bash_history" >> /home/node/.bashrc

ENV DEVCONTAINER=true \
    EDITOR=nano \
    SHELL=/bin/zsh

# node får köra brandväggsskriptet som root, och ingenting annat.
# Inte /usr/local/bin: claude-code-featuren lägger ett eget init-firewall.sh
# där, och features körs efter Dockerfilen — vår fil skulle skrivas över.
COPY init-firewall.sh /usr/local/share/svengelska/
RUN chmod +x /usr/local/share/svengelska/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/share/svengelska/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
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

# Claude Code installeras av featuren i devcontainer.json, inte här.

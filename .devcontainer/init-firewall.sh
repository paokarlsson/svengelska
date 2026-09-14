#!/bin/bash
# Begränsar containerns utgående trafik till en allowlist.
#
# Bygger på Anthropics referensskript. Varje domän nedan är med för att något
# projektet faktiskt gör slutar fungera utan den — se docs/ i planen och
# tabellen i .devcontainer/README-raderna nedan. Telemetridomänerna
# (Datadog, Sentry, Statsig) är medvetet *inte* med: containerEnv sätter
# CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1, så att öppna dem vore
# motsägelsefullt.
#
# Körs som root via postStartCommand (sudo utan lösenord, se Dockerfile).
set -euo pipefail
IFS=$'\n\t'

# Flusha allt gammalt, så att ett omstartat skript inte staplar regler.
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# DNS och SSH måste ut innan default-policyn blir DROP, annars går det inte
# ens att slå upp namnen i allowlistan nedan.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

# Loopback: container-interna anrop (t.ex. ng serve mot sig själv).
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# --- GitHub -----------------------------------------------------------------
# git fetch/push, gh, och npm-paket som löses mot GitHub-tarballs.
# IP-intervallen hämtas från GitHubs eget meta-API i stället för att hårdkodas,
# eftersom de ändras.
echo "Hämtar GitHubs IP-intervall..."
gh_ranges=$(curl -sS --max-time 10 https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "FEL: Fick inget svar från api.github.com/meta" >&2
    exit 1
fi
if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "FEL: GitHubs svar saknar förväntade fält" >&2
    exit 1
fi

while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "FEL: Ogiltigt CIDR från GitHub: $cidr" >&2
        exit 1
    fi
    ipset add allowed-domains "$cidr" 2>/dev/null || true
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# --- Domäner ----------------------------------------------------------------
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "claude.ai" \
    "claude.com" \
    "platform.claude.com" \
    "downloads.claude.ai" \
    "code.claude.com" \
    "marketplace.visualstudio.com" \
    "update.code.visualstudio.com" \
    "vscode.blob.core.windows.net"; do
    echo "Slår upp $domain..."
    ips=$(dig +short A "$domain" | grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || true)
    if [ -z "$ips" ]; then
        echo "FEL: Kunde inte slå upp $domain" >&2
        exit 1
    fi
    while read -r ip; do
        ipset add allowed-domains "$ip" 2>/dev/null || true
    done <<< "$ips"
done

# Värdens eget nät måste nås, annars kan VS Code inte prata med containern.
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "FEL: Hittade ingen default-route" >&2
    exit 1
fi
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Allt som inte uttryckligen tillåts ska falla.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

echo "Brandväggen är på plats. Verifierar..."

# Två prov: ett som ska falla, ett som ska gå igenom. Utan båda vet man bara
# att något är blockerat, inte att rätt saker släpps fram.
if curl --connect-timeout 5 -sS https://example.com >/dev/null 2>&1; then
    echo "FEL: example.com gick att nå — brandväggen släpper igenom för mycket" >&2
    exit 1
fi
echo "Verifierat: example.com är blockerad."

if ! curl --connect-timeout 5 -sS https://api.github.com/zen >/dev/null 2>&1; then
    echo "FEL: api.github.com gick inte att nå — brandväggen blockerar för mycket" >&2
    exit 1
fi
echo "Verifierat: api.github.com går att nå."

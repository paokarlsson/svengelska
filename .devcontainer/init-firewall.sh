#!/bin/bash
# Begränsar utgående trafik till en allowlist. Körs som root vid varje start.
set -euo pipefail
IFS=$'\n\t'

iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# DNS måste ut innan default-policyn blir DROP, annars går domänerna nedan
# inte att slå upp.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# GitHub: git fetch/push och gh. Hämtas från meta-API:t eftersom intervallen ändras.
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

# npm-registret, Anthropics domäner och VS Code-marketplace. Telemetri är
# utelämnad — containerEnv stänger av den trafiken ändå.
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

# Värdens nät, annars kan VS Code inte prata med containern.
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "FEL: Hittade ingen default-route" >&2
    exit 1
fi
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Två prov: utan båda vet man bara att något är blockerat, inte att rätt
# saker släpps fram.
if curl --connect-timeout 5 -sS https://example.com >/dev/null 2>&1; then
    echo "FEL: example.com gick att nå — brandväggen släpper igenom för mycket" >&2
    exit 1
fi
if ! curl --connect-timeout 5 -sS https://api.github.com/zen >/dev/null 2>&1; then
    echo "FEL: api.github.com gick inte att nå — brandväggen blockerar för mycket" >&2
    exit 1
fi
echo "Brandväggen är på plats och verifierad."

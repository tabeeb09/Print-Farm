FROM node:20-bookworm-slim

ARG TERRAFORM_VERSION=1.10.5

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    unzip \
  && curl --http1.1 --retry 5 --retry-delay 2 --retry-all-errors -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/terraform.zip \
  && unzip /tmp/terraform.zip -d /usr/local/bin \
  && rm -f /tmp/terraform.zip \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

ENTRYPOINT ["node", "scripts/bootstrap-hetzner-project.mjs"]

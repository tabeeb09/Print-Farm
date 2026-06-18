locals {
  labels = {
    project = var.project_name
    layout  = "single-vps"
  }
}

resource "hcloud_ssh_key" "bootstrap" {
  name       = "${var.project_name}-single-bootstrap"
  public_key = var.ssh_public_key
  labels     = local.labels
}

resource "hcloud_firewall" "single" {
  name   = "${var.project_name}-single"
  labels = local.labels

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = [var.admin_cidr]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = var.public_web_cidrs
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = var.public_web_cidrs
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = [var.admin_cidr]
  }
}

resource "hcloud_server" "single" {
  name         = "${var.project_name}-single"
  image        = var.image
  server_type  = var.server_type
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.bootstrap.id]
  firewall_ids = [hcloud_firewall.single.id]
  labels       = local.labels

  user_data = templatefile("${path.module}/cloud-init/single.yaml.tftpl", {
    caid_repo_url    = var.caid_repo_url
    caid_repo_ref    = var.caid_repo_ref
    website_repo_url = var.website_repo_url
    website_repo_ref = var.website_repo_ref
  })
}

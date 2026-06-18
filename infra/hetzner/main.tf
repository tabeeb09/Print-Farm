locals {
  common_labels = {
    project = var.project_name
  }
}

resource "hcloud_ssh_key" "bootstrap" {
  name       = "${var.project_name}-bootstrap"
  public_key = var.ssh_public_key
  labels     = local.common_labels
}

resource "hcloud_network" "private" {
  name     = "${var.project_name}-private"
  ip_range = "10.77.0.0/16"
  labels   = local.common_labels
}

resource "hcloud_network_subnet" "private" {
  network_id   = hcloud_network.private.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.77.1.0/24"
}

resource "hcloud_firewall" "caid" {
  name   = "${var.project_name}-caid"
  labels = local.common_labels

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
    source_ips = [var.admin_cidr]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = [var.admin_cidr]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = [var.admin_cidr]
  }
}

resource "hcloud_firewall" "storage" {
  name   = "${var.project_name}-storage"
  labels = local.common_labels

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
}

resource "hcloud_firewall" "website" {
  name   = "${var.project_name}-website"
  labels = local.common_labels

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
}

resource "hcloud_server" "caid" {
  name        = "${var.project_name}-caid"
  image       = var.image
  server_type = var.caid_server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.bootstrap.id]
  labels      = merge(local.common_labels, { role = "caid" })
  firewall_ids = [
    hcloud_firewall.caid.id,
  ]

  network {
    network_id = hcloud_network.private.id
    ip         = "10.77.1.10"
  }

  user_data = templatefile("${path.module}/cloud-init/caid.yaml.tftpl", {
    caid_repo_url = var.caid_repo_url
    caid_repo_ref = var.caid_repo_ref
  })

  depends_on = [hcloud_network_subnet.private]
}

resource "hcloud_server" "storage" {
  name        = "${var.project_name}-storage"
  image       = var.image
  server_type = var.storage_server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.bootstrap.id]
  labels      = merge(local.common_labels, { role = "storage" })
  firewall_ids = [
    hcloud_firewall.storage.id,
  ]

  network {
    network_id = hcloud_network.private.id
    ip         = "10.77.1.20"
  }

  user_data = templatefile("${path.module}/cloud-init/website.yaml.tftpl", {
    website_repo_url = var.website_repo_url
    website_repo_ref = var.website_repo_ref
  })

  depends_on = [hcloud_network_subnet.private]
}

resource "hcloud_server" "website" {
  name        = "${var.project_name}-website"
  image       = var.image
  server_type = var.website_server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.bootstrap.id]
  labels      = merge(local.common_labels, { role = "website" })
  firewall_ids = [
    hcloud_firewall.website.id,
  ]

  network {
    network_id = hcloud_network.private.id
    ip         = "10.77.1.30"
  }

  user_data = templatefile("${path.module}/cloud-init/website.yaml.tftpl", {
    website_repo_url = var.website_repo_url
    website_repo_ref = var.website_repo_ref
  })

  depends_on = [hcloud_network_subnet.private]
}

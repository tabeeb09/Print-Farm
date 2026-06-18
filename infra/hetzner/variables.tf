variable "hcloud_token" {
  description = "Hetzner Cloud API token."
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Name prefix for created resources."
  type        = string
  default     = "oi-loftrop"
}

variable "location" {
  description = "Hetzner location, e.g. fsn1, nbg1, hel1."
  type        = string
  default     = "fsn1"
}

variable "image" {
  description = "Server image."
  type        = string
  default     = "ubuntu-24.04"
}

variable "caid_server_type" {
  type    = string
  default = "cpx11"
}

variable "storage_server_type" {
  type    = string
  default = "cpx11"
}

variable "website_server_type" {
  type    = string
  default = "cpx11"
}

variable "admin_cidr" {
  description = "CIDR allowed to reach SSH and CAId admin services."
  type        = string
}

variable "public_web_cidrs" {
  description = "CIDRs allowed to reach public website/media HTTP(S)."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "ssh_public_key" {
  description = "SSH public key installed on created servers."
  type        = string
}

variable "website_repo_url" {
  type    = string
  default = "https://github.com/tabeeb09/oi.loftrop.com.git"
}

variable "website_repo_ref" {
  type    = string
  default = "main"
}

variable "caid_repo_url" {
  type    = string
  default = "https://github.com/tabeeb09/caid.git"
}

variable "caid_repo_ref" {
  type    = string
  default = "main"
}

output "caid_ipv4" {
  value = hcloud_server.caid.ipv4_address
}

output "caid_private_ip" {
  value = "10.77.1.10"
}

output "storage_ipv4" {
  value = hcloud_server.storage.ipv4_address
}

output "storage_private_ip" {
  value = "10.77.1.20"
}

output "website_ipv4" {
  value = hcloud_server.website.ipv4_address
}

output "website_private_ip" {
  value = "10.77.1.30"
}

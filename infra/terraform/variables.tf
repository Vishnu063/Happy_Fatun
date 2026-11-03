variable "enable_infrastructure" {
  description = "Explicit approval switch. Default creates nothing; AWS resources can be billable."
  type        = bool
  default     = false
}
variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}
variable "subnet_cidr" {
  type    = string
  default = "10.42.1.0/24"
}
variable "availability_zone" {
  type    = string
  default = "ap-south-1a"
}
variable "ami_id" {
  description = "Owner-reviewed hardened AMI; no cloud lookup during validation."
  type        = string
  default     = ""
}
variable "instance_type" {
  description = "8 GiB lab default; not a promise of Free Tier eligibility."
  type        = string
  default     = "t3.large"
}
variable "assign_public_ip" {
  description = "Off by default; public IPv4 may incur charges. Requires approved access/egress design."
  type        = bool
  default     = false
}
variable "ssh_key_name" {
  description = "Existing key name only; never a private key. Empty disables key assignment."
  type        = string
  default     = ""
}
variable "admin_cidrs" {
  type    = list(string)
  default = []
  validation {
    condition     = alltrue([for cidr in var.admin_cidrs : can(cidrhost(cidr, 0)) && !contains(["0.0.0.0/0", "::/0"], cidr)])
    error_message = "SSH requires explicit narrow administrator CIDRs."
  }
}
variable "app_cidrs" {
  description = "Explicit allowed frontend clients; empty exposes nothing. No Jenkins or database ingress is created."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.app_cidrs : can(cidrhost(cidr, 0)) && !contains(["0.0.0.0/0", "::/0"], cidr)])
    error_message = "Review narrow application client CIDRs; wildcard public access is not a default."
  }
}
variable "create_media_bucket" {
  type    = bool
  default = false
}
variable "media_bucket_name" {
  type    = string
  default = ""
}
variable "data_volume_gib" {
  type    = number
  default = 10
  validation {
    condition     = var.data_volume_gib >= 10 && var.data_volume_gib <= 100
    error_message = "Lab data volume must be between 10 and 100 GiB."
  }
}

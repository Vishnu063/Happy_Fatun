terraform {
  required_version = ">= 1.8, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # No remote backend is created; configure approved encrypted/locked state separately.
}
provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "happy-furn", ManagedBy = "terraform" }
  }
}

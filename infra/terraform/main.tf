locals {
  enabled = var.enable_infrastructure ? 1 : 0
  bucket  = var.enable_infrastructure && var.create_media_bucket ? 1 : 0
}
resource "aws_vpc" "lab" {
  count                = local.enabled
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags                 = { Name = "happy-furn-lab" }
}
resource "aws_subnet" "lab" {
  count                   = local.enabled
  vpc_id                  = aws_vpc.lab[0].id
  cidr_block              = var.subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = false
}
resource "aws_internet_gateway" "lab" {
  count  = local.enabled
  vpc_id = aws_vpc.lab[0].id
}
resource "aws_route_table" "lab" {
  count  = local.enabled
  vpc_id = aws_vpc.lab[0].id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lab[0].id
  }
}
resource "aws_route_table_association" "lab" {
  count          = local.enabled
  subnet_id      = aws_subnet.lab[0].id
  route_table_id = aws_route_table.lab[0].id
}
resource "aws_security_group" "lab" {
  count       = local.enabled
  name_prefix = "happy-furn-lab-"
  description = "Reviewed narrow lab access; PostgreSQL and Jenkins remain private"
  vpc_id      = aws_vpc.lab[0].id
  dynamic "ingress" {
    for_each = var.admin_cidrs
    content {
      description = "Approved administrator SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }
  dynamic "ingress" {
    for_each = var.app_cidrs
    content {
      description = "Approved frontend clients only"
      from_port   = 8081
      to_port     = 8081
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }
  egress {
    description = "HTTPS updates and approved AWS APIs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "Private VPC communication and DNS"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }
}
resource "aws_iam_role" "node" {
  count              = local.enabled
  name_prefix        = "happy-furn-node-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "ec2.amazonaws.com" } }] })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  count      = local.enabled
  role       = aws_iam_role.node[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "node" {
  count       = local.enabled
  name_prefix = "happy-furn-"
  role        = aws_iam_role.node[0].name
}
resource "aws_instance" "node" {
  count                       = local.enabled
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.lab[0].id
  vpc_security_group_ids      = [aws_security_group.lab[0].id]
  associate_public_ip_address = var.assign_public_ip
  iam_instance_profile        = aws_iam_instance_profile.node[0].name
  key_name                    = var.ssh_key_name == "" ? null : var.ssh_key_name
  monitoring                  = false
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = false
  }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = can(regex("^ami-[0-9a-f]+$", var.ami_id))
      error_message = "Provide the owner-reviewed AMI before enabling infrastructure."
    }
  }
  tags = { Name = "happy-furn-lab" }
}
resource "aws_ebs_volume" "data" {
  count             = local.enabled
  availability_zone = var.availability_zone
  size              = var.data_volume_gib
  type              = "gp3"
  encrypted         = true
  lifecycle { prevent_destroy = true }
  tags = { Name = "happy-furn-data" }
}
resource "aws_volume_attachment" "data" {
  count       = local.enabled
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data[0].id
  instance_id = aws_instance.node[0].id
}
resource "aws_s3_bucket" "media" {
  count         = local.bucket
  bucket        = var.media_bucket_name
  force_destroy = false
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = length(var.media_bucket_name) >= 3
      error_message = "An approved globally unique private bucket name is required."
    }
  }
}
resource "aws_s3_bucket_public_access_block" "media" {
  count                   = local.bucket
  bucket                  = aws_s3_bucket.media[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count  = local.bucket
  bucket = aws_s3_bucket.media[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_versioning" "media" {
  count  = local.bucket
  bucket = aws_s3_bucket.media[0].id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_policy" "tls" {
  count  = local.bucket
  bucket = aws_s3_bucket.media[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Sid = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.media[0].arn, "${aws_s3_bucket.media[0].arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}

# Bind this policy only to an approved application workload identity; never all node pods.
resource "aws_iam_policy" "media" {
  count       = local.bucket
  name_prefix = "happy-furn-media-"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.media[0].arn}/products/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.media[0].arn }
    ]
  })
}

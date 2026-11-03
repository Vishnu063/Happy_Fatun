output "instance_id" { value = try(aws_instance.node[0].id, null) }
output "private_ip" { value = try(aws_instance.node[0].private_ip, null) }
output "vpc_id" { value = try(aws_vpc.lab[0].id, null) }
output "data_volume_id" { value = try(aws_ebs_volume.data[0].id, null) }
output "private_media_bucket" { value = try(aws_s3_bucket.media[0].id, null) }
output "application_media_policy_arn" { value = try(aws_iam_policy.media[0].arn, null) }

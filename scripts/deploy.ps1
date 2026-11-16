# WorldAtlas AI - one-command deploy for Windows PowerShell (no CI/CD pipeline to maintain).
# Usage:  ./scripts/deploy.ps1            or   ./scripts/deploy.ps1 -SkipSync
# Requirements: AWS CLI v2 (configured), AWS SAM CLI, Node.js 18+, Python 3.12
param([switch]$SkipSync)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Stack = if ($env:STACK) { $env:STACK } else { "worldatlas-ai" }
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

function Out($key) {
  aws cloudformation describe-stacks --stack-name $Stack --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
}

Write-Host "==> 1/4 Building and deploying the serverless backend (SAM)"
sam build
sam deploy --stack-name $Stack --region $Region --no-fail-on-empty-changeset

$ApiUrl = Out "ApiUrl"; $SiteBucket = Out "SiteBucketName"; $DistId = Out "DistributionId"
$SfnArn = Out "StateMachineArn"; $SiteUrl = Out "SiteUrl"

if (-not $SkipSync) {
  Write-Host "==> 2/4 Running the data synchronization workflow (Step Functions, ~3-6 min)"
  $Exec = aws stepfunctions start-execution --state-machine-arn $SfnArn --region $Region --input "{}" --query executionArn --output text
  do {
    Start-Sleep -Seconds 15
    $Status = aws stepfunctions describe-execution --execution-arn $Exec --region $Region --query status --output text
    Write-Host "    status: $Status"
  } while ($Status -eq "RUNNING")
  if ($Status -ne "SUCCEEDED") { throw "Sync failed - open the Step Functions console for details" }
}

Write-Host "==> 3/4 Building the Next.js frontend (static export)"
Push-Location frontend
npm install
$env:NEXT_PUBLIC_API_URL = $ApiUrl
npm run build
Pop-Location

Write-Host "==> 4/4 Uploading to S3 + CloudFront invalidation"
aws s3 sync frontend/out "s3://$SiteBucket" --delete --exclude "data/*" --region $Region
aws cloudfront create-invalidation --distribution-id $DistId --paths "/*" | Out-Null

Write-Host ""
Write-Host "WorldAtlas AI is live:  $SiteUrl"
Write-Host "API:                    $ApiUrl"

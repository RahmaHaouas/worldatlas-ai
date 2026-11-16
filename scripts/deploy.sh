#!/usr/bin/env bash
# One-command deploy from your laptop (no CI/CD pipeline to maintain).
#   ./scripts/deploy.sh            -> backend + first data sync + frontend
#   ./scripts/deploy.sh --skip-sync
# Requirements: AWS CLI v2 (configured), AWS SAM CLI, Node.js 18+, Python 3.12
set -euo pipefail
cd "$(dirname "$0")/.."
STACK=${STACK:-worldatlas-ai}
REGION=${AWS_REGION:-us-east-1}

out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
          --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

echo "==> 1/4 Building and deploying the serverless backend (SAM)"
sam build
sam deploy --stack-name "$STACK" --region "$REGION" --no-fail-on-empty-changeset

API_URL=$(out ApiUrl); SITE_BUCKET=$(out SiteBucketName); DIST_ID=$(out DistributionId)
SFN_ARN=$(out StateMachineArn); SITE_URL=$(out SiteUrl)

if [[ "${1:-}" != "--skip-sync" ]]; then
  echo "==> 2/4 Running the data synchronization workflow (Step Functions, ~3-6 min)"
  EXEC=$(aws stepfunctions start-execution --state-machine-arn "$SFN_ARN" --region "$REGION" \
           --input '{}' --query executionArn --output text)
  while true; do
    STATUS=$(aws stepfunctions describe-execution --execution-arn "$EXEC" --region "$REGION" --query status --output text)
    echo "    status: $STATUS"; [[ "$STATUS" != "RUNNING" ]] && break; sleep 15
  done
  [[ "$STATUS" == "SUCCEEDED" ]] || { echo "Sync failed - open the Step Functions console for details"; exit 1; }
fi

echo "==> 3/4 Building the Next.js frontend (static export)"
pushd frontend >/dev/null
npm ci || npm install
NEXT_PUBLIC_API_URL="$API_URL" npm run build
popd >/dev/null

echo "==> 4/4 Uploading to S3 + CloudFront invalidation"
aws s3 sync frontend/out "s3://$SITE_BUCKET" --delete --exclude "data/*" --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo ""
echo "WorldAtlas AI is live:  $SITE_URL"
echo "API:                    $API_URL"

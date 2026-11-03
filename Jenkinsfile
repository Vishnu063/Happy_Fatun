pipeline {
  agent { label 'happy-furn-tools' }
  options { disableConcurrentBuilds(); timeout(time: 45, unit: 'MINUTES'); skipDefaultCheckout(true) }
  parameters {
    booleanParam(name: 'ENABLE_SONAR', defaultValue: false, description: 'Optional external SonarQube; enabled runs must pass its gate')
    string(name: 'SONAR_INSTALLATION', defaultValue: 'sonarqube')
    booleanParam(name: 'PUBLISH_IMAGES', defaultValue: false, description: 'Requires separate owner approval and registry credentials')
    booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Off by default. Production deployment requires approval')
    choice(name: 'DEPLOYMENT_OWNER', choices: ['none', 'jenkins', 'argocd'], description: 'Only one controller may own application releases')
    string(name: 'REGISTRY', defaultValue: '', description: 'Reviewed registry host/path, without credentials')
    string(name: 'REGISTRY_CREDENTIAL_ID', defaultValue: '')
    string(name: 'REVIEWED_COMMIT', defaultValue: '', description: 'Exact reviewed checkout SHA required before publishing/deployment')
    string(name: 'KUBE_CONTEXT', defaultValue: '', description: 'Explicit approved context; no current-context fallback')
    string(name: 'KUBE_NAMESPACE', defaultValue: 'happy-furn-lab')
    string(name: 'KUBECONFIG_CREDENTIAL_ID', defaultValue: '')
    string(name: 'PUBLIC_HEALTH_URL', defaultValue: '', description: 'Approved HTTPS endpoint, without credentials')
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Tool and target validation') {
      steps { script {
        sh 'node -e "if(Number(process.versions.node.split(\'.\')[0])<24)process.exit(1)"'
        sh 'for tool in docker helm terraform trivy kubeconform jq; do command -v "$tool" >/dev/null || { echo "Mandatory tool unavailable: $tool" >&2; exit 1; }; done'
        if (!(env.GIT_COMMIT ==~ /[a-f0-9]{40}/)) error('A reviewed immutable checkout SHA is required')
        if (!(params.KUBE_NAMESPACE ==~ /[a-z0-9][a-z0-9-]{0,62}/)) error('Invalid namespace')
        if (params.DEPLOY) sh 'for tool in kubectl curl; do command -v "$tool" >/dev/null || { echo "Mandatory deployment tool unavailable: $tool" >&2; exit 1; }; done'
        if (params.DEPLOY && (params.DEPLOYMENT_OWNER != 'jenkins' || !params.PUBLISH_IMAGES)) error('Jenkins deploy requires Jenkins ownership and approved publishing; ArgoCD ownership cannot also deploy here')
        if ((params.PUBLISH_IMAGES || params.DEPLOY) && (params.REVIEWED_COMMIT != env.GIT_COMMIT || !(params.REGISTRY ==~ /[a-z0-9][a-z0-9.:\/-]+/) || !params.REGISTRY_CREDENTIAL_ID.trim())) error('Registry, credentials and the exact reviewed commit are required; approval uses the fixed release-approvers group')
        if (params.DEPLOY && (!params.KUBE_CONTEXT.trim() || !params.KUBECONFIG_CREDENTIAL_ID.trim() || !params.PUBLIC_HEALTH_URL.startsWith('https://') || params.PUBLIC_HEALTH_URL.contains('@'))) error('Explicit cluster credentials/context and HTTPS health target are required')
        env.BACKEND_IMAGE = "${params.REGISTRY ? params.REGISTRY + '/' : ''}happy-furn-backend:${env.GIT_COMMIT}"
        env.POSTGRES_IMAGE = "${params.REGISTRY ? params.REGISTRY + '/' : ''}happy-furn-postgres:${env.GIT_COMMIT}"
        env.FRONTEND_IMAGE = "${params.REGISTRY ? params.REGISTRY + '/' : ''}happy-furn-frontend:${env.GIT_COMMIT}"
      } }
    }
    stage('Install dependencies') { steps { sh 'npm ci' } }
    stage('TypeScript and formatting') { steps { sh 'npx tsc -b && npx tsc -p tsconfig.server.json && npm run format:check' } }
    stage('Unit tests') { steps { sh 'npm test' } }
    stage('PostgreSQL and S3 contract integration tests') { steps { sh 'npm run build:backend && npm run build:frontend && npm run test:postgres && npm run test:s3' } }
    stage('Frontend build') { steps { sh 'npm run build:frontend' } }
    stage('Backend build') { steps { sh 'npm run build:backend' } }
    stage('SonarQube') {
      steps { script {
        if (params.ENABLE_SONAR) {
          sh 'command -v sonar-scanner >/dev/null || { echo "Sonar scanner is required when enabled" >&2; exit 1; }'
          withSonarQubeEnv(params.SONAR_INSTALLATION) { sh 'sonar-scanner -Dsonar.projectKey=happy-furn -Dsonar.sources=src,worker,server,shared' }
          timeout(time: 5, unit: 'MINUTES') { waitForQualityGate abortPipeline: true }
        } else { echo 'SonarQube explicitly disabled; external quality gate NOT VERIFIED. Mandatory Trivy checks remain enabled.' }
      } }
    }
    stage('Mandatory security scans') { steps { sh 'npm audit --audit-level=moderate && npm audit --prefix server/runtime --audit-level=moderate && trivy fs --db-repository ghcr.io/aquasecurity/trivy-db:2 --checks-bundle-repository ghcr.io/aquasecurity/trivy-checks:1 --include-dev-deps --scanners vuln,misconfig,secret --skip-dirs node_modules,.git,.wrangler,dist,dist-server --skip-files .dev.vars --severity HIGH,CRITICAL --exit-code 1 .' } }
    stage('Docker image builds and scans') { steps {
      sh 'docker build -f deploy/docker/backend.Dockerfile -t "$BACKEND_IMAGE" . && docker build -f deploy/docker/frontend.Dockerfile -t "$FRONTEND_IMAGE" . && docker build -f deploy/docker/postgres.Dockerfile -t "$POSTGRES_IMAGE" .'
      sh 'trivy image --db-repository ghcr.io/aquasecurity/trivy-db:2 --severity HIGH,CRITICAL --exit-code 1 "$BACKEND_IMAGE" && trivy image --db-repository ghcr.io/aquasecurity/trivy-db:2 --severity HIGH,CRITICAL --exit-code 1 "$FRONTEND_IMAGE" && trivy image --db-repository ghcr.io/aquasecurity/trivy-db:2 --severity HIGH,CRITICAL --exit-code 1 "$POSTGRES_IMAGE"'
    } }
    stage('Container integration and outage recovery') { steps { sh 'npm run test:compose' } }
    stage('Helm, Kubernetes and Terraform validation') { steps {
      sh 'helm lint deploy/helm/happy-furn && helm template happy-furn deploy/helm/happy-furn | kubeconform -strict -summary -kubernetes-version 1.32.0'
      sh 'terraform -chdir=infra/terraform fmt -check && terraform -chdir=infra/terraform init -backend=false -input=false && terraform -chdir=infra/terraform validate'
    } }
    stage('Approve and publish immutable images') {
      when { expression { params.PUBLISH_IMAGES } }
      steps { script {
        input(message: "Approve publishing scanned ${env.BACKEND_IMAGE}, ${env.FRONTEND_IMAGE} and lab ${env.POSTGRES_IMAGE} at ${env.GIT_COMMIT}?", submitter: 'happy-furn-release-approvers')
        withCredentials([usernamePassword(credentialsId: params.REGISTRY_CREDENTIAL_ID, usernameVariable: 'REGISTRY_USER', passwordVariable: 'REGISTRY_PASSWORD')]) {
          withEnv(["REGISTRY_HOST=${params.REGISTRY.tokenize('/')[0]}", "DOCKER_CONFIG=${pwd(tmp: true)}/registry"]) {
            sh '''set +x
set -eu
mkdir -p "$DOCKER_CONFIG"
chmod 700 "$DOCKER_CONFIG"
trap 'docker logout "$REGISTRY_HOST" >/dev/null 2>&1 || true; rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" --username "$REGISTRY_USER" --password-stdin
docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"
docker push "$POSTGRES_IMAGE"
'''
          }
        }
        if (params.DEPLOYMENT_OWNER == 'argocd') echo "GitOps handoff: review/commit both image tags ${env.GIT_COMMIT} in values/gitops-lab.yaml, then let ArgoCD alone sync. Jenkins does not change Git or the cluster."
      } }
    }
    stage('Approval before production deployment') {
      when { expression { params.DEPLOY && params.DEPLOYMENT_OWNER == 'jenkins' } }
      steps { script { input(message: "Approve application deployment to explicit context ${params.KUBE_CONTEXT}, namespace ${params.KUBE_NAMESPACE}? Database migration/backup approval is separate.", submitter: 'happy-furn-release-approvers') } }
    }
    stage('Kubernetes deployment') {
      when { expression { params.DEPLOY && params.DEPLOYMENT_OWNER == 'jenkins' } }
      steps { script {
        withCredentials([file(credentialsId: params.KUBECONFIG_CREDENTIAL_ID, variable: 'KUBECONFIG')]) {
          withEnv(["KUBE_CONTEXT=${params.KUBE_CONTEXT}", "KUBE_NAMESPACE=${params.KUBE_NAMESPACE}", "REGISTRY=${params.REGISTRY}"]) {
            sh 'kubectl --context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" get deployment >/dev/null'
            env.PREVIOUS_REVISION = sh(returnStdout: true, script: 'helm list --kube-context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" -o json | jq -r \'.[] | select(.name=="happy-furn") | .revision\'').trim()
            env.DEPLOYMENT_STARTED = 'true'
            sh 'helm upgrade --install happy-furn deploy/helm/happy-furn --kube-context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" -f deploy/helm/happy-furn/values/production.yaml --set-string backend.image.repository="$REGISTRY/happy-furn-backend" --set-string frontend.image.repository="$REGISTRY/happy-furn-frontend" --set-string backend.image.tag="$GIT_COMMIT" --set-string frontend.image.tag="$GIT_COMMIT" --wait --timeout 180s'
          }
        }
      } }
    }
    stage('Health verification') {
      when { expression { params.DEPLOY && params.DEPLOYMENT_OWNER == 'jenkins' } }
      steps {
        withCredentials([file(credentialsId: params.KUBECONFIG_CREDENTIAL_ID, variable: 'KUBECONFIG')]) {
          withEnv(["KUBE_CONTEXT=${params.KUBE_CONTEXT}", "KUBE_NAMESPACE=${params.KUBE_NAMESPACE}", "HEALTH_URL=${params.PUBLIC_HEALTH_URL}"]) {
            sh 'kubectl --context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" rollout status deployment/backend --timeout=120s && kubectl --context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" rollout status deployment/frontend --timeout=120s && curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null'
          }
        }
      }
    }
  }
  post {
    failure { script {
      if (env.DEPLOYMENT_STARTED == 'true' && env.PREVIOUS_REVISION?.isInteger()) {
        withCredentials([file(credentialsId: params.KUBECONFIG_CREDENTIAL_ID, variable: 'KUBECONFIG')]) {
          withEnv(["KUBE_CONTEXT=${params.KUBE_CONTEXT}", "KUBE_NAMESPACE=${params.KUBE_NAMESPACE}"]) {
            sh 'helm rollback happy-furn "$PREVIOUS_REVISION" --kube-context "$KUBE_CONTEXT" -n "$KUBE_NAMESPACE" --wait --timeout 180s'
          }
        }
      } else { echo 'No prior application revision eligible for automatic rollback. No database rollback, uninstall or deletion was attempted; owner intervention required.' }
    } }
  }
}

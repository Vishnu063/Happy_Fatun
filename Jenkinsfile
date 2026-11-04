pipeline {
    agent { label 'ec2-builder' }

    stages {
        stage('Check Git checkout') {
            steps {
                sh 'git log -1 --oneline'
                sh 'test -f package.json'
            }
        }

        stage('Check Docker') {
            steps {
                sh 'whoami'
                sh 'docker version'
            }
        }
    }
}

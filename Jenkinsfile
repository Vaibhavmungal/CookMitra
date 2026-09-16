// ==============================================================================
// CookMitra CI/CD Pipeline
// Description: Automates build, deployment, and health verification on AWS EC2
// Engine: Docker Compose
// ==============================================================================

pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup Environment') {
            steps {
                // Ensure production .env is present in the workspace
                sh '''
                if [ ! -f .env ] && [ -f /home/ubuntu/CookMitra/.env ]; then
                    cp /home/ubuntu/CookMitra/.env .env
                fi
                '''
            }
        }

        stage('Build & Deploy') {
            steps {
                // Build fresh image and restart containers with zero downtime
                sh 'docker compose up --build -d'
            }
        }

        stage('Health Check') {
            steps {
                // Verify API and database connectivity
                sh '''
                sleep 5
                curl -f http://localhost:5000/api/health || exit 1
                '''
            }
        }
    }

    post {
        always {
            // Remove dangling image layers to save disk space
            sh 'docker image prune -f'
        }
    }
}

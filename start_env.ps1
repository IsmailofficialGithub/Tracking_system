# Start Docker Desktop if not running
Write-Host "Checking Docker status..."
$dockerStatus = (docker info 2>&1)
if ($dockerStatus -match "error during connect" -or $dockerStatus -match "cannot find the file specified" -or $LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Starting Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    
    # Wait for Docker to start
    $dockerReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $dockerStatus = (docker info 2>&1)
        if ($LASTEXITCODE -eq 0) {
            $dockerReady = $true
            break
        }
        Write-Host "Waiting for Docker daemon to start..."
    }
    
    if (-not $dockerReady) {
        Write-Error "Docker failed to start within the expected time."
        exit 1
    }
}

Write-Host "Docker is running! Starting Postgres database..."
cd "d:\coding\Axirom\Tracking_system"

# Start the DB
docker-compose up -d db

Write-Host "Waiting for PostgreSQL to be ready on port 5432..."
# Wait for the DB to be ready to accept connections
$dbReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $logs = (docker-compose logs db 2>&1)
    if ($logs -match "database system is ready to accept connections") {
        $dbReady = $true
        break
    }
}

Write-Host "Running Database Migrations..."
cd Backend
# Install sqlx-cli if not installed (this might take a while if not installed, but we assume it might be or we can just run it)
# cargo install sqlx-cli --no-default-features --features rustls,postgres
cargo sqlx migrate run

Write-Host "Starting the Rust Backend API in the background..."
# Start the rust backend in a background job or separate window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\coding\Axirom\Tracking_system\Backend; cargo run"

Write-Host "Environment is up! Backend is starting in a new window."
Write-Host "You can now run 'node scripts/test_auth.js' to test the authentication."

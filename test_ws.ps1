$ErrorActionPreference = "Stop"
$wsUrl = "ws://localhost:3000"
$apiUrl = "http://localhost:3000"

function Signup($username, $password) {
  $body = @{username=$username; password=$password; displayName=$username} | ConvertTo-Json
  try {
    $r = Invoke-WebRequest -Uri "$apiUrl/api/signup" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    $data = $r.Content | ConvertFrom-Json
    Write-Output "Signup $username: $($data.status) token=$($data.token)"
    return $data
  } catch {
    Write-Output "Signup $username: $($_.Exception.Message)"
    return $null
  }
}

function Login($username, $password) {
  $body = @{username=$username; password=$password} | ConvertTo-Json
  try {
    $r = Invoke-WebRequest -Uri "$apiUrl/api/login" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    $data = $r.Content | ConvertFrom-Json
    Write-Output "Login $username: $($data.status) token=$($data.token)"
    return $data
  } catch {
    Write-Output "Login $username: $($_.Exception.Message)"
    return $null
  }
}

Write-Output "=== Testing Friend Request System ==="

# Create test users
$user1 = Signup "friendtest1" "test123"
$user2 = Signup "friendtest2" "test123"

if (-not $user1 -or -not $user2) {
  Write-Output "One or both users exist, trying to login..."
  $user1 = Login "friendtest1" "test123"
  $user2 = Login "friendtest2" "test123"
}

if (-not $user1 -or -not $user2) {
  Write-Output "ERROR: Cannot create or login test users"
  exit 1
}

Write-Output "`nUsers created/logged in successfully"
Write-Output "User1 token: $($user1.token)"
Write-Output "User2 token: $($user2.token)"

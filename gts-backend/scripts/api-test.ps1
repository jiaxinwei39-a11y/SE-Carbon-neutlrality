$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$base = 'http://127.0.0.1:8082/api'
$tmp = Join-Path $env:TEMP 'gts_t'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$script:pass = 0
$script:fail = 0

function PostFile([string]$url, [string]$json, [string]$token, [string]$idem) {
  $f = Join-Path $tmp ([guid]::NewGuid().ToString('N') + '.json')
  [System.IO.File]::WriteAllText($f, $json, $utf8)
  $a = @('-s', '-X', 'POST', $url, '-H', 'Content-Type: application/json', '--data-binary', ('@' + $f))
  if ($token) { $a += @('-H', ('Authorization: Bearer ' + $token)) }
  if ($idem) { $a += @('-H', ('Idempotency-Key: ' + $idem)) }
  $out = & curl.exe @a
  Remove-Item $f -ErrorAction SilentlyContinue
  return $out
}
function GetJ([string]$url, [string]$token) {
  $a = @('-s', $url)
  if ($token) { $a += @('-H', ('Authorization: Bearer ' + $token)) }
  return & curl.exe @a
}
function Check([string]$title, [string]$json, [int]$expectCode, [string]$expectTip) {
  $o = $null
  try { $o = $json | ConvertFrom-Json } catch { }
  $code = if ($o) { $o.code } else { -999 }
  $ok = ($code -eq $expectCode)
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ('[' + $mark + '] ' + $title + '  expect=' + $expectCode + ' actual=' + $code + '  msg=' + ($(if ($o) { $o.message } else { 'parse error' })))
  if ($expectTip -and -not $ok) { Write-Host ('        tip: ' + $expectTip) }
  return $o
}

$P1 = '\u548c\u5e73\u8def\u5730\u94c1\u7ad9'
$P2 = '\u5929\u6d25\u5927\u5b66\u4e1c\u95e8'
$P3 = '\u8425\u53e3\u9053\u7ad9'
$P4 = '\u5929\u6d25\u7ad9'

Write-Host '### 1 auth ###'
$o = Check 'POST /auth/login ok' (PostFile "$base/auth/login" '{"account":"13800138000","password":"123456"}' $null $null) 0
$token = $o.data.token
Write-Host ('        token=' + $token.Substring(0, 12) + '...  user.points=' + $o.data.user.points)
Check 'POST /auth/login bad pwd' (PostFile "$base/auth/login" '{"account":"13800138000","password":"wrong"}' $null $null) 40101
$me = Check 'GET /auth/me' (GetJ "$base/auth/me" $token) 0
Write-Host ('        me=' + ($me.data.nickname) + ' role=' + $me.data.role + ' points=' + $me.data.points)

Write-Host '### 2 points before ###'
$acc0 = Check 'GET /points/account (before)' (GetJ "$base/points/account" $token) 0
Write-Host ('        balance=' + $acc0.data.balance + ' earned=' + $acc0.data.totalEarned + ' trips=' + $acc0.data.tripCount)

Write-Host '### 3 create trip + idempotency ###'
$body1 = '{"clientTripId":"e2e-0001","mode":"BUS","distanceKm":12.5,"startTime":"2026-11-14T07:30:00.000Z","endTime":"2026-11-14T08:05:00.000Z","startPlace":"' + $P1 + '","endPlace":"' + $P2 + '"}'
$t1 = Check 'POST /trips BUS 12.5km' (PostFile "$base/trips" $body1 $token 'idem-0001') 0
Write-Host ('        tripId=' + $t1.data.tripId + ' reduction=' + $t1.data.reductionKg + ' points=' + $t1.data.awardedPoints + ' place=' + $t1.data.startPlace)
$t1b = Check 'POST /trips replay same key' (PostFile "$base/trips" $body1 $token 'idem-0001') 0
if ($t1b.data.tripId -eq $t1.data.tripId) { Write-Host '        same tripId -> idempotent OK' } else { Write-Host '        DIFF tripId -> BUG'; $script:fail++ }
$body1d = '{"clientTripId":"e2e-0001","mode":"BUS","distanceKm":99.9,"startTime":"2026-11-14T07:30:00.000Z","endTime":"2026-11-14T08:05:00.000Z","startPlace":"' + $P1 + '","endPlace":"' + $P2 + '"}'
Check 'POST /trips same id diff payload' (PostFile "$base/trips" $body1d $token 'idem-0001') 40904

Write-Host '### 4 validation ###'
$body2 = '{"clientTripId":"e2e-0002","mode":"SUBWAY","distanceKm":8,"startTime":"2026-11-15T09:00:00.000Z","endTime":"2026-11-15T09:30:00.000Z","startPlace":"' + $P3 + '","endPlace":"' + $P4 + '"}'
Check 'POST /trips without Idempotency-Key' (PostFile "$base/trips" $body2 $token $null) 40002
Check 'POST /trips SUBWAY 8km' (PostFile "$base/trips" $body2 $token 'idem-0002') 0
Check 'POST /trips 201km' (PostFile "$base/trips" '{"clientTripId":"e2e-0003","mode":"BUS","distanceKm":201,"startTime":"2026-11-15T09:00:00.000Z","endTime":"2026-11-15T09:30:00.000Z","startPlace":"a","endPlace":"b"}' $token 'idem-0003') 40010
Check 'POST /trips end before start' (PostFile "$base/trips" '{"clientTripId":"e2e-0004","mode":"BUS","distanceKm":5,"startTime":"2026-11-15T10:00:00.000Z","endTime":"2026-11-15T09:00:00.000Z","startPlace":"a","endPlace":"b"}' $token 'idem-0004') 40011
Check 'POST /trips bad mode' (PostFile "$base/trips" '{"clientTripId":"e2e-0005","mode":"PLANE","distanceKm":5,"startTime":"2026-11-15T09:00:00.000Z","endTime":"2026-11-15T09:30:00.000Z","startPlace":"a","endPlace":"b"}' $token 'idem-0005') 40000

Write-Host '### 5 zero-point trip (0.04km) ###'
$z = Check 'POST /trips 0.04km BUS (0 points)' (PostFile "$base/trips" '{"clientTripId":"e2e-0006","mode":"BUS","distanceKm":0.04,"startTime":"2026-11-15T10:00:00.000Z","endTime":"2026-11-15T10:05:00.000Z","startPlace":"c","endPlace":"d"}' $token 'idem-0006') 0
Write-Host ('        reduction=' + $z.data.reductionKg + ' points=' + $z.data.awardedPoints)

Write-Host '### 6 points after ###'
$acc1 = Check 'GET /points/account (after)' (GetJ "$base/points/account" $token) 0
Write-Host ('        balance=' + $acc1.data.balance + ' earned=' + $acc1.data.totalEarned + ' trips=' + $acc1.data.tripCount)
$delta = $acc1.data.balance - $acc0.data.balance
Write-Host ('        balance delta = ' + $delta + ' (should be 30 = 18 + 12 + 0)')
if ($delta -eq 30) { $script:pass++ } else { Write-Host '        BALANCE MISMATCH'; $script:fail++ }

Write-Host '### 7 queries ###'
Check 'GET /trips list' (GetJ "$base/trips?page=1&size=3" $token) 0
Check 'GET /trips filter BUS' (GetJ "$base/trips?mode=BUS&page=1&size=10" $token) 0
$td = Check 'GET /trips/{id}' (GetJ ("$base/trips/" + $t1.data.tripId) $token) 0
Write-Host ('        detail has ruleVersion=' + $td.data.ruleVersion + ' baseFactor=' + $td.data.baseFactor)
$fl = Check 'GET /points/flows' (GetJ "$base/points/flows?page=1&size=10" $token) 0
Write-Host ('        flows total=' + $fl.data.total + ' first=' + $fl.data.items[0].type + '/' + $fl.data.items[0].amount)

Write-Host '### 8 security ###'
Check 'GET /auth/me without token' (GetJ "$base/auth/me" $null) 40100
$o2 = Check 'login U002' (PostFile "$base/auth/login" '{"account":"13900139000","password":"123456"}' $null $null) 0
Check 'GET other user trip' (GetJ ("$base/trips/" + $t1.data.tripId) $o2.data.token) 40401

Write-Host '### 9 register ###'
$phone = '135' + (Get-Random -Minimum 10000000 -Maximum 99999999)
$reg = Check 'POST /auth/register' (PostFile "$base/auth/register" ('{"phone":"' + $phone + '","password":"abc123","nickname":"\u65b0\u7528\u6237"}') $null $null) 0
if ($reg) { Write-Host ('        new user id=' + $reg.data.user.id + ' nickname=' + $reg.data.user.nickname) }
Check 'POST /auth/register dup phone' (PostFile "$base/auth/register" ('{"phone":"' + $phone + '","password":"abc123"}') $null $null) 40906
Check 'POST /auth/register bad phone' (PostFile "$base/auth/register" '{"phone":"123","password":"abc123"}' $null $null) 40000

Write-Host '### 10 concurrency: 8 parallel posts, same clientTripId ###'
$conc = '{"clientTripId":"e2e-conc-01","mode":"BUS","distanceKm":10,"startTime":"2026-11-15T11:00:00.000Z","endTime":"2026-11-15T11:30:00.000Z","startPlace":"x","endPlace":"y"}'
$cf = Join-Path $tmp 'conc.json'
[System.IO.File]::WriteAllText($cf, $conc, $utf8)
$procs = @()
1..8 | ForEach-Object {
  $out = Join-Path $tmp ("c_$_.txt")
  $argstr = '-s -o "' + $out + '" -X POST "' + $base + '/trips" -H "Content-Type: application/json" -H "Authorization: Bearer ' + $token + '" -H "Idempotency-Key: idem-conc" --data-binary "@' + $cf + '"'
  $procs += Start-Process -FilePath 'curl.exe' -ArgumentList $argstr -PassThru -WindowStyle Hidden
}
$procs | Wait-Process -Timeout 60
$codes = @()
$ids = @()
1..8 | ForEach-Object {
  $p = Join-Path $tmp ("c_$_.txt")
  if (Test-Path $p) {
    try {
      $o = (Get-Content $p -Raw -Encoding UTF8) | ConvertFrom-Json
      $codes += $o.code
      if ($o.data.tripId) { $ids += $o.data.tripId }
    } catch { $codes += 'ERR' }
  }
}
Write-Host ('        codes = ' + ($codes -join ','))
Write-Host ('        distinct tripIds = ' + (($ids | Select-Object -Unique)).Count + ' (should be 1)')
$uniqIds = ($ids | Select-Object -Unique).Count
$okCount = ($codes | Where-Object { $_ -eq 0 }).Count
if ($uniqIds -eq 1 -and $okCount -eq 8) { $script:pass++ } else { Write-Host '        CONCURRENCY ISSUE'; $script:fail++ }

$acc2 = Check 'GET /points/account (final)' (GetJ "$base/points/account" $token) 0
Write-Host ('        balance=' + $acc2.data.balance + ' (expect ' + ($acc1.data.balance + 15) + ' = +10km*0.15*10)')

Write-Host ''
Write-Host ('==== RESULT: pass=' + $script:pass + ' fail=' + $script:fail + ' ====')

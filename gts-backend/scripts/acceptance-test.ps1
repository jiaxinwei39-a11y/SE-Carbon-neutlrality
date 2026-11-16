$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$base = 'http://127.0.0.1:8082/api'
$tmp = Join-Path $env:TEMP 'gts_tc'
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
function Verdict([string]$tc, [string]$desc, [bool]$ok, [string]$detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $m = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ('[' + $m + '] ' + $tc + ' ' + $desc + ' | ' + $detail)
}
function Trip([string]$cid, [string]$mode, [double]$km, [string]$st, [string]$et, [string]$token, [string]$idem) {
  $b = '{"clientTripId":"' + $cid + '","mode":"' + $mode + '","distanceKm":' + $km + ',"startTime":"' + $st + '","endTime":"' + $et + '","startPlace":"a","endPlace":"b"}'
  return PostFile "$base/trips" $b $token $idem
}

$o = PostFile "$base/auth/login" '{"account":"13800138000","password":"123456"}' $null $null
$token = ($o | ConvertFrom-Json).data.token
$o2 = PostFile "$base/auth/login" '{"account":"13900139000","password":"123456"}' $null $null
$token2 = ($o2 | ConvertFrom-Json).data.token

Write-Host '### TC-01 bus 10km -> 1.5kg 15 points ###'
$r = Trip 'tc01-a' 'BUS' 10 '2026-11-13T07:00:00.000Z' '2026-11-13T07:30:00.000Z' $token 'k-tc01'
$j = $r | ConvertFrom-Json
Verdict 'TC-01' 'BUS 10km' (($j.code -eq 0) -and ($j.data.reductionKg -eq 1.5) -and ($j.data.awardedPoints -eq 15)) ('reduction=' + $j.data.reductionKg + ' points=' + $j.data.awardedPoints)

Write-Host '### TC-02 0.333km -> 0 points, trip saved, no ledger ###'
$before = (GetJ "$base/points/flows?page=1&size=1" $token | ConvertFrom-Json).data.total
$r = Trip 'tc02-a' 'BUS' 0.333 '2026-11-13T08:00:00.000Z' '2026-11-13T08:05:00.000Z' $token 'k-tc02'
$j = $r | ConvertFrom-Json
$after = (GetJ "$base/points/flows?page=1&size=1" $token | ConvertFrom-Json).data.total
Verdict 'TC-02' '0.333km zero points' (($j.code -eq 0) -and ($j.data.awardedPoints -eq 0) -and ($before -eq $after)) ('points=' + $j.data.awardedPoints + ' flows ' + $before + '->' + $after)

Write-Host '### TC-03 actual factor > baseline -> reduction 0 ###'
$r = Trip 'tc03-a' 'WALK' 5 '2026-11-13T09:00:00.000Z' '2026-11-13T10:00:00.000Z' $token 'k-tc03'
$j = $r | ConvertFrom-Json
Verdict 'TC-03' 'modeFactor 0.3 > base 0.2' (($j.code -eq 0) -and ($j.data.reductionKg -eq 0) -and ($j.data.awardedPoints -eq 0)) ('reduction=' + $j.data.reductionKg + ' points=' + $j.data.awardedPoints)

Write-Host '### TC-04 invalid inputs ###'
$j = (Trip 'tc04-a' 'BUS' 12.3456 '2026-11-13T07:00:00.000Z' '2026-11-13T07:30:00.000Z' $token 'k-tc04a') | ConvertFrom-Json
Verdict 'TC-04' 'precision 4 decimals rejected' ($j.code -eq 40010) ('code=' + $j.code)
$j = (Trip 'tc04-b' 'BUS' 0 '2026-11-13T07:00:00.000Z' '2026-11-13T07:30:00.000Z' $token 'k-tc04b') | ConvertFrom-Json
Verdict 'TC-04' 'distance 0 rejected' ($j.code -eq 40010) ('code=' + $j.code)
$j = (Trip 'tc04-c' 'PLANE' 5 '2026-11-13T07:00:00.000Z' '2026-11-13T07:30:00.000Z' $token 'k-tc04c') | ConvertFrom-Json
Verdict 'TC-04' 'bad mode rejected' ($j.code -eq 40000) ('code=' + $j.code)
$b = '{"clientTripId":"tc04-d","mode":"BUS","distanceKm":5,"startTime":"2026-11-13T07:00:00.000Z","endTime":"2026-11-13T07:30:00.000Z","startPlace":"","endPlace":"b"}'
$j = (PostFile "$base/trips" $b $token 'k-tc04d') | ConvertFrom-Json
Verdict 'TC-04' 'empty startPlace rejected' ($j.code -eq 40000) ('code=' + $j.code)
$j = (Trip 'tc04-e' 'BUS' 5 '2026-11-13T07:30:00.000Z' '2026-11-13T07:00:00.000Z' $token 'k-tc04e') | ConvertFrom-Json
Verdict 'TC-04' 'end before start rejected' ($j.code -eq 40011) ('code=' + $j.code)
$j = (Trip 'tc04-f' 'BUS' 5 '2026-11-20T07:00:00.000Z' '2026-11-20T07:30:00.000Z' $token 'k-tc04f') | ConvertFrom-Json
Verdict 'TC-04' 'future end rejected' ($j.code -eq 40011) ('code=' + $j.code)

Write-Host '### TC-05 rule interval boundary (left closed, right open) ###'
$j = (Trip 'tc05-a' 'BUS' 10 '2026-11-13T14:59:00.000Z' '2026-11-13T15:59:59.000Z' $token 'k-tc05a') | ConvertFrom-Json
Verdict 'TC-05' 'end 1s before boundary -> old rule, ratio 10' (($j.code -eq 0) -and ($j.data.ruleVersion -eq 'R-2026-11') -and ($j.data.pointsRatio -eq 10) -and ($j.data.awardedPoints -eq 15)) ('ver=' + $j.data.ruleVersion + ' ratio=' + $j.data.pointsRatio + ' pts=' + $j.data.awardedPoints)
$j = (Trip 'tc05-b' 'BUS' 10 '2026-11-13T15:00:00.000Z' '2026-11-13T16:00:00.000Z' $token 'k-tc05b') | ConvertFrom-Json
Verdict 'TC-05' 'end exactly at new effectiveFrom -> new rule (left closed)' (($j.code -eq 0) -and ($j.data.ruleVersion -eq 'R-2026-11-V2') -and ($j.data.pointsRatio -eq 20)) ('ver=' + $j.data.ruleVersion + ' ratio=' + $j.data.pointsRatio)
$j = (Trip 'tc05-c' 'BUS' 10 '2026-11-13T22:30:00.000Z' '2026-11-13T23:30:00.000Z' $token 'k-tc05c') | ConvertFrom-Json
Verdict 'TC-05' 'end after boundary -> new rule' ($j.data.ruleVersion -eq 'R-2026-11-V2') ('ver=' + $j.data.ruleVersion + ' pts=' + $j.data.awardedPoints)

Write-Host '### TC-06 no rule for the time -> rejected ###'
$j = (Trip 'tc06-a' 'BUS' 5 '2025-12-30T07:00:00.000Z' '2025-12-30T07:30:00.000Z' $token 'k-tc06a') | ConvertFrom-Json
Verdict 'TC-06' 'no effective rule' ($j.code -eq 40905) ('code=' + $j.code)

Write-Host '### TC-07 retry / conflict / concurrent first submit ###'
$b1 = '{"clientTripId":"tc07-a","mode":"BUS","distanceKm":10,"startTime":"2026-11-13T06:00:00.000Z","endTime":"2026-11-13T06:30:00.000Z","startPlace":"a","endPlace":"b"}'
$r1 = (PostFile "$base/trips" $b1 $token 'k-tc07') | ConvertFrom-Json
$r2 = (PostFile "$base/trips" $b1 $token 'k-tc07') | ConvertFrom-Json
Verdict 'TC-07' 'same key same input -> same tripId' (($r1.data.tripId) -and ($r1.data.tripId -eq $r2.data.tripId)) ('id=' + $r1.data.tripId)
$b2 = '{"clientTripId":"tc07-a","mode":"BUS","distanceKm":77,"startTime":"2026-11-13T06:00:00.000Z","endTime":"2026-11-13T06:30:00.000Z","startPlace":"a","endPlace":"b"}'
$j = (PostFile "$base/trips" $b2 $token 'k-tc07') | ConvertFrom-Json
Verdict 'TC-07' 'same key different input -> 40904' ($j.code -eq 40904) ('code=' + $j.code)

Write-Host '### TC-08 cross-user key isolation + trip isolation ###'
$b3 = '{"clientTripId":"tc08-shared","mode":"BUS","distanceKm":10,"startTime":"2026-11-13T05:00:00.000Z","endTime":"2026-11-13T05:30:00.000Z","startPlace":"a","endPlace":"b"}'
$u1 = (PostFile "$base/trips" $b3 $token 'k-tc08a') | ConvertFrom-Json
$u2 = (PostFile "$base/trips" $b3 $token2 'k-tc08b') | ConvertFrom-Json
Verdict 'TC-08' 'same clientTripId by two users both accepted' (($u1.code -eq 0) -and ($u2.code -eq 0) -and ($u1.data.tripId -ne $u2.data.tripId)) ('u1=' + $u1.data.tripId + ' u2=' + $u2.data.tripId)
$j = (GetJ ("$base/trips/" + $u1.data.tripId) $token2) | ConvertFrom-Json
Verdict 'TC-08' 'other user read -> 40401' ($j.code -eq 40401) ('code=' + $j.code)

Write-Host '### TC-17 old snapshot unchanged after rule change ###'
$j = (GetJ "$base/trips/TR202611080001" $token) | ConvertFrom-Json
Verdict 'TC-17' 'seed trip keeps ratio 10 / 18 points' (($j.code -eq 0) -and ($j.data.pointsRatio -eq 10) -and ($j.data.awardedPoints -eq 18) -and ($j.data.ruleVersion -eq 'R-2026-11')) ('ratio=' + $j.data.pointsRatio + ' pts=' + $j.data.awardedPoints + ' ver=' + $j.data.ruleVersion)

Write-Host '### TC-18 auth ###'
$j = (GetJ "$base/auth/me" $null) | ConvertFrom-Json
Verdict 'TC-18' 'no token -> 40100' ($j.code -eq 40100) ('code=' + $j.code)
$j = (GetJ "$base/points/account" $null) | ConvertFrom-Json
Verdict 'TC-18' 'no token on account -> 40100' ($j.code -eq 40100) ('code=' + $j.code)

Write-Host '### TC-20 account + own query ###'
$acc = (GetJ "$base/points/account" $token) | ConvertFrom-Json
$list = (GetJ "$base/trips?page=1&size=50" $token) | ConvertFrom-Json
$ledgerSum = 0
$p = 1
do {
  $fl = (GetJ ("$base/points/flows?page=" + $p + "&size=100") $token) | ConvertFrom-Json
  foreach ($x in $fl.data.items) { $ledgerSum += $x.amount }
  $p++
} while ($p -le [math]::Ceiling($fl.data.total / 100))
Verdict 'TC-20' 'balance == ledger sum' ($acc.data.balance -eq $ledgerSum) ('balance=' + $acc.data.balance + ' ledgerSum=' + $ledgerSum)
Verdict 'TC-20' 'tripCount == own trip count' ($acc.data.tripCount -eq $list.data.total) ('tripCount=' + $acc.data.tripCount + ' listTotal=' + $list.data.total)

Write-Host ''
Write-Host ('==== RESULT pass=' + $script:pass + ' fail=' + $script:fail + ' ====')

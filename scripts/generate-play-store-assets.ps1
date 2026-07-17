# Google Play 스토어 등록용 이미지 자산을 생성하는 스크립트
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'play-store-assets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Color-Hex([string]$hex) {
  $hex = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    [Convert]::ToInt32($hex.Substring(0, 2), 16),
    [Convert]::ToInt32($hex.Substring(2, 2), 16),
    [Convert]::ToInt32($hex.Substring(4, 2), 16)
  )
}

function Font-Malgun([float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  return New-Object System.Drawing.Font('Malgun Gothic', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function RectF([float]$x, [float]$y, [float]$w, [float]$h) {
  return New-Object System.Drawing.RectangleF($x, $y, $w, $h)
}

function Path-RoundRect([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundRect($g, [System.Drawing.RectangleF]$rect, [float]$radius, [System.Drawing.Color]$color) {
  $path = Path-RoundRect $rect $radius
  $brush = New-Object System.Drawing.SolidBrush($color)
  $g.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

function Stroke-RoundRect($g, [System.Drawing.RectangleF]$rect, [float]$radius, [System.Drawing.Color]$color, [float]$width = 1) {
  $path = Path-RoundRect $rect $radius
  $pen = New-Object System.Drawing.Pen($color, $width)
  $g.DrawPath($pen, $path)
  $pen.Dispose()
  $path.Dispose()
}

function Draw-Text($g, [string]$text, [float]$x, [float]$y, [float]$w, [float]$h, [System.Drawing.Font]$font, [System.Drawing.Color]$color, [string]$align = 'Near', [string]$valign = 'Near') {
  $brush = New-Object System.Drawing.SolidBrush($color)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::$align
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::$valign
  $fmt.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
  $g.DrawString($text, $font, $brush, (RectF $x $y $w $h), $fmt)
  $fmt.Dispose()
  $brush.Dispose()
}

function New-Canvas([int]$w, [int]$h, [System.Drawing.Color]$bg) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear($bg)
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Canvas($canvas, [string]$path) {
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Bitmap.Dispose()
}

function Draw-LogoWord($g, [float]$x, [float]$y, [float]$scale = 1) {
  $font = Font-Malgun (36 * $scale) ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g 'Lotto' $x $y (130 * $scale) (46 * $scale) $font (Color-Hex '#ef3340')
  Draw-Text $g 'Bank' ($x + 92 * $scale) $y (130 * $scale) (46 * $scale) $font (Color-Hex '#101827')
  $font.Dispose()
}

function Draw-TopBar($g, [string]$active) {
  Fill-RoundRect $g (RectF 40 34 1000 86) 24 (Color-Hex '#ffffff')
  Draw-LogoWord $g 68 52 0.9
  $navFont = Font-Malgun 24 ([System.Drawing.FontStyle]::Bold)
  Fill-RoundRect $g (RectF 815 52 168 46) 14 (Color-Hex '#ffe8ef')
  Draw-Text $g $active 830 60 138 30 $navFont (Color-Hex '#e11d48') 'Center' 'Center'
  $navFont.Dispose()
}

function Draw-LottoBalls($g, [int[]]$nums, [float]$x, [float]$y, [float]$size = 46) {
  $font = Font-Malgun ($size * 0.42) ([System.Drawing.FontStyle]::Bold)
  foreach ($n in $nums) {
    $c = if ($n -le 10) { '#f59e0b' } elseif ($n -le 20) { '#3b82f6' } elseif ($n -le 30) { '#ef4444' } elseif ($n -le 40) { '#64748b' } else { '#10b981' }
    $brush = New-Object System.Drawing.SolidBrush((Color-Hex $c))
    $g.FillEllipse($brush, $x, $y, $size, $size)
    $brush.Dispose()
    Draw-Text $g ('{0:00}' -f $n) $x $y $size $size $font (Color-Hex '#ffffff') 'Center' 'Center'
    $x += $size + 14
  }
  $font.Dispose()
}

function Draw-Ticket($g, [float]$x, [float]$y, [string]$type, [string]$round, [string]$accent, [string[]]$rows) {
  Fill-RoundRect $g (RectF $x $y 880 310) 14 (Color-Hex '#fffdf7')
  Stroke-RoundRect $g (RectF $x $y 880 310) 14 (Color-Hex '#dbe3ef') 2
  $pen = New-Object System.Drawing.Pen((Color-Hex $accent), 9)
  $g.DrawLine($pen, $x + 12, $y + 8, $x + 868, $y + 8)
  $pen.Dispose()
  $title = Font-Malgun 34 ([System.Drawing.FontStyle]::Bold)
  $body = Font-Malgun 18 ([System.Drawing.FontStyle]::Regular)
  $numFont = Font-Malgun 22 ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g $type ($x + 38) ($y + 38) 340 48 $title (Color-Hex '#101827')
  Draw-Text $g $round ($x + 40) ($y + 88) 220 30 $body (Color-Hex '#64748b')
  Draw-Text $g '1,000원' ($x + 690) ($y + 48) 140 34 $numFont (Color-Hex '#101827') 'Far' 'Near'
  $linePen = New-Object System.Drawing.Pen((Color-Hex '#111827'), 3)
  $g.DrawLine($linePen, $x + 40, $y + 130, $x + 835, $y + 130)
  $linePen.Dispose()
  $rowY = $y + 158
  foreach ($row in $rows) {
    $parts = $row -split ' '
    $startX = $x + 78
    if ($type -like '*연금*') {
      Fill-RoundRect $g (RectF ($x + 70) $rowY 56 42) 8 (Color-Hex $accent)
      Draw-Text $g $parts[0] ($x + 70) $rowY 56 42 $numFont (Color-Hex '#ffffff') 'Center' 'Center'
      $startX = $x + 144
      $parts = $parts[1..($parts.Length-1)]
    }
    foreach ($p in $parts) {
      Fill-RoundRect $g (RectF $startX $rowY 44 42) 8 (Color-Hex '#f8fafc')
      Stroke-RoundRect $g (RectF $startX $rowY 44 42) 8 (Color-Hex '#dbe3ef') 1
      Draw-Text $g $p $startX $rowY 44 42 $numFont (Color-Hex '#101827') 'Center' 'Center'
      $startX += 66
    }
    $rowY += 56
  }
  $title.Dispose(); $body.Dispose(); $numFont.Dispose()
}

function Draw-StoreMiniTicket($g, [float]$x, [float]$y, [float]$w, [string]$type, [string]$round, [string]$accent, [string[]]$nums) {
  Fill-RoundRect $g (RectF $x $y $w 170) 16 (Color-Hex '#fffdf7')
  Stroke-RoundRect $g (RectF $x $y $w 170) 16 (Color-Hex '#d7deea') 2
  $pen = New-Object System.Drawing.Pen((Color-Hex $accent), 7)
  $g.DrawLine($pen, $x + 14, $y + 10, $x + $w - 14, $y + 10)
  $pen.Dispose()
  $title = Font-Malgun 24 ([System.Drawing.FontStyle]::Bold)
  $small = Font-Malgun 14
  $numFontSize = if ($nums.Length -gt 6) { 14 } else { 15 }
  $numFont = Font-Malgun $numFontSize ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g $type ($x + 28) ($y + 30) ($w - 56) 34 $title (Color-Hex '#101827')
  Draw-Text $g $round ($x + 30) ($y + 66) 220 22 $small (Color-Hex '#64748b')
  $linePen = New-Object System.Drawing.Pen((Color-Hex '#111827'), 2)
  $g.DrawLine($linePen, $x + 28, $y + 94, $x + $w - 28, $y + 94)
  $linePen.Dispose()
  $cellW = if ($nums.Length -gt 6) { 36 } else { 42 }
  $gap = if ($nums.Length -gt 6) { 9 } else { 14 }
  $total = ($nums.Length * $cellW) + (($nums.Length - 1) * $gap)
  $startX = $x + (($w - $total) / 2)
  $cellY = $y + 118
  foreach ($n in $nums) {
    Fill-RoundRect $g (RectF $startX $cellY $cellW 32) 8 (Color-Hex '#f8fafc')
    Stroke-RoundRect $g (RectF $startX $cellY $cellW 32) 8 (Color-Hex '#dbe3ef') 1
    Draw-Text $g $n $startX $cellY $cellW 32 $numFont (Color-Hex '#101827') 'Center' 'Center'
    $startX += $cellW + $gap
  }
  $title.Dispose(); $small.Dispose(); $numFont.Dispose()
}

function Draw-PhoneFrame($g, [string]$active) {
  $dotPen = New-Object System.Drawing.Pen((Color-Hex '#e7edf5'), 1)
  for ($x = 0; $x -lt 1080; $x += 38) {
    for ($y = 0; $y -lt 1920; $y += 38) {
      $g.DrawEllipse($dotPen, $x, $y, 2, 2)
    }
  }
  $dotPen.Dispose()
  Draw-TopBar $g $active
}

function Draw-StatCard($g, [float]$x, [float]$y, [string]$label, [string]$value, [string]$sub, [string]$color) {
  Fill-RoundRect $g (RectF $x $y 470 176) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF $x $y 470 176) 18 (Color-Hex '#dbe3ef') 2
  $small = Font-Malgun 22 ([System.Drawing.FontStyle]::Bold)
  $big = Font-Malgun 40 ([System.Drawing.FontStyle]::Bold)
  $subf = Font-Malgun 20
  Draw-Text $g $label ($x + 32) ($y + 26) 260 32 $small (Color-Hex '#64748b')
  Draw-Text $g $value ($x + 32) ($y + 70) 280 54 $big (Color-Hex $color)
  Draw-Text $g $sub ($x + 32) ($y + 126) 340 30 $subf (Color-Hex '#64748b')
  $small.Dispose(); $big.Dispose(); $subf.Dispose()
}

function New-AppIcon {
  $c = New-Canvas 512 512 (Color-Hex '#f8fafc')
  $g = $c.Graphics
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((RectF 0 0 512 512), (Color-Hex '#e11d48'), (Color-Hex '#0f172a'), 45)
  Fill-RoundRect $g (RectF 38 38 436 436) 108 (Color-Hex '#e11d48')
  $g.FillEllipse($bg, 64, 64, 384, 384)
  $bg.Dispose()
  $white = New-Object System.Drawing.SolidBrush((Color-Hex '#ffffff'))
  $g.FillEllipse($white, 134, 134, 244, 244)
  $white.Dispose()
  $font = Font-Malgun 86 ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g 'LB' 134 138 244 220 $font (Color-Hex '#e11d48') 'Center' 'Center'
  $font.Dispose()
  $shine = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80,255,255,255))
  $g.FillEllipse($shine, 142, 100, 58, 58)
  $shine.Dispose()
  Save-Canvas $c (Join-Path $outDir 'app-icon-512.png')
}

function New-FeatureGraphic {
  $c = New-Canvas 1024 500 (Color-Hex '#f8fafc')
  $g = $c.Graphics
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush((RectF 0 0 1024 500), (Color-Hex '#fff1f2'), (Color-Hex '#ecfdf5'), 20)
  $g.FillRectangle($grad, 0, 0, 1024, 500)
  $grad.Dispose()
  Fill-RoundRect $g (RectF 48 46 928 408) 28 (Color-Hex '#fffffb')
  $panelPen = New-Object System.Drawing.Pen((Color-Hex '#e9eef6'), 2)
  $g.DrawRectangle($panelPen, 48, 46, 928, 408)
  $panelPen.Dispose()
  Draw-LogoWord $g 88 84 1.2
  $h1 = Font-Malgun 34 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 20
  Draw-Text $g 'QR 인증 기반' 92 164 430 48 $h1 (Color-Hex '#101827')
  Draw-Text $g '복권 전적 관리' 92 210 430 48 $h1 (Color-Hex '#101827')
  Draw-Text $g '구매 이력, 당첨 확인, 번호 연구소와 커뮤니티를 한 곳에서 관리하세요.' 94 278 410 62 $p (Color-Hex '#475569')
  Draw-LottoBalls $g @(4,13,14,18,31,38) 94 362 42
  Draw-StoreMiniTicket $g 556 88 376 'Lotto 6/45' '제 1232회 추천' '#e11d48' @('04','11','12','19','28','40')
  Draw-StoreMiniTicket $g 556 282 376 '연금 720+' '제 324회 인증' '#16a34a' @('1조','8','1','4','6','8','7')
  $h1.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'feature-graphic-1024x500.png')
}

function New-ScreenshotDashboard {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '나의 전적'
  $h = Font-Malgun 40 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '내 투자 포트폴리오' 62 160 500 60 $h (Color-Hex '#101827')
  Draw-Text $g 'QR 인증으로 구매와 당첨 기록을 자동 정리합니다.' 64 220 680 34 $p (Color-Hex '#64748b')
  Draw-StatCard $g 60 300 '총 구매' '16게임' '총 16,000원 투자' '#101827'
  Draw-StatCard $g 550 300 '당첨 횟수' '1회' '당첨률 6.3%' '#16a34a'
  Draw-StatCard $g 60 500 '수익률' '-68.8%' '투자 대비 수익률' '#e11d48'
  Draw-StatCard $g 550 500 '총 당첨금' '5,000원' '최고 기록 5등' '#16a34a'
  Fill-RoundRect $g (RectF 60 750 960 360) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 750 960 360) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '등수별 기록' 94 790 300 42 $h (Color-Hex '#101827')
  $labels = @('1등','2등','3등','4등','5등')
  $vals = @(0,0,0,0,1)
  for ($i=0; $i -lt 5; $i++) {
    $y = 860 + ($i * 46)
    Draw-Text $g $labels[$i] 100 $y 80 34 $p (Color-Hex '#64748b')
    Fill-RoundRect $g (RectF 190 $y 650 20) 10 (Color-Hex '#f1f5f9')
    if ($vals[$i] -gt 0) { Fill-RoundRect $g (RectF 190 $y 420 20) 10 (Color-Hex '#16a34a') }
    Draw-Text $g "$($vals[$i])회" 860 ($y - 8) 90 34 $p (Color-Hex '#101827') 'Far'
  }
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-01-record-dashboard.png')
}

function New-ScreenshotQr {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g 'QR 인증'
  $h = Font-Malgun 40 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g 'QR 인증 & 번호 이력' 62 160 600 60 $h (Color-Hex '#101827')
  Fill-RoundRect $g (RectF 60 240 960 116) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 240 960 116) 18 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '복권 QR URL을 등록하면 구매 회차와 번호가 저장됩니다.' 92 274 820 42 $p (Color-Hex '#475569')
  Draw-Ticket $g 100 440 'Lotto 6/45' '제 1222회 인증' '#e11d48' @('08 22 26 32 36 41','02 05 16 21 31 39','02 18 26 28 29 37')
  Draw-Ticket $g 100 820 '연금복권 720+' '제 324회 추첨중' '#16a34a' @('1조 8 1 4 6 8 7','2조 8 1 4 6 8 7','3조 8 1 4 6 8 7')
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-02-qr-history.png')
}

function New-ScreenshotRadar {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '레이더'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Fill-RoundRect $g (RectF 60 160 960 140) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 160 960 140) 18 (Color-Hex '#dbe3ef') 2
  Draw-Text $g 'LOTTOBANK EXCLUSIVE' 98 188 420 28 (Font-Malgun 18 ([System.Drawing.FontStyle]::Bold)) (Color-Hex '#e11d48')
  Draw-Text $g '로또 6/45 번호 레이더' 96 218 520 52 $h (Color-Hex '#101827')
  Draw-Text $g '최근 50회차 데이터 기반 추천 번호 자동 저장' 98 268 700 30 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 340 960 620) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 340 960 620) 18 (Color-Hex '#e11d48') 3
  Draw-Text $g '제 1233회 추천 번호' 96 372 520 48 $h (Color-Hex '#101827')
  for ($i=0; $i -lt 5; $i++) {
    $y = 455 + ($i * 90)
    Draw-Text $g "게임 $($i+1)" 100 $y 100 40 $p (Color-Hex '#64748b')
    $nums = @(@(2,5,20,21,32,41),@(7,10,20,23,32,39),@(2,5,13,20,21,41),@(13,16,26,33,41,44),@(7,11,20,21,23,39))[$i]
    Draw-LottoBalls $g $nums 220 $y 46
  }
  Fill-RoundRect $g (RectF 60 1040 960 260) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 1040 960 260) 18 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '추천 적중 이력' 96 1076 280 44 $h (Color-Hex '#101827')
  $ranks = @('1등','2등','3등','4등','5등')
  for ($i=0; $i -lt 5; $i++) {
    Fill-RoundRect $g (RectF (96 + $i*176) 1150 150 80) 12 (Color-Hex '#f8fafc')
    Draw-Text $g $ranks[$i] (96 + $i*176) 1162 150 26 $p (Color-Hex '#64748b') 'Center'
    Draw-Text $g '0번' (96 + $i*176) 1190 150 34 (Font-Malgun 26 ([System.Drawing.FontStyle]::Bold)) (Color-Hex '#e11d48') 'Center'
  }
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-03-number-radar.png')
}

function New-ScreenshotCommunity {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '커뮤니티'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '커뮤니티' 62 160 380 60 $h (Color-Hex '#101827')
  Fill-RoundRect $g (RectF 60 240 960 170) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 240 960 170) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '추천번호 · 인증게시판 · 문의/건의' 96 274 720 38 $h (Color-Hex '#101827')
  Draw-Text $g '연구소 저장 번호와 QR 인증 이력을 용지 형태로 공유합니다.' 98 326 820 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 460 960 420) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 460 960 420) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '1232회차 로또 추천번호' 96 500 640 42 $h (Color-Hex '#101827')
  Draw-Ticket $g 100 570 'Lotto 6/45' '제 1232회 추천' '#d4a017' @('04 11 12 19 28 40')
  Fill-RoundRect $g (RectF 60 940 960 420) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 940 960 420) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '324회차 연금 추첨중 인증' 96 980 640 42 $h (Color-Hex '#101827')
  Draw-Ticket $g 100 1050 '연금복권 720+' '제 324회 인증' '#16a34a' @('1조 8 1 4 6 8 7','2조 8 1 4 6 8 7')
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-04-community.png')
}

function New-ScreenshotResults {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '회차 조회'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '로또·연금 당첨 결과' 62 160 620 58 $h (Color-Hex '#101827')
  Draw-Text $g '회차별 당첨번호와 당첨 판매소를 한 화면에서 확인하세요.' 64 220 820 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 290 960 500) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 290 960 500) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '제 1231회 · 2026-07-04' 96 330 620 44 $h (Color-Hex '#101827')
  Draw-LottoBalls $g @(4,13,14,18,31,38) 150 430 58
  Draw-Text $g '+' 576 438 40 54 (Font-Malgun 36 ([System.Drawing.FontStyle]::Bold)) (Color-Hex '#64748b') 'Center'
  Draw-LottoBalls $g @(15) 640 430 58
  $rows = @(
    @('1등','17명','1,652,990,074원'),
    @('2등','90명','52,484,658원'),
    @('3등','3,336명','1,415,953원'),
    @('4등','168,902명','50,000원'),
    @('5등','2,770,957명','5,000원')
  )
  for ($i=0; $i -lt $rows.Length; $i++) {
    $y = 540 + ($i * 44)
    Draw-Text $g $rows[$i][0] 110 $y 100 34 $p (Color-Hex '#e11d48')
    Draw-Text $g $rows[$i][1] 330 $y 140 34 $p (Color-Hex '#101827') 'Center'
    Draw-Text $g $rows[$i][2] 650 $y 280 34 $p (Color-Hex '#101827') 'Far'
  }
  Fill-RoundRect $g (RectF 60 850 960 430) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 850 960 430) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '1등 당첨 판매소' 96 890 360 44 $h (Color-Hex '#101827')
  $stores = @('서울 노원구 · 스파', '부산 동래구 · 복권명당', '천안 서북구 · 행운복권')
  for ($i=0; $i -lt 3; $i++) {
    $y = 960 + ($i * 82)
    Fill-RoundRect $g (RectF 96 $y 820 58) 12 (Color-Hex '#f8fafc')
    Draw-Text $g $stores[$i] 126 ($y + 13) 620 30 $p (Color-Hex '#101827')
  }
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-05-results.png')
}

function New-ScreenshotLab {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '연구소'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '복권 연구소' 62 160 480 58 $h (Color-Hex '#101827')
  Draw-Text $g 'OMR 용지를 마킹하듯 번호를 고르고 역대 전적을 조회하세요.' 64 220 850 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 290 960 690) 22 (Color-Hex '#fff7f8')
  Stroke-RoundRect $g (RectF 60 290 960 690) 22 (Color-Hex '#fecdd3') 2
  Draw-Text $g '로또 6/45 백테스터' 96 330 440 46 $h (Color-Hex '#e11d48')
  $numFont = Font-Malgun 20 ([System.Drawing.FontStyle]::Bold)
  for ($n=1; $n -le 45; $n++) {
    $idx = $n - 1
    $col = $idx % 7
    $row = [math]::Floor($idx / 7)
    $x = 104 + ($col * 122)
    $y = 420 + ($row * 72)
    Fill-RoundRect $g (RectF $x $y 54 58) 4 (Color-Hex '#fffafa')
    Stroke-RoundRect $g (RectF $x $y 54 58) 4 (Color-Hex '#fda4af') 2
    Draw-Text $g ('{0:00}' -f $n) $x ($y + 14) 54 24 $numFont (Color-Hex '#e11d48') 'Center'
    if (@(4,11,12,19,28,40) -contains $n) {
      $bar = New-Object System.Drawing.SolidBrush((Color-Hex '#111827'))
      $g.FillRectangle($bar, $x + 8, $y + 23, 38, 12)
      $bar.Dispose()
    }
  }
  Fill-RoundRect $g (RectF 60 1050 960 260) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 1050 960 260) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '역대 전적 조회 결과' 96 1088 420 44 $h (Color-Hex '#101827')
  Draw-Text $g '1052회차 · 3등 당첨' 110 1160 520 34 $p (Color-Hex '#101827')
  Draw-Text $g '942회차 · 4등 당첨' 110 1210 520 34 $p (Color-Hex '#101827')
  Draw-Text $g '무료 조회 5회 제공' 690 1210 240 34 $p (Color-Hex '#e11d48') 'Far'
  $h.Dispose(); $p.Dispose(); $numFont.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-06-lab.png')
}

function New-ScreenshotRanking {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '랭킹'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '인증 데이터 랭킹' 62 160 520 58 $h (Color-Hex '#101827')
  Draw-Text $g 'QR 구매, 당첨, 출석 기록을 기준으로 자동 집계합니다.' 64 220 820 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 290 960 160) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 290 960 160) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '[로또 1등]' 94 334 170 42 $p (Color-Hex '#b45309')
  Draw-Text $g '[연금 1등]' 280 334 170 42 $p (Color-Hex '#b45309')
  Draw-Text $g '[로또 2등]' 466 334 170 42 $p (Color-Hex '#475569')
  Draw-Text $g '[연금 2등]' 650 334 170 42 $p (Color-Hex '#475569')
  $cats = @('구매','저격','수익','똥손','기부왕','출석왕','3등 콜렉터','스캔왕')
  for ($i=0; $i -lt $cats.Length; $i++) {
    $y = 520 + ($i * 92)
    Fill-RoundRect $g (RectF 60 $y 960 72) 14 (Color-Hex '#ffffff')
    Stroke-RoundRect $g (RectF 60 $y 960 72) 14 (Color-Hex '#dbe3ef') 1
    Draw-Text $g ($i+1).ToString() 92 ($y + 18) 60 30 $p (Color-Hex '#e11d48')
    Draw-Text $g $cats[$i] 170 ($y + 18) 280 30 $p (Color-Hex '#101827')
    Draw-Text $g '윤석열' 510 ($y + 18) 180 30 $p (Color-Hex '#101827')
    Draw-Text $g ('{0:N0}' -f (12000 - $i*800)) 820 ($y + 18) 140 30 $p (Color-Hex '#e11d48') 'Far'
  }
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-07-ranking.png')
}

function New-ScreenshotMap {
  $c = New-Canvas 1080 1920 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Draw-PhoneFrame $g '지도'
  $h = Font-Malgun 38 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 22
  Draw-Text $g '내 주변 판매점' 62 160 480 58 $h (Color-Hex '#101827')
  Draw-Text $g '검색한 주소 기준으로 가까운 복권 판매점을 확인하세요.' 64 220 820 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 60 300 960 520) 22 (Color-Hex '#eaf6ef')
  Stroke-RoundRect $g (RectF 60 300 960 520) 22 (Color-Hex '#dbe3ef') 2
  for ($i=0; $i -lt 9; $i++) {
    $pen = New-Object System.Drawing.Pen((Color-Hex '#cbd5e1'), 2)
    $g.DrawLine($pen, 90, 340 + $i*52, 990, 340 + $i*52)
    $g.DrawLine($pen, 110 + $i*96, 330, 110 + $i*96, 790)
    $pen.Dispose()
  }
  $pin = New-Object System.Drawing.SolidBrush((Color-Hex '#e11d48'))
  $g.FillEllipse($pin, 490, 500, 82, 82)
  $pin.Dispose()
  Draw-Text $g '현재 검색 위치' 420 610 230 34 $p (Color-Hex '#101827') 'Center'
  Fill-RoundRect $g (RectF 60 880 960 430) 22 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 60 880 960 430) 22 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '1km 이내 판매점' 96 920 360 44 $h (Color-Hex '#101827')
  $stores = @('행운복권 · 280m', '로또명당 · 640m', '복권나라 · 930m')
  for ($i=0; $i -lt $stores.Length; $i++) {
    $y = 1000 + ($i * 80)
    Fill-RoundRect $g (RectF 96 $y 820 56) 12 (Color-Hex '#f8fafc')
    Draw-Text $g $stores[$i] 126 ($y + 12) 620 30 $p (Color-Hex '#101827')
  }
  $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir 'screenshot-08-map.png')
}

function New-TabletScreenshot([string]$file, [string]$active, [string]$title, [string]$subtitle, [string]$mode) {
  $c = New-Canvas 1920 1080 (Color-Hex '#f6f8fb')
  $g = $c.Graphics
  Fill-RoundRect $g (RectF 40 34 1840 86) 24 (Color-Hex '#ffffff')
  Draw-LogoWord $g 70 54 0.9
  $nav = Font-Malgun 24 ([System.Drawing.FontStyle]::Bold)
  Fill-RoundRect $g (RectF 1620 54 190 46) 14 (Color-Hex '#ffe8ef')
  Draw-Text $g $active 1642 62 145 30 $nav (Color-Hex '#e11d48') 'Center'
  $h = Font-Malgun 42 ([System.Drawing.FontStyle]::Bold)
  $p = Font-Malgun 24
  Draw-Text $g $title 70 170 700 60 $h (Color-Hex '#101827')
  Draw-Text $g $subtitle 72 235 820 34 $p (Color-Hex '#64748b')
  Fill-RoundRect $g (RectF 70 320 460 180) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 70 320 460 180) 18 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '총 구매' 105 352 180 30 $p (Color-Hex '#64748b')
  Draw-Text $g '16게임' 105 392 220 56 $h (Color-Hex '#101827')
  Fill-RoundRect $g (RectF 70 535 460 180) 18 (Color-Hex '#ffffff')
  Stroke-RoundRect $g (RectF 70 535 460 180) 18 (Color-Hex '#dbe3ef') 2
  Draw-Text $g '수익률' 105 567 180 30 $p (Color-Hex '#64748b')
  Draw-Text $g '-68.8%' 105 607 220 56 $h (Color-Hex '#e11d48')
  if ($mode -eq 'qr') {
    Draw-Ticket $g 610 220 'Lotto 6/45' '제 1222회 인증' '#e11d48' @('08 22 26 32 36 41','02 05 16 21 31 39','02 18 26 28 29 37')
    Draw-Ticket $g 610 590 '연금복권 720+' '제 324회 추첨중' '#16a34a' @('1조 8 1 4 6 8 7','2조 8 1 4 6 8 7','3조 8 1 4 6 8 7')
  } elseif ($mode -eq 'radar') {
    Fill-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#ffffff')
    Stroke-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#e11d48') 3
    Draw-Text $g '제 1233회 추천 번호' 660 270 560 52 $h (Color-Hex '#101827')
    for ($i=0; $i -lt 5; $i++) {
      $y = 380 + ($i * 86)
      Draw-Text $g "게임 $($i+1)" 665 $y 100 40 $p (Color-Hex '#64748b')
      $nums = @(@(2,5,20,21,32,41),@(7,10,20,23,32,39),@(2,5,13,20,21,41),@(13,16,26,33,41,44),@(7,11,20,21,23,39))[$i]
      Draw-LottoBalls $g $nums 820 $y 48
    }
  } elseif ($mode -eq 'lab') {
    Fill-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#fff7f8')
    Stroke-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#fecdd3') 2
    Draw-Text $g 'OMR 백테스터' 660 270 500 52 $h (Color-Hex '#e11d48')
    $numFont = Font-Malgun 18 ([System.Drawing.FontStyle]::Bold)
    for ($n=1; $n -le 45; $n++) {
      $idx = $n - 1
      $col = $idx % 9
      $row = [math]::Floor($idx / 9)
      $x = 665 + ($col * 110)
      $y = 360 + ($row * 72)
      Fill-RoundRect $g (RectF $x $y 48 56) 4 (Color-Hex '#fffafa')
      Stroke-RoundRect $g (RectF $x $y 48 56) 4 (Color-Hex '#fda4af') 2
      Draw-Text $g ('{0:00}' -f $n) $x ($y + 14) 48 24 $numFont (Color-Hex '#e11d48') 'Center'
      if (@(4,11,12,19,28,40) -contains $n) {
        $bar = New-Object System.Drawing.SolidBrush((Color-Hex '#111827'))
        $g.FillRectangle($bar, $x + 7, $y + 23, 34, 12)
        $bar.Dispose()
      }
    }
    $numFont.Dispose()
  } else {
    Fill-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#ffffff')
    Stroke-RoundRect $g (RectF 610 220 1180 660) 22 (Color-Hex '#dbe3ef') 2
    Draw-Text $g '추천번호 · 인증게시판 · 문의/건의' 660 270 820 52 $h (Color-Hex '#101827')
    Draw-Ticket $g 660 380 'Lotto 6/45' '제 1232회 추천' '#d4a017' @('04 11 12 19 28 40')
  }
  $nav.Dispose(); $h.Dispose(); $p.Dispose()
  Save-Canvas $c (Join-Path $outDir $file)
}

New-AppIcon
New-FeatureGraphic
New-ScreenshotDashboard
New-ScreenshotQr
New-ScreenshotRadar
New-ScreenshotCommunity
New-ScreenshotResults
New-ScreenshotLab
New-ScreenshotRanking
New-ScreenshotMap
New-TabletScreenshot 'tablet-7-01-dashboard.png' '나의 전적' '나의 전적 대시보드' '구매와 당첨 기록을 태블릿에서도 넓게 확인합니다.' 'qr'
New-TabletScreenshot 'tablet-7-02-radar.png' '레이더' '번호 레이더' '추천 번호와 적중 이력을 한 화면에서 봅니다.' 'radar'
New-TabletScreenshot 'tablet-7-03-lab.png' '연구소' '복권 연구소' 'OMR 마킹처럼 번호를 고르고 역대 전적을 조회합니다.' 'lab'
New-TabletScreenshot 'tablet-7-04-community.png' '커뮤니티' '커뮤니티 공유' '저장 번호와 인증 이력을 용지 형태로 공유합니다.' 'community'
New-TabletScreenshot 'tablet-10-01-dashboard.png' '나의 전적' '나의 전적 대시보드' '구매와 당첨 기록을 태블릿에서도 넓게 확인합니다.' 'qr'
New-TabletScreenshot 'tablet-10-02-radar.png' '레이더' '번호 레이더' '추천 번호와 적중 이력을 한 화면에서 봅니다.' 'radar'
New-TabletScreenshot 'tablet-10-03-lab.png' '연구소' '복권 연구소' 'OMR 마킹처럼 번호를 고르고 역대 전적을 조회합니다.' 'lab'
New-TabletScreenshot 'tablet-10-04-community.png' '커뮤니티' '커뮤니티 공유' '저장 번호와 인증 이력을 용지 형태로 공유합니다.' 'community'

Get-ChildItem -LiteralPath $outDir -Filter *.png | Select-Object Name,Length,LastWriteTime

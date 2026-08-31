# Fabrique les icônes PNG de Season (192, 512, maskable 512) sans outil externe.
# Fond sombre facon appli, disque de progression bleu + triangle « lecture » blanc.
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'

  $bg = [System.Drawing.Color]::FromArgb(255, 15, 16, 21)
  $accent = [System.Drawing.Color]::FromArgb(255, 108, 140, 255)
  $ring = [System.Drawing.Color]::FromArgb(255, 46, 49, 64)

  # fond : coins arrondis sauf maskable (plein carré, la plateforme masque)
  $g.Clear($bg)
  if (-not $maskable) {
    $bmp2 = New-Object System.Drawing.Bitmap($size, $size)
    $g2 = [System.Drawing.Graphics]::FromImage($bmp2)
    $g2.SmoothingMode = 'AntiAlias'
    $r = [int]($size * 0.22)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, $r, $r, 180, 90)
    $gp.AddArc($size - $r, 0, $r, $r, 270, 90)
    $gp.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
    $gp.AddArc(0, $size - $r, $r, $r, 90, 90)
    $gp.CloseFigure()
    $g2.SetClip($gp)
    $g2.DrawImage($bmp, 0, 0)
    $g.Dispose(); $bmp.Dispose()
    $bmp = $bmp2; $g = $g2
  }

  # zone utile (maskable : marge de sécurité)
  $inset = if ($maskable) { $size * 0.22 } else { $size * 0.16 }
  $box = $size - 2 * $inset

  # anneau de fond
  $penRing = New-Object System.Drawing.Pen($ring, [single]($size * 0.075))
  $g.DrawEllipse($penRing, $inset, $inset, $box, $box)
  # arc bleu (progression ~70%)
  $penArc = New-Object System.Drawing.Pen($accent, [single]($size * 0.075))
  $penArc.StartCap = 'Round'; $penArc.EndCap = 'Round'
  $g.DrawArc($penArc, $inset, $inset, $box, $box, -90, 252)

  # triangle lecture blanc, centré
  $cx = $size / 2.0; $cy = $size / 2.0
  $t = $size * 0.15
  $pts = @(
    (New-Object System.Drawing.PointF([single]($cx - $t * 0.8), [single]($cy - $t))),
    (New-Object System.Drawing.PointF([single]($cx - $t * 0.8), [single]($cy + $t))),
    (New-Object System.Drawing.PointF([single]($cx + $t), [single]$cy))
  )
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.FillPolygon($white, $pts)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "écrit $path"
}

$dir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
New-Icon 192 (Join-Path $dir 'icon-192.png') $false
New-Icon 512 (Join-Path $dir 'icon-512.png') $false
New-Icon 512 (Join-Path $dir 'icon-maskable-512.png') $true

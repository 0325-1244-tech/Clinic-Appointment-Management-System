# Opens docs/CareConnect-Documentation.docx in Microsoft Word (Windows), fills in the
# table of contents, saves it, and also exports a PDF next to it for checking.
# Usage (PowerShell): .\scripts\update-word-toc.ps1      (run after npm run docs:word)
param([string]$Pdf = "")
$docx = (Resolve-Path (Join-Path $PSScriptRoot "..\..\docs\CareConnect-Documentation.docx")).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($docx, $false, $false, $false)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Save()
  if ($Pdf) { $doc.SaveAs2($Pdf, 17) }
  "pages: " + $doc.ComputeStatistics(2)
  $doc.Close(0)
} finally {
  $word.Quit()
}

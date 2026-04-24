$content = Get-Content 'c:\Users\AVANZA\.gemini\antigravity\scratch\erp_migration\frontend\src\pages\SalesTreasuryPage.tsx' -Raw;
$tokens = [regex]::Matches($content, '<div|</div>');
$stack = @();
foreach ($t in $tokens) {
    if ($t.Value -eq '<div') {
        $stack += $t.Index
    } else {
        if ($stack.Count -gt 0) {
            $stack = $stack[0..($stack.Count-2)]
        } else {
            $line = ($content.Substring(0, $t.Index).Split("`n").Count);
            Write-Host "Excess close at line $line";
        }
    }
}
Write-Host "Unclosed divs: $($stack.Count)";
foreach ($idx in $stack) {
    $line = ($content.Substring(0, $idx).Split("`n").Count);
    Write-Host "Unclosed div starting at line $line";
}

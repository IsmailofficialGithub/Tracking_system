Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\Mar\.gemini\antigravity-ide\brain\7cd36546-f15e-4e73-b234-cdb8c396b775\chronotrack_logo_1789416175452.jpg")
$img.Save("d:\coding\Axirom\Tracking_system\Frontend\build\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()

/**
 * Opens the Windows share sheet (Nearby sharing, Bluetooth, mail and every app that accepts files)
 * for one file. Windows has no Electron API for it, so a short PowerShell helper owns a one pixel
 * window next to ours and asks the system for the sheet. The file path arrives in an environment
 * variable, never inside the script text.
 */
export const WINDOWS_SHARE_SCRIPT = `
$Path = $env:SCRIM_SHARE_PATH
$X = [int]$env:SCRIM_SHARE_X
$Y = [int]$env:SCRIM_SHARE_Y
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDataTransferManagerInterop {
  IntPtr GetForWindow(IntPtr appWindow, [In] ref Guid riid);
  void ShowShareUIForWindow(IntPtr appWindow);
}
public static class ShareInterop {
  [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr classId, ref Guid iid, out IntPtr factory);
  [DllImport("combase.dll", CharSet = CharSet.Unicode)] static extern int WindowsCreateString(string src, int len, out IntPtr hs);
  static IDataTransferManagerInterop Factory() {
    string name = "Windows.ApplicationModel.DataTransfer.DataTransferManager";
    IntPtr hs; Marshal.ThrowExceptionForHR(WindowsCreateString(name, name.Length, out hs));
    Guid iid = new Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"); IntPtr f;
    Marshal.ThrowExceptionForHR(RoGetActivationFactory(hs, ref iid, out f));
    return (IDataTransferManagerInterop)Marshal.GetObjectForIUnknown(f);
  }
  public static object ManagerFor(IntPtr hwnd) {
    Guid iid = new Guid("A5CAEE9B-8708-49D1-8D36-67D25A8DA00C");
    return Marshal.GetObjectForIUnknown(Factory().GetForWindow(hwnd, ref iid));
  }
  public static void Show(IntPtr hwnd) { Factory().ShowShareUIForWindow(hwnd); }
}
'@

$dtmType = [Windows.ApplicationModel.DataTransfer.DataTransferManager, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]
$fileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
$task = $asTask.MakeGenericMethod($fileType).Invoke($null, @($fileType::GetFileFromPathAsync($Path)))
$task.Wait()
$script:file = $task.Result
$script:failed = $null
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.ShowInTaskbar = $false
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point($X, $Y)
$form.Size = New-Object System.Drawing.Size(1, 1)
$form.TopMost = $true
$script:shown = $false
$script:left = $false
$form.Add_Shown({
  try {
    $dtm = [Windows.ApplicationModel.DataTransfer.DataTransferManager][ShareInterop]::ManagerFor($form.Handle)
    $dtm.add_DataRequested({
      param($s, $e)
      $e.Request.Data.Properties.Title = [System.IO.Path]::GetFileName($Path)
      $e.Request.Data.SetStorageItems(@($script:file))
    }) | Out-Null
    [ShareInterop]::Show($form.Handle)
    $script:shown = $true
  } catch {
    $script:failed = $_.Exception.Message
    $form.Close()
  }
})
$form.Add_Deactivate({ $script:left = $true })
$form.Add_Activated({ if ($script:left -and $script:shown) { $form.Close() } })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600000
$timer.Add_Tick({ $form.Close() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
if ($script:failed) { [Console]::Error.WriteLine($script:failed); exit 2 }
`;

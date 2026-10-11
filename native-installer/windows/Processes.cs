using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal sealed class CheckResult
    {
        public int ExitCode;
        public string Output;
        public bool Cancelled;
        public bool TimedOut;
        public bool OutputIncomplete;
    }

    internal static class Processes
    {
        public static string PowerShellPath()
        {
            // Avoid PATH-selected executables and PowerShell Core; the backend targets Windows PowerShell 5.1.
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string path = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            if (!File.Exists(path)) throw new FileNotFoundException("Windows PowerShell was not found. See the setup guide.", path);
            return path;
        }

        // ProcessStartInfo.Arguments on Framework uses Windows argv quoting, not shell parsing.
        public static string QuoteArgument(string value)
        {
            if (value == null || value.IndexOf('\0') >= 0) throw new ArgumentException("Invalid process argument.");
            var result = new StringBuilder("\"");
            int slashes = 0;
            foreach (char character in value)
            {
                if (character == '\\') { slashes++; continue; }
                if (character == '"') result.Append('\\', slashes * 2 + 1);
                else result.Append('\\', slashes);
                slashes = 0;
                result.Append(character);
            }
            result.Append('\\', slashes * 2);
            return result.Append('"').ToString();
        }

        public static ProcessStartInfo SetupInfo(string executable, string kit, bool check)
        {
            string script = Path.Combine(kit, "setup", "Setup.ps1");
            KitFiles.RejectReparseAncestors(script);
            if (!File.Exists(script)) throw new FileNotFoundException("The kit setup script is missing.", script);
            return new ProcessStartInfo
            {
                FileName = executable,
                Arguments = "-NoLogo -NoProfile " + (check ? "-NonInteractive " : "-NoExit ") + "-File " + QuoteArgument(script) + (check ? " -Check" : ""),
                WorkingDirectory = kit,
                UseShellExecute = false,
                CreateNoWindow = check,
                RedirectStandardOutput = check,
                RedirectStandardError = check
            };
        }

        public static void LaunchSetup(string kit)
        {
            using (var process = Process.Start(SetupInfo(PowerShellPath(), kit, false)))
                if (process == null) throw new IOException("The setup console could not be opened.");
        }

        public static void LaunchFolder(string kit)
        {
            KitFiles.RejectReparseAncestors(kit);
            if (!Directory.Exists(kit)) throw new DirectoryNotFoundException("The placed Zero folder is missing.");
            string explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            using (var process = Process.Start(new ProcessStartInfo(explorer, QuoteArgument(Path.GetFullPath(kit))) { UseShellExecute = false }))
                if (process == null) throw new IOException("The Zero folder could not be opened.");
        }

        public static Task<CheckResult> CheckAsync(string kit, CancellationToken cancellation)
        {
            return RunAsync(SetupInfo(PowerShellPath(), kit, true), 180000, cancellation);
        }

        // Exposed to the local harness so errors/timeouts/cancellation use fake processes only.
        public static async Task<CheckResult> RunAsync(ProcessStartInfo info, int timeoutMilliseconds, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            using (var process = new Process { StartInfo = info })
            {
                if (!process.Start()) throw new IOException("The laptop check could not be started.");
                Task<string> stdout = ReadBoundedAsync(process.StandardOutput);
                Task<string> stderr = ReadBoundedAsync(process.StandardError);
                var result = await Task.Run(() =>
                {
                    var timer = Stopwatch.StartNew();
                    while (!process.WaitForExit(100))
                    {
                        if (!cancellation.IsCancellationRequested && timer.ElapsedMilliseconds < timeoutMilliseconds) continue;
                        try { process.Kill(); } catch (InvalidOperationException) { }
                        process.WaitForExit(5000);
                        return new CheckResult { ExitCode = 1, Cancelled = cancellation.IsCancellationRequested, TimedOut = !cancellation.IsCancellationRequested };
                    }
                    return new CheckResult { ExitCode = process.ExitCode };
                });
                // A child may retain a pipe after its parent exits. Never wait indefinitely for it.
                var reads = Task.WhenAll(stdout, stderr);
                if (await Task.WhenAny(reads, Task.Delay(2000)) == reads)
                    result.Output = (await stdout) + (await stderr);
                else
                {
                    result.OutputIncomplete = true;
                    if (result.ExitCode == 0) result.ExitCode = 1;
                    result.Output = "The check ended without complete output. Close any remaining tool-check process and check again.";
                }
                return result;
            }
        }

        private static async Task<string> ReadBoundedAsync(StreamReader reader)
        {
            const int maximum = 512 * 1024;
            var text = new StringBuilder();
            char[] buffer = new char[4096];
            bool truncated = false;
            try
            {
                int count;
                while ((count = await reader.ReadAsync(buffer, 0, buffer.Length)) > 0)
                {
                    int keep = Math.Min(count, maximum - text.Length);
                    if (keep > 0) text.Append(buffer, 0, keep);
                    if (keep < count) truncated = true;
                }
            }
            catch (ObjectDisposedException) { }
            catch (IOException) { }
            if (truncated) text.Append("\r\n[Check output truncated.]\r\n");
            return text.ToString();
        }
    }
}

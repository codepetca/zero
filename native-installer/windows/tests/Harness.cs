using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ZeroSetup;

internal static class Harness
{
    private static int checks;
    private static void Assert(bool condition, string name)
    {
        if (!condition) throw new Exception("FAILED: " + name);
        checks++;
    }

    private static void Reject(Action action, string name)
    {
        try { action(); } catch (IOException) { checks++; return; }
        catch (InvalidDataException) { checks++; return; }
        throw new Exception("FAILED: accepted " + name);
    }

    private static MemoryStream Archive(string extra = null, int attributes = 0)
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
        {
            foreach (string name in new[] { "setup/Setup.ps1", "setup/Setup.cmd", "setup/README.md", "starter/zero.json", "START-HERE.md" })
                using (var writer = new StreamWriter(archive.CreateEntry("zero-kit/" + name).Open())) writer.Write("trusted fixture");
            if (extra != null)
            {
                var entry = archive.CreateEntry(extra);
                entry.ExternalAttributes = attributes;
                using (var writer = new StreamWriter(entry.Open())) writer.Write("x");
            }
        }
        stream.Position = 0;
        return stream;
    }

    private static int Main(string[] args)
    {
        // macOS /var is a link; use the ignored checkout cache so link guards remain enabled.
        string root = Path.Combine(Directory.GetCurrentDirectory(), ".verification", "windows-native", "harness " + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            TestCloseDuringPausedWork(root);
            checks += ControllerHarness.Run(root);
            checks += EnvironmentHarness.Run();
            string home = Path.Combine(root, "default-home"); Directory.CreateDirectory(home);
            Assert(KitFiles.ResolveDefaultFolder(home) == Path.Combine(home, "Zero") && !Directory.EnumerateFileSystemEntries(home).Any(), "default selection read-only in home");
            File.WriteAllText(Path.Combine(home, "Zero"), "existing file");
            Directory.CreateDirectory(Path.Combine(home, "Zero-2")); File.WriteAllText(Path.Combine(home, "Zero-2", "keep.txt"), "student project");
            Assert(KitFiles.ResolveDefaultFolder(home) == Path.Combine(home, "Zero-3"), "default skips files and existing projects");
            Assert(File.ReadAllText(Path.Combine(home, "Zero")) == "existing file" && File.ReadAllText(Path.Combine(home, "Zero-2", "keep.txt")) == "student project", "default selection preserves existing work");
            Reject(() => KitFiles.ResolveDefaultFolder(null), "missing user home");
            Reject(() => KitFiles.ResolveDefaultFolder(Path.Combine(root, "never-existing-home")), "nonexistent user home");
            try { KitFiles.ResolveDefaultFolder(home, path => { if (path == home) return FileAttributes.Directory; throw new UnauthorizedAccessException("lookup denied"); }); throw new Exception("FAILED selection error swallowed"); }
            catch (UnauthorizedAccessException) { checks++; }
            Reject(() => KitFiles.ResolveDefaultFolder(home, path => FileAttributes.Directory), "bounded exhausted default names");
            Assert(KitFiles.ResolveDefaultFolder(home, path => { if (path == home) return FileAttributes.Directory; if (Path.GetFileName(path) == "Zero") return FileAttributes.ReparsePoint; throw new FileNotFoundException(); }) == Path.Combine(home, "Zero-2"), "default reserves reparse entry name");
            string extracted = Path.Combine(root, "extracted");
            Directory.CreateDirectory(extracted);
            using (var archive = Archive()) KitFiles.Extract(archive, extracted, CancellationToken.None);
            Assert(File.ReadAllText(Path.Combine(extracted, "starter", "zero.json")) == "trusted fixture", "valid extraction");
            foreach (string name in new[] { "../escape", "zero-kit/../escape", "zero-kit/a/../../escape", "zero-kit/C:/escape", "zero-kit/a\\b", "zero-kit/NUL.txt", "zero-kit/a./b", "zero-kit//empty", "other/file", "zero-kit/SETUP/setup.ps1", "zero-kit/setup", "zero-kit/starter/zero.json/child" })
            {
                string output = Path.Combine(root, Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(output);
                using (var archive = Archive(name)) Reject(() => KitFiles.Extract(archive, output, CancellationToken.None), "ZIP path " + name);
                Assert(!Directory.EnumerateFileSystemEntries(output).Any(), "validation before writing " + name);
            }
            using (var archive = Archive("zero-kit/link", unchecked((int)0xa1ff0000)))
                Reject(() => KitFiles.Extract(archive, extracted, CancellationToken.None), "ZIP symlink");
            using (var archive = Archive("zero-kit/link", 0x400))
                Reject(() => KitFiles.Extract(archive, extracted, CancellationToken.None), "ZIP reparse flag");
            using (var empty = new MemoryStream())
            {
                using (var zip = new ZipArchive(empty, ZipArchiveMode.Create, true)) zip.CreateEntry("zero-kit/file");
                empty.Position = 0;
                Reject(() => KitFiles.Extract(empty, extracted, CancellationToken.None), "incomplete kit");
            }
            string placed = KitFiles.PlaceFreshKit(extracted, root, "Student project & spaces", CancellationToken.None);
            Assert(File.Exists(Path.Combine(placed, "setup", "Setup.ps1")), "fresh kit copied");
            File.WriteAllText(Path.Combine(placed, "keep.txt"), "student work");
            Reject(() => KitFiles.PlaceFreshKit(extracted, root, "Student project & spaces", CancellationToken.None), "existing folder");
            Assert(File.ReadAllText(Path.Combine(placed, "keep.txt")) == "student work", "student project preserved");
            File.WriteAllText(Path.Combine(root, "existing-file"), "keep");
            Reject(() => KitFiles.PlaceFreshKit(extracted, root, "existing-file", CancellationToken.None), "existing file");
            var cancelled = new CancellationTokenSource();
            cancelled.Cancel();
            try { KitFiles.PlaceFreshKit(extracted, root, "cancelled", cancelled.Token); throw new Exception("FAILED cancellation"); }
            catch (OperationCanceledException) { checks++; }
            Assert(!Directory.Exists(Path.Combine(root, "cancelled")) && !Directory.GetDirectories(root, ".ZeroSetup-*").Any(), "cancel cleans stage");
            Reject(() => KitFiles.PlaceFreshKit(extracted, root, "../escape", CancellationToken.None), "folder traversal");
            Assert(Processes.QuoteArgument("C:\\Folder name\\") == "\"C:\\Folder name\\\\\"", "trailing slash quote");
            Assert(Processes.QuoteArgument("a\"b") == "\"a\\\"b\"", "embedded quote");
            Assert(Processes.QuoteArgument("x&%$; y") == "\"x&%$; y\"", "literal metacharacters");
            var check = Processes.SetupInfo("powershell.exe", placed, true);
            Assert(!check.UseShellExecute && check.CreateNoWindow && check.Arguments.Contains("-NonInteractive -File ") && check.Arguments.EndsWith(" -Check"), "read-only check flags");
            var setup = Processes.SetupInfo("powershell.exe", placed, false);
            Assert(!setup.UseShellExecute && !setup.CreateNoWindow && !setup.Arguments.Contains("-Check") && !setup.Arguments.Contains("ExecutionPolicy"), "normal policy setup console");

            // Fake processes on Unix only; native PowerShell/WinForms remain a Windows pilot.
            if (Path.DirectorySeparatorChar == '/')
            {
                string script = Path.Combine(root, "fake check.sh");
                File.WriteAllText(script, "printf 'fixture output\\n'; printf 'fixture error\\n' >&2; exit 7\n");
                var info = FakeInfo(script);
                var result = Processes.RunAsync(info, 2000, CancellationToken.None).GetAwaiter().GetResult();
                Assert(result.ExitCode == 7 && result.Output.Contains("fixture output") && result.Output.Contains("fixture error"), "check nonzero/stdout/stderr");
                File.WriteAllText(script, "sleep 4 &\nexit 0\n");
                try
                {
                    result = Processes.RunAsync(FakeInfo(script), 3000, CancellationToken.None).GetAwaiter().GetResult();
                    Assert(result.OutputIncomplete && result.ExitCode != 0 && result.Output.Contains("without complete output"), "incomplete check output cannot pass");
                }
                finally
                {
                    // Let the short-lived fixture child finish, including when an assertion fails.
                    Thread.Sleep(2200);
                }
                File.WriteAllText(script, "exec sleep 10\n");
                result = Processes.RunAsync(FakeInfo(script), 150, CancellationToken.None).GetAwaiter().GetResult();
                Assert(result.TimedOut && result.ExitCode != 0, "check timeout");
                using (var token = new CancellationTokenSource(150))
                {
                    result = Processes.RunAsync(FakeInfo(script), 3000, token.Token).GetAwaiter().GetResult();
                    Assert(result.Cancelled && result.ExitCode != 0, "running check cancellation");
                }
                var link = Path.Combine(root, "linked");
                using (var process = Process.Start(new ProcessStartInfo("/bin/ln", "-s " + Processes.QuoteArgument(extracted) + " " + Processes.QuoteArgument(link)) { UseShellExecute = false })) process.WaitForExit();
                Reject(() => KitFiles.PlaceFreshKit(link, root, "linked-copy", CancellationToken.None), "copy source symlink");
                File.Delete(link);
                string dangling = Path.Combine(home, "Zero-3");
                using (var process = Process.Start(new ProcessStartInfo("/bin/ln", "-s " + Processes.QuoteArgument(Path.Combine(home, "missing-target")) + " " + Processes.QuoteArgument(dangling)) { UseShellExecute = false })) process.WaitForExit();
                Assert((File.GetAttributes(dangling) & FileAttributes.ReparsePoint) != 0 && KitFiles.ResolveDefaultFolder(home) == Path.Combine(home, "Zero-4"), "default skips actual dangling symlink");
                Reject(() => KitFiles.PlaceFreshKit(extracted, home, "Zero-3", CancellationToken.None), "fresh copy rejects dangling destination");
                File.Delete(dangling);
            }
            if (args.Length > 0)
            {
                string realKit = Path.Combine(root, "real-kit");
                Directory.CreateDirectory(realKit);
                using (var bytes = File.OpenRead(args[0])) KitFiles.Extract(bytes, realKit, CancellationToken.None);
                Assert(File.Exists(Path.Combine(realKit, "starter", "pom.xml")), "real kit extraction");
            }
            Console.WriteLine("Windows wrapper harness: " + checks + " checks passed.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { KitFiles.DeleteOwnedDirectory(root); }
    }

    private static void TestCloseDuringPausedWork(string root)
    {
        string temporary = Path.Combine(root, "close-gate-private");
        string stage = Path.Combine(root, ".ZeroSetup-close-gate");
        Directory.CreateDirectory(temporary);
        var gate = new CloseGate();
        gate.SetBusy(true);
        using (var started = new ManualResetEventSlim())
        using (var release = new ManualResetEventSlim())
        using (var lifetime = new CancellationTokenSource())
        {
            var work = Task.Run(() =>
            {
                Directory.CreateDirectory(stage);
                File.WriteAllText(Path.Combine(stage, "partial.txt"), "paused staging fixture");
                started.Set();
                try { if (!release.Wait(5000)) throw new Exception("Paused fixture was not released."); }
                finally { KitFiles.DeleteOwnedDirectory(stage); }
            });
            try
            {
                Assert(started.Wait(3000), "paused work started");
                var request = new CancelEventArgs();
                Assert(!gate.TryClose(request, lifetime.Cancel) && request.Cancel, "active work prevents close");
                Assert(!lifetime.IsCancellationRequested && Directory.Exists(stage), "deferred close keeps work alive");
                release.Set();
                work.GetAwaiter().GetResult();
                gate.SetBusy(false);
                Assert(!Directory.Exists(stage), "work cleanup completes before close allowed");
                request = new CancelEventArgs();
                Assert(gate.TryClose(request, () =>
                {
                    lifetime.Cancel();
                    KitFiles.DeleteOwnedDirectory(temporary);
                }) && !request.Cancel, "idle close allowed");
                Assert(lifetime.IsCancellationRequested && !Directory.Exists(temporary), "idle close cancels and removes owned temporary files");
            }
            finally { release.Set(); work.GetAwaiter().GetResult(); }
        }
    }

    private static ProcessStartInfo FakeInfo(string script)
    {
        return new ProcessStartInfo("/bin/sh", Processes.QuoteArgument(script)) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
    }
}

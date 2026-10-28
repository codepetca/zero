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
        string root = Path.Combine(Directory.GetCurrentDirectory(), ".verification", "upgrade-default", "windows-fixtures " + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            TestCloseDuringPausedWork(root);
            checks += ControllerHarness.Run(root);
            checks += EnvironmentHarness.Run();
            checks += AutomaticControllerHarness.Run();
            checks += RuntimeHarness.Run();
            string home = Path.Combine(root, "default-home"); Directory.CreateDirectory(home);
            Assert(KitFiles.ResolveDefaultFolder(home) == Path.Combine(home, "Zero") && !Directory.EnumerateFileSystemEntries(home).Any(), "default selection read-only in home");
            File.WriteAllText(Path.Combine(home, "Zero"), "existing file");
            Reject(() => KitFiles.ResolveDefaultFolder(home), "default refuses existing file");
            Assert(File.ReadAllText(Path.Combine(home, "Zero")) == "existing file", "default preserves occupied file");
            File.Delete(Path.Combine(home, "Zero")); Directory.CreateDirectory(Path.Combine(home, "Zero"));
            File.WriteAllText(Path.Combine(home, "Zero", "keep.txt"), "student project");
            Reject(() => KitFiles.ResolveDefaultFolder(home), "default refuses unrelated directory");
            Assert(!Directory.Exists(Path.Combine(home, "Zero-2")), "default never chooses numbered folder");
            Reject(() => KitFiles.ResolveDefaultFolder(null), "missing user home");
            Reject(() => KitFiles.ResolveDefaultFolder(Path.Combine(root, "never-existing-home")), "nonexistent user home");
            TestUpdates(root);
            string extracted = Path.Combine(root, "extracted");
            Directory.CreateDirectory(extracted);
            using (var archive = Archive()) KitFiles.Extract(archive, extracted, CancellationToken.None);
            Assert(File.ReadAllText(Path.Combine(extracted, "starter", "zero.json")) == "trusted fixture", "valid extraction");
            string retainedRoot = Path.Combine(root, "retained");
            byte[] firstArchive; using (var archive = Archive()) firstArchive = archive.ToArray();
            string firstKit; using (var archive = new MemoryStream(firstArchive)) firstKit = KitFiles.RetainEmbeddedKit(archive, retainedRoot, CancellationToken.None);
            string again; using (var archive = new MemoryStream(firstArchive)) again = KitFiles.RetainEmbeddedKit(archive, retainedRoot, CancellationToken.None);
            Assert(firstKit == again && File.ReadAllText(Path.Combine(firstKit, "starter", "zero.json")) == "trusted fixture", "retained embedded kit survives reuse for an open editor");
            string secondKit; using (var archive = Archive("zero-kit/extra.txt")) secondKit = KitFiles.RetainEmbeddedKit(archive, retainedRoot, CancellationToken.None);
            Assert(firstKit != secondKit && File.Exists(Path.Combine(firstKit, "starter", "zero.json")), "new embedded kit retains old editor version");
            File.WriteAllText(Path.Combine(firstKit, "starter", "zero.json"), "tampered");
            using (var archive = new MemoryStream(firstArchive)) Reject(() => KitFiles.RetainEmbeddedKit(archive, retainedRoot, CancellationToken.None), "modified retained kit fails closed");
            Assert(File.ReadAllText(Path.Combine(firstKit, "starter", "zero.json")) == "tampered" && File.Exists(Path.Combine(secondKit, "starter", "zero.json")), "failed validation preserves both snapshots");
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
                Directory.Delete(Path.Combine(home, "Zero"), true);
                string dangling = Path.Combine(home, "Zero");
                using (var process = Process.Start(new ProcessStartInfo("/bin/ln", "-s " + Processes.QuoteArgument(Path.Combine(home, "missing-target")) + " " + Processes.QuoteArgument(dangling)) { UseShellExecute = false })) process.WaitForExit();
                Assert((File.GetAttributes(dangling) & FileAttributes.ReparsePoint) != 0, "actual dangling symlink detected");
                Reject(() => KitFiles.ResolveDefaultFolder(home), "default refuses dangling symlink");
                Reject(() => KitFiles.PlaceFreshKit(extracted, home, "Zero", CancellationToken.None), "fresh copy rejects dangling destination");
                File.Delete(dangling);
            }
            if (args.Length > 0)
            {
                string realKit = Path.Combine(root, "real-kit");
                Directory.CreateDirectory(realKit);
                using (var bytes = File.OpenRead(args[0])) KitFiles.Extract(bytes, realKit, CancellationToken.None);
                Assert(File.Exists(Path.Combine(realKit, "starter", "pom.xml")), "real kit extraction");
                string actualHome = Path.Combine(root, "embedded-upgrade-home"); CreateKit(Path.Combine(actualHome, "Zero"), "0.5.3");
                File.WriteAllText(Path.Combine(actualHome, "Zero", "starter", "saved.txt"), "student saved project");
                KitFiles.UpdateKit(realKit, KitFiles.InspectDefaultFolder(actualHome), CancellationToken.None);
                Assert(File.ReadAllText(Path.Combine(actualHome, "Zero", "setup", "kit.properties")) == File.ReadAllText(Path.Combine(realKit, "setup", "kit.properties")), "existing embedded kit updates exact runtime metadata");
                Assert(File.ReadAllText(Path.Combine(actualHome, "Zero", "starter", "saved.txt")) == "student saved project", "embedded kit update preserves student save");
            }
            Console.WriteLine("Windows wrapper harness: " + checks + " checks passed.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { KitFiles.DeleteOwnedDirectory(root); }
    }

    internal static void CreateKit(string root, string version)
    {
        foreach (string relative in new[] { "setup/Setup.cmd", "setup/Setup.ps1", "setup/Setup.command", "setup/setup.sh", "setup/README.md", "starter/zero.json", "START-HERE.md", "LICENSE", "zero-" + version + ".vsix" })
        {
            string path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)); File.WriteAllText(path, version + ":" + relative);
        }
        File.WriteAllText(Path.Combine(root, "setup", "kit.properties"), "kitVersion=" + version + "\nextensionId=zero.zero\nvscodeMinimum=1.95.0\n");
    }
    private static void TestUpdates(string root)
    {
        string source = Path.Combine(root, "upgrade-source"); CreateKit(source, "0.5.6");
        string newerHome = Path.Combine(root, "newer-home"); CreateKit(Path.Combine(newerHome, "Zero"), "0.5.17");
        Reject(() => KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(newerHome), CancellationToken.None), "older installer cannot downgrade newer support");
        Assert(File.ReadAllText(Path.Combine(newerHome, "Zero", "setup", "kit.properties")).Contains("kitVersion=0.5.17"), "downgrade keeps newer metadata");
        string matchingHome = Path.Combine(root, "matching-home"); CreateKit(Path.Combine(matchingHome, "Zero"), "0.5.6");
        KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(matchingHome), CancellationToken.None);
        Assert(Directory.GetDirectories(matchingHome).Length == 1, "same support files create no backup or staging");
        string home = Path.Combine(root, "upgrade-home"), destination = Path.Combine(home, "Zero"); CreateKit(destination, "0.5.3");
        string[] studentPaths = { "starter/src/Main.java", "starter/src/zero/App.java", "starter/pom.xml", "starter/.vscode/settings.json", "starter/.git/config", "starter/assets/image.png", "starter/saves/game.dat", "optional/Zero.code-profile", "optional/optional-keybindings.json", "my-notes.txt", "zero-0.5.3.vsix" };
        foreach (string relative in studentPaths)
        {
            string path = Path.Combine(destination, relative); Directory.CreateDirectory(Path.GetDirectoryName(path)); File.WriteAllText(path, "student bytes: " + relative);
        }
        var preserved = studentPaths.ToDictionary(path => path, path => File.ReadAllBytes(Path.Combine(destination, path)));
        string backup = null;
        var expected = KitFiles.InspectDefaultFolder(home);
        Assert(expected.Existing && KitFiles.ResolveDefaultFolder(home) == destination, "recognized kit selected read-only");
        KitFiles.UpdateKit(source, expected, CancellationToken.None, message => backup = message.Substring("Setup runtime backup: ".Length));
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.ps1")).StartsWith("0.5.6:") && File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.6"), "runtime and metadata upgraded");
        Assert(File.Exists(Path.Combine(destination, "zero-0.5.3.vsix")) && File.Exists(Path.Combine(destination, "zero-0.5.6.vsix")), "old vsix retained and current bundle installed");
        Assert(Directory.Exists(backup) && File.ReadAllText(Path.Combine(backup, "setup", "Setup.ps1")).StartsWith("0.5.3:"), "backup path records old runtime");
        foreach (string relative in studentPaths) Assert(File.ReadAllBytes(Path.Combine(destination, relative)).SequenceEqual(preserved[relative]), "preserved " + relative);
        KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None);
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.6"), "repeat update supported");
        foreach (string relative in studentPaths) Assert(File.ReadAllBytes(Path.Combine(destination, relative)).SequenceEqual(preserved[relative]), "repeat preserved " + relative);
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
        string oldScript = File.ReadAllText(Path.Combine(destination, "setup", "Setup.ps1"));
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, afterReplace: path => { if (path == "setup/Setup.ps1") throw new IOException("injected failure"); }), "injected replacement failure");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.ps1")) == oldScript && File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.3"), "failure restores old runtime and metadata");
        KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None);
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.ps1")).StartsWith("0.5.6:"), "explicit retry succeeds after rollback");
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, beforeCommit: path => File.WriteAllText(Path.Combine(path, "setup", "Setup.ps1"), "raced runtime")), "runtime race at commit");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.ps1")) == "raced runtime", "raced runtime not overwritten");
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
        string driftBackup = null;
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, diagnostic: message => { if (message.StartsWith("Setup runtime backup: ")) driftBackup = message.Substring("Setup runtime backup: ".Length); }, afterReplace: path =>
        {
            if (path == "setup/Setup.cmd") File.WriteAllText(Path.Combine(destination, "setup", "README.md"), "external edit during update");
        }), "later runtime edit detected during atomic replacement");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "README.md")) == "external edit during update", "actual replaced external edit restored");
        Assert(driftBackup != null && File.ReadAllText(Path.Combine(driftBackup, "replaced-at-commit", "setup", "README.md")) == "external edit during update", "actual replaced entry retained in diagnostic backup");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.cmd")).StartsWith("0.5.3:") && File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.3"), "drift rolls back prior runtime without committing metadata");
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home); driftBackup = null;
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, diagnostic: message => { if (message.StartsWith("Setup runtime backup: ")) driftBackup = message.Substring("Setup runtime backup: ".Length); }, afterReplace: path =>
        {
            if (path == "setup/Setup.cmd") { File.WriteAllText(Path.Combine(destination, "setup", "Setup.cmd"), "external edit before rollback"); throw new IOException("injected failure after edit"); }
        }), "rollback preserves edits to already installed file");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.cmd")).StartsWith("0.5.3:"), "rollback restores original entry");
        Assert(driftBackup != null && File.ReadAllText(Path.Combine(driftBackup, "replaced-at-rollback", "setup", "Setup.cmd")) == "external edit before rollback", "latest rollback entry retained atomically");
        foreach (string relative in studentPaths.Where(path => path != "zero-0.5.3.vsix")) Assert(File.ReadAllBytes(Path.Combine(destination, relative)).SequenceEqual(preserved[relative]), "drift preserves student " + relative);
        CreateKit(destination, "0.5.3"); File.Delete(Path.Combine(destination, "zero-0.5.6.vsix")); expected = KitFiles.InspectDefaultFolder(home); driftBackup = null;
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, diagnostic: message => { if (message.StartsWith("Setup runtime backup: ")) driftBackup = message.Substring("Setup runtime backup: ".Length); }, afterReplace: path =>
        {
            if (path == "zero-0.5.6.vsix") { File.WriteAllText(Path.Combine(destination, path), "edit to newly installed file"); throw new IOException("injected new file rollback"); }
        }), "rollback retains unknown bytes in newly installed file");
        Assert(driftBackup != null && File.ReadAllText(Path.Combine(driftBackup, "replaced-at-rollback", "zero-0.5.6.vsix")) == "edit to newly installed file", "new file rollback moves latest edit into retained backup");
        Assert(!File.Exists(Path.Combine(destination, "zero-0.5.6.vsix")) && File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.3"), "new file rollback removes transaction placement and keeps old metadata");
        string freshHome = Path.Combine(root, "fresh-race-home"); Directory.CreateDirectory(freshHome);
        Reject(() => KitFiles.PlaceFreshKit(source, freshHome, "Zero", CancellationToken.None, path => CreateKit(path, "0.5.3")), "fresh race cannot become update");
        Assert(File.ReadAllText(Path.Combine(freshHome, "Zero", "setup", "kit.properties")).Contains("0.5.3"), "fresh race kit preserved until explicit confirmation");
        using (var cancel = new CancellationTokenSource())
        {
            cancel.Cancel(); string[] entries = Directory.GetFileSystemEntries(home);
            try { KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), cancel.Token); throw new Exception("Cancellation accepted"); }
            catch (OperationCanceledException) { checks++; }
            Assert(entries.SequenceEqual(Directory.GetFileSystemEntries(home)), "cancelled update has no staging writes");
        }
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
        using (var cancel = new CancellationTokenSource())
        {
            try { KitFiles.UpdateKit(source, expected, cancel.Token, afterReplace: path => cancel.Cancel()); throw new Exception("Cancellation accepted"); }
            catch (OperationCanceledException) { checks++; }
            Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.cmd")).StartsWith("0.5.3:") && File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.3"), "cancel during commit restores old runtime");
        }
        KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None);
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "kit.properties")).Contains("0.5.6"), "retry after commit cancellation succeeds");
        CreateKit(destination, "0.5.3");
        int competingChecks = 0;
        KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None, beforeCommit: path =>
        {
            Task.Run(() =>
            {
                try { KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None); throw new Exception("Concurrent update accepted"); }
                catch (IOException error) { if (!error.Message.Contains("Another Zero update")) throw; Interlocked.Increment(ref competingChecks); }
            }).GetAwaiter().GetResult();
        });
        Assert(competingChecks == 1, "concurrent updates serialized before filesystem writes");
        CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
        string retained = null;
        Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, diagnostic: message => { if (message.StartsWith("Setup runtime backup: ")) retained = message.Substring("Setup runtime backup: ".Length); }, afterReplace: path =>
        {
            if (path == "setup/Setup.ps1") { string changed = Path.Combine(destination, "setup", "Setup.ps1"); File.Delete(changed); Directory.CreateDirectory(changed); throw new IOException("injected restore failure"); }
        }), "restore failure surfaced");
        Assert(retained != null && Directory.Exists(retained) && File.ReadAllText(Path.Combine(retained, "setup", "Setup.ps1")).StartsWith("0.5.3:"), "restore failure retains old runtime backup");
        Assert(File.ReadAllText(Path.Combine(destination, "setup", "Setup.cmd")).StartsWith("0.5.3:"), "restore attempts other runtime files after one restore failure");
        Directory.Delete(Path.Combine(destination, "setup", "Setup.ps1")); CreateKit(destination, "0.5.3");
        string badHome = Path.Combine(root, "invalid-kit-home"); CreateKit(Path.Combine(badHome, "Zero"), "0.5.3");
        File.WriteAllText(Path.Combine(badHome, "Zero", "setup", "kit.properties"), "kitVersion=bad\nextensionId=zero.zero\nvscodeMinimum=1.95.0\n");
        Reject(() => KitFiles.InspectDefaultFolder(badHome), "invalid metadata cannot be approved");
        if (Path.DirectorySeparatorChar == '/')
        {
            CreateKit(destination, "0.5.3"); expected = KitFiles.InspectDefaultFolder(home);
            string moved = Path.Combine(home, "student-backup");
            Reject(() => KitFiles.UpdateKit(source, expected, CancellationToken.None, beforeCommit: path => { Directory.Move(path, moved); Directory.CreateDirectory(path); File.WriteAllText(Path.Combine(path, "keep.txt"), "racing unrelated directory"); }), "folder replacement race");
            Assert(File.ReadAllText(Path.Combine(destination, "keep.txt")) == "racing unrelated directory" && File.ReadAllText(Path.Combine(moved, "setup", "kit.properties")).Contains("0.5.3"), "folder race preserves both directories");
            Directory.Delete(destination, true); Directory.Move(moved, destination);
        }
        if (Path.DirectorySeparatorChar == '/')
        {
            string studentLink = Path.Combine(destination, "starter", "linked-assets");
            using (var process = Process.Start(new ProcessStartInfo("/bin/ln", "-s " + Processes.QuoteArgument(source) + " " + Processes.QuoteArgument(studentLink)) { UseShellExecute = false })) process.WaitForExit();
            KitFiles.UpdateKit(source, KitFiles.InspectDefaultFolder(home), CancellationToken.None);
            Assert((File.GetAttributes(studentLink) & FileAttributes.ReparsePoint) != 0, "student link preserved without recursive refusal");
            File.Delete(studentLink);
            string script = Path.Combine(destination, "setup", "Setup.ps1"); File.Delete(script);
            using (var process = Process.Start(new ProcessStartInfo("/bin/ln", "-s " + Processes.QuoteArgument(Path.Combine(source, "setup", "Setup.ps1")) + " " + Processes.QuoteArgument(script)) { UseShellExecute = false })) process.WaitForExit();
            Reject(() => KitFiles.InspectDefaultFolder(home), "managed file link refused"); File.Delete(script);
        }
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

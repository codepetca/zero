using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using ZeroSetup;

internal static class RuntimeHarness
{
    private static int checks;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static void Assert(bool value, string name) { if (!value) throw new Exception("FAILED runtime: " + name); checks++; }
    private static void Reject(Action action, string name)
    {
        try { action(); } catch (IOException) { checks++; return; }
        throw new Exception("FAILED runtime rejection: " + name);
    }
    private static void Cancelled(Action action, string name)
    {
        try { action(); } catch (OperationCanceledException) { checks++; return; }
        throw new Exception("FAILED runtime cancellation: " + name);
    }
    private static byte[] Zip(params string[] entries)
    {
        using (var output = new MemoryStream())
        {
            using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
                for (int i = 0; i < entries.Length; i += 2)
                    using (var writer = new StreamWriter(zip.CreateEntry(entries[i]).Open())) writer.Write(entries[i + 1]);
            return output.ToArray();
        }
    }
    private sealed class FakeHost : IWindowsRuntimeHost
    {
        public string Architecture { get; set; } = "AMD64";
        public bool Unsupported, BrokenDownload, CancelDownload, RejectInstall, Timeout;
        public int Downloads, Installs, Runs;
        public string JavaVersion = "21.0.12";
        public string ZeroVersion, RedhatVersion;
        public string InstalledEditor;
        public byte[] Jdk = Zip("jdk-21/bin/java.exe", "fake java", "jdk-21/bin/javac.exe", "fake compiler", "jdk-21/release", "JAVA_VERSION=21\nOS_ARCH=amd64");
        public byte[] Editor = Zip("Code.exe", "fake code", "bin/code.cmd", "@echo off\r\n\"%~dp0..\\Code.exe\" \"%~dp0..\\6d62b1d5da\\resources\\app\\out\\cli.js\" %*\r\n", "6d62b1d5da/resources/app/out/cli.js", "fake CLI", "6d62b1d5da/resources/app/product.json", "{\"quality\":\"stable\"}", "6d62b1d5da/resources/app/package.json", "{\"version\":\"1.142.0\"}");
        public ProcessStartInfo Launched;
        public readonly List<ProcessStartInfo> Commands = new List<ProcessStartInfo>();
        public void ValidatePlatform() { if (Unsupported) throw new IOException("fake unsupported Windows"); }
        public IEnumerable<string> InstalledEditors() { if (InstalledEditor != null) yield return InstalledEditor; }
        public Task Download(WindowsRuntimeAsset asset, string destination, CancellationToken cancellation)
        {
            Downloads++;
            File.WriteAllBytes(destination, BrokenDownload ? new byte[] { 1, 2, 3 } : asset.version.StartsWith("jdk", StringComparison.Ordinal) ? Jdk : Editor);
            if (CancelDownload) throw new OperationCanceledException(cancellation);
            return Task.CompletedTask;
        }
        public Task<CheckResult> Run(ProcessStartInfo info, int milliseconds, CancellationToken cancellation)
        {
            Runs++; Commands.Add(info);
            Assert(!info.WorkingDirectory.Contains(Path.DirectorySeparatorChar + "kit"), "child working folder outside temporary bundled kit");
            Assert(!info.UseShellExecute && info.RedirectStandardError && info.RedirectStandardOutput && info.RedirectStandardInput, "bounded native commands avoid shells");
            Assert(info.EnvironmentVariables["JAVA_HOME"].Contains("jdk-"), "private Java propagated to every command");
            Assert(info.EnvironmentVariables["PATH"].StartsWith(Path.Combine(info.EnvironmentVariables["JAVA_HOME"], "bin") + ";", StringComparison.Ordinal), "private Java first in child PATH");
            Assert(info.EnvironmentVariables["VSCODE_PORTABLE"] == null, "portable environment removed");
            string output;
            if (info.FileName.EndsWith("javac.exe", StringComparison.Ordinal)) output = "javac " + JavaVersion + "\n";
            else if (info.FileName.EndsWith("java.exe", StringComparison.Ordinal)) output = "openjdk version \"" + JavaVersion + "\"\n";
            else
            {
                Assert(info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] == "1" && info.Arguments.Contains("cli.js"), "Code.exe runs CLI JavaScript directly");
                Assert(info.Arguments.Contains("--user-data-dir") && info.Arguments.Contains("--extensions-dir"), "all editor commands isolated");
                if (info.Arguments.Contains("--install-extension"))
                {
                    Installs++;
                    if (!RejectInstall) { if (info.Arguments.Contains("redhat.java")) RedhatVersion = "1.50.0"; else ZeroVersion = "0.5.18"; }
                    output = "installed\n";
                }
                else if (info.Arguments.Contains("--list-extensions")) output = (ZeroVersion == null ? "" : "zero.zero@" + ZeroVersion + "\n") + (RedhatVersion == null ? "" : "redhat.java@" + RedhatVersion + "\n");
                else output = "1.142.0\ncommit\nx64\n";
            }
            return Task.FromResult(new CheckResult { ExitCode = 0, Output = output, TimedOut = Timeout });
        }
        public void Launch(ProcessStartInfo info) { Launched = info; }
    }
    private sealed class Fixture : IDisposable
    {
        public readonly string Root, Kit, Data, Project;
        public readonly FakeHost Host = new FakeHost();
        public Fixture(string parent)
        {
            Root = Path.Combine(parent, "case-" + Guid.NewGuid().ToString("N")); Kit = Path.Combine(Root, "kit"); Data = Path.Combine(Root, "private tools"); Project = Path.Combine(Kit, "starter");
            Directory.CreateDirectory(Project); Directory.CreateDirectory(Path.Combine(Kit, "setup")); Directory.CreateDirectory(Path.Combine(Kit, "optional"));
            File.WriteAllText(Path.Combine(Kit, "setup", "kit.properties"), "kitVersion=0.5.18\nextensionId=zero.zero\nvscodeMinimum=1.90.0\n");
            File.WriteAllText(Path.Combine(Kit, "zero-0.5.18.vsix"), "fake VSIX");
            File.WriteAllText(Path.Combine(Kit, "optional", "Zero.code-profile"), Json.Serialize(new { name = "Zero", settings = Json.Serialize(new { settings = Json.Serialize(new Dictionary<string, object> { ["chat.disableAIFeatures"] = true, ["workbench.startupEditor"] = "none" }) }) }));
            WriteManifest();
        }
        public void WriteManifest()
        {
            var assets = new Dictionary<string, object>();
            foreach (string kind in new[] { "jdk", "vscode" })
            {
                byte[] bytes = kind == "jdk" ? Host.Jdk : Host.Editor;
                string hash; using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
                assets[kind] = new { url = kind == "jdk" ? "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip" : "https://vscode.download.prss.microsoft.com/dbazure/download/stable/6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/VSCode-win32-x64-1.142.0.zip", sha256 = hash, format = "zip", version = kind == "jdk" ? "jdk-21.0.12.1+1" : "1.142.0", size = bytes.Length };
            }
            File.WriteAllText(Path.Combine(Kit, "setup", "windows-downloads.json"), Json.Serialize(new { schemaVersion = 1, architectures = new Dictionary<string, object> { ["x64"] = assets } }));
        }
        public WindowsRuntime Runtime(string architecture = null) { return new WindowsRuntime(Kit, Data, Project, Host, architecture); }
        public void Prepare() { Runtime().Prepare(null, CancellationToken.None).GetAwaiter().GetResult(); }
        public void Dispose() { WindowsRuntimeArchive.DeleteStaging(Root); }
    }
    [DllImport("libc", SetLastError = true)] private static extern int symlink(string target, string path);
    public static int Run()
    {
        checks = 0;
        string parent = Path.Combine(Directory.GetCurrentDirectory(), ".verification", "zero-runtime-harness-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(parent);
        try
        {
            TestLifecycle(parent); TestFailures(parent); TestArchives(parent);
        }
        finally { WindowsRuntimeArchive.DeleteStaging(parent); }
        return checks;
    }
    private static void TestLifecycle(string parent)
    {
        using (var f = new Fixture(parent))
        {
            string parentJava = Environment.GetEnvironmentVariable("JAVA_HOME"), parentPath = Environment.GetEnvironmentVariable("PATH");
            var progress = new List<string>(); var runtime = f.Runtime(); runtime.Prepare(progress.Add, CancellationToken.None).GetAwaiter().GetResult();
            Assert(f.Host.Downloads == 2 && f.Host.Installs == 2, "fresh setup downloads pinned Java/editor and installs extensions");
            Assert(progress.Contains("Downloading Java…") && progress.Contains("Checking Zero…"), "real preparation progress reaches verification");
            Assert(!Directory.EnumerateDirectories(Path.Combine(f.Data, "runtime"), ".install-*").Any(), "successful staging removed");
            string settings = File.ReadAllText(Path.Combine(f.Data, "editor", "user-data", "User", "settings.json"));
            Assert(settings.Contains("java.jdt.ls.java.home") && settings.Contains("JavaSE-21") && settings.Contains("chat.disableAIFeatures") && settings.Contains("terminal.integrated.env.windows"), "quiet profile plus explicit Java settings seeded automatically");
            f.Host.ZeroVersion = "0.9.0";
            f.Prepare(); Assert(f.Host.Downloads == 2 && f.Host.Installs == 2, "repair reuses verified private tools and newer extensions");
            runtime.Open(false, CancellationToken.None).GetAwaiter().GetResult();
            Assert(f.Host.Launched.Arguments.Contains("--new-window") && f.Host.Launched.Arguments.Contains(f.Project), "first editor opens starter in new window");
            Assert(f.Host.Launched.WorkingDirectory == f.Project, "editor working directory uses persistent project");
            Assert(!f.Host.Launched.UseShellExecute && !f.Host.Launched.RedirectStandardOutput && f.Host.Launched.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] == null, "standalone editor launch is not node or a shell");
            runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult();
            Assert(!f.Host.Launched.Arguments.Contains("--new-window") && !f.Host.Launched.Arguments.Contains(f.Project), "resume lets isolated editor restore last session");
            Assert(Environment.GetEnvironmentVariable("JAVA_HOME") == parentJava && Environment.GetEnvironmentVariable("PATH") == parentPath, "global and parent tool environment unchanged");
            f.Host.RedhatVersion = null;
            Reject(() => runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult(), "readiness rechecked before launch");
            f.Host.RedhatVersion = "1.50.0";
            File.WriteAllText(Path.Combine(f.Data, "editor", "user-data", "User", "settings.json"), "{}");
            Reject(() => runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult(), "missing mandatory Java setting blocks readiness");
        }
        using (var f = new Fixture(parent))
        {
            string installed = Path.Combine(f.Root, "installed code"); string zip = Path.Combine(f.Root, "code.zip"); File.WriteAllBytes(zip, f.Host.Editor); WindowsRuntimeArchive.Extract(zip, installed, CancellationToken.None); f.Host.InstalledEditor = installed;
            f.Host.ZeroVersion = "0.5.18"; f.Host.RedhatVersion = "1.50.0"; f.Prepare();
            Assert(f.Host.Downloads == 1 && f.Host.Installs == 0, "compatible installed stable editor reused");
            f.Runtime().Open(false, CancellationToken.None).GetAwaiter().GetResult(); Assert(f.Host.Launched.FileName == Path.Combine(installed, "Code.exe"), "reused editor receives isolated Zero environment");
        }
        string legacy = Path.Combine(parent, "legacy-editor"); Directory.CreateDirectory(legacy);
        string legacyZip = Path.Combine(legacy, "fixture.zip");
        File.WriteAllBytes(legacyZip, Zip("Code.exe", "fake", "resources/app/out/cli.js", "fake", "resources/app/product.json", "{}", "resources/app/package.json", "{}"));
        string legacyRoot = Path.Combine(legacy, "code"); WindowsRuntimeArchive.Extract(legacyZip, legacyRoot, CancellationToken.None);
        Assert(WindowsRuntime.ResolveEditorApp(legacyRoot) == Path.Combine(legacyRoot, "resources", "app"), "legacy installed editor resource layout remains supported");
        string invalid = Path.Combine(legacy, "invalid"); Directory.CreateDirectory(Path.Combine(invalid, "bin"));
        File.WriteAllText(Path.Combine(invalid, "bin", "code.cmd"), @"%~dp0..\..\outside\cli.js");
        Reject(() => WindowsRuntime.ResolveEditorApp(invalid), "vendor launcher resource discovery rejects traversal and never executes scripts");
        Assert(WindowsRuntime.AtLeast("0.5.19", "0.5.18") && !WindowsRuntime.AtLeast("0.5.17", "0.5.18") && !WindowsRuntime.AtLeast("bad", "0.5.18"), "exact numeric version order");
    }
    private static void TestFailures(string parent)
    {
        using (var f = new Fixture(parent))
        {
            Reject(() => f.Runtime("arm64"), "ARM not silently treated as x64"); Reject(() => f.Runtime("x86"), "32-bit rejected");
            f.Host.Unsupported = true; Reject(() => f.Runtime(), "unsupported OS rejected"); f.Host.Unsupported = false;
            Reject(() => new WindowsRuntime(f.Kit, Path.Combine(f.Kit, "inside-app"), f.Project, f.Host), "runtime never placed inside replaceable app/kit");
            string path = Path.Combine(f.Kit, "setup", "windows-downloads.json");
            string manifest = File.ReadAllText(path); File.WriteAllText(path, manifest.Replace("https://github.com", "http://github.com")); Reject(() => f.Runtime(), "non-HTTPS metadata rejected"); File.WriteAllText(path, manifest.Replace("github.com/adoptium", "example.com/adoptium")); Reject(() => f.Runtime(), "unofficial URL rejected");
        }
        using (var f = new Fixture(parent))
        {
            f.Host.BrokenDownload = true; Reject(f.Prepare, "wrong-size download rejected");
            Assert(!Directory.EnumerateDirectories(Path.Combine(f.Data, "runtime")).Any(), "failed download staging removed");
            f.Host.BrokenDownload = false; byte[] original = f.Host.Jdk; f.Host.Jdk = (byte[])original.Clone(); f.Host.Jdk[0] ^= 1;
            Reject(f.Prepare, "same-size checksum mismatch rejected");
            Assert(!Directory.EnumerateDirectories(Path.Combine(f.Data, "runtime")).Any(), "checksum failure leaves no published runtime");
        }
        using (var f = new Fixture(parent))
        {
            f.Host.CancelDownload = true; Cancelled(f.Prepare, "download cancellation propagates");
            Assert(!Directory.EnumerateDirectories(Path.Combine(f.Data, "runtime")).Any(), "cancelled partial download removed");
            using (var cancelled = new CancellationTokenSource()) { cancelled.Cancel(); Cancelled(() => f.Runtime().Prepare(null, cancelled.Token).GetAwaiter().GetResult(), "pre-cancelled preparation"); Assert(f.Host.Downloads == 1, "pre-cancel starts no network work"); }
        }
        using (var f = new Fixture(parent)) { f.Host.JavaVersion = "17.0.1"; Reject(f.Prepare, "wrong private Java version refused"); }
        using (var f = new Fixture(parent)) { f.Host.Timeout = true; Reject(f.Prepare, "bounded process timeout fails preparation"); }
        using (var f = new Fixture(parent)) { f.Host.RejectInstall = true; Reject(f.Prepare, "install exit success alone never means ready"); Assert(f.Host.Launched == null, "unverified setup never launches"); }
        using (var f = new Fixture(parent))
        {
            Directory.CreateDirectory(f.Data);
            using (var held = new FileStream(Path.Combine(f.Data, ".setup-lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)) Reject(f.Prepare, "concurrent preparation refused");
        }
        if (Path.DirectorySeparatorChar != '\\')
        {
            using (var f = new Fixture(parent))
            {
                string target = Path.Combine(f.Root, "real"); Directory.CreateDirectory(target); Assert(symlink(target, f.Data) == 0, "test creates private-folder symlink");
                Reject(() => f.Runtime(), "reparse private root rejected"); File.Delete(f.Data);
            }
        }
    }
    private static void TestArchives(string parent)
    {
        int index = 0;
        foreach (string name in new[] { "../escape", "/absolute", "C:/absolute", "folder/file:stream", "folder\\escape", "folder/../escape", "NUL.txt", "aux", "folder/space ", "folder/trailing.", "folder//empty", "folder/./dot" })
            ArchiveReject(parent, Zip(name, "no"), "unsafe archive path " + index++);
        ArchiveReject(parent, Zip("same", "a", "SAME", "b"), "case-insensitive duplicate");
        ArchiveReject(parent, Zip("file", "a", "file/child", "b"), "file-parent overlap");
        ArchiveReject(parent, MutateCentral(Zip("link", "target"), 38, 0xa1ff0000U), "Unix symbolic link");
        ArchiveReject(parent, MutateCentral(Zip("link", "target"), 38, 0x400U), "Windows reparse entry");
        ArchiveReject(parent, MutateCentral(Zip("oversize", "tiny"), 24, 0x50000000U), "per-file expansion limit");
        string folder = Path.Combine(parent, "archive-cancel"); Directory.CreateDirectory(folder); string archive = Path.Combine(folder, "safe.zip"); File.WriteAllBytes(archive, Zip("okay", "okay"));
        using (var cancellation = new CancellationTokenSource()) { cancellation.Cancel(); Cancelled(() => WindowsRuntimeArchive.Extract(archive, Path.Combine(folder, "out"), cancellation.Token), "archive extraction cancellation"); }
        if (Path.DirectorySeparatorChar != '\\')
        {
            string target = Path.Combine(folder, "real"); Directory.CreateDirectory(target); string linked = Path.Combine(folder, "linked"); Assert(symlink(target, linked) == 0, "test creates extraction symlink");
            Reject(() => WindowsRuntimeArchive.Extract(archive, linked, CancellationToken.None), "linked extraction root refused"); Assert(!File.Exists(Path.Combine(target, "okay")), "linked destination untouched"); File.Delete(linked);
        }
    }
    private static byte[] MutateCentral(byte[] bytes, int offset, uint value)
    {
        for (int index = 0; index < bytes.Length - 46; index++)
            if (bytes[index] == 0x50 && bytes[index + 1] == 0x4b && bytes[index + 2] == 1 && bytes[index + 3] == 2)
            { Array.Copy(BitConverter.GetBytes(value), 0, bytes, index + offset, 4); return bytes; }
        throw new Exception("ZIP fixture missing central record");
    }
    private static void ArchiveReject(string parent, byte[] bytes, string name)
    {
        string folder = Path.Combine(parent, "archive-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(folder); string archive = Path.Combine(folder, "fixture.zip"); File.WriteAllBytes(archive, bytes);
        Reject(() => WindowsRuntimeArchive.Extract(archive, Path.Combine(folder, "out"), CancellationToken.None), name);
        Assert(!Directory.Exists(Path.Combine(folder, "out")) || !Directory.EnumerateFileSystemEntries(Path.Combine(folder, "out")).Any(), "archive rejected before writing entries: " + name);
    }
}

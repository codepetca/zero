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
        public bool Unsupported, BrokenDownload, CancelDownload, RejectInstall, Timeout, RepairJavaOnDownload, RepairNodeOnDownload;
        public int Downloads, Installs, Runs;
        public string JavaVersion = "21.0.12";
        public string NodeVersion = "22.21.1";
        public byte[] Node = Zip("node-v22.21.1-win-x64/node.exe", "fake standalone node");
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
            if (RepairJavaOnDownload && asset.version.StartsWith("jdk", StringComparison.Ordinal)) JavaVersion = "21.0.12";
            if (RepairNodeOnDownload && asset.version == "22.21.1") NodeVersion = "22.21.1";
            File.WriteAllBytes(destination, BrokenDownload ? new byte[] { 1, 2, 3 } : asset.version.StartsWith("jdk", StringComparison.Ordinal) ? Jdk : asset.version == "22.21.1" ? Node : Editor);
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
            Assert(info.EnvironmentVariables["NODE_OPTIONS"] == null && info.EnvironmentVariables["NODE_PATH"] == null, "Node preload/module injection removed from private child environment");
            string output;
            if (info.FileName.EndsWith("javac.exe", StringComparison.Ordinal)) output = "javac " + JavaVersion + "\n";
            else if (info.FileName.EndsWith("java.exe", StringComparison.Ordinal)) output = "openjdk version \"" + JavaVersion + "\"\n";
            else if (info.FileName.EndsWith("node.exe", StringComparison.Ordinal)) {
                Assert(info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] == null && info.Arguments == Processes.QuoteArgument("--version"), "standalone Node version check never uses Electron/npm");
                output = "v" + NodeVersion + "\n";
            }
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
            foreach (string kind in new[] { "jdk", "vscode", "node" })
            {
                byte[] bytes = kind == "jdk" ? Host.Jdk : kind == "node" ? Host.Node : Host.Editor;
                string hash; using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
                assets[kind] = new { url = kind == "jdk" ? "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip" : kind == "node" ? "https://nodejs.org/dist/v22.21.1/node-v22.21.1-win-x64.zip" : "https://vscode.download.prss.microsoft.com/dbazure/download/stable/6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/VSCode-win32-x64-1.142.0.zip", sha256 = hash, format = "zip", version = kind == "jdk" ? "jdk-21.0.12.1+1" : kind == "node" ? "22.21.1" : "1.142.0", size = bytes.Length };
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
            TestLifecycle(parent); TestRecovery(parent); TestNodeRecovery(parent); TestFailures(parent); TestArchives(parent);
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
            Assert(f.Host.Downloads == 3 && f.Host.Installs == 2, "fresh setup downloads pinned Java/Node/editor and installs extensions");
            Assert(progress.Contains("Downloading Java…") && progress.Contains("Checking Zero…"), "real preparation progress reaches verification");
            Assert(!Directory.EnumerateDirectories(Path.Combine(f.Data, "runtime"), ".install-*").Any(), "successful staging removed");
            string settingsPath = Path.Combine(f.Data, "editor", "user-data", "User", "settings.json");
            string settings = File.ReadAllText(settingsPath);
            Assert(!settings.Contains("java.jdt.ls.java.home") && settings.Contains("JavaSE-21") && settings.Contains("chat.disableAIFeatures") && settings.Contains("terminal.integrated.env.windows"), "quiet profile plus project Java settings seeded without overriding bundled tooling JRE");
            f.Host.ZeroVersion = "0.9.0";
            f.Prepare(); Assert(f.Host.Downloads == 3 && f.Host.Installs == 2, "repair reuses verified private tools and newer extensions");
            runtime.Open(false, CancellationToken.None).GetAwaiter().GetResult();
            Assert(f.Host.Launched.Arguments.Contains("--new-window") && !f.Host.Launched.Arguments.Contains(f.Project), "first editor opens empty tutorial window");
            Assert(f.Host.Launched.WorkingDirectory == f.Project, "editor working directory uses persistent project");
            Assert(f.Host.Launched.EnvironmentVariables["ZERO_KIT_DIR"] == f.Kit, "editor receives installed kit path for explicit installation testing");
            string node = Directory.GetDirectories(Path.Combine(f.Data,"runtime"),"node-*").Single();
            Assert(f.Host.Launched.EnvironmentVariables["ZERO_NODE_EXECUTABLE"] == Path.Combine(node,"node.exe") && f.Host.Launched.EnvironmentVariables["PATH"].Contains(node + ";"), "editor receives verified private standalone Node hint and child PATH");
            Assert(!f.Host.Launched.UseShellExecute && !f.Host.Launched.RedirectStandardOutput && f.Host.Launched.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] == null, "standalone editor launch is not node or a shell");
            runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult();
            Assert(!f.Host.Launched.Arguments.Contains("--new-window") && !f.Host.Launched.Arguments.Contains(f.Project), "resume lets isolated editor restore last session");
            string jsonc = settings.TrimEnd().TrimEnd('}') + ",\n// A normal VS Code settings edit\n\"editor.fontSize\": 17,\n\"java.jdt.ls.java.home\": \"old-tooling-jdk\",\n\"java.home\": \"legacy-tooling-jdk\",\n}\n";
            File.WriteAllText(settingsPath, jsonc);
            runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult();
            Assert(f.Host.Launched != null, "readiness accepts JSONC comments and trailing commas before repair");
            f.Prepare(); f.Prepare();
            settings = File.ReadAllText(settingsPath);
            Assert(settings.Contains("\"editor.fontSize\": 17") && !settings.Contains("java.jdt.ls.java.home") && !settings.Contains("\"java.home\""), "repeated JSONC preparation preserves ordinary settings and removes obsolete tooling overrides");
            Assert(f.Host.Downloads == 3 && f.Host.Installs == 2, "JSONC repair reuses tools and extensions");
            int runs = f.Host.Runs;
            var warm = f.Runtime(); warm.Prepare(null, CancellationToken.None).GetAwaiter().GetResult(); warm.Open(true, CancellationToken.None).GetAwaiter().GetResult();
            Assert(f.Host.Runs - runs == 10, "warm preparation and handoff use ten probes without redundant final preparation checks");
            runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult();
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
            Assert(f.Host.Downloads == 2 && f.Host.Installs == 0, "compatible installed stable editor reused");
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
    private static void TestRecovery(string parent)
    {
        using (var f = new Fixture(parent))
        {
            f.Prepare();
            string jdk = Directory.GetDirectories(Path.Combine(f.Data, "runtime"), "jdk-*").Single();
            string editor = Directory.GetDirectories(Path.Combine(f.Data, "runtime"), "vscode-*").Single();
            string saved = Path.Combine(f.Data, "editor", "user-data", "saved-session"); File.WriteAllText(saved, "session");
            File.Delete(Path.Combine(jdk, "bin", "javac.exe"));
            f.Prepare();
            Assert(File.Exists(Path.Combine(jdk, "bin", "javac.exe")) && f.Host.Downloads == 4, "missing private Java compiler repaired automatically");
            File.Delete(Path.Combine(editor, "6d62b1d5da", "resources", "app", "out", "cli.js"));
            f.Prepare();
            Assert(File.Exists(Path.Combine(editor, "6d62b1d5da", "resources", "app", "out", "cli.js")) && f.Host.Downloads == 5, "damaged owned editor repaired automatically");
            f.Host.JavaVersion = "17.0.1"; f.Host.RepairJavaOnDownload = true;
            f.Prepare();
            Assert(f.Host.JavaVersion == "21.0.12" && f.Host.Downloads == 6, "failed cached Java version probe triggers one verified replacement");
            string settings = Path.Combine(f.Data, "editor", "user-data", "User", "settings.json"); File.WriteAllText(settings, "{ broken JSONC");
            var runtime = f.Runtime(); runtime.Prepare(null, CancellationToken.None).GetAwaiter().GetResult(); runtime.Open(true, CancellationToken.None).GetAwaiter().GetResult();
            Assert(File.ReadAllText(settings).Contains("JavaSE-21") && File.ReadAllText(settings).Contains("chat.disableAIFeatures"), "malformed isolated settings reset to shipped defaults and mandatory Java settings");
            Assert(!f.Host.Launched.Arguments.Contains("--new-window") && File.ReadAllText(saved) == "session" && f.Host.Installs == 2, "repair preserves saved editor session and installed extensions");
            Assert(!Directory.GetDirectories(Path.Combine(f.Data, "runtime"), ".repair-*").Any(), "successful repairs remove only quarantined old tools");
            File.Delete(Path.Combine(jdk, "bin", "javac.exe")); f.Host.BrokenDownload = true;
            Reject(f.Prepare, "failed replacement download remains a visible failure");
            Assert(Directory.Exists(jdk) && !File.Exists(Path.Combine(jdk, "bin", "javac.exe")) && !Directory.GetDirectories(Path.Combine(f.Data, "runtime"), ".repair-*").Any(), "failed repair restores original tool folder for another retry");
            f.Host.BrokenDownload = false; f.Host.CancelDownload = true;
            Cancelled(f.Prepare, "cancelled replacement download propagates");
            Assert(Directory.Exists(jdk) && !Directory.GetDirectories(Path.Combine(f.Data, "runtime"), ".repair-*").Any(), "cancelled repair restores original folder");
            f.Host.CancelDownload = false; f.Prepare();
            Assert(File.Exists(Path.Combine(jdk, "bin", "javac.exe")) && File.ReadAllText(saved) == "session", "explicit retry after failed and cancelled repair recovers");
            int downloads = f.Host.Downloads;
            File.WriteAllText(Path.Combine(jdk, ".zero-asset.sha256"), "unrecognized");
            Reject(f.Prepare, "unrecognized runtime is not replaced");
            Assert(f.Host.Downloads == downloads && Directory.Exists(jdk), "unrecognized folder untouched with no repair download");
        }
    }
    private static void TestNodeRecovery(string parent)
    {
        using (var f = new Fixture(parent))
        {
            string parentNode = Environment.GetEnvironmentVariable("ZERO_NODE_EXECUTABLE");
            string options = Environment.GetEnvironmentVariable("NODE_OPTIONS"), modules = Environment.GetEnvironmentVariable("NODE_PATH");
            Environment.SetEnvironmentVariable("NODE_OPTIONS","--require=C:/untrusted-fixture-preload");
            Environment.SetEnvironmentVariable("NODE_PATH","C:/untrusted-fixture-modules");
            try { f.Prepare(); }
            finally { Environment.SetEnvironmentVariable("NODE_OPTIONS",options); Environment.SetEnvironmentVariable("NODE_PATH",modules); }
            string node = Directory.GetDirectories(Path.Combine(f.Data,"runtime"),"node-*").Single(), binary = Path.Combine(node,"node.exe");
            File.Delete(binary);
            Reject(() => f.Runtime().Open(true,CancellationToken.None).GetAwaiter().GetResult(),"missing Node blocks readiness before editor launch");
            f.Prepare(); Assert(File.Exists(binary) && f.Host.Downloads == 4,"missing private Node repaired without global install");
            f.Host.NodeVersion = "20.0.0"; f.Host.RepairNodeOnDownload = true;
            f.Prepare(); Assert(f.Host.NodeVersion == "22.21.1" && f.Host.Downloads == 5,"wrong cached Node version repaired from pinned archive");
            File.Delete(binary); f.Host.BrokenDownload = true;
            Reject(f.Prepare,"failed Node repair remains visible");
            Assert(Directory.Exists(node) && !File.Exists(binary) && !Directory.GetDirectories(Path.Combine(f.Data,"runtime"),".repair-*").Any(),"failed Node repair restores recognized previous folder");
            f.Host.BrokenDownload = false; f.Host.CancelDownload = true;
            Cancelled(f.Prepare,"cancelled Node repair propagates");
            Assert(Directory.Exists(node) && !Directory.GetDirectories(Path.Combine(f.Data,"runtime"),".repair-*").Any(),"cancelled Node repair restores recognized previous folder");
            f.Host.CancelDownload = false; f.Prepare();
            int downloads = f.Host.Downloads; File.WriteAllText(Path.Combine(node,".zero-asset.sha256"),"unrecognized");
            Reject(f.Prepare,"unrecognized private Node preserved");
            Assert(f.Host.Downloads == downloads && File.ReadAllText(Path.Combine(node,".zero-asset.sha256")) == "unrecognized","foreign Node receipt is never replaced");
            Assert(Environment.GetEnvironmentVariable("ZERO_NODE_EXECUTABLE") == parentNode,"parent Node environment unchanged");
        }
        using (var f = new Fixture(parent))
        {
            f.Host.NodeVersion = "20.0.0";
            Reject(f.Prepare,"wrong downloaded Node version refused before publication");
            Assert(!Directory.GetDirectories(Path.Combine(f.Data,"runtime"),"node-*").Any(),"unverified Node never published");
        }
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
            File.WriteAllText(path,manifest.Replace("nodejs.org/dist","nodejs.org.evil.test/dist")); Reject(()=>f.Runtime(),"Node origin lookalike rejected");
            File.WriteAllText(path,manifest.Replace("node-v22.21.1-win-x64.zip","node-v22.21.1-win-arm64.zip")); Reject(()=>f.Runtime(),"wrong Node platform rejected");
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

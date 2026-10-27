using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ZeroSetup
{
    // Private tools and the isolated editor live outside the replaceable app.
    // Every child gets JAVA_HOME directly; no registry, shell, elevation or
    // machine-wide installer is needed.
    internal sealed class WindowsRuntime
    {
        private readonly string kit, data, project, architecture;
        private readonly IWindowsRuntimeHost host;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024, RecursionLimit = 32 };
        private readonly Dictionary<string, WindowsRuntimeAsset> assets;
        private readonly string version, minimum;
        private string java, editor, editorApp, node;
        private const string NodeVersion = "22.21.1";
        private static readonly string[] JavaStartupVariables = { "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "MAVEN_OPTS", "MAVEN_ARGS" };
        private static readonly string[] TerminalOwnedVariables = JavaStartupVariables.Concat(new[] { "JAVA_HOME", "ZERO_JAVA_HOME", "PATH", "MAVEN_SKIP_RC" }).ToArray();
        private sealed class Manifest
        {
            public int schemaVersion { get; set; }
            public Dictionary<string, Dictionary<string, WindowsRuntimeAsset>> architectures { get; set; }
        }
        public WindowsRuntime(string kitRoot, string dataRoot, string projectRoot, string architecture = null)
            : this(kitRoot, dataRoot, projectRoot, new WindowsRuntimeHost(), architecture) { }
        internal WindowsRuntime(string kitRoot, string dataRoot, string projectRoot, IWindowsRuntimeHost host, string architecture = null)
        {
            this.host = host ?? throw new ArgumentNullException("host");
            host.ValidatePlatform();
            this.architecture = NormalizeArchitecture(architecture ?? host.Architecture);
            if (this.architecture != "x64") throw new IOException("Automatic Zero setup currently supports Windows on Intel or AMD 64-bit computers. Windows ARM and 32-bit computers need teacher or IT help.");
            kit = FullPath(kitRoot); data = FullPath(dataRoot); project = FullPath(projectRoot);
            if (Inside(data, kit) || Inside(kit, data)) throw new IOException("Zero's private tools must be outside the replaceable launcher and kit folders.");
            var manifest = json.Deserialize<Manifest>(ReadText(Path.Combine(kit, "setup", "windows-downloads.json"), 65536));
            if (manifest == null || manifest.schemaVersion != 1 || manifest.architectures == null || !manifest.architectures.TryGetValue(this.architecture, out assets) || assets.Count != 3 || !assets.ContainsKey("jdk") || !assets.ContainsKey("vscode") || !assets.ContainsKey("node"))
                throw new IOException("Verified Windows download metadata is missing. Reinstall Zero.");
            foreach (var pair in assets) ValidateAsset(pair.Key, pair.Value);
            var properties = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string line in ReadText(Path.Combine(kit, "setup", "kit.properties"), 4096).Replace("\r\n", "\n").Split('\n'))
            {
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
                int split = line.IndexOf('=');
                if (split <= 0 || properties.ContainsKey(line.Substring(0, split))) throw new IOException("Zero's kit metadata is invalid.");
                properties.Add(line.Substring(0, split), line.Substring(split + 1));
            }
            if (!properties.TryGetValue("kitVersion", out version) || !ValidVersion(version) || !properties.TryGetValue("vscodeMinimum", out minimum) || !ValidVersion(minimum)) throw new IOException("Zero's kit version metadata is invalid.");
        }
        internal static string NormalizeArchitecture(string value) { value = value ?? "unknown"; return value.Equals("AMD64", StringComparison.OrdinalIgnoreCase) || value.Equals("x64", StringComparison.OrdinalIgnoreCase) ? "x64" : value.ToLowerInvariant(); }
        private static bool Inside(string child, string parent) { return child.Equals(parent, StringComparison.OrdinalIgnoreCase) || child.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase); }
        private static string FullPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path)) throw new IOException("Zero needs an absolute local folder path.");
            string result = Path.GetFullPath(path); WindowsRuntimeFolders.Check(result); return result.TrimEnd(Path.DirectorySeparatorChar);
        }
        private static string ReadText(string path, int maximum)
        {
            WindowsRuntimeFolders.Check(path);
            using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (input.Length > maximum) throw new IOException("Zero configuration is too large.");
                using (var reader = new StreamReader(input, Encoding.UTF8, true)) return reader.ReadToEnd();
            }
        }
        private static void ValidateAsset(string kind, WindowsRuntimeAsset asset)
        {
            Uri uri;
            if (asset == null || !Uri.TryCreate(asset.url, UriKind.Absolute, out uri) || uri.Scheme != "https" || !uri.IsDefaultPort || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || asset.format != "zip" || asset.size <= 0 || asset.size > 600000000 || !Regex.IsMatch(asset.sha256 ?? "", "^[a-f0-9]{64}$") || string.IsNullOrWhiteSpace(asset.version))
                throw new IOException("Zero's verified download metadata is invalid.");
            string path = Uri.UnescapeDataString(uri.AbsolutePath);
            bool official;
            if (kind == "jdk")
            {
                official = Regex.IsMatch(asset.version, @"^jdk-21\.\d+\.\d+(\.\d+)?\+\d+$") && uri.Host == "github.com" &&
                    path == "/adoptium/temurin21-binaries/releases/download/" + asset.version + "/OpenJDK21U-jdk_x64_windows_hotspot_" + asset.version.Substring(4).Replace('+', '_') + ".zip";
            }
            else if (kind == "node")
            {
                official = asset.version == NodeVersion && uri.Host == "nodejs.org" &&
                    path == "/dist/v" + NodeVersion + "/node-v" + NodeVersion + "-win-x64.zip";
            }
            else if (kind == "vscode")
            {
                official = ValidVersion(asset.version) && uri.Host == "vscode.download.prss.microsoft.com" &&
                    Regex.IsMatch(path, @"^/dbazure/download/stable/[a-f0-9]{40}/VSCode-win32-x64-" + Regex.Escape(asset.version) + @"\.zip$");
            }
            else official = false;
            if (!official || !uri.AbsolutePath.EndsWith(".zip", StringComparison.Ordinal)) throw new IOException("Zero's download must use its official pinned vendor URL.");
        }
        private string UserData { get { return Path.Combine(data, "editor", "user-data"); } }
        private string Extensions { get { return Path.Combine(data, "editor", "extensions"); } }
        private string AssetFolder(string kind) { return Path.Combine(data, "runtime", kind + "-" + assets[kind].sha256); }
        private string[] Isolated { get { return new[] { "--user-data-dir", UserData, "--extensions-dir", Extensions }; } }
        internal static bool AtLeast(string installed, string required)
        {
            Version actual, target;
            return Version.TryParse(installed, out actual) && Version.TryParse(required, out target) && actual >= target;
        }
        private static bool ValidVersion(string value) { return Regex.IsMatch(value ?? "", @"^\d+\.\d+(\.\d+){0,2}$"); }
        private ProcessStartInfo Info(string executable, IEnumerable<string> arguments, bool cli)
        {
            WindowsRuntimeFolders.Check(executable);
            if (!File.Exists(executable)) throw new IOException("A required Zero tool is missing. Retry setup.");
            var info = new ProcessStartInfo(executable, string.Join(" ", arguments.Select(Processes.QuoteArgument)))
            {
                UseShellExecute = false, WorkingDirectory = cli ? data : project, CreateNoWindow = cli,
                RedirectStandardOutput = cli, RedirectStandardError = cli, RedirectStandardInput = cli
            };
            info.EnvironmentVariables["JAVA_HOME"] = java;
            info.EnvironmentVariables["ZERO_JAVA_HOME"] = java;
            foreach (string key in JavaStartupVariables) info.EnvironmentVariables.Remove(key);
            info.EnvironmentVariables["MAVEN_SKIP_RC"] = "1";
            info.EnvironmentVariables["ZERO_KIT_DIR"] = kit;
            info.EnvironmentVariables["PATH"] = Path.Combine(java, "bin") + ";" + (node == null ? "" : Path.GetDirectoryName(node) + ";") + (Environment.GetEnvironmentVariable("PATH") ?? "");
            if (node != null) info.EnvironmentVariables["ZERO_NODE_EXECUTABLE"] = node;
            else info.EnvironmentVariables.Remove("ZERO_NODE_EXECUTABLE");
            info.EnvironmentVariables.Remove("NODE_OPTIONS");
            info.EnvironmentVariables.Remove("NODE_PATH");
            info.EnvironmentVariables.Remove("VSCODE_PORTABLE");
            info.EnvironmentVariables.Remove("VSCODE_CWD");
            info.EnvironmentVariables.Remove("VSCODE_IPC_HOOK_CLI");
            info.EnvironmentVariables.Remove("VSCODE_DEV");
            if (cli) info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
            else info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            return info;
        }
        private async Task<string> Execute(string executable, IEnumerable<string> arguments, int milliseconds, CancellationToken cancellation, bool electron = false)
        {
            cancellation.ThrowIfCancellationRequested();
            var info = Info(executable, arguments, true);
            if (!electron) info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            var result = await host.Run(info, milliseconds, cancellation);
            if (result.Cancelled || cancellation.IsCancellationRequested) throw new OperationCanceledException(cancellation);
            if (result.TimedOut) throw new IOException("Zero's tool preparation took too long. Check your connection and retry.");
            if (result.ExitCode != 0 || result.OutputIncomplete) throw new IOException("Zero could not prepare its editor support. Retry setup.\n" + result.Output);
            return result.Output ?? "";
        }
        private Task<string> Code(IEnumerable<string> arguments, int milliseconds, CancellationToken cancellation)
        {
            return Execute(Path.Combine(editor, "Code.exe"), new[] { Path.Combine(editorApp, "out", "cli.js") }.Concat(Isolated).Concat(arguments), milliseconds, cancellation, true);
        }
        private void Marker(string folder, string kind)
        {
            if (ReadText(Path.Combine(folder, ".zero-asset.sha256"), 128).Trim() != assets[kind].sha256) throw new IOException("Zero's private tool folder is unrecognized. Reinstall Zero or ask for help.");
        }
        private async Task Install(string kind, Action<string> progress, CancellationToken cancellation)
        {
            string destination = AssetFolder(kind);
            WindowsRuntimeFolders.Check(destination);
            if (Directory.Exists(destination)) { Marker(destination, kind); return; }
            string staging = Path.Combine(data, "runtime", ".install-" + Guid.NewGuid().ToString("N"));
            using (var folders = new WindowsRuntimeFolders())
            {
                folders.Ensure(staging);
                try
                {
                    progress(kind == "jdk" ? "Downloading Java…" : kind == "node" ? "Downloading browser tools…" : "Downloading editor…");
                    string download = Path.Combine(staging, "download.zip");
                    await host.Download(assets[kind], download, cancellation);
                    cancellation.ThrowIfCancellationRequested();
                    WindowsRuntimeFolders.Check(download);
                    if (new FileInfo(download).Length != assets[kind].size || WindowsRuntimeArchive.Hash(download, cancellation) != assets[kind].sha256) throw new IOException("The " + kind + " download did not match its verified size and checksum. Retry setup.");
                    progress(kind == "jdk" ? "Preparing Java…" : kind == "node" ? "Preparing browser tools…" : "Preparing editor…");
                    string extracted = Path.Combine(staging, "extracted");
                    await Task.Run(() => WindowsRuntimeArchive.Extract(download, extracted, cancellation), cancellation);
                    string content = extracted;
                    if (kind != "vscode" || !File.Exists(Path.Combine(extracted, "Code.exe")))
                    {
                        string[] children = Directory.GetFileSystemEntries(extracted);
                        if (children.Length != 1 || !Directory.Exists(children[0])) throw new IOException("The " + kind + " archive has an unexpected layout.");
                        content = children[0];
                        if (kind == "node" && Path.GetFileName(content) != "node-v" + NodeVersion + "-win-x64") throw new IOException("The browser runtime archive has an unexpected layout.");
                    }
                    foreach (string required in kind == "jdk" ? new[] { "bin/java.exe", "bin/javac.exe", "release" } : kind == "node" ? new[] { "node.exe" } : new[] { "Code.exe" })
                    {
                        string path = Path.Combine(content, required.Replace('/', Path.DirectorySeparatorChar));
                        WindowsRuntimeFolders.Check(path);
                        if (!File.Exists(path)) throw new IOException("The downloaded runtime is incomplete: " + required);
                    }
                    if (kind == "vscode") ResolveEditorApp(content);
                    if (kind == "node") await VerifyNodeBinary(Path.Combine(content, "node.exe"), cancellation);
                    File.WriteAllText(Path.Combine(content, ".zero-asset.sha256"), assets[kind].sha256);
                    cancellation.ThrowIfCancellationRequested();
                    WindowsRuntimeFolders.Check(destination);
                    Directory.Move(content, destination);
                }
                finally
                {
                    // Release staging's no-delete handle before cleanup.
                    folders.Dispose(); WindowsRuntimeArchive.DeleteStaging(staging);
                }
            }
        }
        private async Task Repair(string kind, Action<string> progress, CancellationToken cancellation)
        {
            string destination = AssetFolder(kind);
            // Only replace a recognized private runtime, never an installed editor
            // or an unrecognized directory. Keep the old copy until replacement
            // succeeds so a cancelled/offline repair can be retried.
            Marker(destination, kind);
            string previous = Path.Combine(data, "runtime", ".repair-" + Guid.NewGuid().ToString("N"));
            WindowsRuntimeFolders.Check(destination); WindowsRuntimeFolders.Check(previous);
            cancellation.ThrowIfCancellationRequested();
            Directory.Move(destination, previous);
            try
            {
                progress(kind == "jdk" ? "Repairing Java…" : kind == "node" ? "Repairing browser tools…" : "Repairing editor…");
                await Install(kind, progress, cancellation);
            }
            finally
            {
                WindowsRuntimeFolders.Check(destination); WindowsRuntimeFolders.Check(previous);
                if (Directory.Exists(destination)) WindowsRuntimeArchive.DeleteStaging(previous);
                else Directory.Move(previous, destination);
            }
        }
        private async Task PrepareJava(Action<string> progress, CancellationToken cancellation)
        {
            bool existed = Directory.Exists(AssetFolder("jdk"));
            await Install("jdk", progress, cancellation);
            progress("Checking Java…");
            try { await VerifyJava(cancellation); }
            catch (Exception error) when (existed && (error is IOException || error is System.ComponentModel.Win32Exception))
            {
                await Repair("jdk", progress, cancellation);
                await VerifyJava(cancellation);
            }
        }
        private async Task VerifyJava(CancellationToken cancellation)
        {
            string root = AssetFolder("jdk"); Marker(root, "jdk"); java = root;
            // The pinned Temurin ZIP's top directory is flattened at install.
            string javaVersion = await Execute(Path.Combine(java, "bin", "java.exe"), new[] { "-version" }, 30000, cancellation);
            string javacVersion = await Execute(Path.Combine(java, "bin", "javac.exe"), new[] { "-version" }, 30000, cancellation);
            if (!Regex.IsMatch(javaVersion, @"version ""21\.") || !Regex.IsMatch(javacVersion, @"^javac 21\.", RegexOptions.Multiline)) throw new IOException("Zero's private Java 21 could not be verified. Try again; if your device blocks software, ask your teacher or IT for help.");
        }
        private async Task VerifyNodeBinary(string executable, CancellationToken cancellation)
        {
            string output = await Execute(executable, new[] { "--version" }, 30000, cancellation);
            if (output.Trim() != "v" + NodeVersion) throw new IOException("Zero's private browser runtime could not be verified. Run setup again.");
        }
        private async Task VerifyNode(CancellationToken cancellation)
        {
            string folder = AssetFolder("node"); Marker(folder, "node");
            node = Path.Combine(folder, "node.exe");
            await VerifyNodeBinary(node, cancellation);
        }
        private async Task PrepareNode(Action<string> progress, CancellationToken cancellation)
        {
            bool existed = Directory.Exists(AssetFolder("node"));
            await Install("node", progress, cancellation);
            progress("Checking browser tools…");
            try { await VerifyNode(cancellation); }
            catch (Exception error) when (existed && (error is IOException || error is System.ComponentModel.Win32Exception))
            {
                await Repair("node", progress, cancellation);
                await VerifyNode(cancellation);
            }
        }
        internal static string ResolveEditorApp(string root)
        {
            string app = Path.Combine(root, "resources", "app");
            if (!File.Exists(Path.Combine(app, "out", "cli.js")))
            {
                // Current Windows Code keeps Electron at the root and resources
                // in a commit folder. Read only this fixed path from its vendor
                // launcher; never execute or interpret the batch file.
                string command = ReadText(Path.Combine(root, "bin", "code.cmd"), 65536);
                var match = Regex.Match(command, @"%~dp0\.\.\\(?<folder>[a-f0-9]{10})\\resources\\app\\out\\cli\.js", RegexOptions.IgnoreCase);
                if (!match.Success) throw new IOException("The editor's command-line layout is unsupported. Retry setup.");
                app = Path.Combine(root, match.Groups["folder"].Value, "resources", "app");
            }
            foreach (string required in new[] { "out/cli.js", "product.json", "package.json" })
            {
                string path = Path.Combine(app, required.Replace('/', Path.DirectorySeparatorChar)); WindowsRuntimeFolders.Check(path);
                if (!File.Exists(path)) throw new IOException("The editor's command-line support is incomplete. Retry setup.");
            }
            return app;
        }
        private async Task<bool> CompatibleEditor(string root, CancellationToken cancellation)
        {
            try
            {
                WindowsRuntimeFolders.Check(root);
                if (!File.Exists(Path.Combine(root, "Code.exe"))) return false;
                string app = ResolveEditorApp(root);
                var product = json.Deserialize<Dictionary<string, object>>(ReadText(Path.Combine(app, "product.json"), 1024 * 1024));
                var package = json.Deserialize<Dictionary<string, object>>(ReadText(Path.Combine(app, "package.json"), 1024 * 1024));
                object quality, editorVersion;
                if (product == null || package == null || !product.TryGetValue("quality", out quality) || quality as string != "stable" || !package.TryGetValue("version", out editorVersion) || !AtLeast(editorVersion as string, minimum)) return false;
                editor = root; editorApp = app;
                string output = await Code(new[] { "--version" }, 30000, cancellation);
                return output.Replace("\r\n", "\n").Split('\n').Any(line => AtLeast(line.Trim(), minimum));
            }
            catch (OperationCanceledException) { throw; }
            catch (IOException) { return false; }
            catch (ArgumentException) { return false; }
            catch (InvalidOperationException) { return false; }
            catch (System.ComponentModel.Win32Exception) { return false; }
            catch (UnauthorizedAccessException) { return false; }
        }
        private async Task FindEditor(CancellationToken cancellation)
        {
            foreach (string candidate in host.InstalledEditors()) if (await CompatibleEditor(candidate, cancellation)) return;
            string owned = AssetFolder("vscode");
            if (Directory.Exists(owned)) { Marker(owned, "vscode"); if (await CompatibleEditor(owned, cancellation)) return; }
            editor = null;
        }
        private static JObject ReadSettings(string text)
        {
            try
            {
                // VS Code settings are JSONC, including comments and trailing commas.
                using (var reader = new JsonTextReader(new StringReader(text)) { MaxDepth = 32, DateParseHandling = DateParseHandling.None })
                    return JObject.Load(reader);
            }
            catch (JsonException error) { throw new IOException("Zero's editor settings could not be read. Check settings.json and retry setup.", error); }
        }
        private sealed class SettingSpan
        {
            public string Key; public int Start, Value, End, Comma;
        }
        private static void SkipTrivia(string text, ref int i)
        {
            while (i < text.Length)
            {
                if (char.IsWhiteSpace(text[i])) { i++; continue; }
                if (i + 1 < text.Length && text[i] == '/' && text[i + 1] == '/')
                { i += 2; while (i < text.Length && text[i] != '\n') i++; continue; }
                if (i + 1 < text.Length && text[i] == '/' && text[i + 1] == '*')
                { i += 2; while (i + 1 < text.Length && !(text[i] == '*' && text[i + 1] == '/')) i++; i = Math.Min(i + 2, text.Length); continue; }
                break;
            }
        }
        private static void SkipQuoted(string text, ref int i)
        {
            if (i >= text.Length || text[i] != '"') throw new IOException("Use quoted JSON settings keys in Zero's editor settings.");
            i++;
            while (i < text.Length)
            {
                if (text[i] == '\\') i += 2;
                else if (text[i++] == '"') return;
            }
            throw new IOException("Zero's editor settings contain an incomplete string.");
        }
        private static List<SettingSpan> SettingSpans(string text, out int close)
        {
            int i = 0; SkipTrivia(text, ref i);
            if (i >= text.Length || text[i++] != '{') throw new IOException("Zero's editor settings must be an object.");
            var spans = new List<SettingSpan>();
            for (;;)
            {
                SkipTrivia(text, ref i);
                if (i >= text.Length) throw new IOException("Zero's editor settings are incomplete.");
                if (text[i] == '}') { close = i; return spans; }
                int start = i; SkipQuoted(text, ref i);
                string key = JsonConvert.DeserializeObject<string>(text.Substring(start, i - start));
                SkipTrivia(text, ref i);
                if (i >= text.Length || text[i++] != ':') throw new IOException("Invalid editor setting.");
                SkipTrivia(text, ref i); int value = i, end = i, depth = 0;
                while (i < text.Length)
                {
                    SkipTrivia(text, ref i); if (i >= text.Length) break;
                    char ch = text[i];
                    if (depth == 0 && (ch == ',' || ch == '}')) break;
                    if (ch == '"') SkipQuoted(text, ref i);
                    else { if (ch == '{' || ch == '[') depth++; if (ch == '}' || ch == ']') depth--; i++; }
                    end = i;
                }
                int comma = i < text.Length && text[i] == ',' ? i++ : -1;
                spans.Add(new SettingSpan { Key = key, Start = start, Value = value, End = end, Comma = comma });
            }
        }
        private static string PatchSettings(string text, JObject values)
        {
            foreach (string key in new[] { "java.home", "java.jdt.ls.java.home", "java.configuration.runtimes", "java.import.gradle.java.home", "terminal.integrated.env.windows", "terminal.integrated.profiles.windows", "terminal.integrated.defaultProfile.windows" })
            {
                int close; var spans = SettingSpans(text, out close); var matching = spans.Where(span => span.Key == key).ToList();
                if (matching.Count > 1) throw new IOException("Zero's editor settings repeat " + key + ". Remove the duplicate and retry.");
                var value = values[key];
                if (matching.Count == 1)
                {
                    var span = matching[0];
                    if (value != null) text = text.Remove(span.Value, span.End - span.Value).Insert(span.Value, value.ToString(Formatting.None));
                    else if (span.Comma >= 0) text = text.Remove(span.Start, span.Comma + 1 - span.Start);
                    else if (spans.Count > 1) { int previous = spans[spans.Count - 2].Comma; text = text.Remove(previous, span.End - previous); }
                    else text = text.Remove(span.Start, span.End - span.Start);
                }
                else if (value != null)
                {
                    string separator = spans.Count > 0 && spans[spans.Count - 1].Comma < 0 ? "," : "";
                    text = text.Insert(close, separator + "\n  " + JsonConvert.SerializeObject(key) + ": " + value.ToString(Formatting.None) + "\n");
                }
            }
            ReadSettings(text); return text;
        }
        private void Settings(WindowsRuntimeFolders folders)
        {
            string user = Path.Combine(UserData, "User"); folders.Ensure(user); folders.Ensure(Extensions);
            string path = Path.Combine(user, "settings.json");
            JObject values = null;
            string original = null, source = null;
            if (File.Exists(path))
            {
                // A malformed settings edit must not trap Try again outside the
                // editor. Zero owns this isolated profile; restore its defaults.
                // Filesystem/access errors still propagate without replacement.
                original = ReadText(path, 1024 * 1024);
                try { values = ReadSettings(original); source = original; }
                catch (IOException error) when (error.InnerException is JsonException) { }
            }
            if (values == null)
            {
                var profile = json.Deserialize<Dictionary<string, object>>(ReadText(Path.Combine(kit, "optional", "Zero.code-profile"), 1024 * 1024));
                var wrapper = json.Deserialize<Dictionary<string, object>>((string)profile["settings"]);
                values = ReadSettings((string)wrapper["settings"]);
            }
            if (values == null) throw new IOException("Zero's editor settings are incomplete. Reinstall Zero.");
            values["java.configuration.runtimes"] = new JArray(new JObject { ["name"] = "JavaSE-21", ["path"] = java, ["default"] = true });
            // The Java extension supplies its own tooling JRE; Java 21 is the project runtime.
            values.Remove("java.jdt.ls.java.home");
            values.Remove("java.home");
            values["java.import.gradle.java.home"] = java;
            var terminal = values["terminal.integrated.env.windows"] as JObject ?? new JObject();
            // Windows environment names are case-insensitive even though JSON keys are not.
            foreach (var property in terminal.Properties().Where(property => TerminalOwnedVariables.Contains(property.Name, StringComparer.OrdinalIgnoreCase)).ToArray()) property.Remove();
            terminal["JAVA_HOME"] = java; terminal["ZERO_JAVA_HOME"] = java; terminal["PATH"] = JavaPath;
            terminal["MAVEN_SKIP_RC"] = "1";
            foreach (string key in JavaStartupVariables) terminal[key] = JValue.CreateNull();
            values["terminal.integrated.env.windows"] = terminal;
            var profiles = values["terminal.integrated.profiles.windows"] as JObject ?? new JObject();
            profiles["Zero Java"] = TerminalProfile();
            values["terminal.integrated.profiles.windows"] = profiles;
            values["terminal.integrated.defaultProfile.windows"] = "Zero Java";
            // Zero owns this isolated profile; tools never import into Default.
            if (source == null && values["window.restoreWindows"] == null) values["window.restoreWindows"] = "all";
            string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                WindowsRuntimeFolders.Check(path);
                string updated = source == null ? values.ToString(Formatting.Indented) : PatchSettings(source, values);
                if (updated == original) return;
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                using (var writer = new StreamWriter(output, new UTF8Encoding(false))) writer.Write(updated);
                WindowsRuntimeFolders.Check(path);
                if (File.Exists(path))
                {
                    if (original == null || ReadText(path, 1024 * 1024) != original) throw new IOException("Zero's editor settings changed during setup. Your edit was kept; retry setup.");
                    File.Replace(temporary, path, null);
                }
                else if (original != null) throw new IOException("Zero's editor settings changed during setup. Retry setup.");
                else File.Move(temporary, path);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        private async Task<Dictionary<string, string>> ExtensionState(CancellationToken cancellation)
        {
            string output = await Code(new[] { "--list-extensions", "--show-versions" }, 60000, cancellation);
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string line in output.Replace("\r\n", "\n").Split('\n'))
            {
                int split = line.IndexOf('@');
                if (split > 0) values[line.Substring(0, split).Trim()] = line.Substring(split + 1).Trim();
            }
            return values;
        }
        private bool ExtensionsReady(Dictionary<string, string> state)
        {
            string zero;
            return state.TryGetValue("zero.zero", out zero) && AtLeast(zero, version) && state.ContainsKey("redhat.java");
        }
        public async Task Prepare(Action<string> progress, CancellationToken cancellation)
        {
            progress = progress ?? (_ => { }); cancellation.ThrowIfCancellationRequested();
            using (var folders = new WindowsRuntimeFolders())
            {
                folders.Ensure(data); folders.Ensure(Path.Combine(data, "runtime"));
                string lockPath = Path.Combine(data, ".setup-lock"); WindowsRuntimeFolders.Check(lockPath);
                using (var setupLock = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
                {
                    WindowsRuntimeFolders.Check(lockPath);
                    await PrepareJava(progress, cancellation);
                    await PrepareNode(progress, cancellation);
                    folders.Ensure(UserData); folders.Ensure(Extensions);
                    progress("Preparing editor…"); await FindEditor(cancellation);
                    if (editor == null)
                    {
                        if (Directory.Exists(AssetFolder("vscode"))) await Repair("vscode", progress, cancellation);
                        else await Install("vscode", progress, cancellation);
                        await FindEditor(cancellation);
                    }
                    if (editor == null) throw new IOException("A compatible editor could not be prepared. Retry setup.");
                    progress("Preparing editor settings…"); Settings(folders);
                    var state = await ExtensionState(cancellation); string zero; bool installed = false;
                    if (!state.TryGetValue("zero.zero", out zero) || !AtLeast(zero, version))
                    {
                        progress("Preparing Zero support…");
                        string vsix = Path.Combine(kit, "zero-" + version + ".vsix"); WindowsRuntimeFolders.Check(vsix);
                        if (!File.Exists(vsix)) throw new IOException("Zero's bundled editor support is missing. Reinstall Zero.");
                        await Code(new[] { "--install-extension", vsix }, 600000, cancellation);
                        installed = true;
                    }
                    if (!state.ContainsKey("redhat.java")) { progress("Preparing Java support…"); await Code(new[] { "--install-extension", "redhat.java" }, 600000, cancellation); installed = true; }
                    progress("Checking Zero…");
                    // Java/editor were checked above. Only changed extension
                    // state needs another probe here; Open rechecks readiness
                    // authoritatively immediately before the editor handoff.
                    if (!SettingsReady() || !ExtensionsReady(installed ? await ExtensionState(cancellation) : state)) throw new IOException("Required editor support was not verified. Retry setup.");
                }
            }
        }
        private string JavaPath { get { return Path.Combine(java, "bin") + ";${env:PATH}"; } }
        private JObject TerminalProfile()
        {
            // /d prevents a user's cmd AutoRun from replacing the private Java.
            var environment = new JObject { ["JAVA_HOME"] = java, ["ZERO_JAVA_HOME"] = java, ["PATH"] = JavaPath, ["MAVEN_SKIP_RC"] = "1" };
            foreach (string key in JavaStartupVariables) environment[key] = JValue.CreateNull();
            return new JObject { ["path"] = "${env:windir}\\System32\\cmd.exe", ["args"] = new JArray("/d"), ["env"] = environment };
        }
        private bool SettingsReady()
        {
            WindowsRuntimeFolders.Check(Extensions);
            if (!Directory.Exists(Extensions)) return false;
            string path = Path.Combine(UserData, "User", "settings.json");
            if (!File.Exists(path)) return false;
            var values = ReadSettings(ReadText(path, 1024 * 1024));
            var runtimes = values["java.configuration.runtimes"] as JArray;
            var terminal = values["terminal.integrated.env.windows"] as JObject;
            var profiles = values["terminal.integrated.profiles.windows"] as JObject;
            return values["java.home"] == null && values["java.jdt.ls.java.home"] == null &&
                (string)values["java.import.gradle.java.home"] == java &&
                (string)values["terminal.integrated.defaultProfile.windows"] == "Zero Java" &&
                terminal != null && !terminal.Properties().Any(property => TerminalOwnedVariables.Any(key => string.Equals(key, property.Name, StringComparison.OrdinalIgnoreCase) && key != property.Name)) && (string)terminal["MAVEN_SKIP_RC"] == "1" && JavaStartupVariables.All(key => terminal[key]?.Type == JTokenType.Null) && (string)terminal["JAVA_HOME"] == java && (string)terminal["ZERO_JAVA_HOME"] == java && (string)terminal["PATH"] == JavaPath &&
                profiles != null && JToken.DeepEquals(profiles["Zero Java"], TerminalProfile()) &&
                runtimes != null && runtimes.Count == 1 && runtimes.OfType<JObject>().Any(runtime =>
                (string)runtime["name"] == "JavaSE-21" && runtime["default"]?.Type == JTokenType.Boolean &&
                (bool)runtime["default"] && runtime["path"]?.Type == JTokenType.String &&
                string.Equals((string)runtime["path"], java, StringComparison.OrdinalIgnoreCase));
        }
        public async Task Open(bool resume, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            using (var folders = new WindowsRuntimeFolders())
            {
                WindowsRuntimeFolders.Check(data); WindowsRuntimeFolders.Check(project);
                if (!Directory.Exists(data) || !Directory.Exists(project)) throw new IOException("Your Zero starter or private support folder is missing. Run setup again.");
                folders.Ensure(data); folders.Ensure(UserData); folders.Ensure(Extensions);
                await VerifyJava(cancellation); await VerifyNode(cancellation); await FindEditor(cancellation);
                if (editor == null || !SettingsReady() || !ExtensionsReady(await ExtensionState(cancellation))) throw new IOException("Zero's editor support needs repair. Run setup again.");
                cancellation.ThrowIfCancellationRequested();
                host.Launch(Info(Path.Combine(editor, "Code.exe"), Isolated.Concat(resume ? new string[0] : new[] { "--new-window" }), false));
            }
        }
    }
}

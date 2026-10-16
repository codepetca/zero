using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Velopack;
using Velopack.Locators;

namespace ZeroSetup
{
    internal enum UpdateResult { None, Ready, Available, Disabled }

    internal interface IUpdaterRuntime
    {
        bool IsInstalled { get; }
        bool IsPortable { get; }
        string PackagesDirectory { get; }
        Task<UpdateInfo> Check();
        Task Download(UpdateInfo update, CancellationToken cancellation);
        void Apply(VelopackAsset asset);
    }

    internal sealed class VelopackUpdaterRuntime : IUpdaterRuntime
    {
        private readonly UpdateManager manager;
        internal VelopackUpdaterRuntime(TrustedUpdateSource source) { manager = new UpdateManager(source, new UpdateOptions { ExplicitChannel = "win", AllowVersionDowngrade = false, MaximumDeltasBeforeFallback = -1 }); }
        public bool IsInstalled { get { return manager.IsInstalled; } }
        public bool IsPortable { get { return manager.IsPortable; } }
        public string PackagesDirectory { get { return VelopackLocator.Current.PackagesDir; } }
        public Task<UpdateInfo> Check() { return manager.CheckForUpdatesAsync(); }
        public Task Download(UpdateInfo update, CancellationToken cancellation) { return manager.DownloadUpdatesAsync(update, null, cancellation); }
        public void Apply(VelopackAsset asset) { manager.ApplyUpdatesAndExit(asset); }
    }

    // The UI owns serialization and calls ApplyPending only after setup/editor handoff ends.
    internal sealed class UpdateCoordinator : IDisposable
    {
        private readonly string preferencesPath;
        private readonly JObject config;
        private bool checkEnabled = true, downloadEnabled = true;
        private DateTime lastCheckUtc = DateTime.MinValue;
        private TrustedUpdateSource source;
        private IUpdaterRuntime manager;
        private readonly Func<TrustedUpdateSource, IUpdaterRuntime> runtimeFactory;
        private readonly Func<CancellationToken, TrustedUpdateSource> sourceFactory;
        private VelopackAsset pending;
        private CancellationTokenSource deadline;
        internal event Action<string> StatusChanged;
        internal bool Enabled { get { return config != null && (bool)config["enabled"]; } }
        internal bool IsDue { get { return CheckEnabled && DateTime.UtcNow - lastCheckUtc >= TimeSpan.FromDays(1); } }
        internal bool CheckEnabled { get { return checkEnabled; } set { checkEnabled = value; SavePreferences(); } }
        internal bool DownloadEnabled { get { return downloadEnabled; } set { downloadEnabled = value; SavePreferences(); } }

        internal UpdateCoordinator(string dataRoot) : this(dataRoot, LoadConfiguration(), null, null) { }
        private static JObject LoadConfiguration()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WindowsUpdater.json")) {
                if (stream != null) using (var reader = new StreamReader(stream)) return TrustedUpdateSource.Parse(Encoding.UTF8.GetBytes(reader.ReadToEnd()));
            }
            return null;
        }
        internal UpdateCoordinator(string dataRoot, JObject configuration, Func<TrustedUpdateSource, IUpdaterRuntime> runtimeFactory, Func<CancellationToken, TrustedUpdateSource> sourceFactory)
        {
            preferencesPath = Path.Combine(dataRoot, "update-preferences.json");
            config = configuration;
            this.runtimeFactory = runtimeFactory ?? (source => new VelopackUpdaterRuntime(source));
            this.sourceFactory = sourceFactory ?? (token => new TrustedUpdateSource((string)config["feedUrl"], (string)config["publicKeyXml"], (string)config["channel"], token));
            if (config != null) {
                TrustedUpdateSource.RequireKeys(config, "schema", "enabled", "packageId", "channel", "feedUrl", "publicKeyXml", "velopackVersion");
                if ((int)config["schema"] != 1 || (string)config["packageId"] != "Zero" || (string)config["channel"] != "win" ||
                    (string)config["velopackVersion"] != "1.2.161") throw new InvalidDataException("Invalid Windows updater configuration.");
            }
            try {
                TrustedUpdateSource.RejectReparseAncestors(preferencesPath);
                if (File.Exists(preferencesPath)) {
                    JObject preferences = TrustedUpdateSource.Parse(File.ReadAllBytes(preferencesPath));
                    TrustedUpdateSource.RequireKeys(preferences, "checkEnabled", "downloadEnabled", "lastCheckUtc");
                    if (preferences["checkEnabled"].Type != JTokenType.Boolean || preferences["downloadEnabled"].Type != JTokenType.Boolean || preferences["lastCheckUtc"].Type != JTokenType.String)
                        throw new InvalidDataException("Invalid update preferences.");
                    checkEnabled = (bool)preferences["checkEnabled"];
                    downloadEnabled = (bool)preferences["downloadEnabled"];
                    DateTime parsed;
                    if (DateTime.TryParse((string)preferences["lastCheckUtc"], null, System.Globalization.DateTimeStyles.RoundtripKind, out parsed) && parsed <= DateTime.UtcNow)
                        lastCheckUtc = parsed.ToUniversalTime();
                }
            } catch (Exception ex) when (ex is IOException || ex is InvalidDataException || ex is Newtonsoft.Json.JsonException || ex is ArgumentException || ex is InvalidCastException || ex is UnauthorizedAccessException) {
                // Invalid local preferences use safe defaults and retry on the next launch.
            }
        }

        internal async Task<UpdateResult> CheckAndDownload(bool manual, CancellationToken cancellation)
        {
            if (!Enabled) return UpdateResult.Disabled;
            if (!manual && !IsDue) return UpdateResult.None;
            ClearPending();
            deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            deadline.CancelAfter(TimeSpan.FromSeconds(120));
            try {
                source = sourceFactory(deadline.Token);
                manager = runtimeFactory(source);
                if (!manager.IsInstalled || manager.IsPortable) { ClearPending(); return UpdateResult.Disabled; }
                StatusChanged?.Invoke("Checking for updates…");
                UpdateInfo update = await manager.Check().ConfigureAwait(false);
                deadline.Token.ThrowIfCancellationRequested();
                if (update == null) { MarkChecked(); ClearPending(); return UpdateResult.None; }
                if (!manual && !DownloadEnabled) { MarkChecked(); ClearPending(); return UpdateResult.Available; }
                string packagePath = PackagePath(update.TargetFullRelease);
                // Velopack skips its checks when a complete cache file already exists.
                if (File.Exists(packagePath)) {
                    try { source.VerifyPackage(update.TargetFullRelease, packagePath, deadline.Token); }
                    catch (System.Security.Cryptography.CryptographicException) { File.Delete(packagePath); }
                }
                StatusChanged?.Invoke("Downloading update…");
                await manager.Download(update, deadline.Token).ConfigureAwait(false);
                deadline.Token.ThrowIfCancellationRequested();
                source.VerifyPackage(update.TargetFullRelease, packagePath, deadline.Token);
                pending = update.TargetFullRelease;
                MarkChecked();
                return UpdateResult.Ready;
            } catch { ClearPending(); throw; }
        }

        internal void ApplyPending()
        {
            if (pending == null || source == null || manager == null) throw new InvalidOperationException("No authenticated update is ready.");
            source.VerifyPackage(pending, PackagePath(pending));
            manager.Apply(pending);
        }
        private string PackagePath(VelopackAsset asset)
        {
            string packages = manager.PackagesDirectory;
            if (String.IsNullOrEmpty(packages)) throw new InvalidDataException("Installed update package folder is unavailable.");
            string result = Path.Combine(packages, asset.FileName);
            TrustedUpdateSource.RejectReparseAncestors(result);
            return result;
        }
        private void MarkChecked() { lastCheckUtc = DateTime.UtcNow; SavePreferences(); }
        private void SavePreferences()
        {
            TrustedUpdateSource.RejectReparseAncestors(preferencesPath);
            Directory.CreateDirectory(Path.GetDirectoryName(preferencesPath));
            var preferences = new JObject { ["checkEnabled"] = checkEnabled, ["downloadEnabled"] = downloadEnabled, ["lastCheckUtc"] = lastCheckUtc.ToString("o") };
            string temporary = preferencesPath + ".tmp";
            TrustedUpdateSource.RejectReparseAncestors(temporary);
            File.WriteAllText(temporary, preferences.ToString(), new UTF8Encoding(false));
            if (File.Exists(preferencesPath)) File.Replace(temporary, preferencesPath, null);
            else File.Move(temporary, preferencesPath);
        }
        private void ClearPending()
        {
            pending = null; manager = null;
            if (source != null) { source.Dispose(); source = null; }
            if (deadline != null) { deadline.Dispose(); deadline = null; }
        }
        public void Dispose() { ClearPending(); }
    }
}

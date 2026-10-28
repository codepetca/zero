using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal sealed class NativeSetupBackend : IAutomaticSetupBackend
    {
        private readonly string home;
        private readonly string dataRoot;
        private string bundledKit;
        private WindowsRuntime runtime;
        internal Func<bool> ApproveDependencies { get; set; }
        internal NativeSetupBackend(string dataRoot)
        {
            this.dataRoot = dataRoot;
            home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        }
        private async Task EnsureKit(CancellationToken cancellation)
        {
            if (bundledKit != null) return;
            using (Stream archive = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZeroKit.zip"))
            {
                if (archive == null) throw new InvalidDataException("This build is missing its embedded Zero kit.");
                bundledKit = await Task.Run(() => KitFiles.RetainEmbeddedKit(archive, dataRoot, cancellation), cancellation);
            }
        }

        public async Task Prepare(Action<string> progress, CancellationToken cancellation)
        {
#if ZERO_STORE
            if (!DependencyConsent.Ensure(dataRoot, ApproveDependencies)) throw new OperationCanceledException("Dependency download declined.");
#endif
            await EnsureKit(cancellation);
            progress("Preparing Zero…");
            var target = KitFiles.InspectDefaultFolder(home);
            await Task.Run(() => target.Existing
                ? KitFiles.UpdateKit(bundledKit, target, cancellation)
                : KitFiles.PlaceFreshKit(bundledKit, home, Distribution.KitFolder, cancellation), cancellation);
            // Configuration is always trusted from this installed app's payload,
            // rather than from an editable student copy of the support files.
            runtime = new WindowsRuntime(bundledKit, dataRoot, Path.Combine(target.Path, "starter"));
            await runtime.Prepare(progress, cancellation);
        }
        public async Task Open(CancellationToken cancellation)
        {
            if (runtime == null) throw new InvalidOperationException("Prepare Zero before opening the editor.");
            string marker = Path.Combine(dataRoot, "editor-opened");
            KitFiles.RejectReparseAncestors(marker);
            await runtime.Open(File.Exists(marker), cancellation);
            File.WriteAllText(marker, "1");
        }
        public void Dispose() { bundledKit = null; }
    }
}

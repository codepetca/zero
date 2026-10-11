using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal sealed class NativeSetupBackend : ISetupBackend, IDisposable
    {
        private readonly WindowsToolEnvironment tools = new WindowsToolEnvironment(new WindowsEnvironmentReader());
        public string Root { get; private set; }
        public async Task EnsureKit(CancellationToken cancellation)
        {
            if (Root != null) return;
            string created = null;
            try
            {
                created = KitFiles.CreatePrivateTemporaryDirectory();
                await Task.Run(() =>
                {
                    using (Stream archive = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZeroKit.zip"))
                    {
                        if (archive == null) throw new InvalidDataException("This build is missing its embedded Zero kit.");
                        KitFiles.Extract(archive, created, cancellation);
                    }
                });
                cancellation.ThrowIfCancellationRequested();
                Root = created;
            }
            catch { KitFiles.DeleteOwnedDirectory(created); throw; }
        }
        public Task<string> Place(string parent, string name, KitFiles.KitTarget expected, Action<string> diagnostic, CancellationToken cancellation)
        {
            return Task.Run(() => expected.Existing ? KitFiles.UpdateKit(Root, expected, cancellation, diagnostic) : KitFiles.PlaceFreshKit(Root, parent, name, cancellation));
        }
        public Task<CheckResult> Run(string root, string action, string target, bool approved, CancellationToken cancellation)
        {
            // Allow bounded preflight probes before the backend's 5-minute extension timeout.
            int timeout = action == "extension" ? 600000 : action == "profile" ? 180000 : 240000;
            var info = Processes.NativeInfo(Processes.PowerShellPath(), root, action, target, approved);
            tools.Apply(info);
            return Processes.RunAsync(info, timeout, cancellation);
        }
        public Task Download(string url, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            if (url != "https://code.visualstudio.com/download" && url != "https://adoptium.net/temurin/releases/?version=17") throw new ArgumentException("Unknown download page.");
            using (var process = Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })) { /* Shell handoff may reuse the existing browser without a process handle. */ }
            tools.VendorHandoffCompleted();
            return Task.CompletedTask;
        }
        public void Dispose() { KitFiles.DeleteOwnedDirectory(Root); }
    }
}

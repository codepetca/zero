using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal interface IWindowsRuntimeHost
    {
        string Architecture { get; }
        void ValidatePlatform();
        IEnumerable<string> InstalledEditors();
        Task Download(WindowsRuntimeAsset asset, string destination, CancellationToken cancellation);
        Task<CheckResult> Run(ProcessStartInfo info, int timeoutMilliseconds, CancellationToken cancellation);
        void Launch(ProcessStartInfo info);
    }
    internal sealed class WindowsRuntimeHost : IWindowsRuntimeHost
    {
        public string Architecture { get { return Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432") ?? Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "unknown"; } }
        public void ValidatePlatform()
        {
            if (Environment.OSVersion.Platform != PlatformID.Win32NT || Environment.OSVersion.Version.Major < 10)
                throw new IOException("Automatic Zero setup needs Windows 10 or later on an Intel or AMD 64-bit computer. Ask your teacher or IT for help.");
        }
        public IEnumerable<string> InstalledEditors()
        {
            foreach (var root in new[] { Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
            {
                if (string.IsNullOrWhiteSpace(root)) continue;
                yield return Path.Combine(root, root == Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) ? @"Programs\Microsoft VS Code" : "Microsoft VS Code");
            }
        }
        private static bool TrustedDownload(Uri uri)
        {
            return uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo) && uri.IsDefaultPort &&
                (uri.Host == "github.com" || uri.Host == "release-assets.githubusercontent.com" || uri.Host == "objects.githubusercontent.com" || uri.Host == "vscode.download.prss.microsoft.com" || uri.Host == "nodejs.org");
        }
        public async Task Download(WindowsRuntimeAsset asset, string destination, CancellationToken cancellation)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            try
            {
                using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
                using (var handler = new HttpClientHandler { AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.None })
                using (var client = new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(15) })
                {
                    timeout.CancelAfter(TimeSpan.FromMinutes(15));
                    Uri url = new Uri(asset.url);
                    for (int redirect = 0; redirect <= 5; redirect++)
                    {
                        if (!TrustedDownload(url)) throw new IOException("The runtime download redirected outside its official HTTPS source.");
                        using (var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout.Token))
                        {
                            int status = (int)response.StatusCode;
                            if (status >= 300 && status <= 399)
                            {
                                if (response.Headers.Location == null) throw new IOException("The runtime download has no redirect destination.");
                                url = new Uri(url, response.Headers.Location); continue;
                            }
                            response.EnsureSuccessStatusCode();
                            long? length = response.Content.Headers.ContentLength;
                            if (length.HasValue && length.Value != asset.size) throw new IOException("The runtime download has the wrong size. Retry setup.");
                            using (var input = await response.Content.ReadAsStreamAsync())
                            using (var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
                            {
                                var buffer = new byte[65536]; long bytes = 0; int count;
                                while ((count = await input.ReadAsync(buffer, 0, buffer.Length, timeout.Token)) != 0)
                                {
                                    if (bytes > asset.size - count) throw new IOException("The runtime download exceeds its verified size.");
                                    await output.WriteAsync(buffer, 0, count, timeout.Token); bytes += count;
                                }
                                if (bytes != asset.size) throw new IOException("The runtime download ended early. Retry setup.");
                            }
                            return;
                        }
                    }
                    throw new IOException("The runtime download redirected too many times.");
                }
            }
            catch (OperationCanceledException error)
            {
                if (cancellation.IsCancellationRequested) throw;
                throw new IOException("Zero's runtime download timed out. Check your connection and retry setup.", error);
            }
            catch (HttpRequestException error) { throw new IOException("Zero's runtime download failed. Check your connection and retry setup.", error); }
        }
        public Task<CheckResult> Run(ProcessStartInfo info, int timeoutMilliseconds, CancellationToken cancellation) { return Processes.RunAsync(info, timeoutMilliseconds, cancellation); }
        public void Launch(ProcessStartInfo info)
        {
            using (var process = Process.Start(info)) if (process == null) throw new IOException("Zero's editor could not be opened. Retry setup.");
        }
    }
    internal sealed class WindowsRuntimeAsset
    {
        public string url { get; set; }
        public string sha256 { get; set; }
        public string format { get; set; }
        public string version { get; set; }
        public long size { get; set; }
    }
}

using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Velopack;
using ZeroSetup;

internal static class WindowsUpdaterHarness
{
    private sealed class FakeHttp : HttpMessageHandler
    {
        internal byte[] Feed, Package;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(request.RequestUri.AbsolutePath == "/feed" ? Feed : Package) });
        }
    }
    private static void MustFail(Action operation, string name)
    {
        try { operation(); } catch { Console.WriteLine("PASS " + name); return; }
        throw new Exception("Expected rejection: " + name);
    }
    private static byte[] Envelope(JObject release, RSA key)
    {
        byte[] payload = Encoding.UTF8.GetBytes(release.ToString(Newtonsoft.Json.Formatting.None));
        return Encoding.UTF8.GetBytes(new JObject { ["payload"] = Convert.ToBase64String(payload), ["signature"] = Convert.ToBase64String(key.SignData(payload, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) }.ToString());
    }
    private sealed class FakeRuntime : IUpdaterRuntime
    {
        internal TrustedUpdateSource Source;
        internal string Packages;
        internal int Checks, Downloads, Applies;
        public bool IsInstalled { get { return true; } }
        public bool IsPortable { get { return false; } }
        public string PackagesDirectory { get { return Packages; } }
        public async Task<UpdateInfo> Check() { Checks++; var feed = await Source.GetReleaseFeed(null,"Zero","win"); return new UpdateInfo(feed.Assets[0],false); }
        public Task Download(UpdateInfo update, CancellationToken token) { Downloads++; return Source.DownloadReleaseEntry(null,update.TargetFullRelease,Path.Combine(Packages,update.TargetFullRelease.FileName),null,token); }
        public void Apply(VelopackAsset asset) { Applies++; }
    }
    private static void Main()
    {
        // Build output is disposable; macOS /var and /tmp themselves are symlinks.
        string temporary = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "zero-updater-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporary);
        try {
            using (var key = new RSACryptoServiceProvider(3072) { PersistKeyInCsp = false }) {
                byte[] package = Encoding.UTF8.GetBytes("signed kit bytes, including unsigned scripts");
                string hash;
                using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(package)).Replace("-", "").ToLowerInvariant();
                var release = new JObject { ["schema"] = 1, ["packageId"] = "Zero", ["channel"] = "win", ["version"] = "0.5.99", ["fileName"] = "Zero-0.5.99-full.nupkg", ["url"] = "https://updates.example/package", ["size"] = package.Length, ["sha256"] = hash };
                var handler = new FakeHttp { Feed = Envelope(release, key), Package = package };
                using (var source = new TrustedUpdateSource("https://updates.example/feed", key.ToXmlString(false), "win", CancellationToken.None, handler)) {
                    var feed = source.GetReleaseFeed(null,"Zero","win").GetAwaiter().GetResult();
                    string target = Path.Combine(temporary,"package.nupkg");
                    source.DownloadReleaseEntry(null,feed.Assets[0],target,null).GetAwaiter().GetResult();
                    source.VerifyPackage(feed.Assets[0],target);
                    Console.WriteLine("PASS signed full package before extraction");
                    File.AppendAllText(target,"tamper");
                    MustFail(() => source.VerifyPackage(feed.Assets[0],target), "tampered cache rejected");
                    handler.Package = Encoding.UTF8.GetBytes("wrong bytes");
                    MustFail(() => source.DownloadReleaseEntry(null,feed.Assets[0],target,null).GetAwaiter().GetResult(), "tampered download rejected");
                    if (File.Exists(target)) throw new Exception("Rejected download remained on disk.");
                    byte[] original = handler.Feed;
                    JObject envelope = JObject.Parse(Encoding.UTF8.GetString(original));
                    envelope["payload"] = Convert.ToBase64String(Encoding.UTF8.GetBytes("{}"));
                    handler.Feed = Encoding.UTF8.GetBytes(envelope.ToString());
                    MustFail(() => source.GetReleaseFeed(null,"Zero","win").GetAwaiter().GetResult(), "substituted feed rejected");
                    release["fileName"] = "../Zero-0.5.99-full.nupkg";
                    handler.Feed = Envelope(release,key);
                    MustFail(() => source.GetReleaseFeed(null,"Zero","win").GetAwaiter().GetResult(), "signed traversal rejected");
                    MustFail(() => source.GetReleaseFeed(null,"Other","win").GetAwaiter().GetResult(), "application substitution rejected");
                }
                using (var coordinator = new UpdateCoordinator(temporary)) {
                    if (coordinator.Enabled || coordinator.CheckAndDownload(true,CancellationToken.None).GetAwaiter().GetResult() != UpdateResult.Disabled) throw new Exception("Development updater is enabled.");
                    coordinator.CheckEnabled = false; coordinator.DownloadEnabled = false;
                }
                using (var coordinator = new UpdateCoordinator(temporary)) {
                    if (coordinator.CheckEnabled || coordinator.DownloadEnabled || coordinator.IsDue) throw new Exception("Update preferences did not persist.");
                    Console.WriteLine("PASS disabled development configuration and persisted preferences");
                }
                release["fileName"] = "Zero-0.5.99-full.nupkg";
                var config = new JObject { ["schema"] = 1, ["enabled"] = true, ["packageId"] = "Zero", ["channel"] = "win", ["feedUrl"] = "https://updates.example/feed", ["publicKeyXml"] = key.ToXmlString(false), ["velopackVersion"] = "1.2.161" };
                FakeRuntime runtime = null;
                Func<CancellationToken,TrustedUpdateSource> makeSource = token => new TrustedUpdateSource("https://updates.example/feed",key.ToXmlString(false),"win",token,new FakeHttp { Feed = Envelope(release,key), Package = package });
                using (var coordinator = new UpdateCoordinator(temporary,config,source => runtime = new FakeRuntime { Source = source, Packages = temporary },makeSource)) {
                    if (coordinator.CheckAndDownload(false,CancellationToken.None).GetAwaiter().GetResult() != UpdateResult.None || runtime != null) throw new Exception("Disabled background check ran.");
                    if (coordinator.CheckAndDownload(true,CancellationToken.None).GetAwaiter().GetResult() != UpdateResult.Ready || runtime.Checks != 1 || runtime.Downloads != 1) throw new Exception("Manual update did not bypass automatic preferences.");
                    coordinator.ApplyPending();
                    if (runtime.Applies != 1) throw new Exception("Explicit authenticated apply did not run.");
                    coordinator.CheckEnabled = true;
                    if (coordinator.IsDue) throw new Exception("Successful update check did not set last check time.");
                    Console.WriteLine("PASS manual check bypasses prefs, authenticated apply, successful cadence");
                }
                string availableRoot = Path.Combine(temporary,"available");
                using (var coordinator = new UpdateCoordinator(availableRoot,config,source => runtime = new FakeRuntime { Source = source, Packages = temporary },makeSource)) {
                    coordinator.DownloadEnabled = false;
                    if (coordinator.CheckAndDownload(false,CancellationToken.None).GetAwaiter().GetResult() != UpdateResult.Available || runtime.Downloads != 0) throw new Exception("Disabled automatic download ran.");
                    Console.WriteLine("PASS automatic download preference honored");
                }
                string corruptRoot = Path.Combine(temporary,"corrupt"); Directory.CreateDirectory(corruptRoot);
                File.WriteAllText(Path.Combine(corruptRoot,"update-preferences.json"),"{}");
                using (var coordinator = new UpdateCoordinator(corruptRoot,config,source => runtime = new FakeRuntime { Source = source, Packages = temporary },token => new TrustedUpdateSource("https://updates.example/feed",key.ToXmlString(false),"win",token,new FakeHttp { Feed = Encoding.UTF8.GetBytes("{}"), Package = package }))) {
                    MustFail(() => coordinator.CheckAndDownload(false,CancellationToken.None).GetAwaiter().GetResult(),"offline/invalid check rejected");
                    if (!coordinator.IsDue || !coordinator.CheckEnabled || !coordinator.DownloadEnabled) throw new Exception("Failed check suppressed retry or invalid prefs did not default.");
                    Console.WriteLine("PASS failed checks stay due and corrupt preferences recover");
                }
                key.PersistKeyInCsp = false;
            }
        } finally { Directory.Delete(temporary,true); }
    }
}

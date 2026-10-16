using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Velopack;
using Velopack.Logging;
using Velopack.Sources;

namespace ZeroSetup
{
    // The signature covers the exact payload bytes. No network feed supplies a trusted hash.
    internal sealed class TrustedUpdateSource : IUpdateSource, IDisposable
    {
        private readonly string feedUrl, publicKeyXml, channel;
        private readonly CancellationToken cancellation;
        private readonly HttpClient http;
        private VelopackAsset trusted;
        private string packageUrl;
        internal const long MaximumPackageSize = 2147483648L;

        internal TrustedUpdateSource(string feedUrl, string publicKeyXml, string channel, CancellationToken cancellation, HttpMessageHandler handler = null)
        {
            RequireHttps(feedUrl);
            this.feedUrl = feedUrl;
            this.publicKeyXml = publicKeyXml;
            this.channel = channel;
            this.cancellation = cancellation;
            http = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false });
            http.Timeout = TimeSpan.FromSeconds(120);
        }

        public async Task<VelopackAssetFeed> GetReleaseFeed(IVelopackLogger logger, string appId, string requestedChannel, Guid? stagingId = null, VelopackAsset latestLocalRelease = null)
        {
            if (appId != "Zero" || requestedChannel != channel) throw new InvalidDataException("Unexpected update application or channel.");
            byte[] envelope = await ReadBounded(feedUrl, 131072, cancellation).ConfigureAwait(false);
            JObject wrapper = Parse(envelope);
            RequireKeys(wrapper, "payload", "signature");
            byte[] payload = Convert.FromBase64String((string)wrapper["payload"]);
            byte[] signature = Convert.FromBase64String((string)wrapper["signature"]);
            if (payload.Length > 65536) throw new InvalidDataException("Update descriptor is too large.");
            using (RSA rsa = RSA.Create()) {
                rsa.FromXmlString(publicKeyXml);
                if (rsa.KeySize < 3072 || !rsa.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
                    throw new CryptographicException("Update publisher signature is invalid.");
            }
            JObject release = Parse(payload);
            RequireKeys(release, "schema", "packageId", "channel", "version", "fileName", "url", "size", "sha256");
            string name = (string)release["fileName"], hash = (string)release["sha256"];
            long size = (long)release["size"];
            if ((int)release["schema"] != 1 || (string)release["packageId"] != "Zero" || (string)release["channel"] != channel ||
                String.IsNullOrEmpty(name) || name.Length > 180 || Path.GetFileName(name) != name || name.IndexOfAny(new[] { '/', '\\', ':' }) >= 0 ||
                !name.EndsWith("-full.nupkg", StringComparison.Ordinal) || size < 1 || size > MaximumPackageSize ||
                hash == null || hash.Length != 64 || hash.Any(c => !(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')))
                throw new InvalidDataException("Invalid signed update descriptor.");
            packageUrl = (string)release["url"];
            RequireHttps(packageUrl);
            trusted = new VelopackAsset { PackageId = "Zero", Version = SemanticVersion.Parse((string)release["version"]), Type = VelopackAssetType.Full,
                FileName = name, Size = size, SHA256 = hash, SHA1 = "" };
            return new VelopackAssetFeed { Assets = new[] { trusted } };
        }

        public async Task DownloadReleaseEntry(IVelopackLogger logger, VelopackAsset asset, string localFile, Action<int> progress, CancellationToken cancelToken = default(CancellationToken))
        {
            RequireTrusted(asset);
            RejectReparseAncestors(localFile);
            using (var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, cancelToken)) {
                try {
                    using (var response = await GetResponse(packageUrl, linked.Token).ConfigureAwait(false)) {
                        response.EnsureSuccessStatusCode();
                        if (response.Content.Headers.ContentLength.HasValue && response.Content.Headers.ContentLength.Value != trusted.Size)
                            throw new InvalidDataException("Update size does not match its signed descriptor.");
                        using (var input = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        using (var output = new FileStream(localFile, FileMode.Create, FileAccess.Write, FileShare.None)) {
                            byte[] buffer = new byte[81920]; long total = 0; int count;
                            while ((count = await input.ReadAsync(buffer, 0, buffer.Length, linked.Token).ConfigureAwait(false)) > 0) {
                                total += count;
                                if (total > trusted.Size) throw new InvalidDataException("Update exceeds its signed size.");
                                await output.WriteAsync(buffer, 0, count, linked.Token).ConfigureAwait(false);
                                if (progress != null) progress((int)(100 * total / trusted.Size));
                            }
                        }
                    }
                    VerifyPackage(asset, localFile, linked.Token); // Before Velopack can extract Update.exe.
                } catch { if (File.Exists(localFile)) File.Delete(localFile); throw; }
            }
        }

        internal void VerifyPackage(VelopackAsset asset, string path, CancellationToken token = default(CancellationToken))
        {
            RequireTrusted(asset);
            RejectReparseAncestors(path);
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create()) {
                byte[] buffer = new byte[81920]; int count;
                while ((count = stream.Read(buffer, 0, buffer.Length)) > 0) {
                    token.ThrowIfCancellationRequested();
                    sha.TransformBlock(buffer, 0, count, buffer, 0);
                }
                sha.TransformFinalBlock(new byte[0], 0, 0);
                string hash = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                if (stream.Length != trusted.Size || hash != trusted.SHA256) throw new CryptographicException("Update package differs from its signed descriptor.");
            }
        }

        private void RequireTrusted(VelopackAsset asset)
        {
            if (trusted == null || asset == null || asset.PackageId != trusted.PackageId || asset.Version != trusted.Version || asset.Type != VelopackAssetType.Full ||
                asset.FileName != trusted.FileName || asset.Size != trusted.Size || asset.SHA256 != trusted.SHA256)
                throw new InvalidDataException("Untrusted update package request.");
        }
        internal static JObject Parse(byte[] bytes)
        {
            using (var text = new StringReader(new UTF8Encoding(false, true).GetString(bytes)))
            using (var reader = new JsonTextReader(text) { MaxDepth = 8, DateParseHandling = DateParseHandling.None }) {
                JObject value = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
                if (reader.Read()) throw new InvalidDataException("Unexpected data after update JSON.");
                return value;
            }
        }
        internal static void RequireKeys(JObject value, params string[] keys)
        {
            if (value.Properties().Count() != keys.Length || keys.Any(key => value[key] == null || value[key].Type == JTokenType.Null))
                throw new InvalidDataException("Unexpected update descriptor fields.");
        }
        internal static void RejectReparseAncestors(string path)
        {
            string current = Path.GetFullPath(path);
            while (!String.IsNullOrEmpty(current)) {
                try {
                    if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                        throw new IOException("Updater paths cannot contain symbolic links or junctions.");
                } catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { }
                current = Path.GetDirectoryName(current);
            }
        }
        private static void RequireHttps(string url)
        {
            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || uri.Scheme != "https" || !String.IsNullOrEmpty(uri.UserInfo) || !String.IsNullOrEmpty(uri.Fragment))
                throw new InvalidDataException("Update URL must use HTTPS without credentials or a fragment.");
        }
        private async Task<byte[]> ReadBounded(string url, int maximum, CancellationToken token)
        {
            using (var response = await GetResponse(url, token).ConfigureAwait(false)) {
                response.EnsureSuccessStatusCode();
                using (var input = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                using (var output = new MemoryStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = await input.ReadAsync(buffer, 0, buffer.Length, token).ConfigureAwait(false)) > 0) {
                        if (output.Length + count > maximum) throw new InvalidDataException("Update descriptor is too large.");
                        output.Write(buffer, 0, count);
                    }
                    return output.ToArray();
                }
            }
        }
        private async Task<HttpResponseMessage> GetResponse(string url, CancellationToken token)
        {
            Uri current = new Uri(url);
            for (int redirects = 0; redirects <= 5; redirects++) {
                RequireHttps(current.AbsoluteUri);
                HttpResponseMessage response = await http.GetAsync(current, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
                int status = (int)response.StatusCode;
                if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308) return response;
                Uri location = response.Headers.Location;
                response.Dispose();
                if (location == null) throw new InvalidDataException("Update redirect has no destination.");
                current = new Uri(current, location);
            }
            throw new InvalidDataException("Too many update redirects.");
        }
        public void Dispose() { http.Dispose(); }
    }
}

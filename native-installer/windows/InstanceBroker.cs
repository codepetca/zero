using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Text;
using System.Text.RegularExpressions;

namespace ZeroSetup
{
    internal enum RequestKind : byte { Open = 1, Check = 2, Settings = 3, Jam = 4 }

    internal sealed class LauncherRequest
    {
        internal RequestKind Kind { get; private set; }
        internal string JamId { get; private set; }
        internal static readonly LauncherRequest Open = new LauncherRequest(RequestKind.Open, null);
        internal static readonly LauncherRequest Check = new LauncherRequest(RequestKind.Check, null);
        internal static readonly LauncherRequest Settings = new LauncherRequest(RequestKind.Settings, null);
        private LauncherRequest(RequestKind kind, string id) { Kind = kind; JamId = id; }
        internal static LauncherRequest FromUri(string uri)
        {
            var match = Regex.Match(uri ?? "", @"\Azero-studio://jam/(jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32}))\z", RegexOptions.CultureInvariant);
            if (!match.Success) throw new ArgumentException("The Zero jam link is invalid.");
            return new LauncherRequest(RequestKind.Jam, match.Groups[1].Value);
        }
        internal string InternalUri { get { return JamId == null ? null : "vscode://zero.zero/jam/" + JamId; } }
    }

    // Fixed requests and validated jam identifiers only; no paths or feed URLs.
    // A per-user pipe reaches the retained launcher while it checks in the background.
    internal sealed class InstanceBroker : IDisposable
    {
        private readonly Mutex mutex;
        private readonly string pipeName;
        private readonly SecurityIdentifier user;
        private bool ownsMutex;
        private volatile bool disposed;
        private NamedPipeServerStream activeServer;

        public static LauncherRequest Parse(string[] args)
        {
            if (args.Length == 0) return LauncherRequest.Open;
            if (args.Length == 1 && args[0] == "--check-for-updates") return LauncherRequest.Check;
            if (args.Length == 1 && args[0] == "--update-settings") return LauncherRequest.Settings;
            if (args.Length == 2 && args[0] == "--protocol") return LauncherRequest.FromUri(args[1]);
            throw new ArgumentException("Open Zero from the Start menu, or use its update commands in the editor.");
        }

        public InstanceBroker()
        {
            user = WindowsIdentity.GetCurrent().User;
            if (user == null) throw new IOException("Could not identify your Windows account.");
            pipeName = Distribution.BrokerPrefix + user.Value;
            var access = new MutexSecurity();
            access.AddAccessRule(new MutexAccessRule(user, MutexRights.FullControl, AccessControlType.Allow));
            mutex = new Mutex(false, "Local\\" + pipeName, out bool created, access);
            try { ownsMutex = mutex.WaitOne(0); }
            catch (AbandonedMutexException) { ownsMutex = true; }
        }

        public bool IsOwner { get { return ownsMutex; } }

        public void Forward(LauncherRequest request)
        {
            using (var client = new NamedPipeClientStream(".", pipeName, PipeDirection.Out, PipeOptions.None))
            {
                client.Connect(5000);
                client.WriteByte((byte)request.Kind);
                if (request.Kind == RequestKind.Jam)
                {
                    var bytes = Encoding.ASCII.GetBytes(request.JamId);
                    client.WriteByte((byte)bytes.Length); client.Write(bytes, 0, bytes.Length);
                }
                client.Flush();
            }
        }

        public void Listen(Action<LauncherRequest> deliver)
        {
            if (!ownsMutex) throw new InvalidOperationException("Only the active launcher receives requests.");
            Task.Run(() =>
            {
                while (!disposed)
                {
                    try
                    {
                        var access = new PipeSecurity();
                        access.SetAccessRuleProtection(true, false);
                        access.AddAccessRule(new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));
                        using (var server = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                            PipeOptions.Asynchronous, 32, 32, access))
                        {
                            activeServer = server;
                            if (disposed) return;
                            server.WaitForConnection();
                            // A connected same-user client must not pin the receiver.
                            var buffer = new byte[1];
                            var pending = server.ReadAsync(buffer, 0, 1);
                            if (!pending.Wait(5000)) continue;
                            if (pending.Result != 1) continue;
                            if (buffer[0] >= 1 && buffer[0] <= 3)
                                deliver(buffer[0] == 1 ? LauncherRequest.Open : buffer[0] == 2 ? LauncherRequest.Check : LauncherRequest.Settings);
                            else if (buffer[0] == 4)
                            {
                                var read = Task.Run(() =>
                                {
                                    int length = server.ReadByte();
                                    if (length < 1 || length > 41) return null;
                                    var id = new byte[length];
                                    int offset = 0;
                                    while (offset < length) { int n = server.Read(id, offset, length - offset); if (n == 0) return null; offset += n; }
                                    for (int i = 0; i < id.Length; i++) if (id[i] > 127) return null;
                                    try { return LauncherRequest.FromUri("zero-studio://jam/" + Encoding.ASCII.GetString(id)); }
                                    catch (ArgumentException) { return null; }
                                });
                                if (read.Wait(5000) && read.Result != null) deliver(read.Result);
                            }
                        }
                    }
                    catch (Exception error) when (error is IOException || error is ObjectDisposedException || error is AggregateException)
                    { if (disposed) return; }
                    finally { activeServer = null; }
                }
            });
        }

        // Constructed/disposed on the main UI thread: Mutex ownership is affine.
        public void Dispose()
        {
            disposed = true;
            activeServer?.Dispose();
            if (ownsMutex) { mutex.ReleaseMutex(); ownsMutex = false; }
            mutex.Dispose();
        }
    }
}

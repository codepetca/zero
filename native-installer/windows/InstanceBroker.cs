using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal enum LauncherRequest : byte { Open = 1, Check = 2, Settings = 3 }

    // Exactly three requests, no command lines, paths or feed URLs. A per-user
    // pipe reaches the retained launcher while it checks in the background.
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
                client.WriteByte((byte)request); client.Flush();
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
                            if (pending.Result == 1 && buffer[0] >= 1 && buffer[0] <= 3)
                                deliver((LauncherRequest)buffer[0]);
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

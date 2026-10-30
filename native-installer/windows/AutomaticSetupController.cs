using System;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal interface IAutomaticSetupBackend : IDisposable
    {
        Task Prepare(Action<string> progress, CancellationToken cancellation);
        Task Open(CancellationToken cancellation);
    }

    // The UI serializes requests. A failed operation stops here until Try again;
    // readiness and editor handoff are separate authoritative operations.
    internal sealed class AutomaticSetupController
    {
        private readonly IAutomaticSetupBackend backend;
        public bool Busy { get; private set; }
        public bool Opened { get; private set; }
        public bool Failed { get; private set; }
        public string Status { get; private set; } = "Preparing Zero…";
        public string Details { get; private set; } = "";
        public event Action Changed;

        public AutomaticSetupController(IAutomaticSetupBackend backend) { this.backend = backend; }

        public async Task<bool> Open(CancellationToken cancellation)
        {
            if (Busy) return false;
            Busy = true; Failed = false; Status = "Preparing Zero…"; Changed?.Invoke();
            try
            {
                await backend.Prepare(message => { Status = message; Changed?.Invoke(); }, cancellation);
                cancellation.ThrowIfCancellationRequested();
                Status = "Opening Zero…"; Changed?.Invoke();
                await backend.Open(cancellation);
                Opened = true; Status = "Zero is open.";
                return true;
            }
            catch (OperationCanceledException)
            {
                Failed = true; Status = "Setup cancelled. Try again when you’re ready.";
                return false;
            }
            catch (Exception error)
            {
                Failed = true; Status = "Could not prepare Zero. Try again or open Details.";
                Details = error.Message + "\r\n\r\nCheck your internet connection and available disk space. On a school device, ask your device administrator or IT if software is blocked.";
                return false;
            }
            finally { Busy = false; Changed?.Invoke(); }
        }
    }
}

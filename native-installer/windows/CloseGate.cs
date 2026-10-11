using System;
using System.ComponentModel;

namespace ZeroSetup
{
    // Owned by the UI thread. Work remains busy until its awaited cleanup completes.
    internal sealed class CloseGate
    {
        public bool IsBusy { get; private set; }

        public void SetBusy(bool value) { IsBusy = value; }

        public bool TryClose(CancelEventArgs request, Action onIdleClose)
        {
            if (IsBusy)
            {
                request.Cancel = true;
                return false;
            }
            onIdleClose();
            return true;
        }
    }
}

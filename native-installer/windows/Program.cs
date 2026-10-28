using System;
using System.IO;
using System.Windows.Forms;
#if !ZERO_STORE
using Velopack;
#endif

namespace ZeroSetup
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            // Hooks exit here before any setup/UI. Never let an unauthenticated
            // cached package auto-apply before our signed descriptor is checked.
#if !ZERO_STORE
            VelopackApp.Build().SetAutoApplyOnStartup(false).Run();
#endif
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                LauncherRequest request = InstanceBroker.Parse(args);
                string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                if (string.IsNullOrWhiteSpace(local)) throw new IOException("Your Windows app-data folder is unavailable. Ask your teacher or IT for help.");
                string data = Path.Combine(local, Distribution.DataFolder);
                KitFiles.RejectReparseAncestors(data);
                using (var broker = new InstanceBroker())
                {
                    if (!broker.IsOwner) { broker.Forward(request); return; }
                    using (var window = new MainForm(data, request))
                    {
                        // Handle exists before the pipe can deliver a request.
                        var handle = window.Handle;
                        broker.Listen(next => { if (!window.IsDisposed) window.BeginInvoke(new Action(() => window.Request(next))); });
                        Application.Run(window);
                    }
                }
            }
            catch (Exception error)
            {
                MessageBox.Show("Zero could not open. Try again from the Start menu. If software is blocked on your school device, ask your teacher or IT.\r\n\r\n" + error.Message,
                    "Zero", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

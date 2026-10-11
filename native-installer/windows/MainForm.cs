using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZeroSetup
{
    internal sealed class MainForm : Form
    {
        private readonly Label status;
        private readonly ProgressBar progress;
        private readonly Button primary;
        private readonly Button back;
        private readonly Button details;
        private readonly NativeSetupBackend backend = new NativeSetupBackend();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly CloseGate closeGate = new CloseGate();
        private readonly SetupController controller;

        public MainForm()
        {
            Text = "Zero Setup — unsigned development build";
            ClientSize = new Size(440, 180);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9);
            controller = new SetupController(backend, lifetime.Token);
            progress = new ProgressBar { Location = new Point(170, 26), Size = new Size(100, 8), Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 30, AccessibleName = "Setup progress" };
            status = new Label { Location = new Point(16, 52), Size = new Size(408, 24), TextAlign = ContentAlignment.MiddleCenter, AutoEllipsis = true, AccessibleName = "Setup status" };
            primary = new Button { Location = new Point(125, 92), Size = new Size(190, 30), Text = "Please wait" };
            back = new Button { Location = new Point(16, 145), Size = new Size(62, 25), Text = "Back", Visible = false };
            details = new Button { Location = new Point(345, 145), Size = new Size(79, 25), Text = "Details…" };
            Controls.AddRange(new Control[] { progress, status, primary, back, details });
            AcceptButton = primary;
            controller.Changed = RefreshStatus;
            primary.Click += async (sender, args) => await PrimaryAction();
            back.Click += (sender, args) => controller.PreviousProfileStep();
            details.Click += (sender, args) => ShowDetails();
            Shown += async (sender, args) => await controller.Check();
            FormClosing += (sender, args) =>
            {
                if (!closeGate.TryClose(args, lifetime.Cancel))
                    status.Text = "Please wait for setup to finish this step.";
            };
            FormClosed += (sender, args) => { backend.Dispose(); lifetime.Dispose(); };
            RefreshStatus();
        }
        private void RefreshStatus()
        {
            if (IsDisposed) return;
            closeGate.SetBusy(controller.Busy);
            status.Text = controller.Summary;
            primary.Text = controller.PrimaryTitle;
            primary.Enabled = !controller.Busy;
            back.Visible = controller.CanGoBack;
            back.Enabled = !controller.Busy;
            progress.Visible = controller.Busy;
        }
        private async Task PrimaryAction()
        {
            if (controller.Busy) return;
            if (controller.Stage == SetupStage.ProfileStep && controller.Step == ProfileStep.FilePicker)
            {
                controller.CopyProfilePath(path => { Clipboard.SetText(path); return true; });
                return;
            }
            await controller.PrimaryAction(ConfirmUpdate);
        }
        private bool ConfirmUpdate()
        {
            using (var dialog = new Form { Text = "Update Zero?", ClientSize = new Size(440, 150), FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterParent, Font = Font })
            {
                var warning = new Label { Location = new Point(20, 20), Size = new Size(400, 60), Text = "Setup files will be replaced. Your code, assets and saved projects will be kept.", AccessibleName = "Update warning" };
                var update = new Button { Text = "Update Zero", Location = new Point(180, 100), Size = new Size(115, 30), DialogResult = DialogResult.OK };
                var cancel = new Button { Text = "Cancel", Location = new Point(305, 100), Size = new Size(115, 30), DialogResult = DialogResult.Cancel };
                dialog.Controls.AddRange(new Control[] { warning, update, cancel });
                dialog.AcceptButton = cancel; dialog.CancelButton = cancel;
                return dialog.ShowDialog(this) == DialogResult.OK;
            }
        }
        private void ShowDetails()
        {
            string root = controller.Root;
            string guide = "";
            try
            {
                if (root != null)
                {
                    string path = Path.Combine(root, "setup", "README.md");
                    KitFiles.RejectReparseAncestors(path);
                    guide = File.ReadAllText(path);
                }
            }
            catch (Exception error) { guide = "Guide unavailable: " + error.Message; }
            using (var dialog = new Form { Text = "Zero Setup Details", Size = new Size(720, 500), StartPosition = FormStartPosition.CenterParent, Font = Font })
            {
                string profile = root == null ? "(kit is still being prepared)" : controller.ProfileFile;
                dialog.Controls.Add(new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, WordWrap = true,
                    Text = "Unsigned development build • " + Application.ProductVersion + "\r\n\r\n" + controller.Summary + "\r\n" + controller.ConsentDetail +
                    "\r\n\r\nProfile import: Ctrl+Shift+P > Preferences: Open Profiles (UI) > menu beside New Profile > Import Profile > Select File. Paste the full path into File name, choose Open, then Create with the name Zero. Return here and Check profile.\r\nProfile: " + profile +
                    "\r\n\r\n" + controller.Diagnostics + "\r\nManual setup guide:\r\n" + guide, AccessibleName = "Zero setup details" });
                dialog.ShowDialog(this);
            }
        }
    }
}

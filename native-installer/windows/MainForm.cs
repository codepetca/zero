using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZeroSetup
{
    internal sealed class MainForm : Form
    {
        private readonly TextBox summary;
        private readonly Button check;
        private readonly Button setup;
        private readonly Button guide;
        private readonly Button continueSetup;
        private readonly Button openFolder;
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly CloseGate closeGate = new CloseGate();
        private string temporaryKit;
        private string placedKit;
        private bool busy { get { return closeGate.IsBusy; } }

        public MainForm()
        {
            Text = "Zero Setup";
            ClientSize = new Size(760, 540);
            MinimumSize = new Size(620, 440);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 4 };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(new Label { Text = "Zero Setup", AutoSize = true, Font = new Font(Font.FontFamily, 22, FontStyle.Bold), Margin = new Padding(0, 0, 0, 8) });
            layout.Controls.Add(new Label { Text = "Unsigned development build • " + Application.ProductVersion + "\nCheck your laptop, then choose a fresh folder. Tool installation asks for your choice. GitHub is separate.", AutoSize = true, MaximumSize = new Size(700, 0), Margin = new Padding(0, 0, 0, 12) });
            summary = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, Text = "Choose Check laptop to review installed tools.\r\nOpening Zero Setup does not install or configure anything.", AccessibleName = "Laptop check summary" };
            layout.Controls.Add(summary);
            var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 12, 0, 0) };
            check = new Button { Text = "Check laptop", AutoSize = true };
            setup = new Button { Text = "Set up Zero", AutoSize = true };
            guide = new Button { Text = "Show guide", AutoSize = true };
            continueSetup = new Button { Text = "Continue setup", AutoSize = true, Visible = false };
            openFolder = new Button { Text = "Open folder", AutoSize = true, Visible = false };
            check.Click += async (sender, args) => await CheckLaptop();
            setup.Click += async (sender, args) => await SetUp();
            guide.Click += async (sender, args) => await ShowGuide();
            continueSetup.Click += (sender, args) => ContinueSetup();
            openFolder.Click += (sender, args) => OpenFolder();
            buttons.Controls.AddRange(new Control[] { check, setup, guide, continueSetup, openFolder });
            layout.Controls.Add(buttons);
            Controls.Add(layout);
            FormClosing += (sender, args) =>
            {
                if (!closeGate.TryClose(args, lifetime.Cancel))
                    MessageBox.Show(this, "Zero is still checking or copying files. Please wait for it to finish, then close this window.",
                        "Zero Setup is working", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            FormClosed += (sender, args) => KitFiles.DeleteOwnedDirectory(temporaryKit);
        }

        private async Task EnsureKit()
        {
            if (temporaryKit != null) return;
            string created = null;
            try
            {
                created = KitFiles.CreatePrivateTemporaryDirectory();
                await Task.Run(() =>
                {
                    using (Stream archive = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZeroKit.zip"))
                    {
                        if (archive == null) throw new InvalidDataException("This build is missing its embedded Zero kit.");
                        KitFiles.Extract(archive, created, lifetime.Token);
                    }
                });
                lifetime.Token.ThrowIfCancellationRequested();
                temporaryKit = created;
            }
            catch { KitFiles.DeleteOwnedDirectory(created); throw; }
        }

        private void SetBusy(bool value)
        {
            closeGate.SetBusy(value);
            check.Enabled = setup.Enabled = guide.Enabled = continueSetup.Enabled = openFolder.Enabled = !value;
            UseWaitCursor = value;
        }

        private async Task CheckLaptop()
        {
            if (busy) return;
            SetBusy(true);
            summary.Text = "Checking this laptop…\r\nThis check does not install or configure tools.";
            try
            {
                await EnsureKit();
                CheckResult result = await Processes.CheckAsync(placedKit ?? temporaryKit, lifetime.Token);
                if (IsDisposed) return;
                string status = result.Cancelled ? "Check cancelled." : result.TimedOut ? "Check timed out after 3 minutes. Close any remaining tool check and try again." :
                    result.OutputIncomplete ? "The check could not capture complete output. Check again before continuing." :
                    result.ExitCode == 0 ? "The setup checks passed. Run the first app to confirm its window." : "The check needs attention (exit " + result.ExitCode + ").";
                summary.Text = status + "\r\n\r\n" + result.Output + (result.ExitCode == 0 ? "" : "\r\nIf PowerShell policy blocked the script, use Show guide and ask your teacher or IT. Setup does not change policy.");
                check.Text = "Check again";
            }
            catch (OperationCanceledException) { }
            catch (Exception error) { ShowError(error); }
            finally { if (!IsDisposed) SetBusy(false); }
        }

        private async Task SetUp()
        {
            if (busy) return;
            using (var picker = new FolderBrowserDialog { Description = "Choose a writable parent folder. Zero will create a new folder inside it.", ShowNewFolderButton = true })
            {
                if (picker.ShowDialog(this) != DialogResult.OK) return;
                string name = AskFolderName();
                if (name == null) return;
                SetBusy(true);
                try
                {
                    await EnsureKit();
                    string destination = await Task.Run(() => KitFiles.PlaceFreshKit(temporaryKit, picker.SelectedPath, name, lifetime.Token));
                    placedKit = destination;
                    if (IsDisposed || lifetime.IsCancellationRequested) return;
                    continueSetup.Visible = openFolder.Visible = true;
                    summary.Text = "Zero kit placed in:\r\n" + destination + "\r\n\r\nChoose Continue setup to open the setup console. Review each tool action there. Compatible tools are kept; Git is optional.\r\nAfter setup, return here and choose Check again. Copying the kit alone does not mean setup succeeded.\r\nIf policy blocks the script, use Show guide or Open folder and read setup\\README.md. setup\\Setup.cmd offers explicit choices where permitted. Ask your teacher or IT about school policy.";
                    check.Text = "Check again";
                }
                catch (OperationCanceledException) { }
                catch (Exception error) { ShowError(error); }
                finally { if (!IsDisposed) SetBusy(false); }
            }
        }

        private void ContinueSetup()
        {
            if (busy || placedKit == null) return;
            try
            {
                Processes.LaunchSetup(placedKit);
                summary.Text = "The setup console was opened for:\r\n" + placedKit + "\r\n\r\nReview each action in that console, then return here and choose Check again. Opening the console does not confirm success.\r\nIf policy blocks setup, use Show guide or Open folder to read setup\\README.md. Ask your teacher or IT about school policy.";
            }
            catch (Exception error) { ShowError(error); }
        }

        private void OpenFolder()
        {
            if (busy || placedKit == null) return;
            try { Processes.LaunchFolder(placedKit); }
            catch (Exception error) { ShowError(error); }
        }

        private string AskFolderName()
        {
            using (var dialog = new Form { Text = "New Zero folder", ClientSize = new Size(420, 142), FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false, Font = Font })
            {
                var label = new Label { Text = "Name a new folder. Existing folders are kept.", Location = new Point(16, 16), AutoSize = true };
                var input = new TextBox { Text = "Zero", Location = new Point(16, 44), Width = 388, MaxLength = 100 };
                var ok = new Button { Text = "Create and set up", DialogResult = DialogResult.OK, Location = new Point(160, 88), Width = 144 };
                var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Location = new Point(312, 88), Width = 92 };
                dialog.Controls.AddRange(new Control[] { label, input, ok, cancel });
                dialog.AcceptButton = ok;
                dialog.CancelButton = cancel;
                return dialog.ShowDialog(this) == DialogResult.OK ? input.Text : null;
            }
        }

        private async Task ShowGuide()
        {
            if (busy) return;
            SetBusy(true);
            try
            {
                await EnsureKit();
                string kit = placedKit ?? temporaryKit;
                string path = Path.Combine(kit, "setup", "README.md");
                KitFiles.RejectReparseAncestors(path);
                // A native read-only guide does not depend on file associations or shell handlers.
                using (var dialog = new Form { Text = "Zero setup guide", Size = new Size(760, 560), StartPosition = FormStartPosition.CenterParent, Font = Font })
                {
                    dialog.Controls.Add(new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = true, Text = File.ReadAllText(path), AccessibleName = "Zero setup guide" });
                    dialog.ShowDialog(this);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception error) { ShowError(error); }
            finally { if (!IsDisposed) SetBusy(false); }
        }

        private void ShowError(Exception error)
        {
            if (IsDisposed) return;
            summary.Text = "Zero setup could not complete:\r\n" + error.Message +
                (placedKit == null ? "" : "\r\nYour new kit remains at " + placedKit) +
                "\r\nUse Show guide for manual setup. If school policy blocks setup, ask your teacher or IT.";
        }
    }
}

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZeroSetup
{
    internal sealed class MainForm : Form
    {
        private readonly Label status;
        private readonly ProgressBar progress;
        private readonly Button retry;
        private readonly Button details;
        private readonly Button done;
        private readonly NativeSetupBackend backend;
        private readonly AutomaticSetupController controller;
#if !ZERO_STORE
        private readonly UpdateCoordinator updates;
#endif
        private readonly Queue<LauncherRequest> requests = new Queue<LauncherRequest>();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
#if !ZERO_STORE
        private CancellationTokenSource background;
        private bool settingsVisible, foregroundUpdate;
#endif
        private bool pumping, closing;
        private LauncherRequest active;
        private string errorDetails = "";

        internal MainForm(string dataRoot, LauncherRequest initial)
        {
            SuspendLayout();
            Text = "Zero";
            Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            ClientSize = new Size(440, 190);
            MinimumSize = new Size(400, 220);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10);
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);
            MaximizeBox = false;
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 4 };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 14));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            status = new Label { Dock = DockStyle.Fill, Text = "Preparing Zero…", TextAlign = ContentAlignment.MiddleCenter, AccessibleName = "Zero status" };
            progress = new ProgressBar { Dock = DockStyle.Fill, Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = AnimationsEnabled() ? 30 : 0, AccessibleName = "Preparation progress" };
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
            retry = new Button { AutoSize = true, Text = "Try again", Visible = false, TabIndex = 0 };
            details = new Button { AutoSize = true, Text = "Details…", Visible = false, TabIndex = 1 };
            done = new Button { AutoSize = true, Text = "Done", Visible = false, TabIndex = 0 };
            actions.Controls.Add(done); actions.Controls.Add(retry); actions.Controls.Add(details);
            layout.Controls.Add(status, 0, 0); layout.Controls.Add(progress, 0, 1); layout.Controls.Add(actions, 0, 3);
            Controls.Add(layout); AcceptButton = retry;
            backend = new NativeSetupBackend(dataRoot);
            controller = new AutomaticSetupController(backend);
#if ZERO_STORE
            backend.ApproveDependencies = () => MessageBox.Show(this, DependencyConsent.Message, "Prepare Zero", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
#else
            updates = new UpdateCoordinator(dataRoot);
            updates.StatusChanged += message => OnUI(() => { if (Visible && foregroundUpdate) status.Text = message; });
#endif
            controller.Changed += () => OnUI(() => { status.Text = controller.Status; progress.Visible = controller.Busy; });
            retry.Click += (sender, args) => Request(active);
            done.Click += (sender, args) => { Hide(); if (!pumping) Finish(); };
            details.Click += (sender, args) => MessageBox.Show(this, errorDetails, "Zero details", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Shown += (sender, args) => Request(initial);
            FormClosing += (sender, args) =>
            {
                if (!closing && pumping)
                {
                    args.Cancel = true;
                    lifetime.Cancel(); CancelUpdateCheck();
                    status.Text = "Closing Zero after this step…";
                    retry.Visible = false; details.Visible = false;
                }
            };
            FormClosed += (sender, args) => { lifetime.Cancel(); DisposeUpdates(); backend.Dispose(); lifetime.Dispose(); };
            ResumeLayout(false);
            PerformLayout();
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SystemParametersInfo(uint action, uint parameter, [MarshalAs(UnmanagedType.Bool)] out bool value, uint flags);
        private static bool AnimationsEnabled()
        {
            bool enabled;
            return SystemParametersInfo(0x1042, 0, out enabled, 0) && enabled;
        }

        private void OnUI(Action action)
        {
            if (IsDisposed) return;
            if (InvokeRequired) BeginInvoke(action); else action();
        }

        internal void Request(LauncherRequest request)
        {
            if (closing || lifetime.IsCancellationRequested) return;
#if !ZERO_STORE
            if (settingsVisible && request == LauncherRequest.Settings) { Activate(); return; }
#endif
            // Reopening during preparation already has a pending editor handoff.
            if (pumping && controller.Busy && request == LauncherRequest.Open) return;
            if (!requests.Contains(request)) requests.Enqueue(request);
            CancelUpdateCheck();
            if (!pumping) { var operation = Pump(); }
        }

        private async Task Pump()
        {
            pumping = true;
            try
            {
                while (requests.Count > 0 && !lifetime.IsCancellationRequested)
                {
                    active = requests.Dequeue();
                    retry.Visible = false; details.Visible = false; done.Visible = false; errorDetails = "";
#if ZERO_STORE
                    if (active == LauncherRequest.Settings || active == LauncherRequest.Check)
                    {
                        using (var opened = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Distribution.StoreUri) { UseShellExecute = true })) { }
                        Hide();
                    }
#else
                    if (active == LauncherRequest.Settings) ShowUpdateSettings();
                    else if (active == LauncherRequest.Check) await CheckUpdates(true);
#endif
                    else
                    {
                        Show(); Activate();
                        bool opened = await controller.Open(lifetime.Token);
                        if (!opened)
                        {
                            if (!lifetime.IsCancellationRequested) Fail(controller.Status, controller.Details);
                            continue;
                        }
                        Hide();
                        // Pending explicit requests take precedence over an automatic check.
#if !ZERO_STORE
                        if (requests.Count == 0 && updates.Enabled && updates.IsDue) await CheckUpdates(false);
#endif
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception error) { if (!lifetime.IsCancellationRequested) Fail("Zero needs attention. Try again or open Details.", error.Message); }
            finally
            {
                pumping = false;
                if (lifetime.IsCancellationRequested || (!Visible && requests.Count == 0)) Finish();
            }
        }

#if !ZERO_STORE
        private async Task CheckUpdates(bool manual)
        {
            bool installApproved = false;
            foregroundUpdate = manual;
            if (manual)
            {
                Show(); Activate(); status.Text = "Checking for updates…"; progress.Visible = true;
            }
            background?.Dispose();
            background = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            try
            {
                UpdateResult result = await updates.CheckAndDownload(manual, background.Token);
                if (background.IsCancellationRequested || requests.Count > 0) return;
                if (result == UpdateResult.Available)
                {
                    Show(); Activate(); progress.Visible = false;
                    if (MessageBox.Show(this, "A Zero update is available. Download and install it now?", "Zero update", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    {
                        // This is now an explicit user operation. Show progress
                        // and useful failures, and honor the one consent already
                        // given to download and install.
                        manual = true; foregroundUpdate = true; installApproved = true;
                        active = LauncherRequest.Check;
                        status.Text = "Downloading update…"; progress.Visible = true;
                        result = await updates.CheckAndDownload(true, background.Token);
                    }
                    else { Hide(); return; }
                }
                if (result == UpdateResult.Ready)
                {
                    if (manual && !installApproved && MessageBox.Show(this, "The Zero update is ready. Install it now? Your editor can stay open.", "Zero update", MessageBoxButtons.YesNo, MessageBoxIcon.Information) != DialogResult.Yes)
                    { Hide(); return; }
                    if (lifetime.IsCancellationRequested || requests.Count > 0 || controller.Busy) return;
                    // No setup helper may run after commit. Apply only the package
                    // reverified by the coordinator; never restart/kill the editor.
                    closing = true;
                    try { backend.Dispose(); updates.ApplyPending(); }
                    catch { closing = false; throw; }
                    Finish();
                    return;
                }
                if (manual)
                {
                    progress.Visible = false;
                    status.Text = result == UpdateResult.Disabled ? "Automatic updates aren’t configured for this development build." : "Zero is up to date.";
                    ShowCloseButton();
                }
            }
            catch (OperationCanceledException)
            {
                if (manual && !lifetime.IsCancellationRequested && requests.Count == 0)
                    Fail("The update check took too long. Try again when you’re ready.", "Check your internet connection, then choose Try again. The installed version is still available.");
                // Background timeout/offline: normal editor session remains open.
            }
            catch (Exception error)
            {
                if (manual) Fail("Could not update Zero. Try again or open Details.", error.Message);
            }
            finally { progress.Visible = false; foregroundUpdate = false; }
        }

        private void ShowUpdateSettings()
        {
            Hide(); settingsVisible = true;
            try
            {
                using (var dialog = new Form())
                {
                    dialog.SuspendLayout();
                    dialog.Text = "Zero update settings";
                    dialog.ClientSize = new Size(410, 180);
                    dialog.StartPosition = FormStartPosition.CenterScreen;
                    dialog.Font = Font;
                    dialog.AutoScaleMode = AutoScaleMode.Dpi;
                    dialog.AutoScaleDimensions = new SizeF(96F, 96F);
                    dialog.MinimizeBox = false; dialog.MaximizeBox = false;
                    var check = new CheckBox { Text = "Check automatically when Zero opens", Checked = updates.CheckEnabled, AutoSize = true, Location = new Point(20, 20) };
                    var download = new CheckBox { Text = "Download and install updates automatically", Checked = updates.DownloadEnabled, AutoSize = true, Location = new Point(20, 55) };
                    var note = new Label { Text = "Checks happen after your editor opens. School policies may restrict updates.", Location = new Point(20, 87), Size = new Size(370, 40) };
                    var done = new Button { Text = "Done", DialogResult = DialogResult.OK, Location = new Point(290, 137), Size = new Size(100, 28) };
                    dialog.Controls.AddRange(new Control[] { check, download, note, done });
                    dialog.AcceptButton = done; dialog.CancelButton = done;
                    dialog.ResumeLayout(false);
                    dialog.PerformLayout();
                    if (dialog.ShowDialog() == DialogResult.OK) { updates.CheckEnabled = check.Checked; updates.DownloadEnabled = download.Checked; }
                }
            }
            finally { settingsVisible = false; }
        }

#endif
        private void CancelUpdateCheck()
        {
#if !ZERO_STORE
            background?.Cancel();
#endif
        }

        private void DisposeUpdates()
        {
#if !ZERO_STORE
            background?.Dispose();
            updates.Dispose();
#endif
        }

        private void ShowCloseButton()
        {
            retry.Visible = false;
            done.Visible = true; AcceptButton = done;
        }
        private void Fail(string message, string detail)
        {
            Show(); Activate(); status.Text = message; errorDetails = detail;
            progress.Visible = false; retry.Visible = true; details.Visible = true;
            AcceptButton = retry;
        }
        private void Finish()
        {
            if (closing && IsDisposed) return;
            closing = true; Close();
        }
    }
}

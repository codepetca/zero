using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ZeroSetup
{
    internal enum SetupStage { Checking, ChooseFolder, ManualCode, ManualJava, BlockedJava, ProfileConsent, ProfileStep, ExtensionConsent, Ready, Retry, Opened }
    internal enum ProfileStep { CommandPalette, ImportMenu, FilePicker, PastePath, Create }

    internal sealed class SetupSnapshot
    {
        private readonly Dictionary<string, string> fields;
        private SetupSnapshot(Dictionary<string, string> fields) { this.fields = fields; }
        public bool this[string key] { get { return fields[key] == "1"; } }
        public static SetupSnapshot Parse(string output)
        {
            var fields = Protocol(output, "ZERO_SETUP_V1", "END_ZERO_SETUP");
            string[] keys = { "kit", "code", "java", "profile", "zero", "redhat", "javaHomeBlocked", "ready" };
            if (fields.Count != keys.Length || keys.Any(key => !fields.ContainsKey(key)) || fields.Values.Any(value => value != "0" && value != "1"))
                throw new InvalidDataException("Invalid setup check response.");
            var snapshot = new SetupSnapshot(fields);
            if (snapshot["ready"] != keys.Take(6).All(key => snapshot[key]) || (snapshot["javaHomeBlocked"] && snapshot["java"]))
                throw new InvalidDataException("Inconsistent setup check response.");
            return snapshot;
        }
        public static Dictionary<string, string> Protocol(string output, string start, string end)
        {
            var lines = (output ?? "").Replace("\r\n", "\n").Split('\n');
            int begin = Array.IndexOf(lines, start), finish = Array.IndexOf(lines, end);
            if (begin < 0 || finish <= begin || Array.LastIndexOf(lines, start) != begin || Array.LastIndexOf(lines, end) != finish || lines.Skip(finish + 1).Any(line => line.Length > 0))
                throw new InvalidDataException("Incomplete or ambiguous setup response.");
            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string line in lines.Skip(begin + 1).Take(finish - begin - 1))
            {
                int split = line.IndexOf('=');
                if (split < 1 || fields.ContainsKey(line.Substring(0, split))) throw new InvalidDataException("Invalid setup response.");
                fields.Add(line.Substring(0, split), line.Substring(split + 1));
            }
            return fields;
        }
    }

    // This seam keeps the workflow portable. Production owns extraction/copy and
    // normal-policy PowerShell; the harness supplies only fake operations.
    internal interface ISetupBackend
    {
        string Root { get; }
        Task EnsureKit(CancellationToken cancellation);
        Task<string> Place(string parent, string name, CancellationToken cancellation);
        Task<CheckResult> Run(string root, string action, string target, bool approved, CancellationToken cancellation);
        Task Download(string url, CancellationToken cancellation);
    }

    internal sealed class SetupController
    {
        private readonly ISetupBackend backend;
        private readonly CancellationToken cancellation;
        private readonly Func<string> userHome;
        private SetupSnapshot snapshot;
        private bool profileStarted;
        public Action Changed;
        public bool Busy { get; private set; }
        public SetupStage Stage { get; private set; } = SetupStage.Checking;
        public ProfileStep Step { get; private set; }
        public string SelectedFolder { get; private set; }
        public string DefaultFolder { get; private set; }
        public bool CanChangeLocation { get { return !Busy && Stage == SetupStage.ChooseFolder; } }
        public string Summary { get; private set; } = "Checking your laptop…";
        public string Diagnostics { get; private set; } = "Git and Java debugging are optional. GitHub sign-in and sharing are separate.\r\nAfter changing Java, close all VS Code windows and reopen it. Windows may need a restart to refresh PATH/JAVA_HOME. A CLI check does not verify an already-running editor's Java environment.\r\n";
        public string Root { get { return SelectedFolder ?? backend.Root; } }
        public string ProfileFile { get { return Path.Combine(Root, "optional", "Zero.code-profile"); } }
        public bool CanGoBack { get { return !Busy && Stage == SetupStage.ProfileStep && Step != ProfileStep.CommandPalette; } }
        public string PrimaryTitle
        {
            get
            {
                switch (Stage)
                {
                    case SetupStage.ChooseFolder: return "Set up Zero";
                    case SetupStage.ManualCode: case SetupStage.ManualJava: return "Open download page";
                    case SetupStage.ProfileConsent: return "Open VS Code";
                    case SetupStage.ProfileStep: return Step == ProfileStep.FilePicker ? "Copy profile path" : Step == ProfileStep.Create ? "Check profile" : "Next";
                    case SetupStage.ExtensionConsent: return "Install support";
                    case SetupStage.Ready: return "Open Zero";
                    case SetupStage.Opened: return "Open Zero again";
                    case SetupStage.Checking: return "Please wait";
                    default: return "Check again";
                }
            }
        }
        public string ConsentDetail
        {
            get
            {
                if (Stage == SetupStage.ChooseFolder && DefaultFolder != null) return "Zero will create " + DefaultFolder + ". Existing folders are preserved. Choose Change location to use another folder.";
                if (Stage == SetupStage.ProfileConsent) return "Import the supplied light theme and autosave settings in a separate profile named Zero. Existing profiles are preserved. Follow each instruction here, then choose Check profile.";
                if (Stage == SetupStage.ExtensionConsent) return "Install bundled Zero and missing Java language support (redhat.java) in the Zero profile? Java support downloads from the VS Code Marketplace. Compatible extensions and other profiles are preserved.";
                return "";
            }
        }
        public SetupController(ISetupBackend backend, CancellationToken cancellation, Func<string> userHome = null)
        {
            this.backend = backend; this.cancellation = cancellation;
            this.userHome = userHome ?? (() => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
        }
        private void Set(SetupStage stage, string message) { Stage = stage; Summary = message; Changed?.Invoke(); }
        private void SetBusy(bool value, string message = null) { Busy = value; if (message != null) Summary = message; Changed?.Invoke(); }
        private void Record(string text) { Diagnostics += text + "\r\n"; if (Diagnostics.Length > 1024 * 1024) Diagnostics = Diagnostics.Substring(Diagnostics.Length - 512 * 1024); }
        private void Fail(string message, string detail) { snapshot = null; Record(detail); Set(SetupStage.Retry, message); }
        private async Task<CheckResult> Run(string action, string target, bool approved, string message)
        {
            var result = await backend.Run(Root, action, target, approved, cancellation);
            Record("Action: " + action + " " + target + "\r\nExit: " + result.ExitCode + "\r\n" + result.Output);
            if (result.Cancelled || result.TimedOut || result.OutputIncomplete || result.ExitCode != 0)
                throw new IOException(result.TimedOut ? "Setup timed out. Readiness is unverified." : "Setup could not finish. Readiness is unverified. If normal PowerShell policy blocked setup, read setup\\README.md or ask your teacher/IT. Setup does not change policy.");
            return result;
        }
        private async Task Operation(string message, Func<Task> work)
        {
            if (Busy) return;
            SetBusy(true, message);
            try { await backend.EnsureKit(cancellation); await work(); }
            catch (OperationCanceledException) { Fail("Setup cancelled. Check again.", "No readiness confirmed."); }
            catch (Exception error) { Fail("Setup needs attention. See Details.", error.Message); }
            finally { SetBusy(false); }
        }
        public Task Check()
        {
            return Operation("Checking your laptop…", async () => { Stage = SetupStage.Checking; snapshot = null; await CheckCore(); });
        }
        private async Task CheckCore()
        {
            var result = await Run("check", null, false, "Checking your laptop…");
            snapshot = SetupSnapshot.Parse(result.Output);
            if (!snapshot["kit"]) { Fail("The kit is incomplete. See Details.", "Extract the complete kit again."); return; }
            if (SelectedFolder == null) { ChooseDefaultFolder(); return; }
            await Advance();
        }
        private async Task Advance()
        {
            if (!snapshot["code"]) { await Plan("code"); return; }
            if (!snapshot["java"])
            {
                if (snapshot["javaHomeBlocked"]) { Record("JAVA_HOME selects an incompatible or missing JDK. Ask your teacher/IT to select an installed matching JDK 17+. Setup preserves this environment choice."); Set(SetupStage.BlockedJava, "Java needs help. See Details."); }
                else await Plan("java");
                return;
            }
            if (!snapshot["profile"])
            {
                if (profileStarted) { ShowStep(ProfileStep.Create); Set(SetupStage.ProfileStep, "Zero profile not found. Finish Create, then check."); }
                else Set(SetupStage.ProfileConsent, "Import the Zero profile in VS Code.");
                return;
            }
            if (!snapshot["zero"] || !snapshot["redhat"]) { Set(SetupStage.ExtensionConsent, "Install Zero and Java editor support?"); return; }
            if (!snapshot["ready"] || SelectedFolder == null) { Fail("Readiness is unverified. Try again.", "Required fields did not establish readiness."); return; }
            Set(SetupStage.Ready, "Zero is ready. Open it to begin.");
        }
        private async Task Plan(string tool)
        {
            SetBusy(true, tool == "code" ? "Finding VS Code setup options…" : "Finding Java setup options…");
            var result = await Run("plan", tool, false, Summary);
            var fields = SetupSnapshot.Protocol(result.Output, "ZERO_PLAN_V1", "END_ZERO_PLAN");
            if (fields.Count != 1 || !fields.ContainsKey("action")) throw new InvalidDataException("Invalid setup proposal.");
            switch (fields["action"])
            {
                case "manual": Set(tool == "code" ? SetupStage.ManualCode : SetupStage.ManualJava, tool == "code" ? "Install VS Code, then check again." : "Install Java 17 or newer, then check again."); break;
                case "skip": Set(SetupStage.Retry, "Tools changed. Check again."); break;
                case "blocked": Fail("Setup needs help. See Details.", "Tool setup is blocked by kit or environment configuration."); break;
                default: throw new InvalidDataException("Invalid setup proposal.");
            }
        }
        private void ChooseDefaultFolder(string message = null)
        {
            DefaultFolder = null;
            try
            {
                DefaultFolder = KitFiles.ResolveDefaultFolder(userHome());
                Set(SetupStage.ChooseFolder, message ?? "Create " + Path.GetFileName(DefaultFolder) + " in your home folder.");
            }
            catch (Exception error)
            {
                Record(error.Message);
                Set(SetupStage.ChooseFolder, "Change location to choose a writable folder.");
            }
        }
        public Task Place(string parent, string name)
        {
            if (Busy || SelectedFolder != null || parent == null || name == null) return Task.CompletedTask;
            return Operation("Preparing your Zero folder…", async () =>
            {
                try { SelectedFolder = await backend.Place(parent, name, cancellation); Record("Kit folder: " + SelectedFolder); }
                catch (Exception error) when (!(error is OperationCanceledException)) { Record(error.Message); ChooseDefaultFolder("Try again or change location. See Details."); return; }
                SetBusy(true, "Checking your laptop…"); await CheckCore();
            });
        }
        public Task PrimaryAction()
        {
            if (Busy) return Task.CompletedTask;
            if (Stage == SetupStage.ChooseFolder)
            {
                ChooseDefaultFolder();
                return DefaultFolder == null ? Task.CompletedTask : Place(Path.GetDirectoryName(DefaultFolder), Path.GetFileName(DefaultFolder));
            }
            if (Stage == SetupStage.Retry || Stage == SetupStage.BlockedJava) return Check();
            if (Stage == SetupStage.ProfileStep)
            {
                if (Step == ProfileStep.Create) return Check();
                if (Step != ProfileStep.FilePicker) ShowStep(Step + 1);
                return Task.CompletedTask;
            }
            if (Stage == SetupStage.ProfileConsent) return Operation("Opening VS Code for profile import…", async () => { await Run("profile", null, false, Summary); profileStarted = true; ShowStep(ProfileStep.CommandPalette); });
            if (Stage == SetupStage.ExtensionConsent) return Operation("Installing editor support…", async () =>
            {
                var missing = new[] { "zero", "redhat" }.Where(key => !snapshot[key]).ToArray();
                snapshot = null;
                foreach (string key in missing) { SetBusy(true, key == "zero" ? "Installing Zero support…" : "Installing Java support…"); await Run("extension", key == "zero" ? "zero" : "java", true, Summary); }
                SetBusy(true, "Checking your laptop…"); await CheckCore();
            });
            if (Stage == SetupStage.ManualCode || Stage == SetupStage.ManualJava)
            {
                bool java = Stage == SetupStage.ManualJava;
                return Operation(java ? "Opening the Java download page…" : "Opening the VS Code download page…", async () => { Record(java ? "Official download: https://adoptium.net/temurin/releases/?version=17" : "Official download: https://code.visualstudio.com/download"); await backend.Download(java ? "https://adoptium.net/temurin/releases/?version=17" : "https://code.visualstudio.com/download", cancellation); Set(SetupStage.Retry, java ? "Install Java; close VS Code, then check again." : "Finish installing VS Code, then check again."); });
            }
            if (Stage == SetupStage.Ready || Stage == SetupStage.Opened) return Operation("Opening Zero…", async () => { snapshot = null; await Run("open", null, false, Summary); Set(SetupStage.Opened, "In Zero, choose Run App to begin."); });
            return Task.CompletedTask;
        }
        private void ShowStep(ProfileStep step)
        {
            Step = step;
            string[] messages = { "Ctrl+Shift+P → Preferences: Open Profiles (UI)", "New Profile menu → Import Profile → Select File.", "Copy the profile path for the file picker.", "Paste in File name; click Open.", "Click Create; keep the profile name Zero." };
            Set(SetupStage.ProfileStep, messages[(int)step]);
        }
        public void PreviousProfileStep() { if (CanGoBack) ShowStep(Step - 1); }
        public void CopyProfilePath(Func<string, bool> copy)
        {
            if (Busy || Stage != SetupStage.ProfileStep || Step != ProfileStep.FilePicker) return;
            try
            {
                KitFiles.RejectReparseAncestors(ProfileFile);
                if (!File.Exists(ProfileFile)) throw new FileNotFoundException("The profile file is missing.");
                if (!copy(ProfileFile)) { Record("Could not copy the profile path. Try again."); Set(SetupStage.ProfileStep, "Could not copy the path. Try again."); return; }
                ShowStep(ProfileStep.PastePath);
            }
            catch (Exception error) { Fail("The profile file needs attention. See Details.", error.Message); }
        }
    }
}

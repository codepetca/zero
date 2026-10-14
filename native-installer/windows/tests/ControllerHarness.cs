using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ZeroSetup;

internal static class ControllerHarness
{
    private static int checks;
    private static void Assert(bool value, string name) { if (!value) throw new Exception("FAILED: " + name); checks++; }
    private static void Wait(Task task) { task.GetAwaiter().GetResult(); }
    private static string Snapshot(bool code = true, bool java = true, bool profile = true, bool zero = true, bool redhat = true, bool blocked = false)
    {
        return "diagnostics\nZERO_SETUP_V1\nkit=1\ncode=" + (code ? "1" : "0") + "\njava=" + (java ? "1" : "0") + "\nprofile=" + (profile ? "1" : "0") + "\nzero=" + (zero ? "1" : "0") + "\nredhat=" + (redhat ? "1" : "0") + "\njavaHomeBlocked=" + (blocked ? "1" : "0") + "\nready=" + (code && java && profile && zero && redhat ? "1" : "0") + "\nEND_ZERO_SETUP\n";
    }
    private sealed class Fake : ISetupBackend
    {
        public string Root { get; private set; }
        public string UserHome { get; private set; }
        public string State = Snapshot();
        public string Plan = "manual";
        public bool CopyFail;
        public bool RealPlacement;
        public bool FailExtensions;
        public bool FailOpen;
        public bool RaceDefault;
        public string LastParent, LastName;
        public TaskCompletionSource<CheckResult> Pending;
        public readonly List<string> Calls = new List<string>();
        public Fake(string root) { Root = root; UserHome = Path.Combine(root, "home"); Directory.CreateDirectory(UserHome); Directory.CreateDirectory(Path.Combine(root, "optional")); File.WriteAllText(Path.Combine(root, "optional", "Zero.code-profile"), "fake"); }
        public Task EnsureKit(CancellationToken token) { token.ThrowIfCancellationRequested(); return Task.CompletedTask; }
        public Task<string> Place(string parent, string name, KitFiles.KitTarget expected, Action<string> diagnostic, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); Calls.Add("copy"); LastParent = parent; LastName = name;
            if (RaceDefault) { RaceDefault = false; Directory.CreateDirectory(Path.Combine(parent, name)); File.WriteAllText(Path.Combine(parent, name, "keep.txt"), "racing project"); throw new IOException("existing folder"); }
            if (CopyFail) throw new IOException("existing folder");
            if (RealPlacement) return Task.FromResult(expected.Existing ? KitFiles.UpdateKit(Root, expected, token, diagnostic) : KitFiles.PlaceFreshKit(Root, parent, name, token));
            return Task.FromResult(Root);
        }
        public Task<CheckResult> Run(string root, string action, string target, bool approved, CancellationToken token)
        {
            Calls.Add(action + ":" + target + ":" + approved);
            if (Pending != null) { var pending = Pending; Pending = null; return pending.Task; }
            if (action == "check") return Task.FromResult(new CheckResult { ExitCode = 0, Output = State });
            if (action == "plan") return Task.FromResult(new CheckResult { ExitCode = 0, Output = "ZERO_PLAN_V1\naction=" + Plan + "\nEND_ZERO_PLAN\n" });
            return Task.FromResult(new CheckResult { ExitCode = (action == "extension" && FailExtensions) || (action == "open" && FailOpen) ? 44 : 0, Output = "fake action" });
        }
        public Task Download(string url, CancellationToken token) { Calls.Add("download:" + url); return Task.CompletedTask; }
    }
    private static SetupController Controller(Fake backend, CancellationToken token = default(CancellationToken)) { return new SetupController(backend, token, () => backend.UserHome); }
    private static void Placed(SetupController controller) { Wait(controller.Check()); }
    public static int Run(string root)
    {
        var fake = new Fake(Path.Combine(root, "controller"));
        var controller = Controller(fake);
        var statuses = new List<string>();
        controller.Changed = () => statuses.Add(controller.Summary + ":" + controller.Busy);
        Assert(controller.Summary == "Preparing Zero…" && !controller.CanShowDetails, "initial preparation hides healthy details");
        Wait(controller.Check());
        Assert(controller.Stage == SetupStage.Ready && controller.SelectedFolder == fake.Root, "startup automatically prepares fresh default then verifies readiness");
        Assert(controller.DefaultFolder == Path.Combine(fake.UserHome, "Zero") && fake.LastParent == fake.UserHome && fake.LastName == "Zero", "automatic preparation uses exact home default");
        Assert(fake.Calls.SequenceEqual(new[] { "check::False", "copy", "check::False" }), "startup checks bundled and placed kit without consent or editor open");
        Assert(statuses.Any(value => value == "Preparing Zero…:True") && statuses.Last().EndsWith(":False"), "preparing progress stays busy until settled");
        Assert(!controller.CanShowDetails, "ready has no details action");
        Wait(controller.Check());
        Assert(fake.Calls.Count(call => call == "copy") == 1 && controller.Stage == SetupStage.Ready, "later checks do not repeat preparation or open editor");
        Assert(!fake.Calls.Any(call => call.StartsWith("profile") || call.StartsWith("extension") || call.StartsWith("download") || call.StartsWith("open")), "compatible setup preserved and editor remains explicit");
        fake.FailOpen = true; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Retry && !controller.Summary.Contains("ready") && controller.CanShowDetails, "final backend reread failure cannot open and exposes details");
        Wait(controller.Check()); fake.FailOpen = false; Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.Opened && !controller.CanShowDetails, "verified explicit open");
        fake = new Fake(Path.Combine(root, "copy-failure")); fake.CopyFail = true; controller = Controller(fake); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.Retry && controller.SelectedFolder == null && !controller.Busy && controller.CanShowDetails, "copy failure stops without ready or retry loop");
        Assert(fake.Calls.Count(call => call == "copy") == 1, "failed initial preparation attempted once");
        fake.CopyFail = false; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Ready && fake.Calls.Count(call => call == "copy") == 2, "explicit retry prepares once after repair");
        fake = new Fake(Path.Combine(root, "default-race")); fake.RaceDefault = true; controller = Controller(fake); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.Retry && fake.Calls.Count(call => call == "copy") == 1, "race refuses occupied unrelated folder without automatic copy loop");
        Assert(File.ReadAllText(Path.Combine(fake.UserHome, "Zero", "keep.txt")) == "racing project", "race preserves occupied project");
        Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.Retry && fake.Calls.Count(call => call == "copy") == 1, "explicit retry refuses unrelated default without an alternative");
        Directory.Delete(Path.Combine(fake.UserHome, "Zero"), true); Wait(controller.PrimaryAction()); Assert(fake.LastName == "Zero" && controller.Stage == SetupStage.Ready, "retry uses repaired exact default");
        fake = new Fake(Path.Combine(root, "default-collision")); Directory.CreateDirectory(Path.Combine(fake.UserHome, "Zero")); File.WriteAllText(Path.Combine(fake.UserHome, "Zero", "keep.txt"), "unrelated project"); controller = Controller(fake); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.Retry && !fake.Calls.Contains("copy") && File.ReadAllText(Path.Combine(fake.UserHome, "Zero", "keep.txt")) == "unrelated project", "initial collision preserves unrelated project and never prepares it");
        fake = new Fake(Path.Combine(root, "automatic-update")); fake.RealPlacement = true;
        Harness.CreateKit(fake.Root, "0.5.6");
        string existing = Path.Combine(fake.UserHome, "Zero"); Harness.CreateKit(existing, "0.5.3");
        string[] studentPaths = { "starter/src/Main.java", "starter/assets/image.png", "starter/.git/config", "optional/Zero.code-profile", "my-notes.txt" };
        foreach (string relative in studentPaths) { string path = Path.Combine(existing, relative); Directory.CreateDirectory(Path.GetDirectoryName(path)); File.WriteAllText(path, "student bytes: " + relative); }
        var before = studentPaths.ToDictionary(path => path, path => File.ReadAllBytes(Path.Combine(existing, path)));
        controller = Controller(fake); Wait(controller.Check());
        Assert(controller.DefaultIsExisting && controller.Stage == SetupStage.Ready && controller.SelectedFolder == existing && fake.Calls.Count(call => call == "copy") == 1, "recognized kit updates automatically without consent");
        Assert(File.ReadAllText(Path.Combine(existing, "setup", "Setup.ps1")).StartsWith("0.5.6:"), "automatic update replaces setup runtime");
        foreach (string relative in studentPaths) Assert(File.ReadAllBytes(Path.Combine(existing, relative)).SequenceEqual(before[relative]), "automatic update preserves " + relative);
        Assert(controller.Diagnostics.Contains("Setup runtime backup:") && !fake.Calls.Any(call => call.StartsWith("open")), "automatic update retains backup and does not open editor");
        Wait(controller.Check()); Assert(fake.Calls.Count(call => call == "copy") == 1, "ready recheck never updates again");
        fake = new Fake(Path.Combine(root, "missing-home")); Directory.Delete(fake.UserHome); controller = Controller(fake); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.Retry && controller.DefaultFolder == null && !fake.Calls.Contains("copy"), "unavailable home never copies or claims ready");
        Assert(controller.Summary.Contains("retry") && !controller.Summary.Contains("Change location"), "home error offers details and retry without chooser");
        Directory.CreateDirectory(fake.UserHome); Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Ready && fake.LastParent == fake.UserHome && fake.LastName == "Zero", "retry uses default after home is repaired");
        fake = new Fake(Path.Combine(root, "cancel-default")); using (var token = new CancellationTokenSource())
        {
            controller = Controller(fake, token.Token); var pending = new TaskCompletionSource<CheckResult>(); fake.Pending = pending; var checking = controller.Check(); token.Cancel(); pending.SetResult(new CheckResult { ExitCode = 0, Output = Snapshot() }); Wait(checking);
            Assert(!fake.Calls.Contains("copy") && controller.Stage == SetupStage.Retry, "cancelled automatic placement performs no copy");
        }
        fake = new Fake(Path.Combine(root, "manual")); fake.State = Snapshot(code: false); controller = Controller(fake); Placed(controller);
        Assert(controller.Stage == SetupStage.ManualCode && !controller.CanShowDetails && !fake.Calls.Any(call => call.StartsWith("download")), "manual tool needs explicit handoff");
        Wait(controller.PrimaryAction()); Assert(fake.Calls.Last() == "download:https://code.visualstudio.com/download" && controller.Stage == SetupStage.Retry && !controller.CanShowDetails, "approved official Code handoff keeps healthy details hidden");
        fake.State = Snapshot(java: false); Wait(controller.Check()); Assert(controller.Stage == SetupStage.ManualJava, "Java manual step after code");
        Wait(controller.PrimaryAction()); Assert(fake.Calls.Last().Contains("adoptium.net") && controller.Summary.Contains("close VS Code"), "Java restart guidance");
        fake.State = Snapshot(java: false, blocked: true); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.BlockedJava && controller.CanShowDetails && controller.Diagnostics.Contains("JAVA_HOME"), "explicit bad JAVA_HOME blocks download");
        fake = new Fake(Path.Combine(root, "profile")); fake.State = Snapshot(profile: false, zero: false, redhat: false); controller = Controller(fake); Placed(controller);
        Assert(controller.Stage == SetupStage.ProfileConsent && !controller.CanShowDetails, "profile requires deliberate choice without healthy details");
        Assert(controller.Summary.Contains("separate profile"), "profile consequence is in normal status");
        Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.ProfileStep && controller.Step == ProfileStep.CommandPalette, "profile starts main instructions");
        Wait(controller.PrimaryAction()); Assert(controller.Step == ProfileStep.ImportMenu, "profile import instruction");
        Wait(controller.PrimaryAction()); Assert(controller.Step == ProfileStep.FilePicker && controller.PrimaryTitle == "Copy profile path", "deliberate clipboard action");
        Wait(controller.PrimaryAction()); Assert(controller.Step == ProfileStep.FilePicker, "ordinary next cannot bypass clipboard");
        controller.CopyProfilePath(path => false); Assert(controller.Step == ProfileStep.FilePicker, "copy failure retains step");
        controller.CopyProfilePath(path => path == controller.ProfileFile); Assert(controller.Step == ProfileStep.PastePath && controller.Summary.Contains("File name"), "Windows picker paste instruction");
        controller.PreviousProfileStep(); Assert(controller.Step == ProfileStep.FilePicker, "back keeps import recoverable");
        controller.CopyProfilePath(path => true); Wait(controller.PrimaryAction()); Assert(controller.Step == ProfileStep.Create, "Create required");
        Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.ProfileStep && controller.Step == ProfileStep.Create && controller.Summary.Contains("not found"), "unfinished import never ready");
        Assert(!fake.Calls.Any(call => call.StartsWith("extension")), "unfinished profile never installs extensions");
        fake.State = Snapshot(zero: false, redhat: false); Wait(controller.Check()); Assert(controller.Stage == SetupStage.ExtensionConsent && !controller.CanShowDetails, "actual profile detection advances without healthy details");
        Assert(controller.Summary.Contains("download Java"), "extension download consequence is in normal status");
        fake.FailExtensions = true; Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.Retry && !controller.Busy, "extension failure cannot ready");
        Assert(fake.Calls.Last() == "extension:zero:True", "failure stops subsequent extension");
        fake.FailExtensions = false; Wait(controller.Check());
        Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.ExtensionConsent, "reported install success without actual readiness cannot ready");
        Assert(fake.Calls.Contains("extension:java:True") && fake.Calls.Last() == "check::False", "approved essential extensions followed by recheck");
        fake.State = Snapshot(); Wait(controller.Check()); Assert(controller.Stage == SetupStage.Ready, "actual extension verification required");
        fake = new Fake(Path.Combine(root, "busy")); controller = Controller(fake); var paused = new TaskCompletionSource<CheckResult>(); fake.Pending = paused;
        var running = controller.Check(); Assert(controller.Busy, "pending check busy"); Wait(controller.PrimaryAction()); Wait(controller.Check()); Wait(controller.PrimaryAction());
        Assert(fake.Calls.Count == 1 && controller.Busy, "busy actions serialized");
        paused.SetResult(new CheckResult { ExitCode = 1, Cancelled = true, Output = "cancelled" }); Wait(running);
        Assert(!controller.Busy && controller.Stage == SetupStage.Retry, "cancel never ready");
        foreach (var result in new[] { new CheckResult { ExitCode = 0, TimedOut = true }, new CheckResult { ExitCode = 0, OutputIncomplete = true } })
        {
            paused = new TaskCompletionSource<CheckResult>(); fake.Pending = paused; running = controller.Check(); paused.SetResult(result); Wait(running); Assert(controller.Stage == SetupStage.Retry, "incomplete or timeout never ready");
        }
        foreach (string invalid in new[] { Snapshot().Replace("ready=1", "ready=0"), Snapshot().Replace("javaHomeBlocked=0", "javaHomeBlocked=1"), Snapshot() + "extra", Snapshot().Replace("kit=1", "kit=1\nkit=1"), Snapshot().Replace("zero=1", "zero=yes"), Snapshot().Replace("kit=1", "other=1"), Snapshot() + Snapshot() })
        {
            fake.State = invalid; Wait(controller.Check()); Assert(controller.Stage == SetupStage.Retry, "invalid protocol rejected");
        }
        using (var token = new CancellationTokenSource()) { token.Cancel(); controller = Controller(fake, token.Token); Wait(controller.Check()); Assert(controller.Stage == SetupStage.Retry, "cancelled lifetime does no tools"); }
        string kit = Path.Combine(root, "argv-kit"); Directory.CreateDirectory(Path.Combine(kit, "setup")); File.WriteAllText(Path.Combine(kit, "setup", "Setup.ps1"), "fake");
        foreach (var pair in new[] { new[] { "check", "-NativeCheck" }, new[] { "profile", "-NativeProfile" }, new[] { "open", "-NativeOpen" } })
        {
            var info = Processes.NativeInfo("powershell.exe", kit, pair[0]); Assert(info.Arguments.EndsWith(pair[1]) && info.RedirectStandardInput && info.CreateNoWindow && !info.UseShellExecute && !info.Arguments.Contains("ExecutionPolicy"), "fixed native argv " + pair[0]);
        }
        Assert(Processes.NativeInfo("powershell.exe", kit, "extension", "zero", true).Arguments.EndsWith("-NativeExtension zero -Approved"), "literal approved extension flags");
        foreach (var request in new[] { new[] { "extension", "zero" }, new[] { "extension", "unknown" }, new[] { "plan", "git" }, new[] { "open", "extra" }, new[] { "unknown", "" } })
        {
            try { Processes.NativeInfo("powershell.exe", kit, request[0], request[1]); throw new Exception("Invalid action accepted"); } catch (ArgumentException) { checks++; }
        }
        return checks;
    }
}

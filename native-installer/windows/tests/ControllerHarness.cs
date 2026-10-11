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
            if (CopyFail) throw new IOException("existing folder"); return Task.FromResult(Root);
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
    private static void Placed(SetupController controller) { Wait(controller.Check()); Wait(controller.PrimaryAction()); }
    public static int Run(string root)
    {
        var fake = new Fake(Path.Combine(root, "controller"));
        var controller = Controller(fake);
        var statuses = new List<string>();
        controller.Changed = () => statuses.Add(controller.Summary + ":" + controller.Busy);
        Wait(controller.Check());
        Assert(controller.Stage == SetupStage.ChooseFolder && controller.SelectedFolder == null, "startup checks before placement without ready");
        Assert(controller.PrimaryTitle == "Set up Zero" && controller.DefaultFolder == Path.Combine(fake.UserHome, "Zero"), "default primary uses home folder");
        Assert(!Directory.EnumerateFileSystemEntries(fake.UserHome).Any(), "checking does not create a default folder");
        Assert(fake.Calls.SequenceEqual(new[] { "check::False" }), "startup read-only");
        string originalDefault = controller.DefaultFolder;
        Wait(controller.Place(null, null)); Assert(fake.Calls.Count == 1 && controller.DefaultFolder == originalDefault, "invalid placement preserves default without copy");
        fake.CopyFail = true; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.ChooseFolder && controller.SelectedFolder == null && !controller.Busy, "copy failure never ready");
        fake.CopyFail = false; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Ready && controller.SelectedFolder == fake.Root, "existing tools and profile ready after fresh copy");
        Assert(statuses.Any(value => value == "Preparing your Zero folder…:True") && statuses.Last().EndsWith(":False"), "busy status order");
        Assert(!fake.Calls.Any(call => call.StartsWith("profile") || call.StartsWith("extension") || call.StartsWith("download")), "compatible setup preserved");
        fake.FailOpen = true; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Retry && !controller.Summary.Contains("ready"), "final backend reread failure cannot open");
        Wait(controller.Check()); fake.FailOpen = false; Wait(controller.PrimaryAction()); Assert(controller.Stage == SetupStage.Opened, "verified open");
        fake = new Fake(Path.Combine(root, "default-primary")); controller = Controller(fake); Wait(controller.Check()); Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Ready && fake.LastParent == fake.UserHome && fake.LastName == "Zero", "primary places default home folder");
        fake = new Fake(Path.Combine(root, "default-race")); controller = Controller(fake); Wait(controller.Check()); fake.RaceDefault = true; Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.ChooseFolder && controller.DefaultFolder == null && fake.Calls.Count(call => call == "copy") == 1, "race refuses occupied unrelated folder without automatic copy loop");
        Assert(File.ReadAllText(Path.Combine(fake.UserHome, "Zero", "keep.txt")) == "racing project", "race preserves occupied project");
        Wait(controller.Place(null, null)); Wait(controller.PrimaryAction()); Assert(controller.DefaultFolder == null && fake.Calls.Count(call => call == "copy") == 1, "retry never chooses an alternative");
        Directory.Delete(Path.Combine(fake.UserHome, "Zero"), true); Wait(controller.PrimaryAction()); Assert(fake.LastName == "Zero" && controller.Stage == SetupStage.Ready, "retry uses repaired exact default");
        fake = new Fake(Path.Combine(root, "update-confirm"));
        Harness.CreateKit(Path.Combine(fake.UserHome, "Zero"), "0.5.3");
        controller = Controller(fake); Wait(controller.Check());
        Assert(controller.DefaultIsExisting && controller.PrimaryTitle == "Set up Zero", "recognized existing kit keeps primary with update warning");
        string[] before = Directory.GetFileSystemEntries(fake.UserHome);
        Wait(controller.PrimaryAction()); Wait(controller.PrimaryAction(() => false));
        Assert(!fake.Calls.Contains("copy") && before.SequenceEqual(Directory.GetFileSystemEntries(fake.UserHome)), "missing approval and Cancel make no filesystem writes");
        int prompts = 0; Wait(controller.PrimaryAction(() => { prompts++; return true; }));
        Assert(prompts == 1 && controller.Stage == SetupStage.Ready && fake.Calls.Count(call => call == "copy") == 1, "explicit headless approval matches native update confirmation");
        fake = new Fake(Path.Combine(root, "missing-home")); Directory.Delete(fake.UserHome); controller = Controller(fake); Wait(controller.Check()); Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.ChooseFolder && controller.DefaultFolder == null && !fake.Calls.Contains("copy"), "unavailable home never copies or claims ready");
        Assert(controller.Summary.Contains("retry") && !controller.Summary.Contains("Change location"), "home error offers details and retry without chooser");
        Directory.CreateDirectory(fake.UserHome); Wait(controller.PrimaryAction());
        Assert(controller.Stage == SetupStage.Ready && fake.LastParent == fake.UserHome && fake.LastName == "Zero", "retry uses default after home is repaired");
        fake = new Fake(Path.Combine(root, "cancel-default")); using (var token = new CancellationTokenSource())
        {
            controller = Controller(fake, token.Token); Wait(controller.Check()); token.Cancel(); Wait(controller.PrimaryAction());
            Assert(!fake.Calls.Contains("copy") && controller.Stage == SetupStage.Retry, "cancelled default placement performs no copy");
        }
        fake = new Fake(Path.Combine(root, "manual")); fake.State = Snapshot(code: false); controller = Controller(fake); Placed(controller);
        Assert(controller.Stage == SetupStage.ManualCode && !fake.Calls.Any(call => call.StartsWith("download")), "manual tool needs explicit handoff");
        Wait(controller.PrimaryAction()); Assert(fake.Calls.Last() == "download:https://code.visualstudio.com/download" && controller.Stage == SetupStage.Retry, "approved official Code handoff");
        fake.State = Snapshot(java: false); Wait(controller.Check()); Assert(controller.Stage == SetupStage.ManualJava, "Java manual step after code");
        Wait(controller.PrimaryAction()); Assert(fake.Calls.Last().Contains("adoptium.net") && controller.Summary.Contains("close VS Code"), "Java restart guidance");
        fake.State = Snapshot(java: false, blocked: true); Wait(controller.Check());
        Assert(controller.Stage == SetupStage.BlockedJava && controller.Diagnostics.Contains("JAVA_HOME"), "explicit bad JAVA_HOME blocks download");
        fake = new Fake(Path.Combine(root, "profile")); fake.State = Snapshot(profile: false, zero: false, redhat: false); controller = Controller(fake); Placed(controller);
        Assert(controller.Stage == SetupStage.ProfileConsent, "profile requires deliberate choice");
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
        fake.State = Snapshot(zero: false, redhat: false); Wait(controller.Check()); Assert(controller.Stage == SetupStage.ExtensionConsent, "actual profile detection advances");
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

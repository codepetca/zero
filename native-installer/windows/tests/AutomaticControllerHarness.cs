using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ZeroSetup;

internal static class AutomaticControllerHarness
{
    private sealed class Fake : IAutomaticSetupBackend
    {
        public int Prepares, Opens;
        public bool FailPrepare, FailOpen;
        public TaskCompletionSource<bool> Pending;
        public async Task Prepare(Action<string> progress, CancellationToken token)
        {
            Prepares++; progress("Preparing Java…");
            if (Pending != null) await Pending.Task;
            token.ThrowIfCancellationRequested();
            if (FailPrepare) throw new IOException("fixture network error");
        }
        public Task Open(CancellationToken token)
        {
            Opens++; if (FailOpen) throw new IOException("fixture launch error");
            return Task.CompletedTask;
        }
        public void Dispose() { }
    }
    internal static int Run()
    {
        int checks = 0;
        Action<bool, string> assert = (condition, name) => { if (!condition) throw new Exception("FAILED automatic controller: " + name); checks++; };
        var fake = new Fake(); var controller = new AutomaticSetupController(fake);
        assert(controller.Open(CancellationToken.None).GetAwaiter().GetResult(), "automatic prepare and handoff");
        assert(controller.Opened && !controller.Busy && !controller.Failed && fake.Prepares == 1 && fake.Opens == 1, "ready only after open");
        fake.FailPrepare = true;
        assert(!controller.Open(CancellationToken.None).GetAwaiter().GetResult() && controller.Failed && fake.Opens == 1, "failure never opens or retries itself");
        assert(controller.Details.Contains("fixture network error") && controller.Details.Contains("device administrator"), "useful diagnostics and recovery");
        fake.FailPrepare = false; fake.FailOpen = true;
        assert(!controller.Open(CancellationToken.None).GetAwaiter().GetResult() && fake.Opens == 2, "launch failure is visible");
        fake.FailOpen = false;
        assert(controller.Open(CancellationToken.None).GetAwaiter().GetResult() && fake.Opens == 3, "explicit retry recovers");
        fake.Pending = new TaskCompletionSource<bool>();
        var pending = controller.Open(CancellationToken.None);
        assert(controller.Busy, "pending preparation remains busy");
        assert(!controller.Open(CancellationToken.None).GetAwaiter().GetResult(), "duplicate request cannot overlap preparation");
        fake.Pending.SetResult(true); pending.GetAwaiter().GetResult(); fake.Pending = null;
        using (var cancellation = new CancellationTokenSource())
        {
            int before = fake.Opens; cancellation.Cancel();
            assert(!controller.Open(cancellation.Token).GetAwaiter().GetResult() && fake.Opens == before && !controller.Busy, "cancellation never hands off or leaves busy");
        }
        assert(InstanceBroker.Parse(new string[0]) == LauncherRequest.Open && InstanceBroker.Parse(new[] { "--check-for-updates" }) == LauncherRequest.Check && InstanceBroker.Parse(new[] { "--update-settings" }) == LauncherRequest.Settings, "only fixed native requests");
        foreach (var args in new[] { new[] { "--feed", "https://example.invalid" }, new[] { "--check-for-updates", "--path" }, new[] { "--unknown" } })
        {
            bool rejected = false; try { InstanceBroker.Parse(args); } catch (ArgumentException) { rejected = true; }
            assert(rejected, "reject arbitrary native arguments");
        }
        return checks;
    }
}

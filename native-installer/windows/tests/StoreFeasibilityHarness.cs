using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using ZeroSetup;

internal static class StoreFeasibilityHarness
{
    private static int checks;
    private static void Assert(bool value, string description)
    {
        if (!value) throw new Exception(description);
        checks++;
    }
    private static int Main()
    {
        string root = Path.Combine(Directory.GetCurrentDirectory(), ".verification", "store-consent-" + Guid.NewGuid().ToString("N"));
        try
        {
#if ZERO_STORE_PRODUCTION
            Assert(Distribution.DataFolder == "ZeroStudioStoreData", "Store data is isolated");
            Assert(Distribution.KitFolder == "Zero Studio", "Store home kit is isolated");
            Assert(Distribution.BrokerPrefix == "Codepet.Zero.Store.Launcher.", "Store broker is isolated");
#else
            Assert(Distribution.DataFolder == "ZeroMsixFeasibility", "Store data is isolated");
            Assert(Distribution.KitFolder == "Zero MSIX Feasibility", "Store home kit is isolated");
            Assert(Distribution.BrokerPrefix == "Codepet.Zero.MsixFeasibility.Launcher.", "Store broker is isolated");
#endif
            var child = new ProcessStartInfo();
            child.EnvironmentVariables[Distribution.Marker] = "inherited-other";
            Distribution.SetChildEnvironment(child);
#if ZERO_STORE_PRODUCTION
            Assert(child.EnvironmentVariables[Distribution.Marker] == "store", "Store child route is explicit");
#else
            Assert(child.EnvironmentVariables[Distribution.Marker] == "msix-feasibility", "Store child route is explicit");
#endif
            Assert(DependencyConsent.Message.Contains("Node.js"), "consent discloses Node.js acquisition");
            int prompts = 0;
            Assert(!DependencyConsent.Ensure(root, () => { prompts++; return false; }), "decline stops setup");
            Assert(prompts == 1 && !Directory.Exists(root), "decline writes no consent/data");
            // Real backend must stop before extracting its missing embedded kit.
            using (var backend = new NativeSetupBackend(root))
            {
                backend.ApproveDependencies = () => false;
                bool cancelled = false;
                try { backend.Prepare(_ => { throw new Exception("preparation started before consent"); }, CancellationToken.None).GetAwaiter().GetResult(); }
                catch (OperationCanceledException) { cancelled = true; }
                Assert(cancelled && !Directory.Exists(root), "backend decline starts no extraction or downloads");
            }
            Assert(DependencyConsent.Ensure(root, () => { prompts++; return true; }), "accept permits setup");
            Assert(File.Exists(Path.Combine(root, "dependency-consent-v1")), "consent is retained in isolated data");
            Assert(DependencyConsent.Ensure(root, () => { throw new Exception("duplicate prompt"); }), "consent is reused");
            Assert(KitFiles.InspectDefaultFolder(root).Path == Path.Combine(root, Distribution.KitFolder), "kit resolver selects Store folder");
            checks += RuntimeHarness.Run();
            Console.WriteLine("Store feasibility harness: " + checks + " checks passed");
            return 0;
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}

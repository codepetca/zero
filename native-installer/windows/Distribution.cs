using System;
using System.Diagnostics;
using System.IO;

namespace ZeroSetup
{
    internal static class Distribution
    {
#if ZERO_STORE_PRODUCTION
        internal const string DataFolder = "ZeroStudioStoreData";
        internal const string KitFolder = "Zero Studio";
        internal const string BrokerPrefix = "Codepet.Zero.Store.Launcher.";
#elif ZERO_STORE
        internal const string DataFolder = "ZeroMsixFeasibility";
        internal const string KitFolder = "Zero MSIX Feasibility";
        internal const string BrokerPrefix = "Codepet.Zero.MsixFeasibility.Launcher.";
#else
        internal const string DataFolder = "ZeroData";
        internal const string KitFolder = "Zero";
        internal const string BrokerPrefix = "Codepet.Zero.Launcher.";
#endif
        internal const string Marker = "ZERO_WINDOWS_DISTRIBUTION";
        internal const string StoreUri = "ms-windows-store://downloadsandupdates";
        internal static void SetChildEnvironment(ProcessStartInfo info)
        {
#if ZERO_STORE_PRODUCTION
            info.EnvironmentVariables[Marker] = "store";
#elif ZERO_STORE
            info.EnvironmentVariables[Marker] = "msix-feasibility";
#else
            info.EnvironmentVariables.Remove(Marker);
#endif
        }
    }
    internal static class DependencyConsent
    {
        internal const string Message = "Zero needs to download Java and Node.js, and VS Code if a compatible copy is unavailable, plus Java extension support. The first app build also downloads Maven and JavaFX. Continue?";
        // Called before extraction or dependency preparation. Decline performs no writes.
        internal static bool Ensure(string dataRoot, Func<bool> approve)
        {
            string marker = Path.Combine(dataRoot, "dependency-consent-v1");
            KitFiles.RejectReparseAncestors(marker);
            if (File.Exists(marker)) return true;
            if (approve == null || !approve()) return false;
            Directory.CreateDirectory(dataRoot);
            KitFiles.RejectReparseAncestors(marker);
            using (var output = new FileStream(marker, FileMode.CreateNew, FileAccess.Write, FileShare.None)) output.WriteByte(1);
            return true;
        }
    }
}

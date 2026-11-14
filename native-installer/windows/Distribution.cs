using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace ZeroSetup
{
    internal static class Distribution
    {
#if ZERO_PORTABLE
        internal const string DataFolder = "ZeroPortableData";
        internal const string KitFolder = "Zero Portable";
        internal const string BrokerPrefix = "Codepet.Zero.Portable.Launcher.";
        internal const string LaunchError = "Zero could not open. Run Zero.exe from the folder prepared by school IT.";
#elif ZERO_STORE_PRODUCTION
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
#if !ZERO_PORTABLE
        internal const string LaunchError = "Zero could not open. Try again from the Start menu. If software is blocked on your school device, ask your device administrator or IT.";
#endif
#if ZERO_STORE_PRODUCTION
        private static readonly Guid LocalAppData = new Guid("F1B32785-6FBA-4FCF-9D55-7B8E7F157091");
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHGetKnownFolderPath(ref Guid folder, uint flags, IntPtr token, out IntPtr path);
        private static string PhysicalLocalAppData()
        {
            Guid folder = LocalAppData; IntPtr result = IntPtr.Zero;
            try
            {
                // Return the package's real redirected location, not the virtual view.
                int hr = SHGetKnownFolderPath(ref folder, 0x00040000 | 0x00004000, IntPtr.Zero, out result);
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                return Marshal.PtrToStringUni(result);
            }
            finally { if (result != IntPtr.Zero) Marshal.FreeCoTaskMem(result); }
        }
#endif
        internal static string DataRoot(string local, Func<string> redirected = null)
        {
#if ZERO_STORE_PRODUCTION
            local = (redirected ?? PhysicalLocalAppData)();
#endif
            if (string.IsNullOrWhiteSpace(local) || !Path.IsPathRooted(local)) throw new IOException("Your Windows app-data folder is unavailable. Ask your device administrator or IT for help.");
            return Path.Combine(local, DataFolder);
        }
        internal const string Marker = "ZERO_WINDOWS_DISTRIBUTION";
        internal const string StoreUri = "ms-windows-store://downloadsandupdates";
        internal static void SetChildEnvironment(ProcessStartInfo info)
        {
#if ZERO_PORTABLE
            info.EnvironmentVariables[Marker] = "portable";
#elif ZERO_STORE_PRODUCTION
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
        private const byte ConsentIncludesGit = 2;
        private const string DependencyMarker = "dependency-consent-v1";
        private const string GitMarker = "git-download-consent-v1";
        internal const string Message = "Zero needs to download Java, Node.js and Java extension support. It also downloads VS Code and Git if compatible copies are unavailable. The first app build downloads Maven and JavaFX. Continue?";
        internal const string GitMessage = "Zero needs to download a private copy of Git for GitHub projects. Allow the download? You can still open local projects if you choose No.";
        // Called before extraction or dependency preparation. Decline performs no writes.
        internal static bool Ensure(string dataRoot, Func<bool> approve)
        {
            return EnsureMarker(dataRoot, DependencyMarker, ConsentIncludesGit, approve);
        }
        internal static bool EnsureGit(string dataRoot, Func<bool> approve)
        {
            string marker = Path.Combine(dataRoot, DependencyMarker);
            KitFiles.RejectReparseAncestors(marker);
            if (File.Exists(marker))
            {
                using (var input = File.OpenRead(marker))
                    if (input.Length == 1 && input.ReadByte() == ConsentIncludesGit) return true;
            }
            return EnsureMarker(dataRoot, GitMarker, 1, approve);
        }
        private static bool EnsureMarker(string dataRoot, string name, byte value, Func<bool> approve)
        {
            string marker = Path.Combine(dataRoot, name);
            KitFiles.RejectReparseAncestors(marker);
            if (File.Exists(marker)) return true;
            if (approve == null || !approve()) return false;
            Directory.CreateDirectory(dataRoot);
            KitFiles.RejectReparseAncestors(marker);
            using (var output = new FileStream(marker, FileMode.CreateNew, FileAccess.Write, FileShare.None)) output.WriteByte(value);
            return true;
        }
    }
}

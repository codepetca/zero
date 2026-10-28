using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.IO.Compression;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ZeroSetup
{
    internal static class KitFiles
    {
        private const long MaxFileBytes = 16 * 1024 * 1024;
        private const long MaxTotalBytes = 128 * 1024 * 1024;
        internal sealed class KitTarget
        {
            public string Path { get; internal set; }
            public bool Existing { get; internal set; }
            internal string Identity, Metadata;
        }

        // Selection is read-only. A fresh expectation may never turn into an update.
        public static string ResolveDefaultFolder(string home) { return InspectDefaultFolder(home).Path; }
        public static KitTarget InspectDefaultFolder(string home)
        {
            if (string.IsNullOrWhiteSpace(home)) throw new IOException("Your home folder is unavailable. See Details, then retry.");
            home = System.IO.Path.GetFullPath(home);
            RejectReparseAncestors(home);
            if (!Directory.Exists(home)) throw new IOException("Your home folder is unavailable. See Details, then retry.");
            string path = System.IO.Path.Combine(home, Distribution.KitFolder);
            RejectReparseAncestors(path);
            if (!EntryExists(path)) return new KitTarget { Path = path };
            if (!Directory.Exists(path)) throw new IOException("Your home Zero path is a file. Move it safely before retrying.");
            string metadata = ReadKitMetadata(path);
            return new KitTarget { Path = path, Existing = true, Identity = DirectoryIdentity(path), Metadata = metadata };
        }
        private static bool EntryExists(string path)
        {
            try { File.GetAttributes(path); return true; }
            catch (FileNotFoundException) { return false; }
            catch (DirectoryNotFoundException) { return false; }
        }
        private static void RequireRegularFile(string path)
        {
            RejectReparseAncestors(path);
            if ((File.GetAttributes(path) & FileAttributes.Directory) != 0) throw new IOException("Expected a regular setup file: " + path);
        }
        private static string ReadKitMetadata(string root)
        {
            foreach (string relative in new[] { "setup/Setup.cmd", "setup/Setup.ps1", "setup/README.md", "starter/zero.json", "START-HERE.md", "setup/kit.properties" })
                RequireRegularFile(ContainedPath(root, relative));
            string metadataPath = ContainedPath(root, "setup/kit.properties");
            if (new FileInfo(metadataPath).Length > 4096) throw new IOException("Zero setup metadata is invalid.");
            string metadata = File.ReadAllText(metadataPath);
            if (metadata.Length > 4096) throw new IOException("Zero setup metadata is invalid.");
            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string line in metadata.Replace("\r\n", "\n").Split('\n'))
            {
                if (line.Length == 0) continue;
                int split = line.IndexOf('=');
                if (split <= 0 || fields.ContainsKey(line.Substring(0, split))) throw new IOException("Zero setup metadata is invalid.");
                fields.Add(line.Substring(0, split), line.Substring(split + 1));
            }
            Version version, minimum;
            if (fields.Count != 3 || !fields.ContainsKey("kitVersion") || !Version.TryParse(fields["kitVersion"], out version) || version.Build < 0 || version.Revision >= 0 ||
                !fields.ContainsKey("extensionId") || fields["extensionId"] != "zero.zero" || !fields.ContainsKey("vscodeMinimum") || !Version.TryParse(fields["vscodeMinimum"], out minimum))
                throw new IOException("This Zero folder is not a recognizable kit. Your files were kept.");
            return metadata;
        }
        private static string KitVersion(string metadata)
        {
            return metadata.Replace("\r\n", "\n").Split('\n').Single(line => line.StartsWith("kitVersion=", StringComparison.Ordinal)).Substring(11);
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct FileIdentity
        {
            public uint Attributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileIdentity info);
        private static SafeFileHandle HoldDirectory(string path)
        {
            // Deny deletion/rename while updating on Windows. The Mono harness uses
            // creation time for identity; native file IDs are verified on Windows.
            if (System.IO.Path.DirectorySeparatorChar != '\\') return null;
            var handle = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("Cannot hold the Zero folder safely."); }
            return handle;
        }
        private static string DirectoryIdentity(string path)
        {
            using (var handle = HoldDirectory(path))
            {
                if (handle == null) return Directory.GetCreationTimeUtc(path).Ticks.ToString();
                FileIdentity info;
                if (!GetFileInformationByHandle(handle, out info)) throw new IOException("Cannot verify the Zero folder identity.");
                return info.Volume + ":" + info.IndexHigh + ":" + info.IndexLow;
            }
        }
        private static void Recheck(KitTarget expected, bool metadata = true)
        {
            if (!metadata)
            {
                RejectReparseAncestors(expected.Path);
                if (!Directory.Exists(expected.Path) || DirectoryIdentity(expected.Path) != expected.Identity) throw new IOException("The Zero folder identity changed; runtime backup retained.");
                return;
            }
            var actual = InspectDefaultFolder(System.IO.Path.GetDirectoryName(expected.Path));
            if (actual.Existing != expected.Existing || actual.Path != expected.Path || actual.Identity != expected.Identity || (metadata && actual.Metadata != expected.Metadata))
                throw new IOException("The Zero folder changed. Check again and confirm before updating.");
        }

        // Only setup runtime files are replaced. The complete starter and optional
        // settings are student-owned, including its frameworks, wrapper and saves.
        public static string UpdateKit(string source, KitTarget expected, CancellationToken cancellation, Action<string> diagnostic = null,
            Action<string> beforeCommit = null, Action<string> afterReplace = null)
        {
            cancellation.ThrowIfCancellationRequested();
            if (expected == null || !expected.Existing) throw new IOException("An existing Zero kit requires explicit confirmation.");
            string parent = System.IO.Path.GetDirectoryName(expected.Path);
            string lockName;
            using (var hash = SHA256.Create()) lockName = "ZeroSetupUpdate-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(expected.Path.ToUpperInvariant()))).Replace("-", "");
            using (var mutex = new Mutex(false, lockName))
            {
                bool locked;
                try { locked = mutex.WaitOne(0); } catch (AbandonedMutexException) { locked = true; }
                if (!locked) throw new IOException("Another Zero update is running. Wait, then retry.");
                try
                {
                    RejectReparseAncestors(parent);
                    Recheck(expected);
                    using (var heldParent = HoldDirectory(parent))
                    using (var held = HoldDirectory(expected.Path))
                    using (var heldSetup = HoldDirectory(System.IO.Path.Combine(expected.Path, "setup")))
                    {
                        Recheck(expected);
                        string metadata = ReadKitMetadata(source);
                        if (new Version(KitVersion(metadata)) < new Version(KitVersion(expected.Metadata)))
                            throw new IOException("This Zero installer is older than your installed setup. Open the installed Zero from the Start menu or download the latest installer.");
                        var paths = new List<string> { "setup/Setup.cmd", "setup/Setup.ps1", "setup/Setup.command", "setup/setup.sh", "setup/README.md", "START-HERE.md", "LICENSE", "zero-" + KitVersion(metadata) + ".vsix", "setup/kit.properties" };
                        // A normal reopen verifies owned bytes and does not create
                        // another migration/backup of an already-current kit.
                        bool matches = true;
                        foreach (string relative in paths)
                        {
                            string supplied = ContainedPath(source, relative), installedPath = ContainedPath(expected.Path, relative);
                            RequireRegularFile(supplied);
                            RejectReparseAncestors(installedPath);
                            if (!EntryExists(installedPath)) { matches = false; continue; }
                            RequireRegularFile(installedPath);
                            if (new FileInfo(supplied).Length > MaxFileBytes || new FileInfo(installedPath).Length > MaxFileBytes)
                                throw new IOException("A setup runtime file is too large to verify safely.");
                            if (!File.ReadAllBytes(supplied).SequenceEqual(File.ReadAllBytes(installedPath))) matches = false;
                        }
                        if (matches) { Recheck(expected); return expected.Path; }
                        string stage = System.IO.Path.Combine(parent, ".ZeroSetup-stage-" + Guid.NewGuid().ToString("N"));
                        string backup = System.IO.Path.Combine(parent, ".ZeroSetup-backup-" + Guid.NewGuid().ToString("N"));
                        var originals = new Dictionary<string, byte[]>();
                        var installed = new Dictionary<string, byte[]>();
                        var replaced = new List<string>();
                        bool keepBackup = false;
                        try
                        {
                            // Validate every touched file before making even staging writes.
                            foreach (string relative in paths)
                            {
                                RequireRegularFile(ContainedPath(source, relative));
                                string target = ContainedPath(expected.Path, relative);
                                RejectReparseAncestors(target);
                                if (EntryExists(target)) { RequireRegularFile(target); if (new FileInfo(target).Length > MaxFileBytes) throw new IOException("A setup runtime file is too large to back up safely: " + target); originals.Add(relative, File.ReadAllBytes(target)); }
                                else originals.Add(relative, null);
                            }
                            Directory.CreateDirectory(stage); Directory.CreateDirectory(backup);
                            foreach (string relative in paths)
                            {
                                cancellation.ThrowIfCancellationRequested();
                                string staged = ContainedPath(stage, relative); Directory.CreateDirectory(System.IO.Path.GetDirectoryName(staged));
                                File.Copy(ContainedPath(source, relative), staged, false);
                                installed.Add(relative, File.ReadAllBytes(staged));
                                if (originals[relative] != null)
                                {
                                    string saved = ContainedPath(backup, relative); Directory.CreateDirectory(System.IO.Path.GetDirectoryName(saved));
                                    File.WriteAllBytes(saved, originals[relative]);
                                }
                            }
                            diagnostic?.Invoke("Setup runtime backup: " + backup);
                            beforeCommit?.Invoke(expected.Path);
                            Recheck(expected);
                            foreach (string relative in paths)
                            {
                                string target = ContainedPath(expected.Path, relative); RejectReparseAncestors(target);
                                byte[] old = originals[relative];
                                if (old == null ? EntryExists(target) : !EntryExists(target) || !File.ReadAllBytes(target).SequenceEqual(old))
                                    throw new IOException("Setup files changed before the update. Check again.");
                            }
                            foreach (string relative in paths)
                            {
                                cancellation.ThrowIfCancellationRequested();
                                Recheck(expected);
                                string target = ContainedPath(expected.Path, relative); RejectReparseAncestors(target);
                                string staged = ContainedPath(stage, relative);
                                // Capture the actual replaced entry atomically, rather than
                                // trusting the earlier snapshot. Metadata remains the last commit.
                                if (originals[relative] == null) File.Move(staged, target);
                                else
                                {
                                    try { File.Replace(staged, target, RecoveryPath(backup, "replaced-at-commit", relative)); }
                                    catch
                                    {
                                        // A failed OS replacement can leave an ambiguous state.
                                        // Preserve both snapshot and actual-entry recovery paths.
                                        keepBackup = true;
                                        diagnostic?.Invoke("Replacement needs help; recovery backup retained at " + backup);
                                        throw;
                                    }
                                }
                                replaced.Add(relative);
                                if (originals[relative] != null)
                                {
                                    string actual = ContainedPath(backup, "replaced-at-commit/" + relative);
                                    RequireRegularFile(actual);
                                    if (!File.ReadAllBytes(actual).SequenceEqual(originals[relative]))
                                    {
                                        keepBackup = true;
                                        diagnostic?.Invoke("Setup files changed during replacement; latest bytes retained at " + actual);
                                        throw new IOException("Setup files changed during the update. Your latest files were kept. See Details, then retry.");
                                    }
                                }
                                afterReplace?.Invoke(relative);
                            }
                            keepBackup = true; // Keep a diagnostic recovery copy after success too.
                            return expected.Path;
                        }
                        catch
                        {
                            foreach (string relative in replaced.AsEnumerable().Reverse())
                            {
                                try
                                {
                                    Recheck(expected, false);
                                    string target = ContainedPath(expected.Path, relative); RejectReparseAncestors(target);
                                    string restore = null;
                                    if (originals[relative] != null)
                                    {
                                        string actual = ContainedPath(backup, "replaced-at-commit/" + relative);
                                        RequireRegularFile(actual);
                                        restore = RecoveryPath(stage, "restore", relative);
                                        File.Copy(actual, restore, false);
                                    }
                                    if (EntryExists(target))
                                    {
                                        RequireRegularFile(target);
                                        string current = RecoveryPath(backup, "replaced-at-rollback", relative);
                                        // Retain the actual current entry atomically before restoring
                                        // or removing an installed file. Never delete unknown bytes.
                                        if (restore == null) File.Move(target, current);
                                        else File.Replace(restore, target, current);
                                        RequireRegularFile(current);
                                        if (!File.ReadAllBytes(current).SequenceEqual(installed[relative]))
                                        {
                                            keepBackup = true;
                                            diagnostic?.Invoke("Changes made during setup were retained at " + current);
                                        }
                                    }
                                    else if (restore != null)
                                    {
                                        keepBackup = true;
                                        File.Move(restore, target);
                                        diagnostic?.Invoke("A setup file disappeared during the update; recovery backup retained at " + backup);
                                    }
                                }
                                catch (Exception error) { keepBackup = true; diagnostic?.Invoke("Restore needs help; backup retained at " + backup + ": " + error.Message); }
                            }
                            throw;
                        }
                        finally { DeleteOwnedDirectory(stage); if (!keepBackup) DeleteOwnedDirectory(backup); }
                    }
                }
                finally { mutex.ReleaseMutex(); }
            }
        }

        private static string RecoveryPath(string root, string category, string relative)
        {
            string path = ContainedPath(root, category + "/" + relative);
            RejectReparseAncestors(path);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            return path;
        }

        public static string CreatePrivateTemporaryDirectory()
        {
            string path = Path.Combine(Path.GetTempPath(), "ZeroSetup-" + Guid.NewGuid().ToString("N"));
            RejectReparseAncestors(Path.GetTempPath());
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(true, false);
            var user = WindowsIdentity.GetCurrent().User;
            security.SetOwner(user);
            security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None, AccessControlType.Allow));
            Directory.CreateDirectory(path, security);
            return path;
        }

        // Retain a content-addressed snapshot for editors that outlive the launcher.
        // Always extract and compare the embedded archive before reuse; the editable
        // student kit is never a source of runtime metadata. Older snapshots remain
        // available to open editors across upgrades.
        internal static string RetainEmbeddedKit(Stream source, string dataRoot, CancellationToken cancellation)
        {
            byte[] bytes;
            using (var copy = new MemoryStream())
            {
                var buffer = new byte[65536]; int read;
                while ((read = source.Read(buffer, 0, buffer.Length)) != 0)
                {
                    cancellation.ThrowIfCancellationRequested();
                    if (copy.Length + read > 32 * 1024 * 1024) throw new InvalidDataException("The embedded kit exceeds its size limit.");
                    copy.Write(buffer, 0, read);
                }
                bytes = copy.ToArray();
            }
            string digest;
            using (var sha = SHA256.Create()) digest = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            using (var folders = new WindowsRuntimeFolders())
            {
                string parent = Path.GetFullPath(dataRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + "-embedded-kits";
                folders.Ensure(parent);
                string destination = Path.Combine(parent, digest);
                string stage = Path.Combine(parent, ".stage-" + Guid.NewGuid().ToString("N"));
                try
                {
                    Directory.CreateDirectory(stage);
                    using (var input = new MemoryStream(bytes, false)) Extract(input, stage, cancellation);
                    cancellation.ThrowIfCancellationRequested();
                    RejectReparseAncestors(destination);
                    if (!Directory.Exists(destination))
                    {
                        try { Directory.Move(stage, destination); }
                        catch (IOException) { if (!Directory.Exists(destination)) throw; }
                    }
                    VerifyRetainedKit(stage, destination, cancellation);
                    return destination;
                }
                finally { DeleteOwnedDirectory(stage); }
            }
        }
        private static void VerifyRetainedKit(string stage, string destination, CancellationToken cancellation)
        {
            // A successful atomic move made stage disappear and installed the exact
            // freshly extracted bytes. Existing snapshots must match every file.
            if (!Directory.Exists(stage)) return;
            RejectReparseAncestors(destination);
            var expected = RetainedFiles(stage, stage).OrderBy(p => p, StringComparer.Ordinal).ToArray();
            var actual = RetainedFiles(destination, destination).OrderBy(p => p, StringComparer.Ordinal).ToArray();
            if (!expected.SequenceEqual(actual, StringComparer.Ordinal)) throw new IOException("Retained Zero kit differs from its embedded source. Your files were kept.");
            foreach (string relative in expected)
            {
                cancellation.ThrowIfCancellationRequested();
                string file = Path.Combine(destination, relative); RejectReparseAncestors(file);
                using (var sha = SHA256.Create())
                using (var expectedFile = File.OpenRead(Path.Combine(stage, relative)))
                using (var actualFile = File.OpenRead(file))
                    if (!sha.ComputeHash(expectedFile).SequenceEqual(sha.ComputeHash(actualFile))) throw new IOException("Retained Zero kit differs from its embedded source. Your files were kept.");
            }
        }

        private static IEnumerable<string> RetainedFiles(string root, string directory)
        {
            RejectReparseAncestors(directory);
            foreach (string file in Directory.GetFiles(directory)) { RejectReparseAncestors(file); yield return file.Substring(root.Length + 1); }
            foreach (string child in Directory.GetDirectories(directory))
                foreach (string file in RetainedFiles(root, child)) yield return file;
        }

        // The archive is part of the reviewed executable, never a downloaded/user-selected ZIP.
        public static void Extract(Stream stream, string destination, CancellationToken cancellation)
        {
            RejectReparseAncestors(destination);
            if (stream.CanSeek && stream.Length > 32 * 1024 * 1024)
                throw new InvalidDataException("The embedded kit exceeds its size limit.");
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read, true))
            {
                if (archive.Entries.Count > 10000) throw new InvalidDataException("Too many kit entries.");
                var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var explicitPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                long total = 0;
                foreach (var entry in archive.Entries)
                {
                    cancellation.ThrowIfCancellationRequested();
                    string relative = ValidateEntry(entry);
                    if (!explicitPaths.Add(relative)) throw new InvalidDataException("Duplicate kit path: " + relative);
                    if (relative.Length == 0) continue;
                    bool directory = entry.FullName.EndsWith("/", StringComparison.Ordinal);
                    if (directory) directories.Add(relative);
                    else files.Add(relative);
                    string parent = relative;
                    while (parent.LastIndexOf('/') >= 0)
                    {
                        parent = parent.Substring(0, parent.LastIndexOf('/'));
                        directories.Add(parent);
                    }
                    total = checked(total + entry.Length);
                    if (entry.Length > MaxFileBytes || total > MaxTotalBytes)
                        throw new InvalidDataException("The embedded kit exceeds its size limit.");
                }
                foreach (string file in files)
                    if (directories.Contains(file)) throw new InvalidDataException("Conflicting kit path: " + file);
                foreach (string required in new[] { "setup/Setup.ps1", "setup/Setup.cmd", "setup/README.md", "starter/zero.json", "START-HERE.md" })
                    if (!files.Contains(required)) throw new InvalidDataException("The embedded kit is missing " + required);

                foreach (var entry in archive.Entries)
                {
                    cancellation.ThrowIfCancellationRequested();
                    string relative = ValidateEntry(entry);
                    if (relative.Length == 0) continue;
                    string output = ContainedPath(destination, relative);
                    if (entry.FullName.EndsWith("/", StringComparison.Ordinal)) Directory.CreateDirectory(output);
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(output));
                        RejectReparseAncestors(output);
                        using (var input = entry.Open())
                        using (var target = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                        {
                            byte[] buffer = new byte[81920];
                            long written = 0;
                            int count;
                            while ((count = input.Read(buffer, 0, buffer.Length)) != 0)
                            {
                                cancellation.ThrowIfCancellationRequested();
                                written = checked(written + count);
                                if (written > entry.Length || written > MaxFileBytes) throw new InvalidDataException("Invalid kit entry size.");
                                target.Write(buffer, 0, count);
                            }
                            if (written != entry.Length) throw new InvalidDataException("Incomplete kit entry.");
                        }
                    }
                }
            }
        }

        private static string ValidateEntry(ZipArchiveEntry entry)
        {
            string name = entry.FullName;
            if (!name.StartsWith("zero-kit/", StringComparison.Ordinal) || name.IndexOf('\\') >= 0)
                throw new InvalidDataException("Kit paths must be inside zero-kit/.");
            int unixType = (entry.ExternalAttributes >> 16) & 0xf000;
            if ((unixType != 0 && unixType != 0x8000 && unixType != 0x4000) || (entry.ExternalAttributes & 0x400) != 0)
                throw new InvalidDataException("Kit links and special files are not supported.");
            string relative = name.Substring("zero-kit/".Length);
            if (relative.EndsWith("/", StringComparison.Ordinal)) relative = relative.Substring(0, relative.Length - 1);
            if (relative.Length == 0)
            {
                if (name != "zero-kit/" || entry.Length != 0) throw new InvalidDataException("Invalid kit root entry.");
                return relative;
            }
            foreach (string part in relative.Split('/')) ValidateName(part);
            if (name.EndsWith("/", StringComparison.Ordinal) && entry.Length != 0)
                throw new InvalidDataException("Invalid kit directory entry.");
            return relative;
        }

        public static void ValidateName(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || name.Length > 100 || name == "." || name == ".." ||
                name.EndsWith(".", StringComparison.Ordinal) || name.EndsWith(" ", StringComparison.Ordinal))
                throw new IOException("The folder name must be short and have no final space or dot.");
            foreach (char character in name)
                if (character < 32 || "<>:\"/\\|?*".IndexOf(character) >= 0)
                    throw new IOException("The folder name contains an unsupported character.");
            string stem = name.Split('.')[0].ToUpperInvariant();
            if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" ||
                stem == "CONIN$" || stem == "CONOUT$" ||
                (stem.Length == 4 && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal)) &&
                 "123456789¹²³".IndexOf(stem[3]) >= 0))
                throw new IOException("That folder name is reserved by Windows.");
        }

        private static string ContainedPath(string root, string relative)
        {
            string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string full = Path.GetFullPath(Path.Combine(prefix, relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new IOException("Kit path escaped its folder.");
            return full;
        }

        public static void RejectReparseAncestors(string path)
        {
            string current = Path.GetFullPath(path);
            while (!string.IsNullOrEmpty(current))
            {
                // GetAttributes also detects dangling links; only missing paths are ignored.
                try
                {
                    if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                        throw new IOException("Zero setup cannot use a link or junction. Review this path safely, then retry: " + current);
                }
                catch (FileNotFoundException) { }
                catch (DirectoryNotFoundException) { }
                current = Path.GetDirectoryName(current);
            }
        }

        // Build beside the destination, then rename. Directory.Move refuses an existing project.
        public static string PlaceFreshKit(string source, string parent, string name, CancellationToken cancellation, Action<string> beforeCommit = null)
        {
            ValidateName(name);
            parent = Path.GetFullPath(parent);
            RejectReparseAncestors(parent);
            // Windows uses a directory's ReadOnly bit for Explorer customization, not write permission.
            // Creating/writing the sibling stage is the permission check; failures leave the destination untouched.
            if (!Directory.Exists(parent))
                throw new IOException("Your home folder must exist and be writable. See Details, then retry.");
            string destination = Path.Combine(parent, name);
            RejectReparseAncestors(destination);
            if (EntryExists(destination)) throw new IOException("The Zero folder already exists. Check again before continuing.");
            string stage = Path.Combine(parent, ".ZeroSetup-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(stage);
                CopyDirectory(source, stage, cancellation);
                cancellation.ThrowIfCancellationRequested();
                beforeCommit?.Invoke(destination);
                RejectReparseAncestors(parent);
                RejectReparseAncestors(destination);
                RejectReparseAncestors(stage);
                Directory.Move(stage, destination);
                return destination;
            }
            finally { DeleteOwnedDirectory(stage); }
        }

        private static void CopyDirectory(string source, string destination, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            RejectReparseAncestors(source);
            RejectReparseAncestors(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                cancellation.ThrowIfCancellationRequested();
                RejectReparseAncestors(file);
                File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), false);
            }
            foreach (string directory in Directory.GetDirectories(source))
            {
                RejectReparseAncestors(directory);
                string target = Path.Combine(destination, Path.GetFileName(directory));
                Directory.CreateDirectory(target);
                CopyDirectory(directory, target, cancellation);
            }
        }

        public static void DeleteOwnedDirectory(string path)
        {
            if (string.IsNullOrEmpty(path) || !Directory.Exists(path)) return;
            try
            {
                RejectReparseAncestors(path);
                foreach (string child in Directory.GetDirectories(path)) DeleteOwnedDirectory(child);
                foreach (string file in Directory.GetFiles(path))
                {
                    RejectReparseAncestors(file);
                    File.Delete(file);
                }
                Directory.Delete(path);
            }
            catch (IOException) { /* Never follow links during best-effort cleanup. */ }
            catch (UnauthorizedAccessException) { }
        }
    }
}

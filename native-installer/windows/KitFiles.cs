using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace ZeroSetup
{
    internal static class KitFiles
    {
        private const long MaxFileBytes = 16 * 1024 * 1024;
        private const long MaxTotalBytes = 128 * 1024 * 1024;
        internal const int MaxDefaultFolders = 1000;

        // Read-only selection. The exclusive final move in PlaceFreshKit still
        // decides ownership if another process takes this name after selection.
        public static string ResolveDefaultFolder(string home, Func<string, FileAttributes> attributes = null)
        {
            if (string.IsNullOrWhiteSpace(home)) throw new IOException("Your home folder is unavailable. Change location to choose an existing writable folder.");
            home = Path.GetFullPath(home);
            RejectReparseAncestors(home);
            var read = attributes ?? File.GetAttributes;
            if ((read(home) & FileAttributes.Directory) == 0)
                throw new IOException("Your home folder is unavailable. Change location to choose an existing writable folder.");
            for (int number = 1; number <= MaxDefaultFolders; number++)
            {
                string candidate = Path.Combine(home, number == 1 ? "Zero" : "Zero-" + number);
                try { read(candidate); }
                catch (FileNotFoundException) { return candidate; }
                catch (DirectoryNotFoundException) { return candidate; }
                // Every existing entry, including a dangling link or junction,
                // reserves its name. Permission and other lookup errors propagate.
            }
            throw new IOException("All default Zero folder names are occupied. Change location to choose a new folder.");
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
                throw new IOException("Choose a short folder name without a final space or dot.");
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
                        throw new IOException("Choose a regular folder rather than a link or junction: " + current);
                }
                catch (FileNotFoundException) { }
                catch (DirectoryNotFoundException) { }
                current = Path.GetDirectoryName(current);
            }
        }

        // Build beside the destination, then rename. Directory.Move refuses an existing project.
        public static string PlaceFreshKit(string source, string parent, string name, CancellationToken cancellation)
        {
            ValidateName(name);
            parent = Path.GetFullPath(parent);
            RejectReparseAncestors(parent);
            // Windows uses a directory's ReadOnly bit for Explorer customization, not write permission.
            // Creating/writing the sibling stage is the permission check; failures leave the destination untouched.
            if (!Directory.Exists(parent))
                throw new IOException("Choose an existing writable folder.");
            string destination = Path.Combine(parent, name);
            RejectReparseAncestors(destination);
            if (Directory.Exists(destination) || File.Exists(destination)) throw new IOException("That folder already exists. Choose a new name to preserve your work.");
            string stage = Path.Combine(parent, ".ZeroSetup-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(stage);
                CopyDirectory(source, stage, cancellation);
                cancellation.ThrowIfCancellationRequested();
                RejectReparseAncestors(parent);
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

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace ZeroSetup
{
    // Holds every existing ancestor against replacement on Windows. The Mono
    // harness still checks reparse attributes, but cannot prove Windows locking.
    internal sealed class WindowsRuntimeFolders : IDisposable
    {
        private readonly Dictionary<string, SafeFileHandle> held = new Dictionary<string, SafeFileHandle>(StringComparer.OrdinalIgnoreCase);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        public void Ensure(string path)
        {
            path = Path.GetFullPath(path);
            string parent = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(parent) && parent != path) Ensure(parent);
            if (held.ContainsKey(path)) { Check(path); return; }
            Check(path);
            if (!Directory.Exists(path)) Directory.CreateDirectory(path);
            Check(path);
            if (!Directory.Exists(path)) throw new IOException("Zero needs a real private folder: " + path);
            if (Path.DirectorySeparatorChar == '\\')
            {
                // FILE_FLAG_OPEN_REPARSE_POINT prevents following a replacement
                // link; no FILE_SHARE_DELETE pins directory names while held.
                var handle = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
                if (handle.IsInvalid) { handle.Dispose(); throw new IOException("Cannot hold Zero's private folder safely. Close another setup and retry."); }
                held.Add(path, handle);
                Check(path);
            }
            else held.Add(path, null);
        }
        internal static void Check(string path)
        {
            string current = Path.GetFullPath(path);
            for (;;)
            {
                try { if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new IOException("Zero cannot use a linked or redirected runtime path: " + current); }
                catch (FileNotFoundException) { }
                catch (DirectoryNotFoundException) { }
                string parent = Path.GetDirectoryName(current);
                if (string.IsNullOrEmpty(parent) || parent == current) break;
                current = parent;
            }
        }
        public void Dispose() { foreach (var handle in held.Values.Reverse()) if (handle != null) handle.Dispose(); held.Clear(); }
    }

    internal static class WindowsRuntimeArchive
    {
        internal const long MaximumExpandedBytes = 4L * 1024 * 1024 * 1024;
        internal static string SafeName(string name)
        {
            // Apply Windows names even when the fake harness runs on Unix.
            if (string.IsNullOrEmpty(name) || name[0] == '/' || name[0] == '\\' || name.IndexOf('\\') >= 0 || name.IndexOf(':') >= 0 || name.IndexOf('\0') >= 0)
                throw new IOException("The runtime archive has an unsafe path.");
            string clean = name.TrimEnd('/');
            foreach (string part in clean.Split('/'))
            {
                if (part.Length == 0 || part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" ") || part.IndexOfAny(new[] { '<', '>', '"', '|', '?', '*' }) >= 0 || part.Any(c => c < 32) ||
                    Regex.IsMatch(part, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])($|\.)", RegexOptions.IgnoreCase))
                    throw new IOException("The runtime archive has an unsafe Windows filename.");
            }
            return clean;
        }
        public static void Extract(string archive, string destination, CancellationToken cancellation)
        {
            using (var folders = new WindowsRuntimeFolders())
            using (var input = new FileStream(archive, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var zip = new ZipArchive(input, ZipArchiveMode.Read))
            {
                folders.Ensure(destination);
                if (zip.Entries.Count == 0 || zip.Entries.Count > 100000) throw new IOException("The runtime archive has too many files.");
                var names = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                long total = 0;
                foreach (var entry in zip.Entries)
                {
                    cancellation.ThrowIfCancellationRequested();
                    string name = SafeName(entry.FullName);
                    bool directory = entry.FullName.EndsWith("/", StringComparison.Ordinal);
                    int type = (entry.ExternalAttributes >> 16) & 0xf000;
                    if ((type != 0 && type != 0x8000 && type != 0x4000) || (entry.ExternalAttributes & 0x400) != 0 ||
                        (type == 0x4000 && !directory) || (directory && entry.Length != 0))
                        throw new IOException("The runtime archive contains a link or unsupported file.");
                    if (names.ContainsKey(name)) throw new IOException("The runtime archive repeats a Windows filename.");
                    names.Add(name, directory);
                    if (entry.Length < 0 || entry.Length > 1024L * 1024 * 1024 || total > MaximumExpandedBytes - entry.Length)
                        throw new IOException("The runtime archive exceeds its extraction limit.");
                    total += entry.Length;
                }
                foreach (var pair in names)
                {
                    string parent = pair.Key;
                    while (parent.LastIndexOf('/') >= 0)
                    {
                        parent = parent.Substring(0, parent.LastIndexOf('/'));
                        bool directory;
                        if (names.TryGetValue(parent, out directory) && !directory) throw new IOException("The runtime archive overlaps a file and folder.");
                    }
                }
                var buffer = new byte[65536];
                foreach (var entry in zip.Entries)
                {
                    cancellation.ThrowIfCancellationRequested();
                    string path = Path.Combine(destination, SafeName(entry.FullName).Replace('/', Path.DirectorySeparatorChar));
                    if (entry.FullName.EndsWith("/", StringComparison.Ordinal)) { folders.Ensure(path); continue; }
                    folders.Ensure(Path.GetDirectoryName(path));
                    WindowsRuntimeFolders.Check(path);
                    using (var source = entry.Open())
                    using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        long bytes = 0; int count;
                        while ((count = source.Read(buffer, 0, buffer.Length)) != 0)
                        {
                            cancellation.ThrowIfCancellationRequested();
                            if (bytes > entry.Length - count) throw new IOException("The runtime archive expanded beyond its declared size.");
                            output.Write(buffer, 0, count); bytes += count;
                        }
                        if (bytes != entry.Length) throw new IOException("The runtime archive is incomplete.");
                    }
                }
            }
        }
        internal static string Hash(string path, CancellationToken cancellation = default(CancellationToken))
        {
            WindowsRuntimeFolders.Check(path);
            using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create())
            {
                var buffer = new byte[65536]; int count;
                while ((count = input.Read(buffer, 0, buffer.Length)) != 0)
                {
                    cancellation.ThrowIfCancellationRequested(); sha.TransformBlock(buffer, 0, count, buffer, 0);
                }
                cancellation.ThrowIfCancellationRequested(); sha.TransformFinalBlock(new byte[0], 0, 0);
                return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
            }
        }
        internal static void DeleteStaging(string path)
        {
            // Never recurse through links, even during failed-download cleanup.
            WindowsRuntimeFolders.Check(path);
            if (!Directory.Exists(path)) return;
            foreach (string item in Directory.EnumerateFileSystemEntries(path))
            {
                WindowsRuntimeFolders.Check(item);
                if (Directory.Exists(item)) DeleteStaging(item);
                else { File.SetAttributes(item, FileAttributes.Normal); File.Delete(item); }
            }
            Directory.Delete(path);
        }
    }
}

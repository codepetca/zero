using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace ZeroSetup
{
    internal interface IWindowsEnvironmentReader
    {
        IDictionary<string, string> Read(EnvironmentVariableTarget target);
    }

    internal sealed class WindowsEnvironmentReader : IWindowsEnvironmentReader
    {
        public IDictionary<string, string> Read(EnvironmentVariableTarget target)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (target == EnvironmentVariableTarget.Process)
            {
                foreach (DictionaryEntry pair in Environment.GetEnvironmentVariables())
                    values[(string)pair.Key] = (string)pair.Value;
            }
            else
            {
                // Read raw REG_EXPAND_SZ so expansion uses refreshed variables,
                // rather than the app's stale launch-time environment.
                string path = target == EnvironmentVariableTarget.Machine
                    ? @"SYSTEM\CurrentControlSet\Control\Session Manager\Environment" : "Environment";
                RegistryKey hive = target == EnvironmentVariableTarget.Machine ? Registry.LocalMachine : Registry.CurrentUser;
                using (var key = hive.OpenSubKey(path, false))
                {
                    if (key == null && target == EnvironmentVariableTarget.Machine) throw new IOException("Machine environment could not be read.");
                    if (key != null)
                    {
                        foreach (string name in key.GetValueNames())
                        {
                            object value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                            if (value is string) values[name] = (string)value;
                            else if (value != null && (name.Equals("PATH", StringComparison.OrdinalIgnoreCase) || name.Equals("JAVA_HOME", StringComparison.OrdinalIgnoreCase)))
                                throw new IOException("A tool environment value is not text.");
                        }
                    }
                }
            }
            return values;
        }
    }

    // Windows installers update Machine/User environment, while this app keeps
    // its launch-time environment. Refresh only owned children after a deliberate
    // vendor handoff; preserve the owner's explicit process tool selection.
    internal sealed class WindowsToolEnvironment
    {
        private readonly IWindowsEnvironmentReader reader;
        private IDictionary<string, string> process, machine, user;
        private Exception baselineError;
        private bool refresh;
        public WindowsToolEnvironment(IWindowsEnvironmentReader reader)
        {
            this.reader = reader;
            try
            {
                process = Copy(reader.Read(EnvironmentVariableTarget.Process));
                machine = Copy(reader.Read(EnvironmentVariableTarget.Machine));
                user = Copy(reader.Read(EnvironmentVariableTarget.User));
            }
            catch (Exception error) { baselineError = error; }
        }
        public void VendorHandoffCompleted() { refresh = true; }
        public void Apply(ProcessStartInfo info)
        {
            if (!refresh) return;
            try
            {
                if (baselineError != null) throw baselineError;
                var values = Build(process, machine, user,
                    reader.Read(EnvironmentVariableTarget.Machine), reader.Read(EnvironmentVariableTarget.User));
                info.EnvironmentVariables["PATH"] = values["PATH"];
                if (values.ContainsKey("JAVA_HOME")) info.EnvironmentVariables["JAVA_HOME"] = values["JAVA_HOME"];
                else info.EnvironmentVariables.Remove("JAVA_HOME");
            }
            catch (Exception error)
            {
                throw new IOException("Windows tool environment could not be refreshed. Close Zero Setup and reopen it, or ask your device administrator or IT. Readiness remains unverified.", error);
            }
        }
        private static Dictionary<string, string> Copy(IDictionary<string, string> values)
        {
            if (values == null) throw new IOException("Environment values were unavailable.");
            var copy = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var pair in values) copy[pair.Key] = pair.Value ?? "";
            return copy;
        }
        private static string Value(IDictionary<string, string> values, string name)
        {
            string value;
            return values.TryGetValue(name, out value) ? value : "";
        }
        private static Dictionary<string, string> Variables(IDictionary<string, string> process,
            IDictionary<string, string> machine, IDictionary<string, string> user)
        {
            var variables = Copy(process);
            foreach (var pair in machine) variables[pair.Key] = pair.Value;
            foreach (var pair in user) variables[pair.Key] = pair.Value;
            // Any explicitly selected process JAVA_HOME remains a repair blocker
            // when unsuitable. An installer must not silently override it.
            if (!string.IsNullOrEmpty(Value(process, "JAVA_HOME"))) variables["JAVA_HOME"] = Value(process, "JAVA_HOME");
            return variables;
        }
        private static string Expand(string value, IDictionary<string, string> variables)
        {
            // Resolve case-insensitive %names% as data only; never use shell text
            // or modify the parent environment. Cycles/unknown names stay literal.
            if (value.Length > 32767) throw new IOException("Environment path is too long.");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int depth = 0; depth < 16 && seen.Add(value); depth++)
            {
                string expanded = Regex.Replace(value, "%([^%]+)%", match =>
                {
                    string replacement;
                    return variables.TryGetValue(match.Groups[1].Value, out replacement) ? replacement : match.Value;
                });
                if (expanded.Length > 32767) throw new IOException("Expanded environment path is too long.");
                if (expanded == value) break;
                value = expanded;
            }
            if (value.IndexOf('\0') >= 0) throw new IOException("Invalid environment path.");
            return value;
        }
        private static IEnumerable<string> Entries(string value, IDictionary<string, string> variables)
        {
            return Expand(value, variables).Split(';').Select(entry => entry.Trim()).Where(entry => entry.Length > 0);
        }
        private static string Key(string entry) { return entry.Trim('"').Replace('/', '\\').TrimEnd('\\'); }
        public static Dictionary<string, string> Build(IDictionary<string, string> originalProcess,
            IDictionary<string, string> initialMachine, IDictionary<string, string> initialUser,
            IDictionary<string, string> currentMachine, IDictionary<string, string> currentUser)
        {
            // Normalize input key comparers: the fake seam also accepts ordinary
            // case-sensitive dictionaries, just as Windows keys ignore case.
            var original = Copy(originalProcess); var beforeMachine = Copy(initialMachine); var beforeUser = Copy(initialUser);
            var nowMachine = Copy(currentMachine); var nowUser = Copy(currentUser);
            var before = Variables(original, beforeMachine, beforeUser);
            var now = Variables(original, nowMachine, nowUser);
            var baselineOrder = Entries(Value(beforeMachine, "PATH"), before)
                .Concat(Entries(Value(beforeUser, "PATH"), before)).Select(Key)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var baseline = new HashSet<string>(baselineOrder, StringComparer.OrdinalIgnoreCase);
            var originalEntries = Entries(Value(original, "PATH"), original).ToArray();
            var sharedOrder = originalEntries.Select(Key).Where(baseline.Contains)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var shared = new HashSet<string>(sharedOrder, StringComparer.OrdinalIgnoreCase);
            // A process can deliberately prepend/reorder a registered JDK. Keep
            // that selection ahead of refreshed OS paths. Ordinary inherited
            // registry order still replaces stale entries with current OS values.
            bool reordered = !sharedOrder.SequenceEqual(baselineOrder.Where(shared.Contains), StringComparer.OrdinalIgnoreCase);
            var priority = reordered ? originalEntries : originalEntries.Where(entry => !baseline.Contains(Key(entry)));
            var entries = priority.Concat(Entries(Value(nowMachine, "PATH"), now))
                .Concat(Entries(Value(nowUser, "PATH"), now));
            var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["PATH"] = string.Join(";", entries.Where(entry => unique.Add(Key(entry))))
            };
            if (result["PATH"].Length > 32767) throw new IOException("Refreshed PATH is too long.");
            // User values override Machine values, even when the user explicitly
            // cleared the value. Preserve the original nonempty process selection.
            if (!string.IsNullOrEmpty(Value(original, "JAVA_HOME")))
                result["JAVA_HOME"] = Value(original, "JAVA_HOME");
            else if (now.ContainsKey("JAVA_HOME") && !string.IsNullOrEmpty(now["JAVA_HOME"]))
                result["JAVA_HOME"] = Expand(now["JAVA_HOME"], now);
            return result;
        }
    }
}

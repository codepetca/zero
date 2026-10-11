using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ZeroSetup;

internal static class EnvironmentHarness
{
    private static int checks;
    private static void Assert(bool value, string name) { if (!value) throw new Exception("FAILED: " + name); checks++; }
    private static Dictionary<string, string> Values(params string[] entries)
    {
        var values = new Dictionary<string, string>();
        for (int index = 0; index < entries.Length; index += 2) values[entries[index]] = entries[index + 1];
        return values;
    }
    private sealed class Reader : IWindowsEnvironmentReader
    {
        public IDictionary<string, string> Process = Values("Path", "C:\\Windows;C:\\Users\\student\\bin");
        public IDictionary<string, string> Machine = Values("PATH", "C:\\Windows");
        public IDictionary<string, string> User = Values("path", "C:\\Users\\student\\bin");
        public bool Fail;
        public int Reads;
        public IDictionary<string, string> Read(EnvironmentVariableTarget target)
        {
            Reads++;
            if (Fail) throw new IOException("fake registry read failed");
            return target == EnvironmentVariableTarget.Process ? Process : target == EnvironmentVariableTarget.Machine ? Machine : User;
        }
    }
    private sealed class ToolBackend : ISetupBackend
    {
        public string Root { get { return "fake kit"; } }
        public readonly Reader Reader = new Reader();
        private readonly WindowsToolEnvironment tools;
        private bool zero, redhat;
        public string LastPath;
        public ToolBackend() { tools = new WindowsToolEnvironment(Reader); }
        public Task EnsureKit(CancellationToken token) { return Task.CompletedTask; }
        public Task<string> Place(string parent, string name, CancellationToken token) { return Task.FromResult(Root); }
        public Task Download(string url, CancellationToken token)
        {
            Reader.Machine = Values("PATH", @"C:\Windows;C:\new JDK\bin");
            tools.VendorHandoffCompleted();
            return Task.CompletedTask;
        }
        public Task<CheckResult> Run(string root, string action, string target, bool approved, CancellationToken token)
        {
            var child = new ProcessStartInfo(); child.EnvironmentVariables["PATH"] = Reader.Process["Path"];
            tools.Apply(child); LastPath = child.EnvironmentVariables["PATH"];
            string output = "";
            if (action == "plan") output = "ZERO_PLAN_V1\naction=manual\nEND_ZERO_PLAN\n";
            if (action == "extension") { if (target == "zero") zero = true; else redhat = true; }
            if (action == "check")
            {
                bool java = LastPath.Contains("new JDK");
                output = "ZERO_SETUP_V1\nkit=1\ncode=1\njava=" + (java ? "1" : "0") + "\nprofile=1\nzero=" + (zero ? "1" : "0") + "\nredhat=" + (redhat ? "1" : "0") + "\njavaHomeBlocked=0\nready=" + (java && zero && redhat ? "1" : "0") + "\nEND_ZERO_SETUP\n";
            }
            return Task.FromResult(new CheckResult { ExitCode = 0, Output = output });
        }
    }
    public static int Run()
    {
        var reader = new Reader();
        var tools = new WindowsToolEnvironment(reader);
        Assert(reader.Reads == 3, "capture initial process and OS tool baseline at start");
        var child = new ProcessStartInfo(); child.EnvironmentVariables["PATH"] = "unchanged preexisting tools";
        reader.Fail = true; tools.Apply(child);
        Assert(child.EnvironmentVariables["PATH"] == "unchanged preexisting tools" && reader.Reads == 3, "no handoff preserves existing compatible process environment without OS reads");
        reader.Fail = false;
        reader.Machine = Values("Path", "C:\\Windows;C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin");
        tools.Apply(child); Assert(child.EnvironmentVariables["PATH"] == "unchanged preexisting tools", "OS change alone does not refresh");
        tools.VendorHandoffCompleted(); tools.Apply(child);
        Assert(child.EnvironmentVariables["PATH"] == "C:\\Windows;C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin;C:\\Users\\student\\bin", "explicit handoff refresh sees newly installed Machine PATH JDK");
        foreach (string action in new[] { "check", "extension", "open" })
        {
            child = new ProcessStartInfo(); tools.Apply(child);
            Assert(child.EnvironmentVariables["PATH"].Contains("jdk-17\\bin"), "same refreshed tool environment for " + action);
        }
        Assert(reader.Process["Path"] == "C:\\Windows;C:\\Users\\student\\bin", "original environment dictionary remains unchanged");
        var original = Values("PATH", "C:\\custom JDK\\bin;C:\\WINDOWS;C:\\custom tools", "java_home", "C:\\chosen broken JDK");
        var result = WindowsToolEnvironment.Build(original, Values("path", "c:\\windows\\"), Values(),
            Values("PATH", "C:\\Windows;C:\\new JDK\\bin", "JAVA_HOME", "C:\\new JDK"), Values("java_HOME", "C:\\user JDK"));
        Assert(result["PATH"] == "C:\\custom JDK\\bin;C:\\custom tools;C:\\Windows;C:\\new JDK\\bin", "custom process PATH entries keep precedence ahead of refreshed OS entries");
        Assert(result["JAVA_HOME"] == "C:\\chosen broken JDK", "any original nonempty JAVA_HOME preserved despite changed Machine and User values");
        Assert(original["java_home"] == "C:\\chosen broken JDK", "no original JAVA_HOME mutation");
        result = WindowsToolEnvironment.Build(Values("path", "C:\\Windows", "JAVA_HOME", ""), Values("Path", "C:\\Windows"), Values(),
            Values("path", "%SystemRoot%;%JAVA_HOME%\\bin", "systemROOT", "C:\\Windows", "JAVA_HOME", "C:\\machine JDK"), Values("Java_Home", "C:\\user JDK"));
        Assert(result["JAVA_HOME"] == "C:\\user JDK" && result["PATH"] == "C:\\Windows;C:\\user JDK\\bin", "empty original JAVA_HOME adopts User over Machine and expands mixed-case variables");
        result = WindowsToolEnvironment.Build(Values(), Values(), Values(), Values("PATH", "%base%\\%jdk%\\bin", "BASE", "C:\\Program Files", "JDK", "jdk-17", "JAVA_HOME", "%base%\\%jdk%"), Values());
        Assert(result["PATH"] == "C:\\Program Files\\jdk-17\\bin" && result["JAVA_HOME"] == "C:\\Program Files\\jdk-17", "Machine JAVA_HOME fallback and data-only variable expansion");
        result = WindowsToolEnvironment.Build(Values("PATH", "C:\\custom"), Values(), Values(), Values(), Values());
        Assert(result["PATH"] == "C:\\custom" && !result.ContainsKey("JAVA_HOME"), "absent registry values preserve custom PATH without inventing JAVA_HOME");
        result = WindowsToolEnvironment.Build(Values("JAVA_HOME", "%old_selection%", "old_selection", "C:\\old"), Values(), Values(), Values("old_selection", "C:\\new"), Values());
        Assert(result["JAVA_HOME"] == "%old_selection%", "original JAVA_HOME remains byte-for-byte process choice");
        result = WindowsToolEnvironment.Build(Values(), Values(), Values(), Values("PATH", "%missing%\\bin;C:\\same;C:\\SAME\\;C:/same"), Values());
        Assert(result["PATH"] == "%missing%\\bin;C:\\same", "unknown variables stay literal and Windows paths deduplicate ignoring case and slash");
        var registered = Values("PATH", @"C:\Windows;C:\JDK8\bin;C:\JDK17\bin");
        var addedCode = Values("PATH", @"C:\VS Code\bin");
        result = WindowsToolEnvironment.Build(Values("PATH", @"C:\JDK17\bin;C:\Windows;C:\JDK8\bin"), registered, Values(), registered, addedCode);
        Assert(result["PATH"] == @"C:\JDK17\bin;C:\Windows;C:\JDK8\bin;C:\VS Code\bin", "registered JDK process reorder survives vendor handoff exact reproducer");
        result = WindowsToolEnvironment.Build(Values("PATH", @"C:\JDK17\bin;C:\Windows;C:\JDK8\bin;C:\JDK17\bin"), registered, Values(), registered, addedCode);
        Assert(result["PATH"] == @"C:\JDK17\bin;C:\Windows;C:\JDK8\bin;C:\VS Code\bin", "explicit prepend duplicate keeps registered JDK first");
        result = WindowsToolEnvironment.Build(Values("PATH", @"C:\Windows;C:\JDK8\bin;C:\JDK17\bin"), registered, Values(), Values("PATH", @"C:\Windows;C:\JDK21\bin"), addedCode);
        Assert(result["PATH"] == @"C:\Windows;C:\JDK21\bin;C:\VS Code\bin", "ordinary baseline order replaces removed old registered JDK paths");
        result = WindowsToolEnvironment.Build(Values("PATH", @"C:\custom JDK\bin;C:\Windows;C:\JDK8\bin;C:\JDK17\bin;C:\custom tools"), registered, Values(), Values("PATH", @"C:\Windows;C:\JDK21\bin"), addedCode);
        Assert(result["PATH"] == @"C:\custom JDK\bin;C:\custom tools;C:\Windows;C:\JDK21\bin;C:\VS Code\bin", "custom extras keep priority while ordinary stale registered entries are replaced");
        result = WindowsToolEnvironment.Build(Values("PATH", @"C:\JDK17\bin;C:\Windows", "JAVA_HOME", @"C:\explicit JDK"), registered, Values(), Values("PATH", @"C:\Windows;C:\JDK21\bin", "JAVA_HOME", @"C:\registry JDK"), addedCode);
        Assert(result["PATH"] == @"C:\JDK17\bin;C:\Windows;C:\JDK21\bin;C:\VS Code\bin" && result["JAVA_HOME"] == @"C:\explicit JDK", "subset reorder and original JAVA_HOME remain explicit process selections");
        reader.Fail = true; child = new ProcessStartInfo(); child.EnvironmentVariables["PATH"] = "before failed refresh";
        try { tools.Apply(child); throw new Exception("FAILED: environment read failure accepted"); }
        catch (IOException error) { Assert(error.Message.Contains("Close Zero Setup") && error.Message.Contains("unverified"), "failed refresh actionable and readiness unverified"); }
        Assert(child.EnvironmentVariables["PATH"] == "before failed refresh", "failure does not partially change child environment");
        tools = new WindowsToolEnvironment(reader); child = new ProcessStartInfo(); tools.Apply(child);
        tools.VendorHandoffCompleted();
        try { tools.Apply(child); throw new Exception("FAILED: missing baseline accepted"); }
        catch (IOException) { checks++; }
        var backend = new ToolBackend();
        var controller = new SetupController(backend, CancellationToken.None);
        controller.Check().GetAwaiter().GetResult(); controller.Place("parent", "Zero").GetAwaiter().GetResult();
        Assert(controller.Stage == SetupStage.ManualJava, "fresh fake machine initially lacks Java");
        controller.PrimaryAction().GetAwaiter().GetResult(); controller.Check().GetAwaiter().GetResult();
        Assert(controller.Stage == SetupStage.ExtensionConsent && backend.LastPath.Contains("new JDK"), "Check again after handoff sees new JDK without app restart");
        controller.PrimaryAction().GetAwaiter().GetResult();
        Assert(controller.Stage == SetupStage.Ready && backend.LastPath.Contains("new JDK"), "extensions and final verification use refreshed child tools");
        controller.PrimaryAction().GetAwaiter().GetResult();
        Assert(controller.Stage == SetupStage.Opened && backend.LastPath.Contains("new JDK"), "final Code open receives same refreshed child PATH");
        backend.Reader.Fail = true; controller.Check().GetAwaiter().GetResult();
        Assert(controller.Stage == SetupStage.Retry && !controller.Busy && controller.Diagnostics.Contains("unverified"), "environment read failure cannot report Ready");
        return checks;
    }
}

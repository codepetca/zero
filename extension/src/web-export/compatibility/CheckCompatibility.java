import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import javax.lang.model.element.*;
import javax.lang.model.type.*;
import javax.lang.model.util.*;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;

/** Attributes original sources only. Never generates classes or runs processors/application code. */
public final class CheckCompatibility {
    static final Set<String> contract = new HashSet<>();
    static final Set<String> failures = new LinkedHashSet<>();
    static final Set<String> resourceUrls = new LinkedHashSet<>();
    static Trees trees;
    static Types types;
    static Elements elements;
    static Path root;
    static String signature(Element element) {
        if (element instanceof TypeElement type) return "T\t" + type.getQualifiedName();
        Element enclosing = element.getEnclosingElement();
        if (!(enclosing instanceof TypeElement owner)) return null;
        if (element instanceof ExecutableElement method) return "M\t" + owner.getQualifiedName() + "#" + method.getSimpleName() + "(" + method.getParameters().stream().map(p -> types.erasure(p.asType()).toString()).collect(Collectors.joining(",")) + ")";
        if (element.getKind().isField()) return "M\t" + owner.getQualifiedName() + "#" + element.getSimpleName();
        return null;
    }
    static void fail(CompilationUnitTree unit, Tree tree, String message) {
        long offset = trees.getSourcePositions().getStartPosition(unit, tree);
        long line = offset < 0 ? 1 : unit.getLineMap().getLineNumber(offset);
        long column = offset < 0 ? 1 : unit.getLineMap().getColumnNumber(offset);
        String file = root.relativize(Path.of(unit.getSourceFile().toUri())).toString().replace(File.separatorChar, '/');
        failures.add(file + ":" + line + ":" + column + ": " + message);
    }
    static boolean application(Element element, Set<CompilationUnitTree> trusted) {
        TreePath path = trees.getPath(element);
        if (path == null && element.getEnclosingElement() instanceof TypeElement owner) path = trees.getPath(owner);
        return path != null && !trusted.contains(path.getCompilationUnit());
    }
    static MethodInvocationTree invocation(TreePath path) {
        if (path.getLeaf() instanceof MethodInvocationTree call) return call;
        TreePath parent = path.getParentPath();
        return parent != null && parent.getLeaf() instanceof MethodInvocationTree call ? call : null;
    }
    static boolean resourceReceiver(Tree expression) {
        return expression instanceof MemberSelectTree select && select.getIdentifier().contentEquals("class")
            || expression instanceof MethodInvocationTree call && call.getArguments().isEmpty() && call.getMethodSelect() instanceof IdentifierTree name && name.getName().contentEquals("getClass");
    }
    static boolean resourceClass(TreePath path) {
        MethodInvocationTree call = invocation(path);
        if (call == null || !(call.getMethodSelect() instanceof IdentifierTree name) || !name.getName().contentEquals("getClass") || !call.getArguments().isEmpty()) return false;
        TreePath p = path.getLeaf() == call ? path.getParentPath() : path.getParentPath().getParentPath();
        return p != null && p.getLeaf() instanceof MemberSelectTree select && select.getIdentifier().contentEquals("getResource") && p.getParentPath() != null && p.getParentPath().getLeaf() instanceof MethodInvocationTree;
    }
    static String guidance(String key) {
        return switch (key) {
            case "M\tjava.util.ArrayList#<init>(int)" -> "Use new ArrayList<>() without an initial-capacity argument; add items normally.";
            case "M\tjava.lang.String#format(java.lang.String,java.lang.Object[])" -> "Build simple labels with ordinary string concatenation, for example \"Score: \" + score.";
            case "M\tjava.lang.Thread#sleep(long)" -> "For a GameApp delay, accumulate seconds in update(double seconds) and act when the timer reaches your target; keep the browser event loop responsive.";
            case "M\tjavafx.scene.Parent#getStylesheets()" -> "Use setStyle(\"...\") for supported inline control styles; external JavaFX stylesheets require native Run App.";
            default -> "Use a member listed in docs/WEB-EXPORT.md and the browser compatibility contract; a different overload or declaring type needs its own browser verification.";
        };
    }
    static void check(Element element, Tree tree, TreePath path, Set<CompilationUnitTree> trusted) {
        if (element == null) return; // javac error diagnostics below fail closed on unresolved symbols.
        String key = signature(element);
        if (element instanceof TypeElement type && type.getQualifiedName().contentEquals("java.net.URL") && (tree instanceof IdentifierTree || tree instanceof MemberSelectTree)) {
            long start = trees.getSourcePositions().getStartPosition(path.getCompilationUnit(), tree);
            long end = trees.getSourcePositions().getEndPosition(path.getCompilationUnit(), tree);
            String file = root.relativize(Path.of(path.getCompilationUnit().getSourceFile().toUri())).toString().replace(File.separatorChar, '/');
            // Inferred var type trees have no original source span. Their APIs
            // still pass through every semantic check below; only edits need spans.
            if (start != Diagnostic.NOPOS && end != Diagnostic.NOPOS)
                resourceUrls.add("ZERO_URL\t" + Base64.getEncoder().encodeToString(file.getBytes(StandardCharsets.UTF_8)) + "\t" + start + "\t" + end);
        }
        if (key == null || element.getSimpleName().contentEquals("this") || element.getSimpleName().contentEquals("super") || application(element, trusted)) return;
        if (key.equals("M\tArray#length") && tree instanceof MemberSelectTree select && trees.getTypeMirror(new TreePath(path, select.getExpression())).getKind() == TypeKind.ARRAY) return;
        if (key.equals("M\tjava.lang.Object#getClass()") && !resourceClass(path)) { fail(path.getCompilationUnit(), tree, "Object#getClass() is supported only in getClass().getResource(...); use ordinary methods and the Zero asset helpers."); return; }
        if (key.equals("M\tjava.lang.Class#getResource(java.lang.String)")) {
            MethodInvocationTree call = invocation(path);
            if (call == null || !(call.getMethodSelect() instanceof MemberSelectTree select) || !resourceReceiver(select.getExpression())) { fail(path.getCompilationUnit(), tree, "Class#getResource is supported only as ClassName.class.getResource(...) or getClass().getResource(...)."); return; }
        }
        if (key.equals("M\tjavafx.scene.Node#setAccessibleText(java.lang.String)")) {
            MethodInvocationTree call = invocation(path);
            if (call == null || !(call.getMethodSelect() instanceof MemberSelectTree select) || !(select.getExpression() instanceof MethodInvocationTree receiver) || !(receiver.getMethodSelect() instanceof IdentifierTree name) || !name.getName().contentEquals("canvas") || !receiver.getArguments().isEmpty()) { fail(path.getCompilationUnit(), tree, "Use canvas().setAccessibleText(...) so the browser adapter can label the actual canvas."); return; }
        }
        if (!contract.contains(key)) fail(path.getCompilationUnit(), tree, "Unsupported browser API " + key.substring(2) + ". " + guidance(key));
    }
    public static void main(String[] args) throws Exception {
        root = Path.of(args[0]).toAbsolutePath();
        contract.addAll(Files.readAllLines(Path.of(args[2]), StandardCharsets.UTF_8));
        Set<String> trustedNames = new HashSet<>(Files.readAllLines(Path.of(args[3]), StandardCharsets.UTF_8));
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("Use the existing JDK 17 or newer, including javac, to check browser compatibility.");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            List<Path> files;
            try (var stream = Files.walk(root)) { files = stream.filter(p -> p.toString().endsWith(".java")).sorted().toList(); }
            // Explicit paths isolate attribution from project classpaths, sourcepaths, plugins and processors.
            JavacTask task = (JavacTask) compiler.getTask(null, manager, diagnostics, List.of("-proc:none", "--release", "17", "-encoding", "UTF-8", "-classpath", args[1], "-sourcepath", root.toString(), "-implicit:none", "-Xlint:none"), null, manager.getJavaFileObjectsFromPaths(files));
            List<CompilationUnitTree> units = new ArrayList<>();
            task.parse().forEach(units::add);
            task.analyze();
            trees = Trees.instance(task); types = task.getTypes(); elements = task.getElements();
            Set<CompilationUnitTree> trusted = new HashSet<>();
            for (CompilationUnitTree unit : units) {
                String name = root.relativize(Path.of(unit.getSourceFile().toUri())).toString().replace(File.separatorChar, '/');
                if (trustedNames.contains(name)) trusted.add(unit);
            }
            for (CompilationUnitTree unit : units) {
                if (trusted.contains(unit)) continue; // Exact hash-bound bodies have reviewed browser adapters.
                String pkg = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
                if (pkg.matches("(?:java|javax|javafx|jsinterop|com\\.google\\.gwt|com\\.sun|dev\\.webfx)(?:\\..*)?") || pkg.equals("zero.web") || pkg.startsWith("zero.web.") || pkg.equals("zero.exported")) fail(unit, unit, "This package is reserved by the browser/JDK runtime; use your own application package.");
                new TreePathScanner<Void, Void>() {
                    @Override public Void visitClass(ClassTree tree, Void ignored) {
                        Element e = trees.getElement(getCurrentPath());
                        if (e instanceof TypeElement type && Set.of("zero.Actor", "zero.AnimationSource", "zero.AnimationPlayback", "zero.Color", "zero.Key", "zero.ui.Element", "zero.ui.Label", "zero.ui.TextField", "zero.ui.Button", "zero.ui.Column", "zero.ui.Row", "zero.App", "zero.GameApp", "zero.ImageRegion", "zero.SpriteAnimation", "zero.Collisions", "zero.Sound", "zero.Music").contains(type.getQualifiedName().toString())) fail(unit, tree, "This Zero helper identity requires its exact reviewed source path and adapter hash; use a different name for your own helper.");
                        return super.visitClass(tree, ignored);
                    }
                    void inspect(Tree tree) { check(trees.getElement(getCurrentPath()), tree, getCurrentPath(), trusted); }
                    @Override public Void visitIdentifier(IdentifierTree tree, Void ignored) { inspect(tree); return super.visitIdentifier(tree, ignored); }
                    @Override public Void visitMemberSelect(MemberSelectTree tree, Void ignored) {
                        inspect(tree);
                        // A class literal is allowed only for the adapter's exact resource-lookup form.
                        if (tree.getIdentifier().contentEquals("class")) {
                            TreePath p = getCurrentPath().getParentPath();
                            boolean resource = p != null && p.getLeaf() instanceof MemberSelectTree select && select.getIdentifier().contentEquals("getResource") && p.getParentPath() != null && p.getParentPath().getLeaf() instanceof MethodInvocationTree;
                            if (!resource) fail(unit, tree, "Class literals are supported only for ClassName.class.getResource(...); use loadImage/loadSound/loadMusic for packaged assets.");
                        }
                        return super.visitMemberSelect(tree, ignored);
                    }
                    @Override public Void visitMethodInvocation(MethodInvocationTree tree, Void ignored) { inspect(tree); return super.visitMethodInvocation(tree, ignored); }
                    @Override public Void visitNewClass(NewClassTree tree, Void ignored) { inspect(tree); return super.visitNewClass(tree, ignored); }
                    @Override public Void visitMemberReference(MemberReferenceTree tree, Void ignored) { inspect(tree); return super.visitMemberReference(tree, ignored); }
                    @Override public Void visitMethod(MethodTree tree, Void ignored) {
                        Element e = trees.getElement(getCurrentPath());
                        if (tree.getModifiers().getFlags().contains(Modifier.NATIVE)) fail(unit, tree, "Native methods are outside the browser compatibility contract.");
                        if (e instanceof ExecutableElement method && method.getKind() == ElementKind.METHOD && method.getEnclosingElement() instanceof TypeElement owner) {
                            // Local overrides cannot smuggle unapproved external lifecycle or native APIs.
                            Set<String> seen = new HashSet<>();
                            var queue = new ArrayDeque<TypeMirror>(types.directSupertypes(owner.asType()));
                            while (!queue.isEmpty()) {
                                TypeMirror parent = queue.remove();
                                Element parentElement = types.asElement(parent);
                                if (!(parentElement instanceof TypeElement type) || !seen.add(type.getQualifiedName().toString())) continue;
                                for (Element member : type.getEnclosedElements()) if (member instanceof ExecutableElement inherited && elements.overrides(method, inherited, owner)) check(inherited, tree, getCurrentPath(), trusted);
                                queue.addAll(types.directSupertypes(parent));
                            }
                        }
                        return super.visitMethod(tree, ignored);
                    }
                    @Override public Void visitImport(ImportTree tree, Void ignored) {
                        // Star imports do not approve their package. Every actual use is resolved independently.
                        if (tree.getQualifiedIdentifier() instanceof MemberSelectTree select && select.getIdentifier().contentEquals("*")) return null;
                        return super.visitImport(tree, ignored);
                    }
                }.scan(unit, null);
            }
            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) if (d.getKind() == Diagnostic.Kind.ERROR) {
                String file = d.getSource() == null ? "Main.java" : root.relativize(Path.of(d.getSource().toUri())).toString().replace(File.separatorChar, '/');
                failures.add(file + ":" + Math.max(1, d.getLineNumber()) + ":" + Math.max(1, d.getColumnNumber()) + ": Cannot resolve browser source: " + d.getMessage(Locale.ROOT).replace('\n', ' '));
            }
        }
        failures.forEach(System.err::println);
        if (!failures.isEmpty()) System.exit(1);
        resourceUrls.forEach(System.out::println);
    }
}
